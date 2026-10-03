import { randomUUID } from 'node:crypto'
import { rows } from './support'
import type { Database, FactActor } from './support'

export interface WorkflowTimerRow {
  tenant_id: string
  id: string
  instance_id: string
  release_id: string
  node_id: string
  activity_id: string
  kind: 'resume' | 'deadline'
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'cancelled'
    | 'blocked'
    | 'failed'
  due_at: Date
  revision: number
  attempts: number
  next_attempt_at: Date
  lease_until: Date | null
  claimed_by: string | null
  error_code: string | null
  completed_at: Date | null
}
export const createWorkflowTimer = async (
  db: Database,
  tenantId: string,
  instanceId: string,
  nodeId: string,
  activityId: string,
  kind: WorkflowTimerRow['kind'],
  seconds: number
) => {
  await db.query(
    "INSERT INTO workflow_timers(tenant_id,id,instance_id,release_id,node_id,activity_id,kind,due_at,next_attempt_at) SELECT tenant_id,$3,id,release_id,$4,$5,$6,now()+($7::integer*interval '1 second'),now()+($7::integer*interval '1 second') FROM workflow_instances WHERE tenant_id=$1 AND id=$2",
    [tenantId, instanceId, randomUUID(), nodeId, activityId, kind, seconds]
  )
}
export const cancelWorkflowTimers = async (
  db: Database,
  tenantId: string,
  instanceId: string,
  activityId?: string
) => {
  await db.query(
    `UPDATE workflow_timers SET status='cancelled',revision=revision+1,lease_until=NULL,claimed_by=NULL,updated_at=now() WHERE tenant_id=$1 AND instance_id=$2 AND status IN ('pending','processing','blocked','failed')${
      activityId ? ' AND activity_id=$3' : ''
    }`,
    [tenantId, instanceId, ...(activityId ? [activityId] : [])]
  )
}
export const timerDto = (row: WorkflowTimerRow) => ({
  id: row.id,
  instanceId: row.instance_id,
  nodeId: row.node_id,
  activityId: row.activity_id,
  kind: row.kind,
  status: row.status,
  dueAt: row.due_at.toISOString(),
  revision: row.revision,
  attempts: row.attempts,
  nextAttemptAt: row.next_attempt_at.toISOString(),
  errorCode: row.error_code,
  completedAt: row.completed_at?.toISOString() || null,
})
export const instanceTimers = async (
  db: Database,
  tenantId: string,
  instanceId: string
) =>
  (
    await rows<WorkflowTimerRow>(
      db,
      'SELECT * FROM workflow_timers WHERE tenant_id=$1 AND instance_id=$2 ORDER BY due_at,id',
      [tenantId, instanceId]
    )
  ).map(timerDto)
export const timerFact = async (
  db: Database,
  actor: FactActor,
  timer: WorkflowTimerRow,
  kind: 'resume' | 'deadline' | 'retry' | 'blocked' | 'failed'
) => {
  await db.query(
    'INSERT INTO workflow_timer_events(tenant_id,id,timer_id,kind,timer_revision,attempt,planned_at,actor_id,source,trace_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      timer.tenant_id,
      randomUUID(),
      timer.id,
      kind,
      timer.revision,
      timer.attempts,
      timer.due_at,
      actor.userId,
      actor.userId === null ? 'scheduler' : 'user',
      actor.traceId,
    ]
  )
}
