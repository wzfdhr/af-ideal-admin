import { randomUUID } from 'node:crypto'
import {
  DomainError,
  record,
  text,
  onlyKeys,
  parseLeaveFields,
  parseForm,
  validateBusinessFields,
  computeBusinessFields,
} from '@af-admin/contracts'
import { requirePermission } from '@af-admin/workflow-core'
import {
  captureFormSources,
  assertFormSourcesAvailable,
} from './form-source-bindings'
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
import { rows, noFault, authorizedTransaction } from './support'
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
      await authorizedTransaction(
        pool,
        await auth(request),
        undefined,
        (client, current) =>
          readApplication(client, current, parameterId(request))
      )
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
        await saveDraft(
          pool,
          await auth(request),
          kind,
          request.body,
          undefined,
          key(request)
        )
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
          parameterId(request),
          key(request)
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
  server.get('/api/form-schemas/:id/application', async (request) => {
    const actor = await auth(request)
    const id = parameterId(request)
    await readDraft(pool, actor, 'form', id)
    const owned = await rows<{
      id: string
      name: string
      business_kind: string
    }>(
      pool,
      'SELECT id,name,business_kind FROM applications WHERE tenant_id=$1 AND form_draft_id=$2 ORDER BY id LIMIT 1',
      [actor.tenantId, id]
    )
    return ok(
      request,
      owned[0]
        ? {
            id: owned[0].id,
            name: owned[0].name,
            businessKind: owned[0].business_kind,
          }
        : null
    )
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
    const body = record(request.body)
    onlyKeys(body, ['values'])
    return authorizedTransaction(
      pool,
      actor,
      'application:configure',
      async (client, current) => {
        const draft = await readDraft(client, current, 'form', id)
        const owner = await rows<{ business_kind: string }>(
          client,
          'SELECT business_kind FROM applications WHERE tenant_id=$1 AND form_draft_id=$2 ORDER BY id LIMIT 1',
          [current.tenantId, id]
        )
        if (owner[0]?.business_kind === 'leave') parseLeaveFields(body.values)
        else {
          const schema = await captureFormSources(
            client,
            current,
            parseForm(draft.schema)
          )
          const values = validateBusinessFields(schema, body.values)
          await assertFormSourcesAvailable(client, current, schema, values)
          computeBusinessFields(schema, values)
        }
        return ok(request, {
          id: `preview-${randomUUID()}`,
          formId: id,
          status: 'submitted',
          mode: 'preview',
        })
      }
    )
  })
  server.get('/api/messages/notifications', async (request) =>
    ok(
      request,
      await authorizedTransaction(
        pool,
        await auth(request),
        'message:list',
        (db, current) => listNotifications(db, current, request.query)
      )
    )
  )
  server.post('/api/messages/notifications/read-all', async (request) =>
    ok(
      request,
      await authorizedTransaction(
        pool,
        await auth(request),
        'message:batch-read',
        (db, current) => readAllNotifications(db, current, request.body)
      )
    )
  )
  server.post('/api/messages/notifications/:id/read', async (request) =>
    ok(
      request,
      await authorizedTransaction(
        pool,
        await auth(request),
        'message:read',
        (db, current) => readNotification(db, current, parameterId(request))
      )
    )
  )
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
