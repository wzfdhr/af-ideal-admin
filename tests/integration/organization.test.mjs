import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import contracts from '@af-admin/contracts'

const pool = db.createPool()
let server, base
const tokens = new Map()
before(async () => {
  await migrations.migrate(pool); await seeds.seedDemo(pool)
  await pool.query("UPDATE memberships SET permissions=permissions || $1::jsonb WHERE user_id IN ('a-admin','b-admin')", [JSON.stringify(Object.values(contracts.DEPARTMENT_PERMISSIONS))])
  server = api.createServer(pool)
  base = await server.listen({ host: '127.0.0.1', port: 0 })
})
after(async () => { await server.close(); await pool.end() })
const call = async (path, { user = 'a-admin', tenant = user.startsWith('b-') ? 'tenant-b' : 'tenant-a', method = 'GET', body, key = randomUUID() } = {}) => {
  if (!tokens.has(user)) {
    const login = await fetch(`${base}/api/user/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: user }) })
    assert.equal(login.status, 200)
    tokens.set(user, (await login.json()).data.token)
  }
  const response = await fetch(`${base}/api${path}`, { method, headers: { 'x-access-token': tokens.get(user), 'x-tenant-id': tenant, 'idempotency-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, ...await response.json() }
}
const ok = (response) => { assert.equal(response.status, 200, response.businessCode); return response.data }
const payload = (name) => ({ departmentName: name, leader: '合成负责人', sort: 1, status: 'enabled' })
test('real department CRUD is persisted, versioned, audited and command replays do not duplicate', async () => {
  const body = payload(`组织-${randomUUID()}`), key = randomUUID()
  const created = ok(await call('/system/departments', { method: 'POST', body, key }))
  assert.equal(created.revision, 1)
  assert.equal(ok(await call('/system/departments', { method: 'POST', body, key })).id, created.id)
  assert.equal((await call('/system/departments', { method: 'POST', body: { ...body, sort: 2 }, key })).status, 409)
  assert.equal(ok(await call(`/system/departments/${created.id}`)).departmentName, body.departmentName)
  const updated = ok(await call(`/system/departments/${created.id}`, { method: 'PUT', body: { ...body, expectedRevision: 1, departmentName: `${body.departmentName}-更新` } }))
  assert.equal(updated.revision, 2)
  assert.equal((await call(`/system/departments/${created.id}`, { method: 'PUT', body: { ...body, expectedRevision: 1 } })).status, 409)
  const deleted = await call(`/system/departments/${created.id}`, { method: 'DELETE', body: { expectedRevision: 2 } })
  ok(deleted)
  assert.equal((await call(`/system/departments/${created.id}`)).status, 404)
  const events = await pool.query("SELECT action FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND result='success' ORDER BY created_at,id", [created.id])
  assert.deepEqual(events.rows.map((item) => item.action), ['department.create','department.update','department.delete'])
})
test('department authorization and tenant boundaries apply to raw HTTP commands', async () => {
  const created = ok(await call('/system/departments', { method: 'POST', body: payload(`边界-${randomUUID()}`) }))
  assert.equal((await call('/system/departments', { user: 'a-employee' })).status, 403)
  assert.equal((await call(`/system/departments/${created.id}`, { user: 'b-admin' })).status, 404)
  assert.equal((await call(`/system/departments/${created.id}`, { user: 'b-admin', method: 'PUT', body: { ...payload('越权'), expectedRevision: 1 } })).status, 404)
  assert.equal((await call('/system/departments', { method: 'POST', body: { ...payload('身份伪造'), tenantId: 'tenant-b' } })).status, 422)
})
test('organization hierarchy refuses cycles, cross-tenant parents and referenced deletion', async () => {
  const root = ok(await call('/system/departments', { method: 'POST', body: payload(`树-${randomUUID()}`) }))
  const child = ok(await call('/system/departments', { method: 'POST', body: { ...payload('子部门'), parentId: root.id } }))
  assert.equal((await call(`/system/departments/${root.id}`, { method: 'PUT', body: { ...payload('环'), parentId: child.id, expectedRevision: 1 } })).status, 409)
  assert.equal((await call(`/system/departments/${root.id}`, { method: 'DELETE', body: { expectedRevision: 1 } })).status, 409)
  assert.equal((await call('/system/departments', { user: 'b-admin', method: 'POST', body: { ...payload('错父级'), parentId: root.id } })).status, 404)
  await pool.query("UPDATE memberships SET department_id=$1 WHERE tenant_id='tenant-a' AND user_id='a-employee'", [child.id])
  assert.equal((await call(`/system/departments/${child.id}`, { method: 'DELETE', body: { expectedRevision: 1 } })).status, 409)
})
test('two editors of one department revision have one effect and one conflict', async () => {
  const root = ok(await call('/system/departments', { method: 'POST', body: payload(`并发-${randomUUID()}`) }))
  const results = await Promise.all([1,2].map((sort) => call(`/system/departments/${root.id}`, { method: 'PUT', body: { ...payload('并发部门'), sort, expectedRevision: 1 } })))
  assert.deepEqual(results.map((item) => item.status).sort(), [200,409])
  assert.equal(ok(await call(`/system/departments/${root.id}`)).revision, 2)
})
