import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {before,after,test} from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
const pool=db.createPool(),tokens=new Map()
let server,base,admins
before(async()=>{
 await migrations.migrate(pool);await seeds.seedDemo(pool)
 admins=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin')")).rows
 const codes=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(codes)])
 server=api.createServer(pool);base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{
 await server.close()
 for(const admin of admins)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[admin.tenant_id,admin.user_id,JSON.stringify(admin.permissions)])
 await pool.end()
})
const call=async(path,{user='a-admin',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,key=randomUUID()}={})=>{
 if(!tokens.has(user)){
  const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})})
  assert.equal(response.status,200);tokens.set(user,(await response.json()).data.token)
 }
 const response=await fetch(`${base}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,...await response.json()}
}
const ok=value=>{assert.equal(value.status,200,value.businessCode);return value.data}
const metadata=()=>({code:`app-${randomUUID().slice(0,8)}`,name:'合成独立应用',description:'隔离验收'})
const create=async(template='blank')=>ok(await call('/application-center',{method:'POST',body:{...metadata(),template}}))
const publish=async(app)=>{
 const f=ok(await call(`/form-schemas/${app.formDraftId}`)),w=ok(await call(`/workflows/${app.workflowDraftId}`))
 return ok(await call(`/applications/${app.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:w.revision,expectedRevision:app.revision}}))
}
test('real application creation is atomic, idempotent and creates independent default drafts without publishing',async()=>{
 const body={...metadata(),template:'blank'},key=randomUUID()
 const created=ok(await call('/application-center',{method:'POST',body,key})),replay=ok(await call('/application-center',{method:'POST',body,key}))
 assert.deepEqual(replay,created);assert.equal(created.activeReleaseId,null);assert.equal(created.businessKind,'generic')
 assert.notEqual(created.formDraftId,'form-leave');assert.notEqual(created.workflowDraftId,'workflow-leave')
 const f=ok(await call(`/form-schemas/${created.formDraftId}`));assert.deepEqual(f.schema.widgetsConfig,[])
 assert.equal((await call('/application-center',{method:'POST',body})).status,409)
 const count=await pool.query('SELECT count(*) AS total FROM applications WHERE tenant_id=$1 AND code=$2',['tenant-a',body.code]);assert.equal(Number(count.rows[0].total),1)
 assert.equal(ok(await call(`/application-center/${created.id}`)).id,created.id)
 assert.equal((await call(`/applications/${created.id}`,{user:'a-employee'})).status,404)
})
test('application lifecycle permissions, raw payloads and tenant identities are checked by the server',async()=>{
 const created=await create()
 assert.equal((await call('/application-center',{user:'a-employee'})).status,403)
 assert.equal((await call('/application-center',{user:'a-employee',method:'POST',body:{...metadata(),template:'blank'}})).status,403)
 assert.equal((await call(`/application-center/${created.id}`,{user:'b-admin'})).status,404)
 assert.equal((await call(`/application-center/${created.id}/copy`,{user:'b-admin',method:'POST',body:{...metadata(),expectedRevision:1}})).status,404)
 assert.equal((await call('/application-center',{method:'POST',body:{...metadata(),template:'blank',tenantId:'tenant-b'}})).status,422)
 assert.equal((await call('/application-center',{method:'POST',body:{...metadata(),template:'arbitrary-script'}})).status,422)
 assert.equal((await call('/application-center',{method:'POST',body:{...metadata(),code:'../../leave',template:'blank'}})).status,422)
})
test('copying published leave configuration remaps draft references and publishes an independent v1 while preserving source history',async()=>{
 const source=ok(await call('/applications/leave')),body={...metadata(),expectedRevision:source.revision},key=randomUUID()
 const copied=ok(await call('/application-center/leave/copy',{method:'POST',body,key}))
 assert.equal(ok(await call('/application-center/leave/copy',{method:'POST',body,key})).id,copied.id)
 assert.notEqual(copied.id,source.id);assert.equal(copied.activeReleaseId,null)
 const w=ok(await call(`/workflows/${copied.workflowDraftId}`));assert.ok(w.schema.nodes.every(node=>!node.config.formId||node.config.formId===copied.formDraftId))
 const stolen=await call(`/applications/${copied.id}/releases`,{method:'POST',body:{formDraftId:'form-leave',workflowDraftId:'workflow-leave',formRevision:1,workflowRevision:1,expectedRevision:copied.revision}})
 assert.equal(stolen.status,422);assert.equal(stolen.businessCode,'APPLICATION_BINDING_INVALID')
 const release=await publish(copied);assert.equal(release.applicationId,copied.id);assert.equal(release.releaseVersion,1)
 assert.equal(ok(await call('/applications/leave')).activeReleaseId,source.activeReleaseId)
 const f=ok(await call(`/form-schemas/${copied.formDraftId}`)),edited=structuredClone(f.schema);edited.widgetsConfig[0].config.label='仅副本标题'
 ok(await call(`/form-schemas/${f.id}`,{method:'PUT',body:{schema:edited,expectedRevision:f.revision}}))
 const original=ok(await call('/form-schemas/form-leave'));assert.notEqual(original.schema.widgetsConfig[0].config.label,'仅副本标题')
 const fields={leaveType:'personal',startDate:'2026-10-01',startSlot:'am',endDate:'2026-10-02',endSlot:'pm',reason:'复制应用实际运行'}
 const draft=ok(await call('/leave-requests',{user:'a-employee',method:'POST',body:{applicationReleaseId:release.id,fields}}))
 const running=ok(await call(`/leave-requests/${draft.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:draft.revision}}))
 assert.equal(running.status,'running')
 const current=ok(await call(`/application-center/${copied.id}`))
 ok(await call(`/application-center/${copied.id}/state`,{method:'PUT',body:{status:'archived',expectedRevision:current.revision}}))
 assert.equal((await call('/leave-requests',{user:'a-employee',method:'POST',body:{applicationReleaseId:release.id,fields}})).businessCode,'APPLICATION_ARCHIVED')
 assert.equal((await call(`/applications/${copied.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:2,workflowRevision:w.revision,expectedRevision:current.revision+1}})).businessCode,'APPLICATION_ARCHIVED')
 const todos=ok(await call('/workflow-todos',{user:'a-manager-1'})).list,task=todos.find(item=>item.requestId===draft.id)
 assert.ok(task);ok(await call(`/workflow-tasks/${task.id}/approve`,{user:'a-manager-1',method:'POST',body:{expectedRevision:task.revision}}))
 const next=ok(await call('/workflow-todos',{user:'a-manager-2'})).list.find(item=>item.requestId===draft.id)
 assert.ok(next);ok(await call(`/workflow-tasks/${next.id}/approve`,{user:'a-manager-2',method:'POST',body:{expectedRevision:next.revision}}))
 assert.equal(ok(await call(`/leave-requests/${draft.id}`,{user:'a-employee'})).status,'approved')
})
test('unpublished copies require both draft revisions and competing archive commands have one effect',async()=>{
 const created=await create()
 const body={...metadata(),expectedRevision:created.revision}
 assert.equal((await call(`/application-center/${created.id}/copy`,{method:'POST',body})).businessCode,'DRAFT_VERSION_REQUIRED')
 const copied=ok(await call(`/application-center/${created.id}/copy`,{method:'POST',body:{...body,formRevision:1,workflowRevision:1}}))
 assert.notEqual(copied.formDraftId,created.formDraftId);assert.notEqual(copied.workflowDraftId,created.workflowDraftId)
 const results=await Promise.all([1,2].map(()=>call(`/application-center/${created.id}/state`,{method:'PUT',body:{status:'archived',expectedRevision:created.revision}})))
 assert.deepEqual(results.map(value=>value.status).sort(),[200,409])
 const archived=ok(await call(`/application-center/${created.id}`));assert.equal(archived.status,'archived')
 const restored=ok(await call(`/application-center/${created.id}/state`,{method:'PUT',body:{status:'enabled',expectedRevision:archived.revision}}));assert.equal(restored.status,'enabled')
})
test('metadata edits preserve immutable codes and versions, and copied bound workflows point only at their new form',async()=>{
 const source=await create('leave')
 const w=ok(await call(`/workflows/${source.workflowDraftId}`)),schema=structuredClone(w.schema)
 schema.nodes.find(node=>node.type==='approval').config.formId=source.formDraftId
 ok(await call(`/workflows/${w.id}`,{method:'PUT',body:{schema,expectedRevision:w.revision}}))
 const published=await publish(source),current=ok(await call(`/application-center/${source.id}`))
 const copied=ok(await call(`/application-center/${source.id}/copy`,{method:'POST',body:{...metadata(),expectedRevision:current.revision}}))
 const bound=ok(await call(`/workflows/${copied.workflowDraftId}`)).schema.nodes.filter(node=>node.config.formId)
 assert.ok(bound.length>0);assert.ok(bound.every(node=>node.config.formId===copied.formDraftId));assert.notEqual(copied.formDraftId,source.formDraftId)
 assert.equal((await publish(copied)).releaseVersion,1)
 assert.equal(ok(await call(`/applications/${source.id}`)).activeReleaseId,published.id)
 const updated=ok(await call(`/application-center/${copied.id}`,{method:'PATCH',body:{name:'独立改名',description:'仅此副本',expectedRevision:2}}))
 assert.equal(updated.name,'独立改名');assert.equal(updated.code,copied.code)
 assert.equal((await call(`/application-center/${copied.id}`,{method:'PATCH',body:{name:'过期改名',expectedRevision:2}})).status,409)
 assert.equal((await call(`/application-center/${copied.id}`,{method:'PATCH',body:{code:'changed-id',expectedRevision:updated.revision}})).status,422)
})
test('a catalogue reader and copier can duplicate unpublished configuration using metadata versions without draft-reading authority',async()=>{
 const source=await create()
 const original=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-auditor'")).rows[0].permissions
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-auditor'",[JSON.stringify(['application:list','application:copy'])])
 try{
  const visible=ok(await call(`/application-center/${source.id}`,{user:'a-auditor'}));assert.equal(visible.formRevision,1);assert.equal(visible.workflowRevision,1)
  assert.equal((await call(`/form-schemas/${visible.formDraftId}`,{user:'a-auditor'})).status,403)
  const copied=ok(await call(`/application-center/${source.id}/copy`,{user:'a-auditor',method:'POST',body:{...metadata(),expectedRevision:visible.revision,formRevision:visible.formRevision,workflowRevision:visible.workflowRevision}}))
  assert.notEqual(copied.id,source.id);assert.notEqual(copied.formDraftId,visible.formDraftId)
 }finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-auditor'",[JSON.stringify(original)])}
})

test('bound definitions remain readable beyond the first catalogue page and real published snapshots compare without changing history',async()=>{
 const application=await create('equipment'),first=await publish(application)
 const draft=ok(await call(`/form-schemas/${application.formDraftId}`)),changed=structuredClone(draft.schema)
 changed.version=2;changed.widgetsConfig[0].config.label='资产名称';changed.widgetsConfig[0].config.validation={minLength:2}
 const saved=ok(await call(`/form-schemas/${draft.id}`,{method:'PUT',body:{schema:changed,expectedRevision:draft.revision}}))
 const current=ok(await call(`/application-center/${application.id}`)),second=await publish(current)
 const prefix=`later-${randomUUID().slice(0,8)}-`
 try{
  for(const table of ['form_drafts','workflow_drafts']){
   const source=ok(await call(`/${table==='form_drafts'?'form-schemas':'workflows'}/${table==='form_drafts'?application.formDraftId:application.workflowDraftId}`))
   await pool.query(`INSERT INTO ${table}(tenant_id,id,name,schema,revision,updated_at) SELECT 'tenant-a',$1 || n::text,'后续目录验收', $2::jsonb,1,now()+interval '1 minute' FROM generate_series(1,101) AS n`,[prefix,JSON.stringify(source.schema)])
  }
  assert.ok(!ok(await call('/form-schemas?current=1&pageSize=100')).list.some(item=>item.id===draft.id))
  assert.ok(!ok(await call('/workflows?current=1&pageSize=100')).list.some(item=>item.id===application.workflowDraftId))
  assert.equal(ok(await call(`/form-schemas/${draft.id}`)).revision,saved.revision)
  assert.equal(ok(await call(`/workflows/${application.workflowDraftId}`)).id,application.workflowDraftId)
  const detail=ok(await call(`/applications/${application.id}`))
  const contracts=(await import('@af-admin/contracts')).default
  const diff=contracts.compareFormDefinitions(detail.releases.find(item=>item.id===first.id).formSnapshot,detail.releases.find(item=>item.id===second.id).formSnapshot)
  assert.equal(diff.fields[0].key,'itemName');assert.ok(diff.fields[0].properties.some(item=>item.property==='validation'))
  assert.equal(detail.releases.find(item=>item.id===first.id).formSnapshot.widgetsConfig[0].config.label,'设备名称')
  assert.equal((await call(`/applications/${application.id}`,{user:'b-admin'})).status,404)
  assert.equal((await call(`/form-schemas/${draft.id}`,{user:'b-admin'})).status,404)
  assert.equal((await call(`/form-schemas/${draft.id}`,{user:'a-employee'})).status,403)
  const original=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
  await pool.query("UPDATE memberships SET permissions=permissions-'application:configure' WHERE tenant_id='tenant-a' AND user_id='a-admin'")
  try{assert.equal((await call(`/form-schemas/${draft.id}`)).status,403)}finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(original)])}
 }finally{
  await pool.query('DELETE FROM form_drafts WHERE tenant_id=$1 AND id LIKE $2',['tenant-a',`${prefix}%`])
  await pool.query('DELETE FROM workflow_drafts WHERE tenant_id=$1 AND id LIKE $2',['tenant-a',`${prefix}%`])
 }
})
