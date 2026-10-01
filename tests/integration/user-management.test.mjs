import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before,after,test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import security from '../../services/reference-api/dist/security.js'
import contracts from '@af-admin/contracts'

const pool=db.createPool(),tokens=new Map(),passwords=new Map()
const capabilities=['system:user:list','system:user:create','system:user:update','system:user:delete','system:user:detail','system:user:reset-password']
let server,base
before(async()=>{
  await migrations.migrate(pool);await seeds.seedDemo(pool)
  await pool.query("UPDATE memberships SET permissions=permissions || $1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(capabilities)])
  server=api.createServer(pool);base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();await pool.end()})
const call=async(path,{user='a-admin',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,key=randomUUID()}={})=>{
  if(!tokens.has(user)){
    const login=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:passwords.get(user)||user})})
    assert.equal(login.status,200)
    tokens.set(user,(await login.json()).data.token)
  }
  const response=await fetch(`${base}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
  return {status:response.status,...await response.json()}
}
const ok=value=>{assert.equal(value.status,200,value.businessCode);return value.data}
const input=()=>({username:`fp-user-${randomUUID().slice(0,8)}`,name:'合成成员',phone:'15000000001',email:'fixture@invalid.example',initialPassword:'Private-fixture-password-2026',status:'enabled'})
test('private user creation stores a hash, masks contact fields and replays one identity without privileges',async()=>{
  const body=input(),key=randomUUID(),created=ok(await call('/system/users',{method:'POST',body,key}))
  assert.equal(ok(await call('/system/users',{method:'POST',body,key})).id,created.id)
  assert.equal((await call('/system/users',{method:'POST',body:{...body,permissions:['*']}})).status,422)
  const stored=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[created.id])).rows[0]
  assert.equal(await security.verifyPassword(body.initialPassword,stored.password_hash),true)
  assert.notEqual(created.phone,body.phone)
  assert.notEqual(created.email,body.email)
  assert.ok(!JSON.stringify(created).includes(body.initialPassword))
  assert.ok(!JSON.stringify(created).includes(stored.password_hash))
  assert.equal(created.role,'user')
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='user.create' AND result='success'",[created.id])).rows[0].count,1)
  assert.equal((await call(`/system/users/${created.id}`,{user:'b-admin'})).status,404)
  assert.equal((await call('/system/users',{user:'a-employee'})).status,403)
})
test('tenant profile edits do not change a shared identity in another tenant and concurrent revisions have one effect',async()=>{
  const shared=contracts.demoIdentities.find(identity=>identity.tenantIds.length>1)
  const prior=(await pool.query('SELECT name FROM users WHERE id=$1',[shared.id])).rows[0].name
  const profile=ok(await call(`/system/users/${shared.id}`))
  const edits=await Promise.all(['A范围姓名一','A范围姓名二'].map(name=>call(`/system/users/${shared.id}`,{method:'PUT',body:{name,expectedRevision:profile.revision}})))
  assert.deepEqual(edits.map(value=>value.status).sort(),[200,409])
  const afterA=ok(await call('/user/info',{user:shared.id,tenant:'tenant-a'})),afterB=ok(await call('/user/info',{user:shared.id,tenant:'tenant-b'}))
  assert.ok(afterA.name.startsWith('A范围姓名'))
  assert.equal(afterB.name,prior)
  assert.equal((await pool.query('SELECT name FROM users WHERE id=$1',[shared.id])).rows[0].name,prior)
  assert.equal((await call(`/system/users/${shared.id}/reset-password`,{method:'POST',body:{initialPassword:'Different-private-fixture-2026',expectedRevision:profile.revision+1,expectedCredentialRevision:profile.credentialRevision}})).status,409)
})
test('disabled membership cannot use its old session and the last effective user administrator remains enabled',async()=>{
  const body=input(),created=ok(await call('/system/users',{method:'POST',body}))
  passwords.set(body.username,body.initialPassword)
  ok(await call('/user/info',{user:body.username}))
  ok(await call(`/system/users/${created.id}`,{method:'PUT',body:{status:'disabled',expectedRevision:created.revision}}))
  assert.ok([401,404].includes((await call('/user/info',{user:body.username})).status))
  const administrator=ok(await call('/system/users/b-admin',{user:'b-admin'}))
  assert.equal((await call('/system/users/b-admin',{user:'b-admin',method:'PUT',body:{status:'disabled',expectedRevision:administrator.revision}})).status,409)
  assert.equal((await pool.query("SELECT status FROM memberships WHERE tenant_id='tenant-b' AND user_id='b-admin'")).rows[0].status,'enabled')
})
test('two effective administrators disabling themselves retain one governor under the same tenant lock',async()=>{
  const body=input(),created=ok(await call('/system/users',{method:'POST',body}))
  passwords.set(body.username,body.initialPassword)
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id=$2",[JSON.stringify(capabilities),created.id])
  const administrator=ok(await call('/system/users/a-admin'))
  const results=await Promise.all([
    call('/system/users/a-admin',{method:'PUT',body:{status:'disabled',expectedRevision:administrator.revision}}),
    call(`/system/users/${created.id}`,{user:body.username,method:'PUT',body:{status:'disabled',expectedRevision:created.revision}}),
  ])
  assert.deepEqual(results.map(value=>value.status).sort(),[200,409])
  const active=await pool.query("SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id='tenant-a' AND m.status='enabled' AND u.status='enabled' AND m.deleted_at IS NULL AND m.permissions @> $1::jsonb",[JSON.stringify(['system:user:create','system:user:update','system:user:delete'])])
  assert.equal(active.rowCount,1)
  // Restore only these owned synthetic fixture states for the following tests.
  await pool.query("UPDATE memberships SET status='enabled' WHERE tenant_id='tenant-a' AND user_id='a-admin'")
  await pool.query("UPDATE memberships SET status='disabled' WHERE tenant_id='tenant-a' AND user_id=$1",[created.id])
  tokens.delete('a-admin')
})
test('owned identity password reset revokes old sessions; member deletion is versioned, audited and keeps identity history',async()=>{
  const body=input(),created=ok(await call('/system/users',{method:'POST',body}))
  passwords.set(body.username,body.initialPassword)
  ok(await call('/user/info',{user:body.username}))
  const updated=ok(await call(`/system/users/${created.id}/reset-password`,{method:'POST',body:{initialPassword:'Rotated-private-fixture-2026',expectedRevision:created.revision,expectedCredentialRevision:created.credentialRevision}}))
  assert.equal((await call('/user/info',{user:body.username})).status,401)
  passwords.set(body.username,'Rotated-private-fixture-2026')
  tokens.delete(body.username)
  ok(await call('/user/info',{user:body.username}))
  const key=randomUUID()
  ok(await call(`/system/users/${created.id}`,{method:'DELETE',body:{expectedRevision:updated.revision},key}))
  ok(await call(`/system/users/${created.id}`,{method:'DELETE',body:{expectedRevision:updated.revision},key}))
  assert.equal((await call(`/system/users/${created.id}`)).status,404)
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM users WHERE id=$1',[created.id])).rows[0].total,1)
  const facts=(await pool.query("SELECT action FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND result='success' ORDER BY created_at,id",[created.id])).rows.map(value=>value.action)
  assert.deepEqual(facts,['user.create','login','user.password-reset','login','user.delete'])
})
test('revoking one tenant membership preserves the other tenant and re-enabling does not revive an old tenant session',async()=>{
  const shared=contracts.demoIdentities.find(identity=>identity.tenantIds.length>1)
  const profile=ok(await call(`/system/users/${shared.id}`))
  ok(await call('/user/info',{user:shared.id,tenant:'tenant-a'}))
  const disabled=ok(await call(`/system/users/${shared.id}`,{method:'PUT',body:{status:'disabled',expectedRevision:profile.revision}}))
  assert.equal((await call('/user/info',{user:shared.id,tenant:'tenant-a'})).status,404)
  ok(await call('/user/info',{user:shared.id,tenant:'tenant-b'}))
  ok(await call(`/system/users/${shared.id}`,{method:'PUT',body:{status:'enabled',expectedRevision:disabled.revision}}))
  assert.equal((await call('/user/info',{user:shared.id,tenant:'tenant-a'})).status,401)
  ok(await call('/user/info',{user:shared.id,tenant:'tenant-b'}))
  tokens.delete(shared.id)
  ok(await call('/user/info',{user:shared.id,tenant:'tenant-a'}))
})
test('a member with a real running approval cannot be silently disabled or deleted',async()=>{
  const application=ok(await call('/applications/leave',{user:'a-employee'}))
  const draft=ok(await call('/leave-requests',{user:'a-employee',method:'POST',body:{applicationReleaseId:application.activeReleaseId,fields:{leaveType:'personal',startDate:'2026-10-01',startSlot:'am',endDate:'2026-10-02',endSlot:'pm',reason:'成员待办保护验收'}}}))
  ok(await call(`/leave-requests/${draft.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:draft.revision}}))
  const reviewer=ok(await call('/system/users/a-manager-1'))
  const disabled=await call('/system/users/a-manager-1',{method:'PUT',body:{status:'disabled',expectedRevision:reviewer.revision}})
  assert.equal(disabled.status,409)
  assert.equal(disabled.businessCode,'MEMBER_HAS_PENDING_TASKS')
  assert.equal((await call('/system/users/a-manager-1',{method:'DELETE',body:{expectedRevision:reviewer.revision}})).status,409)
  const retained=ok(await call('/system/users/a-manager-1'))
  assert.equal(retained.status,'enabled');assert.equal(retained.revision,reviewer.revision)
})
test('revoked contact-reading permission cannot recover private contacts through an idempotent update replay',async()=>{
  const body=input(),created=ok(await call('/system/users',{method:'POST',body}))
  await pool.query("UPDATE memberships SET permissions=permissions || '[\"system:user:read-contacts\"]'::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'")
  assert.equal(ok(await call(`/system/users/${created.id}`)).phone,body.phone)
  const command={name:'仅更新姓名',expectedRevision:created.revision},key=randomUUID()
  ok(await call(`/system/users/${created.id}`,{method:'PUT',body:command,key}))
  await pool.query("UPDATE memberships SET permissions=permissions - 'system:user:read-contacts' WHERE tenant_id='tenant-a' AND user_id='a-admin'")
  assert.notEqual(ok(await call(`/system/users/${created.id}`)).phone,body.phone)
  const replay=ok(await call(`/system/users/${created.id}`,{method:'PUT',body:command,key}))
  assert.notEqual(replay.phone,body.phone)
  assert.notEqual(replay.email,body.email)
  assert.equal(replay.contactsMasked,true)
})
