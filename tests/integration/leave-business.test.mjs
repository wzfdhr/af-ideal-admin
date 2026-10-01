import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import notifications from '../../services/reference-api/dist/notification.js'
import contracts from '@af-admin/contracts'

const pool = db.createPool()
let server, base
const tokens = new Map()
const fields = { leaveType: 'personal', startDate: '2026-10-01', startSlot: 'am', endDate: '2026-10-02', endSlot: 'pm', reason: '验收测试申请' }
before(async () => {
  await migrations.migrate(pool); await seeds.seedDemo(pool)
  server = api.createServer(pool); base = await server.listen({ host: '127.0.0.1', port: 0 })
})
after(async () => { await server.close(); await pool.end() })
const tokenFor = async (user) => {
  if (!tokens.has(user)) {
    const response = await fetch(`${base}/api/user/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: user }) })
    assert.equal(response.status, 200)
    tokens.set(user, (await response.json()).data.token)
  }
  return tokens.get(user)
}
const call = async (path, { user = 'a-employee', method = 'GET', body, key, tenant, origin = base } = {}) => {
  const headers = { 'x-access-token': await tokenFor(user), 'x-tenant-id': tenant || (user.startsWith('b-') ? 'tenant-b' : 'tenant-a') }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (key) headers['idempotency-key'] = key
  const response = await fetch(`${origin}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, ...await response.json() }
}
const success = (response) => { assert.equal(response.status, 200, response.businessCode); return response.data }
const application = async () => success(await call('/applications/leave'))
const fresh = async (patch = {}, user = 'a-employee') => {
  const app = success(await call('/applications/leave', { user }))
  return success(await call('/leave-requests', { user, method: 'POST', body: { applicationReleaseId: app.activeReleaseId, fields: { ...fields, ...patch } } }))
}
const submit = async (draft, key = randomUUID(), origin = base) => call(`/leave-requests/${draft.id}/submit`, { method: 'POST', body: { expectedRevision: draft.revision }, key, origin })
const detail = async (request, user = 'a-employee') => success(await call(`/leave-requests/${request.id}`, { user }))
const taskFor = async (request, user) => {
  const info = await detail(request, user)
  const task = info.tasks.find((item) => item.assigneeId === user && item.status === 'pending')
  assert.ok(task)
  return task
}
const decide = (task, user, action = 'approve', key = randomUUID(), origin = base) => call(`/workflow-tasks/${task.id}/${action}`, { user, method: 'POST', body: { expectedRevision: task.revision, comment: action === 'reject' ? '验收驳回意见' : '验收通过' }, key, origin })
const count = async (sql, params) => Number((await pool.query(sql, params)).rows[0].total)

test('real HTTP business path advances two reviewers, preserves snapshot and ends consistently', async () => {
  const draft = await fresh()
  const running = success(await submit(draft))
  assert.equal(running.status, 'running')
  const first = await taskFor(running, 'a-manager-1')
  success(await decide(first, 'a-manager-1'))
  const second = await taskFor(running, 'a-manager-2')
  success(await decide(second, 'a-manager-2'))
  const completed = await detail(running)
  assert.equal(completed.status, 'approved')
  assert.equal(completed.applicationReleaseId, draft.applicationReleaseId)
  assert.deepEqual(completed.history.map((item) => item.action), ['start', 'approve', 'approve', 'copy'])
  assert.equal(completed.tasks.filter((item) => item.status === 'pending').length, 0)
  const instance = await pool.query('SELECT status FROM workflow_instances WHERE tenant_id=$1 AND id=$2', ['tenant-a', running.instanceId])
  assert.equal(instance.rows[0].status, 'completed')
})
test('draft fields persist via another HTTP server and stale saves cannot overwrite', async () => {
  const draft = await fresh({ reason: '' })
  const saved = success(await call(`/leave-requests/${draft.id}`, { method: 'PATCH', body: { expectedRevision: draft.revision, fields: { ...fields, reason: '已保存草稿' } } }))
  assert.equal(saved.revision, 2)
  const stale = await call(`/leave-requests/${draft.id}`, { method: 'PATCH', body: { expectedRevision: 1, fields: { ...fields, reason: '应被拒绝' } } })
  assert.equal(stale.status, 409)
  const replacement = api.createServer(pool)
  const origin = await replacement.listen({ host: '127.0.0.1', port: 0 })
  try {
    const reread = success(await call(`/leave-requests/${draft.id}`, { origin }))
    assert.equal(reread.reason, '已保存草稿')
  } finally { await replacement.close() }
})
test('submit retries return one instance, task, history and success audit', async () => {
  const draft = await fresh(); const key = randomUUID()
  const results = await Promise.all([submit(draft, key), submit(draft, key)])
  assert.deepEqual(results.map((item) => item.status), [200, 200])
  assert.equal(results[0].data.instanceId, results[1].data.instanceId)
  const instanceId = results[0].data.instanceId
  assert.equal(await count('SELECT count(*) AS total FROM workflow_instances WHERE tenant_id=$1 AND request_id=$2', ['tenant-a', draft.id]), 1)
  assert.equal(await count('SELECT count(*) AS total FROM workflow_tasks WHERE tenant_id=$1 AND instance_id=$2', ['tenant-a', instanceId]), 1)
  assert.equal(await count("SELECT count(*) AS total FROM audit_events WHERE tenant_id=$1 AND target_id=$2 AND action='submit'", ['tenant-a', draft.id]), 1)
  const conflict = await call(`/leave-requests/${draft.id}/submit`, { method: 'POST', key, body: { expectedRevision: draft.revision, comment: '不同内容' } })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.businessCode, 'IDEMPOTENCY_CONFLICT')
})
test('two independent HTTP decisions cause one state transition and one next task', async () => {
  const request = success(await submit(await fresh())); const task = await taskFor(request, 'a-manager-1')
  const result = await Promise.all([decide(task, 'a-manager-1'), decide(task, 'a-manager-1')])
  assert.deepEqual(result.map((item) => item.status).sort(), [200, 409])
  assert.equal(await count("SELECT count(*) AS total FROM workflow_tasks WHERE tenant_id=$1 AND instance_id=$2 AND node_id='approval-2'", ['tenant-a', request.instanceId]), 1)
  assert.equal(await count("SELECT count(*) AS total FROM workflow_history WHERE tenant_id=$1 AND instance_id=$2 AND action='approve'", ['tenant-a', request.instanceId]), 1)
})
test('approve versus withdraw serializes on the application and leaves no split state', async () => {
  const request = success(await submit(await fresh())); const task = await taskFor(request, 'a-manager-1')
  const result = await Promise.all([decide(task, 'a-manager-1'), call(`/workflow-instances/${request.instanceId}/withdraw`, { method: 'POST', key: randomUUID(), body: { expectedRevision: request.revision } })])
  assert.deepEqual(result.map((item) => item.status).sort(), [200, 409])
  const final = await detail(request)
  const instance = (await pool.query('SELECT status FROM workflow_instances WHERE tenant_id=$1 AND id=$2', ['tenant-a', request.instanceId])).rows[0]
  assert.equal(final.status, instance.status)
  assert.equal(final.tasks.filter((item) => item.status === 'pending').length, final.status === 'running' ? 1 : 0)
})
test('reject requires an opinion, ends pending tasks and copies to a distinct new application', async () => {
  const request = success(await submit(await fresh())); const task = await taskFor(request, 'a-manager-1')
  assert.equal((await call(`/workflow-tasks/${task.id}/reject`, { user: 'a-manager-1', method: 'POST', key: randomUUID(), body: { expectedRevision: task.revision } })).status, 422)
  success(await decide(task, 'a-manager-1', 'reject'))
  const rejected = await detail(request)
  assert.equal(rejected.status, 'rejected')
  assert.equal(rejected.tasks.filter((item) => item.status === 'pending').length, 0)
  const app = await application()
  const copied = success(await call('/leave-requests', { method: 'POST', body: { applicationReleaseId: app.activeReleaseId, fields, previousRequestId: request.id } }))
  assert.notEqual(copied.id, request.id)
  assert.equal(copied.previousRequestId, request.id)
  assert.equal((await detail(request)).status, 'rejected')
})
test('withdraw cancels tasks and old task commands fail without new business effects', async () => {
  const request = success(await submit(await fresh())); const task = await taskFor(request, 'a-manager-1')
  const withdrawn = success(await call(`/workflow-instances/${request.instanceId}/withdraw`, { method: 'POST', key: randomUUID(), body: { expectedRevision: request.revision } }))
  assert.equal(withdrawn.status, 'withdrawn')
  assert.equal((await decide(task, 'a-manager-1')).status, 409)
  assert.equal((await detail(request)).tasks.every((item) => item.status === 'cancelled'), true)
})
test('cross-tenant IDs and unassigned reviewer IDs do not expose business data', async () => {
  const request = success(await submit(await fresh())); const task = await taskFor(request, 'a-manager-1')
  assert.equal((await call(`/leave-requests/${request.id}`, { user: 'b-employee' })).status, 404)
  assert.equal((await call(`/leave-requests/${request.id}`, { user: 'a-admin' })).status, 404)
  assert.equal((await decide(task, 'b-manager-1')).status, 404)
  assert.equal((await decide(task, 'a-manager-2')).status, 404)
  assert.equal((await call(`/workflow-instances/${request.instanceId}/history`, { user: 'b-manager-1' })).status, 404)
})
test('client supplied identity, duration, state and generic workflow start cannot bypass business submit', async () => {
  const app = await application()
  for (const key of ['applicantId', 'tenantId', 'halfDayUnits', 'status']) {
    const response = await call('/leave-requests', { method: 'POST', body: { applicationReleaseId: app.activeReleaseId, fields, [key]: 'forged' } })
    assert.equal(response.status, 422)
  }
  assert.equal((await call('/workflow-instances', { method: 'POST', body: { workflowId: 'workflow-leave' } })).status, 409)
})
test('draft and release mutations require permissions and use revision conflicts', async () => {
  assert.equal((await call('/form-schemas')).status, 403)
  const form = success(await call('/form-schemas/form-leave', { user: 'a-admin' }))
  const saved = success(await call('/form-schemas/form-leave', { user: 'a-admin', method: 'PUT', body: { schema: form.schema, expectedRevision: form.revision } }))
  assert.equal(saved.revision, form.revision + 1)
  assert.equal((await call('/form-schemas/form-leave', { user: 'a-admin', method: 'PUT', body: { schema: form.schema, expectedRevision: form.revision } })).status, 409)
})
const publish = async (schema, origin = base) => {
  const app = await application()
  const form = success(await call('/form-schemas/form-leave', { user: 'a-admin' }))
  const workflow = success(await call('/workflows', { user: 'a-admin', method: 'POST', body: { name: '验收流程', schema } }))
  return call('/applications/leave/releases', { user: 'a-admin', method: 'POST', origin, key: randomUUID(), body: { formDraftId: form.id, workflowDraftId: workflow.id, formRevision: form.revision, workflowRevision: workflow.revision, expectedRevision: app.revision } })
}
const restore = async (releaseId) => {
  const app = await application()
  success(await call('/applications/leave/activate-release', { user: 'a-admin', method: 'POST', key: randomUUID(), body: { releaseId, expectedRevision: app.revision } }))
}
test('publishing and rollback affect new applications but do not mutate an in-flight snapshot', async () => {
  const old = await application(); const request = success(await submit(await fresh())); const stale = await fresh()
  const graph = contracts.serialWorkflow('a-manager-2', 'a-manager-1')
  try {
    const release = success(await publish(graph))
    assert.notEqual(release.id, old.activeReleaseId)
    assert.equal((await submit(stale)).businessCode, 'RELEASE_CHANGED')
    const confirmed = success(await call(`/leave-requests/${stale.id}`, { method: 'PATCH', body: { expectedRevision: stale.revision, fields, applicationReleaseId: release.id } }))
    success(await submit(confirmed))
    const original = await detail(request)
    assert.equal(original.release.id, old.activeReleaseId)
    assert.equal(original.tasks[0].assigneeId, 'a-manager-1')
    const current = await fresh()
    assert.equal(current.applicationReleaseId, release.id)
  } finally { await restore(old.activeReleaseId) }
})
test('unsupported graphs and invalid form bindings cannot publish', async () => {
  const graph = contracts.serialWorkflow('a-manager-1', 'a-manager-2')
  const parallel = structuredClone(graph); parallel.nodes[1].type = 'parallel'
  assert.equal((await publish(parallel)).status, 422)
  const cyclic = structuredClone(graph); cyclic.edges[1].target = 'start'
  assert.equal((await publish(cyclic)).status, 422)
  const binding = structuredClone(graph); binding.nodes[1].config.formId = 'other-form'
  assert.equal((await publish(binding)).status, 422)
})
test('publish and submit faults roll back all success effects inside their database transaction', async () => {
  const faultServer = api.createServer(pool, (point) => { if (['publish:release-created', 'submit:task-created'].includes(point)) throw new Error('test fault') })
  const origin = await faultServer.listen({ host: '127.0.0.1', port: 0 })
  try {
    const app = await application()
    const failed = await publish(contracts.serialWorkflow('a-manager-1', 'a-manager-2'), origin)
    assert.equal(failed.status, 500)
    const after = await application()
    assert.equal(after.activeReleaseId, app.activeReleaseId)
    assert.equal(after.releases.length, app.releases.length)
    const draft = await fresh(); assert.equal((await submit(draft, randomUUID(), origin)).status, 500)
    assert.equal((await detail(draft)).status, 'draft')
    assert.equal(await count('SELECT count(*) AS total FROM workflow_instances WHERE tenant_id=$1 AND request_id=$2', ['tenant-a', draft.id]), 0)
    assert.equal(await count("SELECT count(*) AS total FROM outbox WHERE tenant_id=$1 AND payload->>'link'=$2", ['tenant-a', `/leave/requests/${draft.id}`]), 0)
  } finally { await faultServer.close() }
})
test('notification worker de-duplicates delivery, protects message ownership and keeps audit server-authored', async () => {
  const request = success(await submit(await fresh())); const task = await taskFor(request, 'a-manager-1')
  success(await decide(task, 'a-manager-1', 'reject'))
  let remaining = 1
  while (remaining) remaining = await notifications.processOutbox(pool, undefined, 100)
  await notifications.processOutbox(pool)
  const messages = success(await call('/messages/notifications?pageSize=100'))
  const message = messages.list.find((item) => item.link.endsWith(request.id))
  assert.ok(message)
  assert.equal(messages.list.filter((item) => item.link.endsWith(request.id)).length, 1)
  assert.equal((await call(`/messages/notifications/${message.id}/read`, { user: 'b-employee', method: 'POST' })).status, 404)
  success(await call(`/messages/notifications/${message.id}/read`, { method: 'POST' }))
  const forged = success(await call('/audit/events', { method: 'POST', body: { operator: { id: 'a-admin' }, result: 'success', action: 'forged-success', detail: { reason: 'must not be stored' } } }))
  assert.equal(forged.source, 'browser')
  assert.equal(await count("SELECT count(*) AS total FROM audit_events WHERE action='forged-success'", []), 0)
  const audits = success(await call(`/audit/events?targetId=${request.id}`, { user: 'a-auditor' }))
  assert.ok(audits.list.some((item) => item.action === 'submit'))
  assert.ok(!JSON.stringify(audits).includes(fields.reason))
  assert.equal((await call('/audit/events')).status, 403)
  const trace = await call('/form-schemas')
  const denied = await pool.query('SELECT result FROM audit_events WHERE trace_id=$1', [trace.traceId])
  assert.ok(denied.rows.some((item) => item.result === 'failure'))
})

test('self approval is refused and a revoked approver cannot replay a prior successful command', async () => {
  const own = await fresh({}, 'a-manager-1')
  const self = await call(`/leave-requests/${own.id}/submit`, { user: 'a-manager-1', method: 'POST', key: randomUUID(), body: { expectedRevision: own.revision } })
  assert.equal(self.status, 422)
  assert.equal(self.businessCode, 'SELF_APPROVAL')
  const request = success(await submit(await fresh()))
  const task = await taskFor(request, 'a-manager-1'), key = randomUUID()
  success(await decide(task, 'a-manager-1', 'approve', key))
  const permissions = (await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-manager-1'")).rows[0].permissions
  try {
    await pool.query("UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-manager-1'", [JSON.stringify(permissions.filter((item) => item !== 'workflow:approve'))])
    const replay = await decide(task, 'a-manager-1', 'approve', key)
    assert.equal(replay.status, 403)
  } finally { await pool.query("UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-manager-1'", [JSON.stringify(permissions)]) }
})
test('unavailable next approver rolls back progression, alerts configuration admins and can recover', async () => {
  const request = success(await submit(await fresh()))
  const task = await taskFor(request, 'a-manager-1')
  try {
    await pool.query("UPDATE memberships SET status='disabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")
    const failed = await decide(task, 'a-manager-1')
    assert.equal(failed.status, 409)
    assert.equal(failed.businessCode, 'NEXT_APPROVER_UNAVAILABLE')
    const unchanged = await detail(request)
    assert.equal(unchanged.status, 'running')
    assert.equal(unchanged.tasks.find((item) => item.id === task.id).status, 'pending')
    assert.deepEqual(unchanged.history.map((item) => item.action), ['start'])
    assert.equal(await count("SELECT count(*) AS total FROM outbox WHERE tenant_id='tenant-a' AND recipient_id='a-admin' AND payload->>'traceId'=$1", [failed.traceId]), 1)
  } finally { await pool.query("UPDATE memberships SET status='enabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'") }
  success(await decide(task, 'a-manager-1'))
  assert.ok((await detail(request)).tasks.some((item) => item.assigneeId === 'a-manager-2' && item.status === 'pending'))
})
test('copy recipients gain readonly participation only after their node executes; auditors stay on audit scope', async () => {
  const old = await application()
  try {
    success(await publish(contracts.serialWorkflow('a-manager-1', 'a-manager-2', 'cross-tenant-employee')))
    const request = success(await submit(await fresh()))
    assert.equal((await call(`/leave-requests/${request.id}`, { user: 'cross-tenant-employee' })).status, 404)
    success(await decide(await taskFor(request, 'a-manager-1'), 'a-manager-1'))
    success(await decide(await taskFor(request, 'a-manager-2'), 'a-manager-2'))
    const copied = await detail(request, 'cross-tenant-employee')
    assert.equal(copied.status, 'approved')
    assert.deepEqual(copied.allowedActions, [])
    assert.equal((await call(`/leave-requests/${request.id}`, { user: 'a-auditor' })).status, 404)
  } finally { await restore(old.activeReleaseId) }
  const original = success(await submit(await fresh()))
  success(await decide(await taskFor(original, 'a-manager-1'), 'a-manager-1'))
  success(await decide(await taskFor(original, 'a-manager-2'), 'a-manager-2'))
  const auditCopy = await pool.query("SELECT payload FROM outbox WHERE tenant_id='tenant-a' AND recipient_id='a-auditor' AND payload->>'requestId'=$1", [original.id])
  assert.equal(auditCopy.rows[0].payload.link, `/audit/logs?targetId=${original.id}`)
  assert.equal((await call(`/leave-requests/${original.id}`, { user: 'a-auditor' })).status, 404)
})

test('legacy form preview validates without creating a business request or workflow instance', async () => {
  const before = await count('SELECT count(*) AS total FROM leave_requests', [])
  const preview = success(await call('/form-runtime/form-leave/submit', { user: 'a-admin', method: 'POST', body: { values: fields } }))
  assert.equal(preview.mode, 'preview')
  assert.ok(preview.id.startsWith('preview-'))
  assert.equal(await count('SELECT count(*) AS total FROM leave_requests', []), before)
  assert.equal((await call('/form-runtime/form-leave/submit', { method: 'POST', body: { values: fields } })).status, 403)
})
test('server menus use fixed component keys and contain only the actor capabilities', async () => {
  const admin = success(await call('/user/menu', { user: 'a-admin', method: 'POST' }))
  const manager = success(await call('/user/menu', { user: 'a-manager-1' }))
  const flatten = (items) => items.flatMap((item) => [item.name, ...flatten(item.children || [])])
  assert.ok(flatten(admin).includes('leaveApplication'))
  assert.ok(!flatten(admin).includes('workflowCenter'))
  assert.ok(flatten(manager).includes('workflowCenter'))
  assert.ok(!flatten(manager).includes('leaveApplication'))
  assert.ok(!JSON.stringify(admin).includes('.vue'))
  assert.ok(success(await call('/user/info')).permissions.includes('message:list'))
})

test('audit filters apply operator, event type, target and local calendar bounds', async () => {
  const request = await fresh()
  const scoped = success(await call(`/audit/events?targetId=${request.id}&operatorName=${encodeURIComponent('A 员工')}&eventType=operation`, { user: 'a-auditor' }))
  assert.ok(scoped.list.length)
  assert.ok(scoped.list.every((item) => item.target.id === request.id && item.operator.name === 'A 员工' && item.eventType === 'operation'))
  const empty = success(await call(`/audit/events?targetId=${request.id}&dateRange[]=1900-01-01&dateRange[]=1900-01-01`, { user: 'a-auditor' }))
  assert.equal(empty.total, 0)
})
