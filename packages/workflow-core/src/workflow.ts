import { DomainError, invalid, parseWorkflow } from '@af-admin/contracts'
import {
  validateConditionalWorkflow,
  advanceConditionalWorkflow,
} from './conditional-workflow'
import type { WorkflowRouteDecision } from './conditional-workflow'
import type {
  WorkflowSchema,
  WorkflowNode,
  InstanceStatus,
  TaskStatus,
} from '@af-admin/contracts'

export const assertRevision = (actual: number, expected: number) => {
  if (actual !== expected)
    throw new DomainError(
      409,
      'REVISION_CONFLICT',
      '记录已被修改，请刷新后确认'
    )
}
export const hasPermission = (permissions: string[], required: string) =>
  permissions.includes(required) || permissions.includes('*')
export const requirePermission = (permissions: string[], required: string) => {
  if (!hasPermission(permissions, required))
    throw new DomainError(403, 'FORBIDDEN', '没有操作权限')
}
export const assertTaskAction = (
  task: { assigneeId: string; status: TaskStatus; revision: number },
  instanceStatus: InstanceStatus,
  actorId: string,
  permissions: string[],
  action: 'approve' | 'reject',
  expectedRevision: number
) => {
  requirePermission(permissions, `workflow:${action}`)
  if (task.assigneeId !== actorId)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  assertRevision(task.revision, expectedRevision)
  if (task.status !== 'pending' || instanceStatus !== 'running')
    throw new DomainError(409, 'STATE_CONFLICT', '任务已处理或申请已结束')
}
export const assertWithdraw = (
  status: string,
  applicantId: string,
  actorId: string
) => {
  if (applicantId !== actorId)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  if (status !== 'running')
    throw new DomainError(409, 'STATE_CONFLICT', '只能撤回进行中的申请')
}
export const validateSerialWorkflow = (input: unknown): WorkflowSchema => {
  const schema = parseWorkflow(input)
  const nodes = new Map<string, WorkflowNode>()
  schema.nodes.forEach((node) => {
    if (nodes.has(node.id)) invalid(node.id, '节点标识重复')
    if (node.type === 'condition' || node.type === 'parallel')
      invalid(node.id, 'R1 不支持条件或并行节点')
    if (node.type === 'approval' && node.config.approvers?.length !== 1)
      invalid(node.id, '串行审批节点必须指定一名处理人')
    if (node.type === 'copy' && !node.config.ccUsers?.length)
      invalid(node.id, '抄送节点必须指定接收人')
    nodes.set(node.id, node)
  })
  const start = schema.nodes.filter((node) => node.type === 'start')
  const end = schema.nodes.filter((node) => node.type === 'end')
  if (start.length !== 1 || end.length !== 1)
    invalid('nodes', '必须恰有一个开始和结束节点')
  if (!schema.nodes.some((node) => node.type === 'approval'))
    invalid('nodes', '请假流程至少需要一个审批节点')
  const ids = new Set<string>()
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, string>()
  schema.edges.forEach((edge) => {
    if (!nodes.has(edge.source) || !nodes.has(edge.target))
      invalid(edge.id, '连线引用不存在的节点')
    if (ids.has(edge.id) || outgoing.has(edge.source))
      invalid(edge.id, '重复连线或不支持的分支')
    ids.add(edge.id)
    outgoing.set(edge.source, edge.target)
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
  })
  schema.nodes.forEach((node) => {
    if (node.type === 'end' ? outgoing.has(node.id) : !outgoing.has(node.id))
      invalid(node.id, '节点出边不合法')
    if ((incoming.get(node.id) || 0) !== (node.type === 'start' ? 0 : 1))
      invalid(node.id, '节点入边不合法')
  })
  const visited = new Set<string>()
  let current: string | undefined = start[0].id
  while (current) {
    if (visited.has(current)) invalid(current, '流程存在环')
    visited.add(current)
    current = outgoing.get(current)
  }
  if (visited.size !== nodes.size || !visited.has(end[0].id))
    invalid('nodes', '存在不可达节点')
  return schema
}
export interface AdvanceResult {
  approval: WorkflowNode | null
  copiedUserIds: string[]
  completed: boolean
  routes?: WorkflowRouteDecision[]
}
export const validateExecutableWorkflow = (
  input: unknown,
  form?: unknown
): WorkflowSchema => {
  const schema = parseWorkflow(input)
  return schema.version === 2
    ? validateConditionalWorkflow(schema, form)
    : validateSerialWorkflow(schema)
}
export const advanceWorkflow = (
  input: WorkflowSchema,
  afterNodeId?: string,
  values?: Record<string, unknown>
): AdvanceResult => {
  if (input.version === 2) {
    if (!values) return invalid('fields', '条件流程需要真实固定业务字段')
    return advanceConditionalWorkflow(input, afterNodeId, values)
  }
  const schema = validateSerialWorkflow(input)
  const nodes = new Map(schema.nodes.map((node) => [node.id, node]))
  const next = new Map(schema.edges.map((edge) => [edge.source, edge.target]))
  const start = schema.nodes.find(
    (node) => node.type === 'start'
  ) as WorkflowNode
  if (afterNodeId && nodes.get(afterNodeId)?.type !== 'approval')
    invalid('nodeId', '只能从审批节点继续推进')
  let current = next.get(afterNodeId || start.id)
  const copiedUserIds: string[] = []
  while (current) {
    const node = nodes.get(current) as WorkflowNode
    if (node.type === 'approval')
      return { approval: node, copiedUserIds, completed: false }
    if (node.type === 'end')
      return { approval: null, copiedUserIds, completed: true }
    if (node.type === 'copy') copiedUserIds.push(...(node.config.ccUsers || []))
    current = next.get(current)
  }
  return invalid('nodes', '流程未到达结束节点')
}
