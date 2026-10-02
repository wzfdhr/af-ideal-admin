import {
  invalid,
  parseWorkflow,
  evaluateWorkflowCondition,
  validateWorkflowConditionBindings,
} from '@af-admin/contracts'
import type { WorkflowSchema, WorkflowNode } from '@af-admin/contracts'

export interface WorkflowRouteDecision {
  nodeId: string
  nodeName: string
  branch: 'matched' | 'fallback'
}
export const validateConditionalWorkflow = (
  input: unknown,
  form?: unknown
): WorkflowSchema => {
  const schema = parseWorkflow(input)
  if (schema.version !== 2) invalid('version', '条件流程必须使用v2格式')
  const nodes = new Map<string, WorkflowNode>()
  schema.nodes.forEach((node) => {
    if (nodes.has(node.id)) invalid(node.id, '节点标识重复')
    if (node.type === 'parallel') invalid(node.id, '并行节点尚不支持执行')
    if (node.type === 'approval' && node.config.approvers?.length !== 1)
      invalid(node.id, '审批节点必须指定一名处理人')
    if (node.type === 'copy' && !node.config.ccUsers?.length)
      invalid(node.id, '抄送节点必须指定接收人')
    if (node.type === 'condition' && !node.config.condition)
      invalid(node.id, '条件节点缺少结构化规则')
    if (node.type !== 'approval' && node.config.approvers?.length)
      invalid(node.id, '处理人只能配置在审批节点')
    if (node.type !== 'copy' && node.config.ccUsers?.length)
      invalid(node.id, '接收人只能配置在抄送节点')
    nodes.set(node.id, node)
  })
  const start = schema.nodes.filter((node) => node.type === 'start')
  const end = schema.nodes.filter((node) => node.type === 'end')
  if (start.length !== 1 || end.length !== 1)
    invalid('nodes', '必须恰有一个开始和结束节点')
  const outgoing = new Map<string, WorkflowSchema['edges']>()
  const incoming = new Map<string, number>()
  const ids = new Set<string>()
  schema.edges.forEach((edge) => {
    if (ids.has(edge.id) || !nodes.has(edge.source) || !nodes.has(edge.target))
      invalid(edge.id, '重复或悬空连线')
    ids.add(edge.id)
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge])
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
  })
  schema.nodes.forEach((node) => {
    const edges = outgoing.get(node.id) || []
    if (node.type === 'condition') {
      if (
        edges.length !== 2 ||
        new Set(edges.map((edge) => edge.branch)).size !== 2 ||
        !edges.every((edge) => edge.branch) ||
        edges[0].target === edges[1].target
      )
        invalid(node.id, '条件节点需具有两条不同目标的matched/fallback分支')
    } else if (
      edges.length !== (node.type === 'end' ? 0 : 1) ||
      edges.some((edge) => edge.branch)
    )
      invalid(node.id, '非条件节点出边不合法')
    if (
      node.type === 'start'
        ? (incoming.get(node.id) || 0) !== 0
        : !incoming.get(node.id)
    )
      invalid(node.id, '节点入边不合法')
  })
  const visiting = new Set<string>()
  const minimum = new Map<string, number>()
  const visit = (id: string): number => {
    if (visiting.has(id)) return invalid(id, '流程存在环')
    const known = minimum.get(id)
    if (known !== undefined) return known
    visiting.add(id)
    const node = nodes.get(id) as WorkflowNode
    const tail =
      node.type === 'end'
        ? 0
        : Math.min(
            ...(outgoing.get(id) || []).map((edge) => visit(edge.target))
          )
    const count = tail + (node.type === 'approval' ? 1 : 0)
    visiting.delete(id)
    minimum.set(id, count)
    return count
  }
  if (visit(start[0].id) < 1)
    invalid('nodes', '每条执行路径至少需要一个审批节点')
  if (minimum.size !== nodes.size) invalid('nodes', '存在不可达节点')
  if (form !== undefined) validateWorkflowConditionBindings(schema, form)
  return schema
}
export const advanceConditionalWorkflow = (
  input: WorkflowSchema,
  afterNodeId: string | undefined,
  values: Record<string, unknown>
) => {
  const schema = validateConditionalWorkflow(input)
  const nodes = new Map(schema.nodes.map((node) => [node.id, node]))
  const start = schema.nodes.find(
    (node) => node.type === 'start'
  ) as WorkflowNode
  if (afterNodeId && nodes.get(afterNodeId)?.type !== 'approval')
    invalid('nodeId', '只能从审批节点继续推进')
  const copiedUserIds: string[] = []
  const routes: WorkflowRouteDecision[] = []
  let current = schema.edges.find(
    (edge) => edge.source === (afterNodeId || start.id)
  )?.target
  while (current) {
    const node = nodes.get(current) as WorkflowNode
    if (node.type === 'approval')
      return { approval: node, copiedUserIds, completed: false, routes }
    if (node.type === 'end')
      return { approval: null, copiedUserIds, completed: true, routes }
    if (node.type === 'copy') copiedUserIds.push(...(node.config.ccUsers || []))
    if (node.type === 'condition') {
      const branch = evaluateWorkflowCondition(
        node.config.condition || invalid(node.id, '条件规则缺失'),
        values
      )
        ? ('matched' as const)
        : ('fallback' as const)
      routes.push({ nodeId: node.id, nodeName: node.name, branch })
      current = schema.edges.find(
        (edge) => edge.source === node.id && edge.branch === branch
      )?.target
    } else
      current = schema.edges.find((edge) => edge.source === node.id)?.target
  }
  return invalid('nodes', '流程未到达结束节点')
}
// Validate participant availability only on the deterministic path of this fixed record.
// This is a read-only path calculation; route facts are emitted only by actual advancement.
export const selectedConditionalNodeIds = (
  input: WorkflowSchema,
  values: Record<string, unknown>
): Set<string> => {
  const schema = validateConditionalWorkflow(input)
  const nodes = new Map(schema.nodes.map((node) => [node.id, node]))
  const selected = new Set<string>()
  let current = schema.nodes.find((node) => node.type === 'start')?.id
  while (current) {
    selected.add(current)
    const node = nodes.get(current) as WorkflowNode
    if (node.type === 'end') break
    let branch: 'matched' | 'fallback' | undefined
    if (node.type === 'condition')
      branch = evaluateWorkflowCondition(
        node.config.condition || invalid(node.id, '条件规则缺失'),
        values
      )
        ? 'matched'
        : 'fallback'
    current = schema.edges.find(
      (edge) => edge.source === node.id && edge.branch === branch
    )?.target
  }
  return selected
}
