import { randomUUID } from 'node:crypto'
import {
  DomainError,
  record,
  text,
  onlyKeys,
  parseLeaveFields,
} from '@af-admin/contracts'
import { requirePermission } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  readApplication,
  listDrafts,
  readDraft,
  saveDraft,
  publishApplication,
  activateRelease,
} from './application'
import {
  listLeaves,
  readLeave,
  createLeave,
  updateLeave,
  submitLeave,
} from './leave'
import {
  listTasks,
  instanceHistory,
  decideTask,
  withdrawInstance,
} from './workflow'
import {
  listNotifications,
  readNotification,
  readAllNotifications,
} from './notification'
import { rows, one, pageQuery, noFault } from './support'
import type { Pool } from 'pg'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { FaultInjector } from './support'

const parameterId = (request: FastifyRequest) =>
  text(record(request.params).id, 'id', 100)
const ok = <T>(request: FastifyRequest, data: T) => ({
  code: 20000,
  data,
  traceId: request.id,
})
export const registerBusiness = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault
) => {
  const auth = (request: FastifyRequest) => authenticate(pool, request)
  const key = (request: FastifyRequest) =>
    scalarHeader(request, 'idempotency-key')
  server.get('/api/applications/:id', async (request) =>
    ok(
      request,
      await readApplication(pool, await auth(request), parameterId(request))
    )
  )
  server.post('/api/applications/:id/releases', async (request) =>
    ok(
      request,
      await publishApplication(
        pool,
        await auth(request),
        parameterId(request),
        request.body,
        key(request),
        fault
      )
    )
  )
  server.post('/api/applications/:id/activate-release', async (request) =>
    ok(
      request,
      await activateRelease(
        pool,
        await auth(request),
        parameterId(request),
        request.body,
        key(request)
      )
    )
  )
  const kinds = [
    { kind: 'form' as const, path: 'form-schemas' },
    { kind: 'workflow' as const, path: 'workflows' },
  ]
  kinds.forEach(({ kind, path }) => {
    server.get(`/api/${path}`, async (request) =>
      ok(
        request,
        await listDrafts(pool, await auth(request), kind, request.query)
      )
    )
    server.get(`/api/${path}/:id`, async (request) =>
      ok(
        request,
        await readDraft(pool, await auth(request), kind, parameterId(request))
      )
    )
    server.post(`/api/${path}`, async (request) =>
      ok(
        request,
        await saveDraft(pool, await auth(request), kind, request.body)
      )
    )
    server.put(`/api/${path}/:id`, async (request) =>
      ok(
        request,
        await saveDraft(
          pool,
          await auth(request),
          kind,
          request.body,
          parameterId(request)
        )
      )
    )
    server.post(`/api/${path}/:id/publish`, async (request) => {
      await auth(request)
      throw new DomainError(
        409,
        'COMBINED_RELEASE_REQUIRED',
        '请假应用必须通过组合发布入口发布表单和流程'
      )
    })
  })
  server.get('/api/leave-requests', async (request) =>
    ok(request, await listLeaves(pool, await auth(request), request.query))
  )
  server.get('/api/leave-requests/:id', async (request) =>
    ok(
      request,
      await readLeave(pool, await auth(request), parameterId(request))
    )
  )
  server.post('/api/leave-requests', async (request) =>
    ok(
      request,
      await createLeave(pool, await auth(request), request.body, key(request))
    )
  )
  server.patch('/api/leave-requests/:id', async (request) =>
    ok(
      request,
      await updateLeave(
        pool,
        await auth(request),
        parameterId(request),
        request.body
      )
    )
  )
  server.post('/api/leave-requests/:id/submit', async (request) =>
    ok(
      request,
      await submitLeave(
        pool,
        await auth(request),
        parameterId(request),
        request.body,
        key(request),
        fault
      )
    )
  )
  server.get('/api/workflow-todos', async (request) =>
    ok(request, await listTasks(pool, await auth(request), request.query))
  )
  server.get('/api/workflow-done', async (request) =>
    ok(request, await listTasks(pool, await auth(request), request.query, true))
  )
  server.get('/api/workflow-instances/:id/history', async (request) =>
    ok(
      request,
      await instanceHistory(pool, await auth(request), parameterId(request))
    )
  )
  server.post('/api/workflow-instances/:id/withdraw', async (request) =>
    ok(
      request,
      await withdrawInstance(
        pool,
        await auth(request),
        parameterId(request),
        request.body,
        key(request),
        fault
      )
    )
  )
  ;(['approve', 'reject'] as const).forEach((action) => {
    server.post(`/api/workflow-tasks/:id/${action}`, async (request) =>
      ok(
        request,
        await decideTask(
          pool,
          await auth(request),
          parameterId(request),
          action,
          request.body,
          key(request),
          fault
        )
      )
    )
  })
  server.post('/api/workflow-instances', async (request) => {
    await auth(request)
    throw new DomainError(
      409,
      'ATOMIC_SUBMIT_REQUIRED',
      '请通过申请提交入口原子发起流程'
    )
  })
  server.post('/api/form-runtime/:id/submit', async (request) => {
    const actor = await auth(request)
    const id = parameterId(request)
    await readDraft(pool, actor, 'form', id)
    const body = record(request.body)
    onlyKeys(body, ['values'])
    parseLeaveFields(body.values)
    return ok(request, {
      id: `preview-${randomUUID()}`,
      formId: id,
      status: 'submitted',
      mode: 'preview',
    })
  })
  server.get('/api/messages/notifications', async (request) =>
    ok(
      request,
      await listNotifications(pool, await auth(request), request.query)
    )
  )
  server.post('/api/messages/notifications/read-all', async (request) =>
    ok(
      request,
      await readAllNotifications(pool, await auth(request), request.body)
    )
  )
  server.post('/api/messages/notifications/:id/read', async (request) =>
    ok(
      request,
      await readNotification(pool, await auth(request), parameterId(request))
    )
  )
  server.get('/api/audit/events', async (request) => {
    const actor = await auth(request)
    requirePermission(actor.permissions, 'audit:read')
    const page = pageQuery(request.query)
    const query = record(request.query)
    const result = typeof query.result === 'string' ? query.result : ''
    const module = typeof query.module === 'string' ? query.module : ''
    const target = typeof query.targetId === 'string' ? query.targetId : ''
    const operatorName =
      typeof query.operatorName === 'string'
        ? query.operatorName.slice(0, 100)
        : ''
    const eventType = typeof query.eventType === 'string' ? query.eventType : ''
    const dateInput = query.dateRange || query['dateRange[]']
    let dates: unknown[] = []
    if (Array.isArray(dateInput)) dates = dateInput
    else if (typeof dateInput === 'string') dates = [dateInput]
    if (dates.length > 2)
      throw new DomainError(422, 'VALIDATION_ERROR', '审计日期筛选无效')
    const boundary = (value: unknown, end = false) => {
      if (value === undefined || value === '') return null
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new DomainError(422, 'VALIDATION_ERROR', '审计日期筛选无效')
      const date = Date.parse(`${value}T00:00:00+08:00`)
      if (
        !Number.isFinite(date) ||
        new Date(Date.parse(`${value}T00:00:00Z`))
          .toISOString()
          .slice(0, 10) !== value
      )
        throw new DomainError(422, 'VALIDATION_ERROR', '审计日期筛选无效')
      return new Date(date + (end ? 86400000 : 0)).toISOString()
    }
    const params = [
      actor.tenantId,
      result,
      module,
      target,
      `%${operatorName}%`,
      eventType,
      boundary(dates[0]),
      boundary(dates[1], true),
    ]
    const filter =
      "WHERE tenant_id=$1 AND ($2='' OR result=$2) AND ($3='' OR module=$3) AND ($4='' OR target_id=$4 OR detail->>'requestId'=$4 OR detail->>'instanceId'=$4) AND actor_name ILIKE $5 AND ($6='' OR (CASE WHEN module='auth' THEN 'security' ELSE 'operation' END)=$6) AND ($7::timestamptz IS NULL OR created_at>=$7) AND ($8::timestamptz IS NULL OR created_at<$8)"
    const count = one(
      await rows<{ total: string }>(
        pool,
        `SELECT count(*) AS total FROM audit_events ${filter}`,
        params
      )
    )
    const items = await rows<{
      id: string
      actor_id: string
      actor_name: string
      module: string
      action: string
      result: string
      target_type: string
      target_id: string
      trace_id: string
      created_at: Date
      detail: Record<string, unknown>
    }>(
      pool,
      `SELECT * FROM audit_events ${filter} ORDER BY created_at DESC,id LIMIT $9 OFFSET $10`,
      [...params, page.pageSize, page.offset]
    )
    return ok(request, {
      total: Number(count.total),
      list: items.map((row) => ({
        id: row.id,
        operator: { id: row.actor_id, name: row.actor_name },
        module: row.module,
        action: row.action,
        eventType: row.module === 'auth' ? 'security' : 'operation',
        result: row.result,
        target: { type: row.target_type, id: row.target_id },
        traceId: row.trace_id,
        occurredAt: row.created_at.toISOString(),
        detail: row.detail,
        source: 'server',
      })),
    })
  })
  server.post('/api/audit/events', async (request) => {
    const actor = await auth(request)
    const id = randomUUID()
    await pool.query(
      'INSERT INTO client_telemetry (tenant_id,id,actor_id,trace_id) VALUES ($1,$2,$3,$4)',
      [actor.tenantId, id, actor.userId, request.id]
    )
    return ok(request, { id, source: 'browser' })
  })
  server.get('/api/outbox/failures', async (request) => {
    const actor = await auth(request)
    requirePermission(actor.permissions, 'application:configure')
    return ok(
      request,
      await rows<{
        id: string
        recipient_id: string
        attempts: number
        status: string
      }>(
        pool,
        "SELECT id,recipient_id,attempts,status FROM outbox WHERE tenant_id=$1 AND status='failed' ORDER BY created_at DESC,id",
        [actor.tenantId]
      )
    )
  })
}

export default registerBusiness
