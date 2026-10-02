import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before,after,test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import contracts from '@af-admin/contracts'
const pool=db.createPool(),tokens=new Map(),passwords=new Map()
let server,base,codes
before(async()=>{
 await migrations.migrate(pool);await seeds.seedDemo(pool)
 codes=(await pool.query("SELECT code FROM permission_definitions WHERE code<>'system:user:read-contacts' ORDER BY code")).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(codes)])
 server=api.createServer(pool);base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();await pool.end()})
const call=async(path,{user='a-admin',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,key=randomUUID()}={})=>{
 if(!tokens.has(user)){
  const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:passwords.get(user)||user})})
  assert.equal(response.status,200);tokens.set(user,(await response.json()).data.token)
 }
 const response=await fetch(`${base}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,...await response.json()}
}
const ok=value=>{assert.equal(value.status,200,value.businessCode);return value.data}
const role=(permissions=[],name='合成角色')=>({roleName:name,roleKey:`role-${randomUUID().slice(0,8)}`,roleSort:1,status:'enabled',remark:'合成验收',permissions})
const member=async(actor='a-admin',tenant='tenant-a')=>{
 const body={username:`role-user-${randomUUID().slice(0,8)}`,name:'角色合成成员',initialPassword:'Role-private-fixture-2026',status:'enabled'}
 const value=ok(await call('/system/users',{user:actor,tenant,method:'POST',body}))
 passwords.set(body.username,body.initialPassword)
 return {...value,username:body.username}
}
test('tenant role CRUD and member authorization are real, audited, idempotent and immediately affect the same session',async()=>{
 const user=await member(),input=role(['system:user:list','system:user:detail']),key=randomUUID()
 assert.equal((await call('/system/users',{user:user.username})).status,403)
 const created=ok(await call('/system/roles',{method:'POST',body:input,key}))
 assert.equal(ok(await call('/system/roles',{method:'POST',body:input,key})).id,created.id)
 assert.equal((await call(`/system/roles/${created.id}`,{user:'b-admin'})).status,404)
 const assigned=ok(await call(`/system/users/${user.id}/authorization`,{method:'POST',body:{roleIds:[created.id],directPermissions:[],expectedRevision:user.revision}}))
 assert.equal(assigned.revision,user.revision+1)
 ok(await call('/system/users',{user:user.username}))
 const info=ok(await call('/user/info',{user:user.username}))
 assert.ok(info.permissions.includes('system:user:list'))
 const revoked=ok(await call(`/system/roles/${created.id}`,{method:'PUT',body:{...input,permissions:[],expectedRevision:1}}))
 assert.equal(revoked.revision,2)
 assert.equal((await call('/system/users',{user:user.username})).status,403)
 assert.ok(!ok(await call('/user/info',{user:user.username})).permissions.includes('system:user:list'))
 const facts=(await pool.query("SELECT action FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND result='success' ORDER BY created_at,id",[created.id])).rows.map(row=>row.action)
 assert.deepEqual(facts,['role.create','role.update'])
})
test('controlled permission catalogue and delegation deny wildcard, unknown codes and privileges the caller does not hold',async()=>{
 const user=await member()
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id=$2",[JSON.stringify(Object.values(contracts.ROLE_PERMISSIONS)),user.id])
 const catalog=ok(await call('/system/permissions',{user:user.username}))
 assert.ok(catalog.some(permission=>permission.code==='system:user:delete'&&permission.delegatable===false))
 const excess=await call('/system/roles',{user:user.username,method:'POST',body:role(['system:user:delete'])})
 assert.equal(excess.status,403);assert.equal(excess.businessCode,'PRIVILEGE_BOUNDS')
 assert.equal((await call('/system/roles',{method:'POST',body:role(['*'])})).status,422)
 assert.equal((await call('/system/roles',{method:'POST',body:role(['unknown:execute'])})).status,422)
 assert.equal((await call('/system/roles',{method:'POST',body:{...role(),tenantId:'tenant-b'}})).status,422)
 const root=ok(await call('/system/roles',{method:'POST',body:role()}))
 const other=await member('b-admin','tenant-b')
 assert.equal((await call(`/system/users/${other.id}/authorization`,{user:'b-admin',method:'POST',body:{roleIds:[root.id],directPermissions:[],expectedRevision:other.revision}})).status,404)
})
test('role lifecycle and member revoke preserve the last effective governor even when privileges come only from a role',async()=>{
 const input=role(codes,'租户B授权管理者'),governor=ok(await call('/system/roles',{user:'b-admin',method:'POST',body:input}))
 const current=ok(await call('/system/users/b-admin',{user:'b-admin'}))
 const bound=ok(await call('/system/users/b-admin/authorization',{user:'b-admin',method:'POST',body:{roleIds:[governor.id],directPermissions:[],expectedRevision:current.revision}}))
 const disable=await call(`/system/roles/${governor.id}`,{user:'b-admin',method:'PUT',body:{...input,status:'disabled',expectedRevision:1}})
 assert.equal(disable.status,409);assert.equal(disable.businessCode,'LAST_ADMINISTRATOR')
 assert.equal((await call(`/system/roles/${governor.id}`,{user:'b-admin',method:'PUT',body:{...input,permissions:codes.filter(code=>code!=='system:role:assign'),expectedRevision:1}})).status,409)
 assert.equal((await call('/system/users/b-admin/authorization',{user:'b-admin',method:'POST',body:{roleIds:[],directPermissions:[],expectedRevision:bound.revision}})).status,409)
 assert.equal((await call('/system/users/b-admin',{user:'b-admin',method:'PUT',body:{status:'disabled',expectedRevision:bound.revision}})).status,409)
 assert.equal(ok(await call(`/system/roles/${governor.id}`,{user:'b-admin'})).status,'enabled')
})
test('role optimistic versions and referenced deletion prevent stale overwrite or silent membership removal',async()=>{
 const input=role(),created=ok(await call('/system/roles',{method:'POST',body:input})),user=await member()
 const changes=await Promise.all([1,2].map(roleSort=>call(`/system/roles/${created.id}`,{method:'PUT',body:{...input,roleSort,expectedRevision:1}})))
 assert.deepEqual(changes.map(value=>value.status).sort(),[200,409])
 ok(await call(`/system/users/${user.id}/authorization`,{method:'POST',body:{roleIds:[created.id],directPermissions:[],expectedRevision:user.revision}}))
 assert.equal((await call(`/system/roles/${created.id}`,{method:'DELETE',body:{expectedRevision:2}})).status,409)
 const auth=ok(await call(`/system/users/${user.id}/authorization`))
 ok(await call(`/system/users/${user.id}/authorization`,{method:'POST',body:{roleIds:[],directPermissions:[],expectedRevision:auth.revision}}))
 ok(await call(`/system/roles/${created.id}`,{method:'DELETE',body:{expectedRevision:2}}))
 assert.equal((await call(`/system/roles/${created.id}`)).status,404)
})
test('two complete governors concurrently revoking their own authority preserve one effective owner',{timeout:10000},async()=>{
 const input=role(codes,'第二完整管理者'),created=ok(await call('/system/roles',{method:'POST',body:input})),user=await member()
 const bound=ok(await call(`/system/users/${user.id}/authorization`,{method:'POST',body:{roleIds:[created.id],directPermissions:[],expectedRevision:user.revision}}))
 const first=ok(await call('/system/users/a-admin/authorization'))
 const results=await Promise.all([
  call('/system/users/a-admin/authorization',{method:'POST',body:{roleIds:[],directPermissions:[],expectedRevision:first.revision}}),
  call(`/system/users/${user.id}/authorization`,{user:user.username,method:'POST',body:{roleIds:[],directPermissions:[],expectedRevision:bound.revision}}),
 ])
 assert.deepEqual(results.map(value=>value.status).sort(),[200,409])
 const surviving=results[0].status===200?user.username:'a-admin'
 const target=ok(await call('/system/users/a-admin/authorization',{user:surviving}))
 ok(await call('/system/users/a-admin/authorization',{user:surviving,method:'POST',body:{roleIds:[],directPermissions:codes,expectedRevision:target.revision}}))
 const other=ok(await call(`/system/users/${user.id}/authorization`))
 ok(await call(`/system/users/${user.id}/authorization`,{method:'POST',body:{roleIds:[],directPermissions:[],expectedRevision:other.revision}}))
})
test('a reviewer authorized only through a role can publish and execute the actual workflow, then loses historical detail access on revoke',async()=>{
 const user=await member(),input=role(['workflow:todo','workflow:approve','workflow:reject'],'真实审批角色'),assigned=ok(await call('/system/roles',{method:'POST',body:input}))
 ok(await call(`/system/users/${user.id}/authorization`,{method:'POST',body:{roleIds:[assigned.id],directPermissions:[],expectedRevision:user.revision}}))
 const original=ok(await call('/workflows/workflow-leave'))
 const publish=async()=>{
  const form=ok(await call('/form-schemas/form-leave')),workflow=ok(await call('/workflows/workflow-leave')),application=ok(await call('/applications/leave'))
  return ok(await call('/applications/leave/releases',{method:'POST',body:{formDraftId:form.id,workflowDraftId:workflow.id,formRevision:form.revision,workflowRevision:workflow.revision,expectedRevision:application.revision}}))
 }
 const changed=ok(await call('/workflows/workflow-leave',{method:'PUT',body:{schema:contracts.serialWorkflow(user.id,'a-manager-2'),expectedRevision:original.revision}}))
 try{
  await publish()
  const application=ok(await call('/applications/leave',{user:'a-employee'}))
  const draft=ok(await call('/leave-requests',{user:'a-employee',method:'POST',body:{applicationReleaseId:application.activeReleaseId,fields:{leaveType:'personal',startDate:'2026-10-01',startSlot:'am',endDate:'2026-10-02',endSlot:'pm',reason:'角色授权真实审批验收'}}}))
  ok(await call(`/leave-requests/${draft.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:draft.revision}}))
  const task=ok(await call('/workflow-todos',{user:user.username})).list.find(value=>value.requestId===draft.id)
  assert.ok(task)
  ok(await call(`/workflow-tasks/${task.id}/approve`,{user:user.username,method:'POST',body:{expectedRevision:task.revision,comment:'角色授权处理'}}))
  const second=ok(await call('/workflow-todos',{user:'a-manager-2'})).list.find(value=>value.requestId===draft.id)
  ok(await call(`/workflow-tasks/${second.id}/approve`,{user:'a-manager-2',method:'POST',body:{expectedRevision:second.revision,comment:'角色授权回归完成'}}))
  assert.equal(ok(await call(`/leave-requests/${draft.id}`,{user:user.username})).status,'approved')
  ok(await call(`/system/roles/${assigned.id}`,{method:'PUT',body:{...input,permissions:[],expectedRevision:1}}))
  const denied=await call(`/leave-requests/${draft.id}`,{user:user.username})
  assert.equal(denied.status,404);assert.equal(denied.businessCode,'NOT_FOUND')
  assert.equal(denied.data,null)
  assert.equal(ok(await call(`/leave-requests/${draft.id}`,{user:'a-employee'})).applicationReleaseId,application.activeReleaseId)
 }finally{
  ok(await call('/workflows/workflow-leave',{method:'PUT',body:{schema:original.schema,expectedRevision:changed.revision}}))
  await publish()
 }
})
