import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {before,after,test} from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migration from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import support from '../../services/reference-api/dist/support.js'
const pool=db.createPool(),tokens=new Map()
let server,base,originals,fail=false
before(async()=>{
 await migration.migrate(pool);await seeds.seedDemo(pool)
 originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','b-employee')")).rows
 const codes=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin','b-employee')",[JSON.stringify(codes)])
 server=api.createServer(pool,point=>{if(fail&&point==='package:application-created'){fail=false;throw new Error('Controlled import rollback')}});base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();for(const item of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[item.tenant_id,item.user_id,JSON.stringify(item.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,key=randomUUID()}={})=>{
 if(!tokens.has(user)){const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(response.status,200);tokens.set(user,(await response.json()).data.token)}
 const response=await fetch(`${base}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,...await response.json()}
}
const ok=result=>{assert.equal(result.status,200,result.businessCode);return result.data}
const metadata=()=>({code:`package-${randomUUID().slice(0,8)}`,name:'设备跨租户定义',description:'真实导入'})
const exported=async()=>{
 const created=ok(await call('/application-center',{method:'POST',body:{...metadata(),template:'equipment'}}))
 const f=ok(await call(`/form-schemas/${created.formDraftId}`)),w=ok(await call(`/workflows/${created.workflowDraftId}`))
 ok(await call(`/applications/${created.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:w.revision,expectedRevision:created.revision}}))
 return ok(await call(`/application-center/${created.id}/package`,{method:'POST',body:{expectedRevision:2}}))
}
const bindings=pkg=>Object.fromEntries(pkg.people.map((slot,index)=>[slot.key,slot.kind==='copy'?'b-auditor':index===0?'b-manager-1':'b-manager-2']))
const digest=pkg=>{const copy=structuredClone(pkg);delete copy.checksum;pkg.checksum=support.contentHash(copy);return pkg}
test('exported definition contains portable references and explicit redactions, then another tenant imports and executes its own release',async()=>{
 const pkg=await exported(),serialized=JSON.stringify(pkg)
 for(const secret of ['tenant-a','a-manager-1','a-manager-2','a-auditor','publishedBy','password','token'])assert.equal(serialized.includes(secret),false)
 assert.equal(pkg.version,1);assert.ok(pkg.redactions.length>0);assert.ok(pkg.form.widgetsConfig.every(widget=>widget.config.defaultValue===undefined))
 const body={package:pkg,...metadata(),bindings:bindings(pkg)},key=randomUUID()
 const imported=ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body,key})),app=imported.application
 assert.equal(ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body,key})).application.id,app.id)
 assert.equal(app.tenantId,'tenant-b');assert.equal(app.activeReleaseId,null)
 const f=ok(await call(`/form-schemas/${app.formDraftId}`,{user:'b-admin'})),w=ok(await call(`/workflows/${app.workflowDraftId}`,{user:'b-admin'}))
 assert.ok(w.schema.nodes.filter(node=>node.type==='approval').every(node=>node.config.approvers[0].startsWith('b-')))
 const release=ok(await call(`/applications/${app.id}/releases`,{user:'b-admin',method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:w.revision,expectedRevision:app.revision}}));assert.equal(release.releaseVersion,1)
 const draft=ok(await call('/business/records',{user:'b-employee',method:'POST',body:{applicationReleaseId:release.id,fields:{itemName:'独立设备',quantity:2,reason:'导入新租户使用'}}}))
 ok(await call(`/business/records/${draft.id}/submit`,{user:'b-employee',method:'POST',body:{expectedRevision:draft.revision}}))
 const task=ok(await call('/workflow-todos',{user:'b-manager-1'})).list.find(row=>row.requestId===draft.id);assert.ok(task)
 ok(await call(`/workflow-tasks/${task.id}/approve`,{user:'b-manager-1',method:'POST',body:{expectedRevision:task.revision}}))
 const next=ok(await call('/workflow-todos',{user:'b-manager-2'})).list.find(row=>row.requestId===draft.id);assert.ok(next)
 ok(await call(`/workflow-tasks/${next.id}/approve`,{user:'b-manager-2',method:'POST',body:{expectedRevision:next.revision}}))
 assert.equal(ok(await call(`/business/records/${draft.id}`,{user:'b-employee'})).status,'approved')
 assert.equal((await call(`/business/records/${draft.id}`,{user:'a-admin'})).status,404)
})
test('packages reject tampering, future formats, unexpected dependencies, raw tenant references and foreign member bindings',async()=>{
 const pkg=await exported(),body={package:pkg,...metadata(),bindings:bindings(pkg)}
 const tampered=structuredClone(pkg);tampered.application.name='changed'
 assert.equal((await call('/application-packages/import',{user:'b-admin',method:'POST',body:{...body,package:tampered}})).businessCode,'PACKAGE_CHECKSUM_INVALID')
 for(const mutate of [p=>{p.version=99},p=>{p.dependencies[0].version=999},p=>{p.tenantId='tenant-a'},p=>{p.workflow.nodes.find(n=>n.type==='approval').config.approvers=['a-manager-1']},p=>{p.form.widgetsConfig[0].config.defaultValue='private data'}]){
  const bad=structuredClone(pkg);mutate(bad);digest(bad)
  assert.equal((await call('/application-packages/import',{user:'b-admin',method:'POST',body:{...body,package:bad}})).status,422)
 }
 const foreign=bindings(pkg);foreign[pkg.people.find(slot=>slot.kind==='approver').key]='a-manager-1'
 assert.equal((await call('/application-packages/import',{user:'b-admin',method:'POST',body:{...body,bindings:foreign}})).businessCode,'INACTIVE_APPROVER')
 assert.equal((await call('/application-packages/import',{user:'a-employee',method:'POST',body})).status,403)
})
test('an import fault rolls back app, drafts, audit and idempotency, and the same command can recover once',async()=>{
 const pkg=await exported(),body={package:pkg,...metadata(),bindings:bindings(pkg)},key=randomUUID()
 fail=true;assert.equal((await call('/application-packages/import',{user:'b-admin',method:'POST',body,key})).status,500)
 assert.equal((await pool.query("SELECT id FROM applications WHERE tenant_id='tenant-b' AND code=$1",[body.code])).rowCount,0)
 const result=ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body,key}))
 assert.equal(ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body,key})).application.id,result.application.id)
 assert.equal((await pool.query("SELECT count(*) AS total FROM audit_events WHERE tenant_id='tenant-b' AND target_id=$1 AND action='application.package-import' AND result='success'",[result.application.id])).rows[0].total,'1')
})
