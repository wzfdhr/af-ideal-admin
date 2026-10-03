import { evaluateWorkflowCondition, invalid } from '@af-admin/contracts'
import { advanceWorkflow } from '@af-admin/workflow-core'
import { rows, one } from './support'
import type { WorkflowSchema, WorkflowNode } from '@af-admin/contracts'
import type { Database } from './support'

export interface FrontierTask {
  id: string
  instance_id: string
  node_id: string
  activity_id?: string | null
}
export const approvalFrontier = async (
  db: Database,
  tenantId: string,
  task: FrontierTask,
  schema: WorkflowSchema,
  values: Record<string, unknown>
): Promise<WorkflowNode[]> => {
  if (schema.version < 3) {
    const next = advanceWorkflow(schema, task.node_id, values)
    return next.approval ? [next.approval] : []
  }
  if (!task.activity_id) return invalid('activityId', '并行任务缺少活动')
  const activity = one(
    await rows<{
      status: string
      kind: string
      threshold: number
      parent_group_id: string | null
      branch_key: string | null
    }>(
      db,
      'SELECT * FROM workflow_activities WHERE tenant_id=$1 AND instance_id=$2 AND id=$3',
      [tenantId, task.instance_id, task.activity_id]
    )
  )
  const votes = one(
    await rows<{ approved: string }>(
      db,
      "SELECT count(*) AS approved FROM workflow_tasks WHERE tenant_id=$1 AND activity_id=$2 AND status='approved'",
      [tenantId, task.activity_id]
    )
  )
  if (
    activity.status !== 'waiting' ||
    (activity.kind !== 'wait' &&
      Number(votes.approved) + 1 < activity.threshold)
  )
    return []
  const nodes = new Map(schema.nodes.map((node) => [node.id, node]))
  const next = (id: string) =>
    schema.edges.find((edge) => edge.source === id)?.target ||
    invalid(id, '下一节点缺失')
  const virtual = (
    id: string,
    stop?: string
  ): { frontier: WorkflowNode[]; complete: boolean } => {
    if (id === stop) return { frontier: [], complete: true }
    const node = nodes.get(id) || invalid(id, '节点缺失')
    if (node.type === 'end') return { frontier: [], complete: true }
    if (node.type === 'wait') return { frontier: [], complete: false }
    if (node.type === 'approval' || node.type === 'sign')
      return { frontier: [node], complete: false }
    if (node.type === 'condition') {
      const branch = evaluateWorkflowCondition(
        node.config.condition || invalid(id, '条件缺失'),
        values
      )
        ? 'matched'
        : 'fallback'
      return virtual(
        (
          schema.edges.find(
            (edge) => edge.source === id && edge.branch === branch
          ) || invalid(id, '分支缺失')
        ).target,
        stop
      )
    }
    if (node.type === 'parallel') {
      const results = schema.edges
        .filter((edge) => edge.source === id)
        .map((edge) => virtual(edge.target, node.config.joinId))
      if (results.every((result) => result.complete))
        return virtual(next(node.config.joinId as string), stop)
      return {
        frontier: results.flatMap((result) => result.frontier),
        complete: false,
      }
    }
    if (node.type === 'join') return invalid(id, '缺少匹配的虚拟汇合上下文')
    return virtual(next(id), stop)
  }
  const existing = async (
    id: string,
    parent: string | null,
    branch: string | null
  ): Promise<WorkflowNode[]> => {
    const node = nodes.get(id) || invalid(id, '节点缺失')
    if (node.type === 'join') {
      if (!parent || !branch) invalid(id, '汇合归属缺失')
      const group = one(
        await rows<{
          status: string
          join_node_id: string
          expected_branches: number
          arrived_branches: string[]
          parent_group_id: string | null
          branch_key: string | null
        }>(
          db,
          'SELECT * FROM workflow_activities WHERE tenant_id=$1 AND instance_id=$2 AND id=$3',
          [tenantId, task.instance_id, parent]
        )
      )
      if (
        group.status !== 'waiting' ||
        group.join_node_id !== id ||
        group.arrived_branches.includes(branch as string)
      )
        invalid(id, '汇合状态无效')
      if (group.arrived_branches.length + 1 < group.expected_branches) return []
      return existing(next(id), group.parent_group_id, group.branch_key)
    }
    if (node.type === 'copy' || node.type === 'start')
      return existing(next(id), parent, branch)
    if (node.type === 'condition') {
      const selected = evaluateWorkflowCondition(
        node.config.condition || invalid(id, '条件缺失'),
        values
      )
        ? 'matched'
        : 'fallback'
      return existing(
        (
          schema.edges.find(
            (edge) => edge.source === id && edge.branch === selected
          ) || invalid(id, '条件边缺失')
        ).target,
        parent,
        branch
      )
    }
    if (node.type === 'parallel') {
      const parentRow = parent
        ? one(
            await rows<{ join_node_id: string }>(
              db,
              'SELECT join_node_id FROM workflow_activities WHERE tenant_id=$1 AND instance_id=$2 AND id=$3',
              [tenantId, task.instance_id, parent]
            )
          )
        : undefined
      const result = virtual(id, parentRow?.join_node_id)
      if (result.complete && parentRow)
        return existing(parentRow.join_node_id, parent, branch)
      return result.frontier
    }
    if (node.type === 'end' || node.type === 'wait') return []
    return [node]
  }
  return existing(
    next(task.node_id),
    activity.parent_group_id,
    activity.branch_key
  )
}
