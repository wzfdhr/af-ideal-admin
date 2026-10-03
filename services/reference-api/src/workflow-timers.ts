import {
  DomainError,
  WORKFLOW_TIMER_PERMISSIONS as P,
  parseWorkflowTimerRetry,
  computeBusinessFields,
  record,
  onlyKeys,
  text,
} from '@af-admin/contracts'
import { assertRevision, requirePermission } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  authorizedTransaction,
  idempotent,
  pageQuery,
  audit,
  sequential,
} from './support'
import { readRecordRow } from './record-access'
import { assertMemberScope } from './member-scope'
import {
  runtimeAssignments,
  assignmentUserAvailable,
} from './assignment-runtime'
import { readRelease } from './application'
import { approvalFrontier } from './recovery-frontier'
import { timerDto, timerFact } from './timer-state'
import type { Actor } from './auth'
import type { Database } from './support'
import type { WorkflowTimerRow } from './timer-state'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

const locatedTimer = async (db: Database, actor: Actor, id: string) =>
  one(
    await rows<WorkflowTimerRow & { request_id: string }>(
      db,
      'SELECT t.*,i.request_id FROM workflow_timers t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE t.tenant_id=$1 AND t.id=$2',
      [actor.tenantId, id]
    )
  )
const timerScope = async (
  db: Database,
  actor: Actor,
  timer: WorkflowTimerRow & { request_id: string },
  permission: string
) => {
  const resource = await readRecordRow(db, actor, timer.request_id)
  await assertMemberScope(db, actor, permission, resource.applicant_id)
  return resource
}
const unavailableTimerSlots = async (
  db: Database,
  actor: Actor,
  timer: WorkflowTimerRow & { request_id: string }
) => {
  requirePermission(actor.permissions, 'workflow:recover')
  if (timer.kind !== 'resume') return []
  const resource = await timerScope(db, actor, timer, P.retry)
  await assertMemberScope(db, actor, 'workflow:recover', resource.applicant_id)
  const release = await readRelease(db, actor.tenantId, timer.release_id)
  const schema = await runtimeAssignments(
    db,
    actor.tenantId,
    timer.instance_id,
    release.workflowSnapshot
  )
  const frontier = await approvalFrontier(
    db,
    actor.tenantId,
    {
      id: timer.id,
      instance_id: timer.instance_id,
      node_id: timer.node_id,
      activity_id: timer.activity_id,
    },
    schema,
    {
      ...resource.fields,
      ...(resource.record_kind === 'generic'
        ? computeBusinessFields(release.formSnapshot, resource.fields)
        : {}),
    }
  )
  const slots: {
    nodeId: string
    nodeName: string
    originalAssigneeId: string
    assignedUserId: string
  }[] = []
  await sequential(frontier, async (node) => {
    const originals =
      release.workflowSnapshot.nodes.find((original) => original.id === node.id)
        ?.config.approvers || []
    await sequential(node.config.approvers || [], async (assignee) => {
      const scope = await rows<{ visible: boolean }>(
        db,
        'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
        [actor.tenantId, actor.userId, 'workflow:recover', assignee]
      )
      if (
        scope[0]?.visible &&
        !(await assignmentUserAvailable(db, actor.tenantId, assignee))
      )
        slots.push({
          nodeId: node.id,
          nodeName: node.name,
          originalAssigneeId:
            originals[node.config.approvers?.indexOf(assignee) || 0],
          assignedUserId: assignee,
        })
    })
  })
  return slots
}
export const registerWorkflowTimers = (server: FastifyInstance, pool: Pool) => {
  server.get('/api/workflow-timers', async (request) => {
    const actor = await authenticate(pool, request)
    const query = record(request.query)
    onlyKeys(query, ['current', 'pageSize', 'keyword', 'status'])
    const page = pageQuery(query)
    const status =
      query.status === undefined ? '' : text(query.status, 'status', 30)
    if (
      status &&
      ![
        'pending',
        'processing',
        'completed',
        'cancelled',
        'blocked',
        'failed',
      ].includes(status)
    )
      throw new DomainError(422, 'VALIDATION_ERROR', '定时状态无效')
    return authorizedTransaction(pool, actor, P.read, async (db, current) => {
      const base =
        "FROM workflow_timers t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id JOIN business_records r ON r.tenant_id=i.tenant_id AND r.id=i.request_id JOIN application_releases a ON a.tenant_id=t.tenant_id AND a.id=t.release_id WHERE t.tenant_id=$1 AND af_member_scope_visible($1,$2,$3,r.applicant_id) AND ($4='' OR t.status=$4) AND t.node_id ILIKE $5"
      const params = [
        current.tenantId,
        current.userId,
        P.read,
        status,
        `%${page.keyword}%`,
      ]
      const count = one(
        await rows<{ total: string }>(
          db,
          `SELECT count(*) AS total ${base}`,
          params
        )
      )
      const timers = await rows<
        WorkflowTimerRow & { request_id: string; node_name: string }
      >(
        db,
        `SELECT t.*,i.request_id,(SELECT n->>'name' FROM jsonb_array_elements(a.workflow_snapshot->'nodes') n WHERE n->>'id'=t.node_id LIMIT 1) AS node_name ${base} ORDER BY t.due_at DESC,t.id LIMIT $6 OFFSET $7`,
        [...params, page.pageSize, page.offset]
      )
      return {
        code: 20000,
        data: {
          list: timers.map((timer) => ({
            ...timerDto(timer),
            requestId: timer.request_id,
            nodeName: timer.node_name,
          })),
          total: Number(count.total),
        },
      }
    })
  })
  server.get('/api/workflow-timers/:id/recovery-slots', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(pool, actor, P.retry, async (db, current) => {
      const timer = await locatedTimer(db, current, id)
      if (!['blocked', 'failed'].includes(timer.status))
        throw new DomainError(409, 'STATE_CONFLICT', '当前定时不需要恢复')
      return {
        code: 20000,
        data: await unavailableTimerSlots(db, current, timer),
      }
    })
  })
  server.get(
    '/api/workflow-timers/:id/assignment-candidates',
    async (request) => {
      const actor = await authenticate(pool, request)
      const id = text(record(request.params).id, 'id', 100)
      const query = record(request.query)
      onlyKeys(query, ['nodeId', 'originalAssigneeId'])
      return authorizedTransaction(
        pool,
        actor,
        P.retry,
        async (db, current) => {
          const timer = await locatedTimer(db, current, id)
          const slot = (await unavailableTimerSlots(db, current, timer)).find(
            (item) =>
              item.nodeId === query.nodeId &&
              item.originalAssigneeId === query.originalAssigneeId
          )
          if (!slot || !['blocked', 'failed'].includes(timer.status))
            throw new DomainError(
              409,
              'NO_RECOVERY_REQUIRED',
              '该票位不是当前实际阻塞'
            )
          const resource = await timerScope(db, current, timer, P.retry)
          const release = await readRelease(
            db,
            current.tenantId,
            timer.release_id
          )
          const schema = await runtimeAssignments(
            db,
            current.tenantId,
            timer.instance_id,
            release.workflowSnapshot
          )
          const reserved =
            schema.nodes
              .find((node) => node.id === slot.nodeId)
              ?.config.approvers?.filter(
                (memberId) => memberId !== slot.assignedUserId
              ) || []
          const candidates = await rows<{ id: string; name: string }>(
            db,
            "SELECT m.user_id AS id,CASE WHEN af_member_field_visible($1,$2,$3,m.user_id,'name') THEN COALESCE(m.display_name,u.name) ELSE '成员' END AS name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id<>$4 AND m.user_id<>$5 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND af_member_scope_visible($1,$2,$3,m.user_id) AND af_effective_permissions(m.tenant_id,m.user_id) ? 'workflow:approve' AND af_effective_permissions(m.tenant_id,m.user_id) ? 'workflow:reject' ORDER BY m.user_id LIMIT 100",
            [
              current.tenantId,
              current.userId,
              'workflow:recover',
              resource.applicant_id,
              slot.assignedUserId,
            ]
          )
          return {
            code: 20000,
            data: candidates.filter((person) => !reserved.includes(person.id)),
          }
        }
      )
    }
  )
  server.post('/api/workflow-timers/:id/retry', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = parseWorkflowTimerRetry(request.body)
    const result = await idempotent(
      pool,
      actor,
      P.retry,
      `workflow-timer-retry:${id}`,
      scalarHeader(request, 'idempotency-key'),
      body,
      async (db, current) => {
        const located = await locatedTimer(db, current, id)
        await readRecordRow(db, current, located.request_id, true)
        const instance = one(
          await rows<{ status: string }>(
            db,
            'SELECT status FROM workflow_instances WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [current.tenantId, located.instance_id]
          )
        )
        const activity = one(
          await rows<{ status: string }>(
            db,
            'SELECT status FROM workflow_activities WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [current.tenantId, located.activity_id]
          )
        )
        const timer = one(
          await rows<WorkflowTimerRow & { request_id: string }>(
            db,
            'SELECT t.*,$3::text AS request_id FROM workflow_timers t WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [current.tenantId, id, located.request_id]
          )
        )
        assertRevision(timer.revision, body.expectedRevision)
        if (
          !['blocked', 'failed'].includes(timer.status) ||
          instance.status !== 'running' ||
          activity.status !== 'waiting'
        )
          throw new DomainError(409, 'STATE_CONFLICT', '定时或流程当前不可恢复')
        const resource = await timerScope(db, current, timer, P.retry)
        if (body.targetUserId && body.nodeId && body.originalAssigneeId) {
          const slot = (await unavailableTimerSlots(db, current, timer)).find(
            (item) =>
              item.nodeId === body.nodeId &&
              item.originalAssigneeId === body.originalAssigneeId
          )
          if (!slot)
            throw new DomainError(
              409,
              'NO_RECOVERY_REQUIRED',
              '恢复目标不是实际阻塞票位'
            )
          await assertMemberScope(
            db,
            current,
            'workflow:recover',
            body.targetUserId
          )
          if (body.targetUserId === resource.applicant_id)
            throw new DomainError(
              422,
              'SELF_APPROVAL',
              '申请人不能审批自己的申请'
            )
          if (
            !(await assignmentUserAvailable(
              db,
              current.tenantId,
              body.targetUserId
            ))
          )
            throw new DomainError(
              409,
              'TARGET_APPROVER_UNAVAILABLE',
              '目标当前不可审批'
            )
          await db.query(
            'INSERT INTO workflow_assignment_overrides(tenant_id,instance_id,node_id,original_assignee_id,target_user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,instance_id,node_id,original_assignee_id) DO UPDATE SET target_user_id=excluded.target_user_id,revision=workflow_assignment_overrides.revision+1,updated_at=now()',
            [
              current.tenantId,
              timer.instance_id,
              slot.nodeId,
              slot.originalAssigneeId,
              body.targetUserId,
            ]
          )
          const release = await readRelease(
            db,
            current.tenantId,
            timer.release_id
          )
          await runtimeAssignments(
            db,
            current.tenantId,
            timer.instance_id,
            release.workflowSnapshot
          )
        }
        await timerFact(db, current, timer, 'retry')
        await audit(
          db,
          current,
          'workflow',
          'timer.retry',
          'workflow-timer',
          id,
          'success',
          {
            instanceId: timer.instance_id,
            reason: body.reason,
            ...(body.targetUserId
              ? {
                  nodeId: body.nodeId as string,
                  originalAssigneeId: body.originalAssigneeId as string,
                  toUserId: body.targetUserId,
                }
              : {}),
          }
        )
        return timerDto(
          one(
            await rows<WorkflowTimerRow>(
              db,
              "UPDATE workflow_timers SET status='pending',attempts=0,revision=revision+1,error_code=NULL,next_attempt_at=now(),claimed_by=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
              [current.tenantId, id]
            )
          )
        )
      },
      false,
      '',
      async (db, current, response) => {
        const timer = await locatedTimer(db, current, id)
        await timerScope(db, current, timer, P.retry)
        if (body.targetUserId) {
          requirePermission(current.permissions, 'workflow:recover')
          await assertMemberScope(
            db,
            current,
            'workflow:recover',
            body.targetUserId
          )
        }
        return response
      }
    )
    return { code: 20000, data: result }
  })
}

export default registerWorkflowTimers
