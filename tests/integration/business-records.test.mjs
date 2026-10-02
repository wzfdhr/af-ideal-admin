import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import {before,after,test} from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import contracts from '@af-admin/contracts'
const pool=db.createPool(),tokens=new Map()
let server,base,originals,failure=null
const fault=point=>{if(point===failure){failure=null;throw new Error('Controlled business rollback')}}
before(async()=>{
 await migrations.migrate(pool);await seeds.seedDemo(pool)
 originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','a-employee','b-employee')")).rows
 const all=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(all)])
 await pool.query("UPDATE memberships SET permissions=permissions || $1::jsonb WHERE user_id IN ('a-employee','b-employee')",[JSON.stringify(Object.values(contracts.BUSINESS_PERMISSIONS))])
 server=api.createServer(pool,fault);base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();for(const row of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,JSON.stringify(row.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,key=randomUUID(),origin=base}={})=>{
 if(!tokens.has(user)){
  const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(response.status,200);tokens.set(user,(await response.json()).data.token)
 }
 const response=await fetch(`${origin}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,...await response.json()}
}
const ok=value=>{assert.equal(value.status,200,value.businessCode);return value.data}
const app=async()=>{
 const created=ok(await call('/application-center',{method:'POST',body:{name:'设备领用通用引擎验收',code:`proc-${randomUUID().slice(0,8)}`,template:'equipment'}}))
 const f=ok(await call(`/form-schemas/${created.formDraftId}`)),w=ok(await call(`/workflows/${created.workflowDraftId}`))
 const release=ok(await call(`/applications/${created.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:w.revision,expectedRevision:created.revision}}))
 return {...created,release}
}
const fields={itemName:'合成办公用品',quantity:'3',unitPrice:'0.10',reason:'通用业务真实校验'}
const create=async(application,values=fields)=>ok(await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:application.release.id,fields:values}}))
test('equipment request creates a generic record with exact decimal calculation while the original leave view remains isolated',async()=>{
 const application=await app(),record=await create(application)
 const detail=ok(await call(`/business/records/${record.id}`,{user:'a-employee'}))
 assert.equal(detail.fields.quantity,3);assert.equal(detail.fields.unitPrice,'0.10');assert.equal(detail.computedFields.totalAmount,'0.30')
 assert.equal((await call(`/leave-requests/${record.id}`,{user:'a-employee'})).status,404)
 const row=(await pool.query('SELECT record_kind,half_day_units FROM business_records WHERE tenant_id=$1 AND id=$2',['tenant-a',record.id])).rows[0]
 assert.equal(row.record_kind,'generic');assert.equal(row.half_day_units,null)
 assert.equal((await pool.query('SELECT id FROM leave_requests WHERE tenant_id=$1 AND id=$2',['tenant-a',record.id])).rowCount,0)
 assert.equal((await call(`/business/records/${record.id}`,{user:'b-admin'})).status,404)
 assert.equal((await call(`/business/records/${record.id}`,{user:'a-admin'})).status,404)
})
test('registered business fields reject injected totals, arbitrary data and malformed integer or decimal values',async()=>{
 const application=await app()
 for(const changed of [{quantity:'1.2'},{quantity:0},{quantity:[3]},{unitPrice:'0.001'},{unitPrice:'1e4'},{totalAmount:'0.01'},{constructor:'script'},{itemName:'x'.repeat(101)}]){
  const result=await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:application.release.id,fields:{...fields,...changed}}});assert.equal(result.status,422)
 }
 assert.equal((await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:application.release.id,fields,applicantId:'a-admin'}})).status,422)
 const draft=await create(application,{})
 assert.equal((await call(`/business/records/${draft.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:1}})).status,422)
 assert.equal(ok(await call(`/business/records/${draft.id}`,{user:'a-employee'})).status,'draft')
})
test('the common task engine approves an equipment request with pinned schema, history and a business-specific message link',async()=>{
 const application=await app(),record=await create(application)
 const key=randomUUID(),body={expectedRevision:record.revision}
 const submitted=ok(await call(`/business/records/${record.id}/submit`,{user:'a-employee',method:'POST',body,key}))
 assert.deepEqual(ok(await call(`/business/records/${record.id}/submit`,{user:'a-employee',method:'POST',body,key})),submitted)
 assert.equal((await call(`/business/records/${record.id}`,{user:'a-manager-2'})).status,404)
 const task=ok(await call('/workflow-todos',{user:'a-manager-1'})).list.find(value=>value.requestId===record.id)
 assert.ok(task);assert.equal(task.businessKind,'generic');assert.equal(task.recordLink,`/business/records/${record.id}`)
 assert.equal(ok(await call(`/business/records/${record.id}`,{user:'a-manager-1'})).computedFields.totalAmount,'0.30')
 ok(await call(`/workflow-tasks/${task.id}/approve`,{user:'a-manager-1',method:'POST',body:{expectedRevision:task.revision}}))
 const next=ok(await call('/workflow-todos',{user:'a-manager-2'})).list.find(value=>value.requestId===record.id)
 assert.ok(next);ok(await call(`/workflow-tasks/${next.id}/approve`,{user:'a-manager-2',method:'POST',body:{expectedRevision:next.revision}}))
 const detail=ok(await call(`/business/records/${record.id}`,{user:'a-employee'}));assert.equal(detail.status,'approved');assert.equal(detail.applicationReleaseId,application.release.id)
 assert.deepEqual(detail.history.map(value=>value.action),['start','approve','approve','copy'])
 const notifications=await pool.query("SELECT payload FROM outbox WHERE tenant_id='tenant-a' AND recipient_id='a-employee' AND payload->>'requestId'=$1",[record.id])
 assert.ok(notifications.rows.some(value=>value.payload.link===`/business/records/${record.id}`))
})
test('generic submissions roll back all effects on a fault, then recover exactly once; competing keys have one effect',async()=>{
 const application=await app(),record=await create(application),key=randomUUID(),body={expectedRevision:record.revision}
 failure='business:submit-task-created'
 assert.equal((await call(`/business/records/${record.id}/submit`,{user:'a-employee',method:'POST',body,key})).status,500)
 assert.equal((await pool.query('SELECT id FROM workflow_instances WHERE tenant_id=$1 AND request_id=$2',['tenant-a',record.id])).rowCount,0)
 assert.equal(ok(await call(`/business/records/${record.id}`,{user:'a-employee'})).revision,1)
 const results=await Promise.all([key,randomUUID()].map(k=>call(`/business/records/${record.id}/submit`,{user:'a-employee',method:'POST',body,key:k})))
 assert.deepEqual(results.map(value=>value.status).sort(),[200,409])
 const count=(await pool.query('SELECT count(*) AS total FROM workflow_instances WHERE tenant_id=$1 AND request_id=$2',['tenant-a',record.id])).rows[0]
 assert.equal(Number(count.total),1)
})
test('withdrawal uses the shared engine but requires generic ownership and cancels the corresponding tasks',async()=>{
 const application=await app(),record=await create(application)
 const submitted=ok(await call(`/business/records/${record.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:record.revision}}))
 assert.equal((await call(`/business/records/${record.id}/withdraw`,{user:'a-admin',method:'POST',body:{expectedRevision:submitted.revision}})).status,404)
 const result=ok(await call(`/business/records/${record.id}/withdraw`,{user:'a-employee',method:'POST',body:{expectedRevision:submitted.revision}}))
 assert.equal(result.status,'withdrawn')
 assert.ok((await pool.query('SELECT status FROM workflow_tasks WHERE tenant_id=$1 AND instance_id=$2',['tenant-a',submitted.instanceId])).rows.every(value=>value.status==='cancelled'))
})
test('a new business release requires explicit same-application draft migration and never rewrites running snapshots',async()=>{
 const application=await app(),draft=await create(application),running=await create(application)
 ok(await call(`/business/records/${running.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:running.revision}}))
 const f=ok(await call(`/form-schemas/${application.formDraftId}`)),schema=structuredClone(f.schema)
 schema.widgetsConfig.push({uid:'projectCode',type:'input',name:'项目编号',config:{id:'projectCode',label:'项目编号',required:true,maxLength:30}})
 ok(await call(`/form-schemas/${f.id}`,{method:'PUT',body:{schema,expectedRevision:f.revision}}))
 const current=ok(await call(`/application-center/${application.id}`)),w=ok(await call(`/workflows/${application.workflowDraftId}`))
 const next=ok(await call(`/applications/${application.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision+1,workflowRevision:w.revision,expectedRevision:current.revision}}))
 const stale=await call(`/business/records/${draft.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:draft.revision}})
 assert.equal(stale.status,409);assert.equal(stale.businessCode,'RELEASE_CHANGED')
 const another=await app()
 const wrong=await call(`/business/records/${draft.id}`,{user:'a-employee',method:'PATCH',body:{fields:{...fields,projectCode:'P-01'},applicationReleaseId:another.release.id,expectedRevision:draft.revision}})
 assert.equal(wrong.status,404)
 const migrated=ok(await call(`/business/records/${draft.id}`,{user:'a-employee',method:'PATCH',body:{fields:{...fields,projectCode:'P-01'},applicationReleaseId:next.id,expectedRevision:draft.revision}}))
 ok(await call(`/business/records/${draft.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:migrated.revision}}))
 const pinned=ok(await call(`/business/records/${running.id}`,{user:'a-employee'}));assert.equal(pinned.applicationReleaseId,application.release.id);assert.ok(!pinned.release.formSnapshot.widgetsConfig.some(widget=>widget.uid==='projectCode'))
})
test('generic records and their existing session survive API replacement; revocation removes later ownership reads',async()=>{
 const application=await app(),created=await create(application),before=ok(await call(`/business/records/${created.id}`,{user:'a-employee'}))
 const start=async()=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:['ignore','ignore','ignore','ipc']})
  try{const [ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)});return {child,origin:ready.base}}catch(error){child.kill('SIGKILL');throw error}
 }
 const stop=async(child)=>{const closed=once(child,'exit');child.kill('SIGTERM');const [status]=await closed;assert.equal(status,0)}
 const first=await start()
 try{assert.deepEqual(ok(await call(`/business/records/${created.id}`,{user:'a-employee',origin:first.origin})),before)}finally{await stop(first.child)}
 const replacement=await start()
 try{assert.deepEqual(ok(await call(`/business/records/${created.id}`,{user:'a-employee',origin:replacement.origin})),before)}finally{await stop(replacement.child)}
 const stored=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-employee'")).rows[0].permissions
 await pool.query("UPDATE memberships SET permissions=permissions-'business:read:self' WHERE tenant_id='tenant-a' AND user_id='a-employee'")
 try{assert.equal((await call(`/business/records/${created.id}`,{user:'a-employee'})).status,404)}finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(stored)])}
})
