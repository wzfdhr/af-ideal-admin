import { randomUUID } from 'node:crypto'
import {
  DomainError,
  calculateHalfDayUnits,
  parseCreateLeave,
  parseUpdateLeave,
  parseLeaveFields,
  parseCommand,
} from '@af-admin/contracts'
import {
  advanceWorkflow,
  assertRevision,
  requirePermission,
  hasPermission,
} from '@af-admin/workflow-core'
import { instanceTimers } from './timer-state'
import { appendHistory, appendRouteHistory, addTask } from './workflow-effects'
import { startParallelActivities } from './parallel-activities'
import { assertFilesReady } from './file-policy'
import { readRelease, validatePeople } from './application'
import {
  rows,
  one,
  pageQuery,
  authorizedTransaction,
  idempotent,
  audit,
  enqueue,
  sequential,
} from './support'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool, PoolClient } from 'pg'
import type {
  LeaveFields,
  LeaveRequest,
  LeaveStatus,
  HistoryRecord,
  WorkflowTask,
} from '@af-admin/contracts'

export { appendHistory, appendRouteHistory, addTask } from './workflow-effects'

export interface LeaveRow {
  tenant_id: string
  id: string
  application_release_id: string
  applicant_id: string
  applicant_name: string
  department_snapshot: string
  fields: LeaveFields
  half_day_units: number
  status: LeaveStatus
  revision: number
  previous_request_id: string | null
  created_at: Date
  updated_at: Date
  instance_id?: string | null
}
export const leaveDto = (row: LeaveRow, actor: Actor): LeaveRequest => {
  const allowedActions: string[] = []
  if (row.applicant_id === actor.userId) {
    if (row.status === 'draft') {
      if (hasPermission(actor.permissions, 'leave:update:self'))
        allowedActions.push('edit')
      if (hasPermission(actor.permissions, 'leave:submit'))
        allowedActions.push('submit')
    }
    if (
      row.status === 'running' &&
      hasPermission(actor.permissions, 'leave:withdraw:self')
    )
      allowedActions.push('withdraw')
    if (
      ['rejected', 'withdrawn'].includes(row.status) &&
      hasPermission(actor.permissions, 'leave:create')
    )
      allowedActions.push('copy')
  }
  return {
    ...row.fields,
    id: row.id,
    tenantId: row.tenant_id,
    applicationReleaseId: row.application_release_id,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    departmentSnapshot: row.department_snapshot,
    halfDayUnits: row.half_day_units,
    status: row.status,
    revision: row.revision,
    previousRequestId: row.previous_request_id,
    instanceId: row.instance_id || null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    allowedActions,
  }
}
export const history = async (
  db: Database,
  tenantId: string,
  instanceId: string
): Promise<HistoryRecord[]> => {
  const items = await rows<{
    id: string
    instance_id: string
    task_id: string | null
    action: string
    operator_id: string | null
    operator_name: string
    comment: string
    sequence: number
    created_at: Date
  }>(
    db,
    'SELECT * FROM workflow_history WHERE tenant_id=$1 AND instance_id=$2 ORDER BY sequence',
    [tenantId, instanceId]
  )
  return items.map((item) => ({
    id: item.id,
    instanceId: item.instance_id,
    taskId: item.task_id,
    action: item.action,
    operatorId: item.operator_id,
    operatorName: item.operator_name,
    comment: item.comment,
    sequence: item.sequence,
    createdAt: item.created_at.toISOString(),
  }))
}
export const readLeaveRow = async (
  db: Database,
  actor: Actor,
  id: string,
  lock = false
): Promise<LeaveRow> =>
  one(
    await rows<LeaveRow>(
      db,
      `SELECT * FROM leave_requests WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [actor.tenantId, id]
    )
  )
export const visibleLeave = async (db: Database, actor: Actor, id: string) => {
  const row = await readLeaveRow(db, actor, id)
  const isOwner =
    row.applicant_id === actor.userId &&
    hasPermission(actor.permissions, 'leave:read:self')
  const canReview = [
    'workflow:todo',
    'workflow:approve',
    'workflow:reject',
  ].some((code) => hasPermission(actor.permissions, code))
  const participated = canReview
    ? await rows<{ id: string }>(
        db,
        'SELECT t.id FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.tenant_id=$1 AND i.request_id=$2 AND (t.assignee_id=$3 OR EXISTS(SELECT 1 FROM workflow_assignment_events e WHERE e.tenant_id=t.tenant_id AND e.instance_id=t.instance_id AND e.task_id=t.id AND (e.from_user_id=$3 OR e.to_user_id=$3))) LIMIT 1',
        [actor.tenantId, id, actor.userId]
      )
    : []
  const canReadCopy =
    hasPermission(actor.permissions, 'leave:read:self') || canReview
  const copied = canReadCopy
    ? await rows<{ id: string }>(
        db,
        "SELECT id FROM outbox WHERE tenant_id=$1 AND recipient_id=$2 AND payload->>'requestId'=$3 AND payload->>'access'='copy' LIMIT 1",
        [actor.tenantId, actor.userId, id]
      )
    : []
  if (!isOwner && !participated.length && !copied.length)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  return row
}
export const readLeave = async (
  db: Database,
  actor: Actor,
  id: string
): Promise<LeaveRequest> => {
  const row = await visibleLeave(db, actor, id)
  const instance = await rows<{ id: string }>(
    db,
    'SELECT id FROM workflow_instances WHERE tenant_id=$1 AND request_id=$2',
    [actor.tenantId, id]
  )
  const result = leaveDto({ ...row, instance_id: instance[0]?.id }, actor)
  result.release = await readRelease(
    db,
    actor.tenantId,
    row.application_release_id
  )
  result.timers = instance[0]
    ? await instanceTimers(db, actor.tenantId, instance[0].id)
    : []
  result.history = instance.length
    ? await history(db, actor.tenantId, instance[0].id)
    : []
  const tasks = await rows<{
    id: string
    tenant_id: string
    instance_id: string
    node_id: string
    node_name: string
    assignee_id: string
    status: WorkflowTask['status']
    revision: number
    created_at: Date
    completed_at: Date | null
  }>(
    db,
    'SELECT t.* FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.tenant_id=$1 AND i.request_id=$2 ORDER BY t.created_at,t.id',
    [actor.tenantId, id]
  )
  result.tasks = tasks.map((task) => ({
    id: task.id,
    tenantId: task.tenant_id,
    instanceId: task.instance_id,
    requestId: id,
    nodeId: task.node_id,
    nodeName: task.node_name,
    assigneeId: task.assignee_id,
    status: task.status,
    revision: task.revision,
    createdAt: task.created_at.toISOString(),
    completedAt: task.completed_at?.toISOString() || null,
  }))
  return result
}
export const listLeaves = async (
  db: Database,
  actor: Actor,
  input: unknown
) => {
  requirePermission(actor.permissions, 'leave:read:self')
  const query = (input || {}) as Record<string, unknown>
  const page = pageQuery(input)
  const status = typeof query.status === 'string' ? query.status : ''
  if (
    status &&
    !['draft', 'running', 'approved', 'rejected', 'withdrawn'].includes(status)
  )
    throw new DomainError(422, 'VALIDATION_ERROR', '申请状态无效')
  const params = [actor.tenantId, actor.userId, status]
  const total = one(
    await rows<{ total: string }>(
      db,
      "SELECT count(*) AS total FROM leave_requests WHERE tenant_id=$1 AND applicant_id=$2 AND ($3='' OR status=$3)",
      params
    )
  )
  const items = await rows<LeaveRow>(
    db,
    "SELECT r.*,i.id AS instance_id FROM leave_requests r LEFT JOIN workflow_instances i ON i.tenant_id=r.tenant_id AND i.request_id=r.id WHERE r.tenant_id=$1 AND r.applicant_id=$2 AND ($3='' OR r.status=$3) ORDER BY r.updated_at DESC,r.id LIMIT $4 OFFSET $5",
    [...params, page.pageSize, page.offset]
  )
  return {
    list: items.map((row) => leaveDto(row, actor)),
    total: Number(total.total),
  }
}
export const activeRelease = async (
  db: Database,
  actor: Actor,
  releaseId: string,
  kind: 'leave' | 'generic' = 'leave'
) => {
  const release = await readRelease(db, actor.tenantId, releaseId)
  const app = one(
    await rows<{
      active_release_id: string | null
      status: string
      business_kind: string
    }>(
      db,
      'SELECT active_release_id,status,business_kind FROM applications WHERE tenant_id=$1 AND id=$2 FOR SHARE',
      [actor.tenantId, release.applicationId]
    )
  )
  if (app.status === 'archived')
    throw new DomainError(
      409,
      'APPLICATION_ARCHIVED',
      '应用已归档，不能创建或提交新业务'
    )
  if (app.business_kind !== kind)
    throw new DomainError(
      422,
      'APPLICATION_KIND_INVALID',
      '此应用不使用请假业务运行时'
    )
  if (app.active_release_id !== releaseId)
    throw new DomainError(
      409,
      'RELEASE_CHANGED',
      '应用已发布新版本，请预览并确认迁移后再提交'
    )
  return release
}
export const createLeave = (
  pool: Pool,
  actor: Actor,
  input: unknown,
  key?: string
) => {
  const payload = parseCreateLeave(input)
  const run = async (client: PoolClient, current: Actor) => {
    await activeRelease(client, current, payload.applicationReleaseId)
    if (payload.previousRequestId) {
      const previous = await readLeaveRow(
        client,
        current,
        payload.previousRequestId
      )
      if (previous.applicant_id !== current.userId)
        throw new DomainError(404, 'NOT_FOUND', '资源不存在')
      if (!['rejected', 'withdrawn'].includes(previous.status))
        throw new DomainError(
          409,
          'STATE_CONFLICT',
          '只能复制已驳回或已撤回的申请'
        )
    }
    const id = randomUUID()
    await client.query(
      'INSERT INTO leave_requests (tenant_id,id,application_release_id,applicant_id,applicant_name,department_snapshot,fields,half_day_units,previous_request_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        current.tenantId,
        id,
        payload.applicationReleaseId,
        current.userId,
        current.name,
        current.department,
        JSON.stringify(payload.fields),
        calculateHalfDayUnits(payload.fields),
        payload.previousRequestId || null,
      ]
    )
    await audit(client, current, 'leave', 'create-draft', 'leave-request', id)
    return leaveDto(await readLeaveRow(client, current, id), current)
  }
  if (key)
    return idempotent(
      pool,
      actor,
      'leave:create',
      'create-draft',
      key,
      payload,
      run
    )
  return authorizedTransaction(pool, actor, 'leave:create', run)
}
export const updateLeave = (
  pool: Pool,
  actor: Actor,
  id: string,
  input: unknown
) => {
  const payload = parseUpdateLeave(input)
  return authorizedTransaction(
    pool,
    actor,
    'leave:update:self',
    async (client, current) => {
      const old = await readLeaveRow(client, current, id, true)
      if (old.applicant_id !== current.userId)
        throw new DomainError(404, 'NOT_FOUND', '资源不存在')
      assertRevision(old.revision, payload.expectedRevision)
      if (old.status !== 'draft')
        throw new DomainError(409, 'STATE_CONFLICT', '已提交的申请不能直接编辑')
      if (payload.applicationReleaseId)
        await activeRelease(client, current, payload.applicationReleaseId)
      await client.query(
        'UPDATE leave_requests SET fields=$3,half_day_units=$4,application_release_id=$5,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
        [
          current.tenantId,
          id,
          JSON.stringify(payload.fields),
          calculateHalfDayUnits(payload.fields),
          payload.applicationReleaseId || old.application_release_id,
        ]
      )
      await audit(client, current, 'leave', 'save-draft', 'leave-request', id)
      return leaveDto(await readLeaveRow(client, current, id), current)
    }
  )
}
export const submitLeave = (
  pool: Pool,
  actor: Actor,
  id: string,
  input: unknown,
  key: string | undefined,
  fault: FaultInjector
) => {
  const payload = parseCommand(input)
  return idempotent(
    pool,
    actor,
    'leave:submit',
    `submit:${id}`,
    key,
    payload,
    async (client, current) => {
      const draft = await readLeaveRow(client, current, id, true)
      if (draft.applicant_id !== current.userId)
        throw new DomainError(404, 'NOT_FOUND', '资源不存在')
      assertRevision(draft.revision, payload.expectedRevision)
      if (draft.status !== 'draft')
        throw new DomainError(409, 'STATE_CONFLICT', '申请已经提交')
      const release = await activeRelease(
        client,
        current,
        draft.application_release_id
      )
      await assertFilesReady(client, current.tenantId, id)
      parseLeaveFields(draft.fields)
      await validatePeople(
        client,
        current.tenantId,
        release.workflowSnapshot,
        current.userId,
        draft.fields as unknown as Record<string, unknown>
      )
      const parallel = release.workflowSnapshot.version >= 3
      const next = parallel
        ? { approval: null, routes: [], copiedUserIds: [] }
        : advanceWorkflow(
            release.workflowSnapshot,
            undefined,
            draft.fields as unknown as Record<string, unknown>
          )
      const instanceId = randomUUID()
      await client.query(
        "INSERT INTO workflow_instances (tenant_id,id,request_id,release_id,status,current_node_id) VALUES ($1,$2,$3,$4,'running',$5)",
        [
          current.tenantId,
          instanceId,
          id,
          release.id,
          next.approval?.id || null,
        ]
      )
      await client.query(
        "UPDATE leave_requests SET status='running',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [current.tenantId, id]
      )
      if (next.approval)
        await addTask(client, current, instanceId, id, next.approval)
      await appendHistory(client, current, instanceId, 'start')
      if (parallel)
        await startParallelActivities({
          db: client,
          actor: current,
          instanceId,
          requestId: id,
          applicantId: current.userId,
          businessKind: 'leave',
          schema: release.workflowSnapshot,
          values: draft.fields as unknown as Record<string, unknown>,
          fault,
        })
      await appendRouteHistory(client, current, instanceId, next.routes)
      await sequential(next.copiedUserIds, async (recipient) => {
        await enqueue(
          client,
          current,
          recipient,
          id,
          '请假申请抄送',
          'message',
          'copy'
        )
      })
      if (next.copiedUserIds.length)
        await appendHistory(
          client,
          current,
          instanceId,
          'copy',
          null,
          '已按流程抄送'
        )
      fault('submit:task-created')
      await audit(client, current, 'leave', 'submit', 'leave-request', id)
      return leaveDto(
        {
          ...(await readLeaveRow(client, current, id)),
          instance_id: instanceId,
        },
        current
      )
    }
  )
}
