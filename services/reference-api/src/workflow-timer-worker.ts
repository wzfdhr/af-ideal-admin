import { randomUUID } from 'node:crypto'
import { DomainError, computeBusinessFields } from '@af-admin/contracts'
import { hasPermission } from '@af-admin/workflow-core'
import { transaction } from './database'
import { rows, one, sequential, noFault, audit, enqueue } from './support'
import { readRelease } from './application'
import { runtimeAssignments } from './assignment-runtime'
import { continueWaitingActivity } from './parallel-activities'
import { appendHistory } from './workflow-effects'
import { cancelWorkflowTimers, timerFact } from './timer-state'
import type { WorkflowTimerRow } from './timer-state'
import type { FactActor } from './support'
import type { JsonObject } from '@af-admin/contracts'
import type { Pool } from 'pg'

const identity = (tenantId: string, traceId: string): FactActor => ({
  tenantId,
  userId: null,
  name: '流程调度服务',
  traceId,
})
const blockedCodes = new Set([
  'NEXT_APPROVER_UNAVAILABLE',
  'TARGET_APPROVER_UNAVAILABLE',
  'SELF_APPROVAL',
  'TENANT_UNAVAILABLE',
])
export type TimerFaultInjector = (point: string, timerId?: string) => void

export const processWorkflowTimers = async (
  pool: Pool,
  fault: TimerFaultInjector = noFault,
  batchSize = 10
) => {
  const claim = randomUUID()
  const claimed = await transaction(pool, async (db) => {
    const selected = await rows<WorkflowTimerRow>(
      db,
      "SELECT * FROM workflow_timers WHERE attempts<5 AND ((status='pending' AND due_at<=now() AND next_attempt_at<=now()) OR (status='processing' AND lease_until<=now())) ORDER BY due_at,id FOR UPDATE SKIP LOCKED LIMIT $1",
      [batchSize]
    )
    const result: WorkflowTimerRow[] = []
    await sequential(selected, async (timer) => {
      result.push(
        one(
          await rows<WorkflowTimerRow>(
            db,
            "UPDATE workflow_timers SET status='processing',attempts=attempts+1,revision=revision+1,claimed_by=$3,lease_until=now()+interval '30 seconds',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
            [timer.tenant_id, timer.id, claim]
          )
        )
      )
    })
    return result
  })
  await sequential(claimed, async (claimedTimer) => {
    fault('timer:claimed', claimedTimer.id)
    const actor = identity(claimedTimer.tenant_id, claim)
    try {
      const executed = await transaction(pool, async (db) => {
        const tenant = one(
          await rows<{ status: string }>(
            db,
            'SELECT status FROM tenants WHERE id=$1 FOR SHARE',
            [actor.tenantId]
          )
        )
        const located = one(
          await rows<{ request_id: string }>(
            db,
            'SELECT request_id FROM workflow_instances WHERE tenant_id=$1 AND id=$2',
            [actor.tenantId, claimedTimer.instance_id]
          )
        )
        const record = one(
          await rows<{
            id: string
            applicant_id: string
            record_kind: 'leave' | 'generic'
            fields: JsonObject
            status: string
          }>(
            db,
            'SELECT * FROM business_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [actor.tenantId, located.request_id]
          )
        )
        const instance = one(
          await rows<{ status: string; release_id: string }>(
            db,
            'SELECT * FROM workflow_instances WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [actor.tenantId, claimedTimer.instance_id]
          )
        )
        const activity = one(
          await rows<{ status: string; kind: string }>(
            db,
            'SELECT * FROM workflow_activities WHERE tenant_id=$1 AND instance_id=$2 AND id=$3 FOR UPDATE',
            [actor.tenantId, claimedTimer.instance_id, claimedTimer.activity_id]
          )
        )
        const timer = one(
          await rows<WorkflowTimerRow>(
            db,
            'SELECT * FROM workflow_timers WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [actor.tenantId, claimedTimer.id]
          )
        )
        if (timer.status !== 'processing' || timer.claimed_by !== claim)
          return false
        if (
          instance.status !== 'running' ||
          record.status !== 'running' ||
          activity.status !== 'waiting'
        ) {
          await cancelWorkflowTimers(
            db,
            actor.tenantId,
            timer.instance_id,
            timer.activity_id
          )
          return false
        }
        if (tenant.status !== 'enabled')
          throw new DomainError(409, 'TENANT_UNAVAILABLE', '租户当前不可运行')
        const release = await readRelease(
          db,
          actor.tenantId,
          instance.release_id
        )
        if (
          release.id !== timer.release_id ||
          release.workflowSnapshot.version !== 4
        )
          throw new DomainError(
            409,
            'TIMER_DEFINITION_CONFLICT',
            '定时配置与固定版本不一致'
          )
        const schema = await runtimeAssignments(
          db,
          actor.tenantId,
          timer.instance_id,
          release.workflowSnapshot
        )
        fault('timer:before-effects', timer.id)
        if (timer.kind === 'resume') {
          if (activity.kind !== 'wait')
            throw new DomainError(
              409,
              'TIMER_DEFINITION_CONFLICT',
              '该定时不属于等待活动'
            )
          const completed = await continueWaitingActivity(
            {
              db,
              actor,
              instanceId: timer.instance_id,
              requestId: record.id,
              applicantId: record.applicant_id,
              businessKind: record.record_kind,
              schema,
              values: {
                ...record.fields,
                ...(record.record_kind === 'generic'
                  ? computeBusinessFields(release.formSnapshot, record.fields)
                  : {}),
              },
              fault: (point) => fault(point, timer.id),
            },
            timer.activity_id
          )
          await db.query(
            'UPDATE workflow_instances SET status=$3,current_node_id=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [
              actor.tenantId,
              timer.instance_id,
              completed ? 'completed' : 'running',
            ]
          )
          await db.query(
            'UPDATE business_records SET status=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [actor.tenantId, record.id, completed ? 'approved' : 'running']
          )
          if (completed) {
            await cancelWorkflowTimers(db, actor.tenantId, timer.instance_id)
            await enqueue(
              db,
              actor,
              record.applicant_id,
              record.id,
              record.record_kind === 'generic'
                ? '业务申请已通过'
                : '请假申请已通过'
            )
          }
        } else {
          if (!['approval', 'sign'].includes(activity.kind))
            throw new DomainError(
              409,
              'TIMER_DEFINITION_CONFLICT',
              '该期限不属于审批活动'
            )
          const pending = await rows<{ assignee_id: string }>(
            db,
            "SELECT assignee_id FROM workflow_tasks WHERE tenant_id=$1 AND instance_id=$2 AND activity_id=$3 AND status='pending' ORDER BY assignee_id",
            [actor.tenantId, timer.instance_id, timer.activity_id]
          )
          const recipients = [
            ...new Set(pending.map((task) => task.assignee_id)),
          ]
          if (!recipients.length)
            throw new DomainError(
              409,
              'STATE_CONFLICT',
              '当前活动没有可提醒的待办'
            )
          await sequential(recipients, async (recipientId) => {
            const members = await rows<{ permissions: string[] }>(
              db,
              "SELECT af_effective_permissions(m.tenant_id,m.user_id) AS permissions FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' FOR SHARE OF m,u",
              [actor.tenantId, recipientId]
            )
            if (
              recipientId === record.applicant_id ||
              !members.length ||
              !['workflow:approve', 'workflow:reject'].every((permission) =>
                hasPermission(members[0].permissions, permission)
              )
            )
              throw new DomainError(
                409,
                'TARGET_APPROVER_UNAVAILABLE',
                '实际处理人当前不可审批，需先恢复分配'
              )
          })
          await sequential(recipients, async (recipientId) =>
            enqueue(
              db,
              actor,
              recipientId,
              record.id,
              '审批已超过处理期限',
              'alert'
            )
          )
          await appendHistory(
            db,
            actor,
            timer.instance_id,
            'timer-overdue',
            null,
            `${
              schema.nodes.find((node) => node.id === timer.node_id)?.name ||
              timer.node_id
            }：已发送期限提醒，审批规则保持固定`
          )
        }
        await timerFact(db, actor, timer, timer.kind)
        await audit(
          db,
          actor,
          'workflow',
          `timer.${timer.kind}`,
          'workflow-timer',
          timer.id,
          'success',
          {
            instanceId: timer.instance_id,
            plannedAt: timer.due_at.toISOString(),
            attempt: timer.attempts,
          }
        )
        fault('timer:after-effects', timer.id)
        await db.query(
          "UPDATE workflow_timers SET status='completed',revision=revision+1,completed_at=now(),claimed_by=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [actor.tenantId, timer.id]
        )
        return true
      })
      if (executed) fault('timer:after-commit', claimedTimer.id)
    } catch (failure) {
      const code =
        failure instanceof DomainError
          ? failure.businessCode
          : 'TIMER_EXECUTION_FAILED'
      await transaction(pool, async (db) => {
        const changed = await rows<WorkflowTimerRow>(
          db,
          "UPDATE workflow_timers SET status=CASE WHEN $4 THEN 'blocked' WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,error_code=$5,revision=revision+1,next_attempt_at=now()+($6::integer*interval '1 second'),claimed_by=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND status='processing' RETURNING *",
          [
            actor.tenantId,
            claimedTimer.id,
            claim,
            blockedCodes.has(code),
            code,
            Math.min(300, 2 ** claimedTimer.attempts),
          ]
        )
        if (changed.length) {
          if (changed[0].status !== 'pending')
            await timerFact(
              db,
              actor,
              changed[0],
              changed[0].status === 'blocked' ? 'blocked' : 'failed'
            )
          await audit(
            db,
            actor,
            'workflow',
            'timer.failure',
            'workflow-timer',
            claimedTimer.id,
            'failure',
            { businessCode: code, attempt: changed[0].attempts }
          )
        }
      })
    }
  })
  await transaction(pool, async (db) => {
    const expired = await rows<WorkflowTimerRow>(
      db,
      "UPDATE workflow_timers SET status='failed',revision=revision+1,error_code='TIMER_LEASE_EXHAUSTED',claimed_by=NULL,lease_until=NULL,updated_at=now() WHERE status='processing' AND lease_until<=now() AND attempts>=5 RETURNING *"
    )
    await sequential(expired, async (timer) =>
      timerFact(db, identity(timer.tenant_id, claim), timer, 'failed')
    )
  })
  return claimed.length
}
export const startWorkflowTimerWorker = (pool: Pool) => {
  let stopped = false
  let running: Promise<unknown> | undefined
  const tick = () => {
    if (stopped || running) return
    running = processWorkflowTimers(pool)
      .catch(() => undefined)
      .finally(() => {
        running = undefined
      })
  }
  const timer = setInterval(tick, 500)
  tick()
  return async () => {
    stopped = true
    clearInterval(timer)
    await running
  }
}
