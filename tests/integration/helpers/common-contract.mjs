import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export const commonContract = async (call) => {
  const ok = (response) => { assert.equal(response.status, 200, response.businessCode); return response.data }
  const fields = { leaveType: 'personal', startDate: '2026-10-01', startSlot: 'am', endDate: '2026-10-02', endSlot: 'pm', reason: '公共契约验收' }
  const app = ok(await call('/applications/leave'))
  const create = async () => ok(await call('/leave-requests', { method: 'POST', body: { applicationReleaseId: app.activeReleaseId, fields } }))
  const first = await create()
  const saved = ok(await call(`/leave-requests/${first.id}`, { method: 'PATCH', body: { expectedRevision: first.revision, fields: { ...fields, reason: '公共草稿更新' } } }))
  assert.equal(saved.reason, '公共草稿更新')
  assert.equal((await call(`/leave-requests/${first.id}`, { method: 'PATCH', body: { expectedRevision: first.revision, fields } })).status, 409)
  assert.equal((await call('/leave-requests', { method: 'POST', body: { applicationReleaseId: app.activeReleaseId, fields, applicantId: 'forged' } })).status, 422)
  assert.equal((await call('/leave-requests', { method: 'POST', body: { applicationReleaseId: app.activeReleaseId, fields: { ...fields, endDate: '2026-09-01' } } })).status, 422)
  assert.equal((await call(`/leave-requests/${first.id}`, { user: 'b-employee', tenant: 'tenant-b' })).status, 404)
  assert.equal((await call('/workflow-instances', { method: 'POST', body: {} })).status, 409)
  const preview = ok(await call('/form-runtime/form-leave/submit', { user: 'a-admin', method: 'POST', body: { values: fields } }))
  assert.equal(preview.mode, 'preview')
  const tenant = ok(await call('/tenants/tenant-a/context'))
  assert.equal(tenant.currentTenant.id, 'tenant-a')
  const menu = ok(await call('/user/menu', { user: 'a-manager-1' }))
  assert.ok(JSON.stringify(menu).includes('WorkflowCenter'))
  assert.ok(!JSON.stringify(menu).includes('LeaveApplication'))
  const key = randomUUID()
  const running = ok(await call(`/leave-requests/${saved.id}/submit`, { method: 'POST', key, body: { expectedRevision: saved.revision } }))
  const replay = ok(await call(`/leave-requests/${saved.id}/submit`, { method: 'POST', key, body: { expectedRevision: saved.revision } }))
  assert.equal(replay.instanceId, running.instanceId)
  assert.equal((await call(`/leave-requests/${saved.id}/submit`, { method: 'POST', key, body: { expectedRevision: saved.revision + 1 } })).status, 409)
  for (const user of ['a-manager-1', 'a-manager-2']) {
    const task = ok(await call('/workflow-todos?pageSize=100', { user })).list.find((item) => item.requestId === saved.id)
    assert.ok(task)
    ok(await call(`/workflow-tasks/${task.id}/approve`, { user, method: 'POST', key: randomUUID(), body: { expectedRevision: task.revision, comment: '已核实' } }))
  }
  const done = ok(await call(`/leave-requests/${saved.id}`))
  assert.equal(done.status, 'approved')
  assert.equal(done.release.id, app.activeReleaseId)
  const related = ok(await call(`/audit/events?targetId=${saved.id}`, { user: 'a-auditor' }))
  assert.equal(related.list.filter((event) => event.action === 'approve').length, 2)
  assert.deepEqual(done.history.map((item) => item.action).slice(0, 3), ['start', 'approve', 'approve'])
  const next = await create()
  const submitted = ok(await call(`/leave-requests/${next.id}/submit`, { method: 'POST', key: randomUUID(), body: { expectedRevision: next.revision } }))
  const withdrawn = ok(await call(`/workflow-instances/${submitted.instanceId}/withdraw`, { method: 'POST', key: randomUUID(), body: { expectedRevision: submitted.revision } }))
  assert.equal(withdrawn.status, 'withdrawn')
  const copy = ok(await call('/leave-requests', { method: 'POST', body: { applicationReleaseId: app.activeReleaseId, fields, previousRequestId: next.id } }))
  assert.equal(copy.previousRequestId, next.id)
  const events = ok(await call(`/audit/events?targetId=${next.id}&eventType=operation&operatorName=${encodeURIComponent('员工')}`, { user: 'a-auditor' }))
  assert.ok(events.total >= 1)
  assert.ok(!JSON.stringify(events).includes(fields.reason))
}
