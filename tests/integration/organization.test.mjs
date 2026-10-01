import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
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
  await pool.query("UPDATE memberships SET permissions=permissions || $1::jsonb WHERE user_id IN ('a-admin','b-admin')", [JSON.stringify([...Object.values(contracts.DEPARTMENT_PERMISSIONS),...Object.values(contracts.POSITION_PERMISSIONS)])])
  server = api.createServer(pool)
  base = await server.listen({ host: '127.0.0.1', port: 0 })
})
after(async () => { await server.close(); await pool.end() })
const call = async (path, { user = 'a-admin', tenant = user.startsWith('b-') ? 'tenant-b' : 'tenant-a', method = 'GET', body, key = randomUUID(), origin=base } = {}) => {
  if (!tokens.has(user)) {
    const login = await fetch(`${base}/api/user/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: user }) })
    assert.equal(login.status, 200)
    tokens.set(user, (await login.json()).data.token)
  }
  const response = await fetch(`${origin}/api${path}`, { method, headers: { 'x-access-token': tokens.get(user), 'x-tenant-id': tenant, 'idempotency-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
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
test('real tenant tree exposes stable parent-child structure without foreign tenant nodes', async () => {
  const root = ok(await call('/system/departments', { method:'POST',body:payload(`Tree-${randomUUID()}`) }))
  const child = ok(await call('/system/departments', { method:'POST',body:{...payload('Tree-child'),parentId:root.id} }))
  const tree = ok(await call('/system/departments/tree'))
  assert.equal(tree.find((item)=>item.id===root.id).children[0].id,child.id)
  assert.ok(!JSON.stringify(ok(await call('/system/departments/tree',{user:'b-admin'}))).includes(root.id))
})
test('real positions and organization assignment reject cross-department bindings and preserve old leave snapshots', async () => {
  const department = ok(await call('/system/departments',{method:'POST',body:payload(`岗位部-${randomUUID()}`)}))
  const position = ok(await call('/system/positions',{method:'POST',body:{departmentId:department.id,positionName:'测试岗位',status:'enabled'}}))
  const members = ok(await call('/system/organization-members')).list
  const member = members.find((item)=>item.id==='a-employee')
  const application=ok(await call('/applications/leave',{user:'a-employee'}))
  const draft=ok(await call('/leave-requests',{user:'a-employee',method:'POST',body:{applicationReleaseId:application.activeReleaseId,fields:{leaveType:'personal',startDate:'2026-10-01',startSlot:'am',endDate:'2026-10-02',endSlot:'pm',reason:'组织变更快照验收'}}}))
  const old = await pool.query("SELECT id,department_snapshot FROM leave_requests WHERE tenant_id='tenant-a' AND id=$1",[draft.id])
  assert.equal(old.rowCount,1)
  const assigned = ok(await call('/system/organization-members/a-employee/assign',{method:'POST',body:{departmentId:department.id,positionId:position.id,expectedRevision:member.revision}}))
  assert.equal(assigned.positionId,position.id)
  assert.equal((await call(`/system/positions/${position.id}`,{method:'DELETE',body:{expectedRevision:1}})).status,409)
  assert.equal((await call('/system/organization-members/a-employee/assign',{user:'b-admin',method:'POST',body:{departmentId:department.id,positionId:position.id,expectedRevision:assigned.revision}})).status,404)
  const other = ok(await call('/system/departments',{method:'POST',body:payload(`不匹配-${randomUUID()}`)}))
  assert.equal((await call('/system/organization-members/a-employee/assign',{method:'POST',body:{departmentId:other.id,positionId:position.id,expectedRevision:assigned.revision}})).status,422)
  assert.equal((await pool.query("SELECT department_snapshot FROM leave_requests WHERE tenant_id='tenant-a' AND id=$1",[old.rows[0].id])).rows[0].department_snapshot,old.rows[0].department_snapshot)
})
test('position versions, duplicate names, idempotency, raw permissions and audit stay consistent',async()=>{
  const node=ok(await call('/system/departments',{method:'POST',body:payload(`Position-${randomUUID()}`)}))
  const body={departmentId:node.id,positionName:'版本岗位',status:'enabled'},key=randomUUID()
  const created=ok(await call('/system/positions',{method:'POST',body,key}))
  assert.equal(ok(await call('/system/positions',{method:'POST',body,key})).id,created.id)
  assert.equal((await call('/system/positions',{method:'POST',body})).status,409)
  assert.equal((await call('/system/positions',{user:'a-employee',method:'POST',body})).status,403)
  assert.equal((await call(`/system/positions/${created.id}`,{user:'b-admin',method:'PUT',body:{...body,expectedRevision:1}})).status,404)
  assert.equal((await call('/system/positions',{method:'POST',body:{...body,tenantId:'tenant-b'}})).status,422)
  const edits=await Promise.all([1,2].map(i=>call(`/system/positions/${created.id}`,{method:'PUT',body:{...body,positionName:`更新${i}`,expectedRevision:1}})))
  assert.deepEqual(edits.map(item=>item.status).sort(),[200,409])
  assert.equal((await call(`/system/positions/${created.id}`,{method:'DELETE',body:{expectedRevision:1}})).status,409)
  ok(await call(`/system/positions/${created.id}`,{method:'DELETE',body:{expectedRevision:2}}))
  const audit=await pool.query("SELECT action FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND result='success' ORDER BY created_at,id",[created.id])
  assert.deepEqual(audit.rows.map(item=>item.action),['position.create','position.update','position.delete'])
})
test('assignment lookup is available with only assign permission and disabled ancestors refuse new bindings',async()=>{
  await pool.query("UPDATE memberships SET permissions=permissions || $1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",[JSON.stringify([contracts.POSITION_PERMISSIONS.assign])])
  const root=ok(await call('/system/departments',{method:'POST',body:payload(`Disabled-${randomUUID()}`)}))
  const child=ok(await call('/system/departments',{method:'POST',body:{...payload('下级'),parentId:root.id}}))
  const pos=ok(await call('/system/positions',{method:'POST',body:{departmentId:child.id,positionName:'下级岗位',status:'enabled'}}))
  ok(await call('/system/departments/tree',{user:'a-manager-1'}))
  ok(await call('/system/positions',{user:'a-manager-1'}))
  ok(await call(`/system/departments/${root.id}`,{method:'PUT',body:{...payload(root.departmentName),status:'disabled',expectedRevision:1}}))
  const member=ok(await call('/system/organization-members')).list.find(item=>item.id==='a-employee')
  assert.equal((await call('/system/organization-members/a-employee/assign',{method:'POST',body:{departmentId:child.id,positionId:pos.id,expectedRevision:member.revision}})).status,409)
  assert.equal((await call('/system/positions',{method:'POST',body:{departmentId:child.id,positionName:'不可新增',status:'enabled'}})).status,409)
  assert.equal((await call('/system/departments',{method:'POST',body:{...payload('不可新增'),parentId:child.id}})).status,409)
})
test('two administrators assigning each other serialize without a shared-lock upgrade deadlock', { timeout:10000 }, async () => {
  await pool.query("UPDATE memberships SET permissions=permissions || $1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",[JSON.stringify([contracts.POSITION_PERMISSIONS.assign])])
  const node=ok(await call('/system/departments',{method:'POST',body:payload(`Lock-${randomUUID()}`)}))
  const revisions=(await pool.query("SELECT user_id,revision FROM memberships WHERE tenant_id='tenant-a' AND user_id IN ('a-admin','a-manager-1')")).rows
  const rev=(id)=>revisions.find((item)=>item.user_id===id).revision
  const results=await Promise.all([
    call('/system/organization-members/a-manager-1/assign',{method:'POST',body:{departmentId:node.id,positionId:null,expectedRevision:rev('a-manager-1')}}),
    call('/system/organization-members/a-admin/assign',{user:'a-manager-1',method:'POST',body:{departmentId:node.id,positionId:null,expectedRevision:rev('a-admin')}}),
  ])
  assert.deepEqual(results.map((item)=>item.status),[200,200])
})
test('department tree, positions, membership revisions and sessions survive an actual API process replacement',{timeout:15000},async()=>{
  const first=ok(await call('/system/departments',{method:'POST',body:payload(`Restart-${randomUUID()}`)}))
  const position=ok(await call('/system/positions',{method:'POST',body:{departmentId:first.id,positionName:'重启岗位',status:'enabled'}}))
  const member=ok(await call('/system/organization-members')).list.find(item=>item.id==='a-employee')
  ok(await call('/system/organization-members/a-employee/assign',{method:'POST',body:{departmentId:first.id,positionId:position.id,expectedRevision:member.revision}}))
  const start=async()=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:['ignore','ignore','ignore','ipc']})
    try{const [ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)});return {child,base:ready.base}}catch(error){child.kill('SIGKILL');throw error}
  }
  const stop=async(child)=>{const exited=once(child,'exit');child.kill('SIGTERM');const [code]=await exited;assert.equal(code,0)}
  const snapshots=async(origin)=>Promise.all(['/system/departments/tree','/system/positions','/system/organization-members'].map(async path=>ok(await call(path,{origin}))))
  const initial=await start()
  let saved
  try{saved=await snapshots(initial.base)}finally{await stop(initial.child)}
  const replacement=await start()
  try{assert.deepEqual(await snapshots(replacement.base),saved);assert.equal(ok(await call(`/system/departments/${first.id}`,{origin:replacement.base})).revision,1)}finally{await stop(replacement.child)}
})
