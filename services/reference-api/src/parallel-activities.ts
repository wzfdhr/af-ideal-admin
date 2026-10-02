import { randomUUID } from 'node:crypto'
import {
  DomainError,
  evaluateWorkflowCondition,
  invalid,
} from '@af-admin/contracts'
import {
  validateParallelWorkflow,
  votingThreshold,
  votingOutcome,
  hasPermission,
} from '@af-admin/workflow-core'
import { addTask, appendHistory, appendRouteHistory } from './workflow-effects'
import { rows, one, sequential, enqueue, audit } from './support'
import type { WorkflowSchema, WorkflowNode } from '@af-admin/contracts'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'

interface Activity {
  id: string
  instance_id: string
  node_id: string
  kind: 'approval' | 'sign' | 'fork'
  status: string
  parent_group_id: string | null
  branch_key: string | null
  threshold: number | null
  expected_branches: number | null
  join_node_id: string | null
  arrived_branches: string[]
  revision: number
}
interface Context {
  db: Database
  actor: Actor
  instanceId: string
  requestId: string
  applicantId: string
  businessKind: 'leave' | 'generic'
  schema: WorkflowSchema
  values: Record<string, unknown>
  fault: FaultInjector
}
const nodeFor = (context: Context, id: string) =>
  context.schema.nodes.find((node) => node.id === id) ||
  invalid(id, '活动节点不在固定快照中')
const nextFor = (context: Context, id: string) =>
  context.schema.edges.find((edge) => edge.source === id)?.target ||
  invalid(id, '下一节点缺失')
const fact = async (
  context: Context,
  action: string,
  comment: string,
  target: string
) => {
  await appendHistory(
    context.db,
    context.actor,
    context.instanceId,
    action,
    null,
    comment
  )
  await audit(
    context.db,
    context.actor,
    'workflow',
    action,
    'workflow-activity',
    target
  )
}
const available = async (context: Context, node: WorkflowNode) => {
  await sequential(node.config.approvers || [], async (id) => {
    if (id === context.applicantId)
      throw new DomainError(422, 'SELF_APPROVAL', '申请人不能审批自己的申请')
    const members = await rows<{ permissions: string[] }>(
      context.db,
      "SELECT af_effective_permissions(m.tenant_id,m.user_id) AS permissions FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND u.status='enabled'",
      [context.actor.tenantId, id]
    )
    if (
      !members.length ||
      !['workflow:approve', 'workflow:reject'].every((code) =>
        hasPermission(members[0].permissions, code)
      )
    )
      throw new DomainError(
        409,
        'NEXT_APPROVER_UNAVAILABLE',
        '下一节点处理人不可用，请恢复或撤回申请'
      )
  })
}
const walk = async (
  context: Context,
  id: string,
  parent: string | null = null,
  branch: string | null = null
): Promise<void> => {
  const node = nodeFor(context, id)
  const { db, actor, instanceId } = context
  if (node.type === 'end') {
    if (parent) invalid(id, '并行分支不能提前结束')
    return
  }
  if (node.type === 'join') {
    if (!parent || !branch) invalid(id, '缺少汇合归属')
    const group = one(
      await rows<Activity>(
        db,
        'SELECT * FROM workflow_activities WHERE tenant_id=$1 AND instance_id=$2 AND id=$3 FOR UPDATE',
        [actor.tenantId, instanceId, parent]
      )
    )
    if (
      group.kind !== 'fork' ||
      group.join_node_id !== id ||
      group.status !== 'waiting' ||
      group.arrived_branches.includes(branch as string)
    )
      throw new DomainError(409, 'STATE_CONFLICT', '分支汇合状态不一致')
    const arrived = [...group.arrived_branches, branch as string]
    const complete = arrived.length === group.expected_branches
    if (arrived.length > (group.expected_branches || 0))
      invalid(id, '汇合分支超出定义')
    await db.query(
      'UPDATE workflow_activities SET arrived_branches=$4::jsonb,status=$5,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND instance_id=$2 AND id=$3',
      [
        actor.tenantId,
        instanceId,
        group.id,
        JSON.stringify(arrived),
        complete ? 'completed' : 'waiting',
      ]
    )
    context.fault('parallel:join-arrived')
    if (complete) {
      await fact(context, 'join', `${node.name}：全部分支已汇合`, group.id)
      await walk(
        context,
        nextFor(context, id),
        group.parent_group_id,
        group.branch_key
      )
    }
    return
  }
  if (node.type === 'parallel') {
    const edges = context.schema.edges.filter((edge) => edge.source === id)
    const groupId = randomUUID()
    await db.query(
      "INSERT INTO workflow_activities(tenant_id,id,instance_id,node_id,kind,status,parent_group_id,branch_key,expected_branches,join_node_id) VALUES($1,$2,$3,$4,'fork','waiting',$5,$6,$7,$8)",
      [
        actor.tenantId,
        groupId,
        instanceId,
        id,
        parent,
        branch,
        edges.length,
        node.config.joinId,
      ]
    )
    await fact(
      context,
      'fork',
      `${node.name}：已开启${edges.length}条并行分支`,
      groupId
    )
    await sequential(edges, async (edge) =>
      walk(context, edge.target, groupId, edge.channel as string)
    )
    return
  }
  if (node.type === 'approval' || node.type === 'sign') {
    await available(context, node)
    const activityId = randomUUID()
    const threshold = node.type === 'sign' ? votingThreshold(node) : 1
    await db.query(
      "INSERT INTO workflow_activities(tenant_id,id,instance_id,node_id,kind,status,parent_group_id,branch_key,threshold) VALUES($1,$2,$3,$4,$5,'waiting',$6,$7,$8)",
      [
        actor.tenantId,
        activityId,
        instanceId,
        id,
        node.type,
        parent,
        branch,
        threshold,
      ]
    )
    await sequential(node.config.approvers || [], async (assignee) => {
      await addTask(
        db,
        actor,
        instanceId,
        context.requestId,
        node,
        context.businessKind,
        activityId,
        assignee
      )
    })
    context.fault('parallel:tasks-created')
    return
  }
  if (node.type === 'condition') {
    const branchName = evaluateWorkflowCondition(
      node.config.condition || invalid(id, '条件缺失'),
      context.values
    )
      ? 'matched'
      : 'fallback'
    await appendRouteHistory(db, actor, instanceId, [
      { nodeId: id, nodeName: node.name, branch: branchName },
    ])
    const edge =
      context.schema.edges.find(
        (item) => item.source === id && item.branch === branchName
      ) || invalid(id, '条件分支缺失')
    await walk(context, edge.target, parent, branch)
    return
  }
  if (node.type === 'copy') {
    await sequential(node.config.ccUsers || [], async (recipient) =>
      enqueue(
        db,
        actor,
        recipient,
        context.requestId,
        context.businessKind === 'generic' ? '业务记录抄送' : '请假申请抄送',
        'message',
        'copy'
      )
    )
    await appendHistory(db, actor, instanceId, 'copy', null, '已按流程抄送')
  }
  await walk(context, nextFor(context, id), parent, branch)
}
const completed = async (context: Context) =>
  !(
    await rows(
      context.db,
      "SELECT id FROM workflow_activities WHERE tenant_id=$1 AND instance_id=$2 AND status='waiting'",
      [context.actor.tenantId, context.instanceId]
    )
  ).length
export const startParallelActivities = async (context: Context) => {
  validateParallelWorkflow(context.schema)
  const start =
    context.schema.nodes.find((node) => node.type === 'start') ||
    invalid('nodes', '开始缺失')
  await walk(context, start.id)
  return completed(context)
}
export const cancelParallelActivities = async (
  db: Database,
  actor: Actor,
  instanceId: string
) => {
  await db.query(
    "UPDATE workflow_activities SET status='cancelled',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND instance_id=$2 AND status='waiting'",
    [actor.tenantId, instanceId]
  )
}
export const continueParallelActivity = async (
  context: Context,
  activityId: string
) => {
  validateParallelWorkflow(context.schema)
  const activity = one(
    await rows<Activity>(
      context.db,
      'SELECT * FROM workflow_activities WHERE tenant_id=$1 AND instance_id=$2 AND id=$3 FOR UPDATE',
      [context.actor.tenantId, context.instanceId, activityId]
    )
  )
  if (
    activity.status !== 'waiting' ||
    !['approval', 'sign'].includes(activity.kind)
  )
    throw new DomainError(409, 'STATE_CONFLICT', '签署活动已经结束')
  const votes = await rows<{ status: string }>(
    context.db,
    'SELECT status FROM workflow_tasks WHERE tenant_id=$1 AND instance_id=$2 AND activity_id=$3',
    [context.actor.tenantId, context.instanceId, activity.id]
  )
  const outcome = votingOutcome(
    activity.threshold as number,
    votes.filter((v) => v.status === 'approved').length,
    votes.filter((v) => v.status === 'pending').length
  )
  if (outcome === 'waiting') {
    await context.db.query(
      'UPDATE workflow_activities SET revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND instance_id=$2 AND id=$3',
      [context.actor.tenantId, context.instanceId, activity.id]
    )
    return { completed: false, rejected: false }
  }
  await context.db.query(
    'UPDATE workflow_activities SET status=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND instance_id=$2 AND id=$3',
    [
      context.actor.tenantId,
      context.instanceId,
      activity.id,
      outcome === 'approved' ? 'completed' : 'rejected',
    ]
  )
  const cancelled = await context.db.query<{ id: string }>(
    "UPDATE workflow_tasks SET status='cancelled',revision=revision+1,completed_at=now() WHERE tenant_id=$1 AND instance_id=$2 AND activity_id=$3 AND status='pending' RETURNING id",
    [context.actor.tenantId, context.instanceId, activity.id]
  )
  const node = nodeFor(context, activity.node_id)
  if (activity.kind === 'sign')
    await fact(
      context,
      'sign',
      `${node.name}：${
        outcome === 'approved' ? '已达到批准阈值' : '剩余签署无法达到批准阈值'
      }`,
      activity.id
    )
  if (cancelled.rows.length)
    await fact(
      context,
      'cancel',
      `${node.name}：已取消${cancelled.rows.length}个剩余签署`,
      activity.id
    )
  context.fault('parallel:vote-aggregated')
  if (outcome === 'rejected') {
    await cancelParallelActivities(
      context.db,
      context.actor,
      context.instanceId
    )
    return { completed: false, rejected: true }
  }
  await walk(
    context,
    nextFor(context, node.id),
    activity.parent_group_id,
    activity.branch_key
  )
  return { completed: await completed(context), rejected: false }
}

export const parallelActivityProgress = async (
  db: Database,
  actor: Actor,
  instanceId: string,
  schema: WorkflowSchema
) => {
  const activities = await rows<Activity>(
    db,
    'SELECT * FROM workflow_activities WHERE tenant_id=$1 AND instance_id=$2 ORDER BY created_at,id',
    [actor.tenantId, instanceId]
  )
  const counts = await rows<{
    activity_id: string
    approved: string
    pending: string
    rejected: string
  }>(
    db,
    "SELECT activity_id,count(*) FILTER (WHERE status='approved') AS approved,count(*) FILTER (WHERE status='pending') AS pending,count(*) FILTER (WHERE status='rejected') AS rejected FROM workflow_tasks WHERE tenant_id=$1 AND instance_id=$2 AND activity_id IS NOT NULL GROUP BY activity_id",
    [actor.tenantId, instanceId]
  )
  return activities.map((activity) => {
    const votes = counts.find((row) => row.activity_id === activity.id)
    return {
      id: activity.id,
      nodeId: activity.node_id,
      nodeName:
        schema.nodes.find((node) => node.id === activity.node_id)?.name ||
        activity.node_id,
      kind: activity.kind,
      status: activity.status,
      parentGroupId: activity.parent_group_id,
      branchKey: activity.branch_key,
      threshold: activity.threshold,
      expectedBranches: activity.expected_branches,
      arrivedBranches: activity.arrived_branches.length,
      approved: Number(votes?.approved || 0),
      pending: Number(votes?.pending || 0),
      rejected: Number(votes?.rejected || 0),
      revision: activity.revision,
    }
  })
}
