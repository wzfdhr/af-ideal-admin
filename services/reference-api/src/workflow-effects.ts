import { randomUUID } from 'node:crypto'
import { audit, sequential, enqueue } from './support'
import type { Database } from './support'
import type { Actor } from './auth'
import type { WorkflowNode } from '@af-admin/contracts'
import type { WorkflowRouteDecision } from '@af-admin/workflow-core'

export const appendHistory = async (
  db: Database,
  actor: Actor,
  instanceId: string,
  action: string,
  taskId: string | null = null,
  comment = ''
) => {
  await db.query(
    'INSERT INTO workflow_history (tenant_id,id,instance_id,task_id,action,operator_id,operator_name,comment,sequence) SELECT $1,$2,$3,$4,$5,$6,$7,$8,COALESCE(max(sequence),0)+1 FROM workflow_history WHERE tenant_id=$1 AND instance_id=$3',
    [
      actor.tenantId,
      randomUUID(),
      instanceId,
      taskId,
      action,
      actor.userId,
      actor.name,
      comment,
    ]
  )
}
export const appendRouteHistory = async (
  db: Database,
  actor: Actor,
  instanceId: string,
  routes?: WorkflowRouteDecision[]
) => {
  await sequential(routes || [], async (route) => {
    await appendHistory(
      db,
      actor,
      instanceId,
      'route',
      null,
      `${route.nodeName}（${route.nodeId}）：${
        route.branch === 'matched' ? '匹配分支' : '默认分支'
      }`
    )
    await audit(
      db,
      actor,
      'workflow',
      'route',
      'workflow-instance',
      instanceId,
      'success',
      { nodeId: route.nodeId, branch: route.branch }
    )
  })
}
export const addTask = async (
  db: Database,
  actor: Actor,
  instanceId: string,
  requestId: string,
  node: WorkflowNode,
  businessKind: 'leave' | 'generic' = 'leave',
  activityId: string | undefined = undefined,
  assigneeId = node.config.approvers?.[0]
) => {
  const id = randomUUID()
  await db.query(
    'INSERT INTO workflow_tasks (tenant_id,id,instance_id,node_id,node_name,assignee_id,activity_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      actor.tenantId,
      id,
      instanceId,
      node.id,
      node.name,
      assigneeId,
      activityId || null,
    ]
  )
  await enqueue(
    db,
    actor,
    assigneeId as string,
    requestId,
    businessKind === 'generic' ? '有新的业务审批待办' : '有新的请假审批待办',
    'todo'
  )
  return id
}
