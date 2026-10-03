import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import {before,after,test} from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migration from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import c from '@af-admin/contracts'
const pool=db.createPool(),tokens=new Map();let server,base,originals,failure=null
before(async()=>{
 await migration.migrate(pool);await seed.seedDemo(pool)
 originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','a-employee','b-employee','a-manager-1')")).rows
 const all=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(all)])
 await pool.query("UPDATE memberships SET permissions=permissions||$1::jsonb WHERE user_id IN ('a-employee','b-employee')",[JSON.stringify([...Object.values(c.BUSINESS_PERMISSIONS),c.LOW_CODE_PERMISSIONS.run])])
 await pool.query("UPDATE memberships SET permissions=permissions||$1::jsonb WHERE user_id='a-manager-1'",[JSON.stringify([c.BUSINESS_PERMISSIONS.read,c.BUSINESS_PERMISSIONS.update,c.LOW_CODE_PERMISSIONS.run])])
 server=api.createServer(pool,point=>{if(point===failure){failure=null;throw new Error('Controlled low code rollback')}});base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();for(const row of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,JSON.stringify(row.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',method='GET',body,key=randomUUID(),origin=base}={})=>{
 if(!tokens.has(user)){const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(response.status,200);tokens.set(user,(await response.json()).data.token)}
 const response=await fetch(`${origin}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':user.startsWith('b-')?'tenant-b':'tenant-a','idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,...await response.json()}
}
const ok=result=>{assert.equal(result.status,200,result.message);return result.data}
const fixture=async()=>{
 const app=ok(await call('/application-center',{method:'POST',body:{name:'低代码真实设备',code:`lc-app-${randomUUID().slice(0,8)}`,template:'equipment'}})),f=ok(await call(`/form-schemas/${app.formDraftId}`)),w=ok(await call(`/workflows/${app.workflowDraftId}`))
 const appRelease=ok(await call(`/applications/${app.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:w.revision,expectedRevision:app.revision}}))
 const page=ok(await call('/low-code/pages/from-application',{method:'POST',body:{name:'真实设备管理页',applicationReleaseId:appRelease.id}}))
 const release=ok(await call(`/low-code/pages/${page.id}/publish`,{method:'POST',body:{expectedRevision:page.revision}}))
 return{app,appRelease,page,release}
}
const run=(ctx,action,body={},options={})=>call(`/low-code/runtime/${ctx.page.id}/actions/${action}`,{user:'a-employee',method:'POST',body:{releaseId:ctx.release.id,...body},...options})
const values={itemName:'低代码真实键盘',quantity:2,unitPrice:'0.10',reason:'公共能力复用'}

test('all five runtime actions have real isolated effects and share the existing save and approval transaction',async()=>{
 const ctx=await fixture(),runtime=ok(await call(`/low-code/runtime/${ctx.page.id}`,{user:'a-employee'}));assert.equal(runtime.releaseId,ctx.release.id);assert.ok(runtime.forms.editor)
 const before=ok(await run(ctx,'query'));assert.equal(before.kind,'data');assert.equal(before.data.total,0)
 const modal=ok(await run(ctx,'new'));assert.equal(modal.kind,'modal');assert.equal(modal.mode,'create');assert.equal(modal.targetId,'editor')
 const key=randomUUID(),created=ok(await run(ctx,'create',{fields:values},{key}));assert.deepEqual(ok(await run(ctx,'create',{fields:values},{key})),created)
 assert.equal(created.record.status,'draft');const id=created.record.id
 const refreshed=ok(await run(ctx,'refresh'));assert.equal(refreshed.data.total,1);assert.equal(refreshed.data.list[0]['field:itemName'],values.itemName)
 const navigation=ok(await run(ctx,'detail',{recordId:id}));assert.equal(navigation.to,`/business/records/${id}`)
 const edit=ok(await run(ctx,'edit',{recordId:id}));assert.equal(edit.record.fields.itemName,values.itemName)
 const saved=ok(await run(ctx,'save',{recordId:id,expectedRevision:created.record.revision,fields:{...values,quantity:3}}));assert.equal(saved.record.revision,2)
 assert.equal((await run(ctx,'start',{recordId:id,expectedRevision:2,fields:values})).businessCode,'LOW_CODE_UNSAVED_FIELDS')
 const submitted=ok(await run(ctx,'start',{recordId:id,expectedRevision:2}));assert.equal(submitted.record.status,'running');assert.ok(submitted.record.instanceId)
 const detail=ok(await call(`/business/records/${id}`,{user:'a-employee'}));assert.equal(detail.computedFields.totalAmount,'0.30')
 const data=ok(await call(`/low-code/runtime/${ctx.page.id}/data/total`,{user:'a-employee',method:'POST',body:{releaseId:ctx.release.id}}));assert.equal(data.total,1);assert.ok(data.distribution.some(item=>item.name==='running'&&item.value===1));assert.equal(data.trend.length,1)
 const outsider=ok(await run(ctx,'query',{}, {user:'a-manager-1'}));assert.equal(outsider.data.total,0)
 assert.equal((await run(ctx,'edit',{recordId:id},{user:'a-manager-1'})).status,404)
 assert.equal((await run(ctx,'query',{}, {user:'b-admin'})).status,404)
 const first=ok(await call('/workflow-todos',{user:'a-manager-1'})).list.find(task=>task.requestId===id);ok(await call(`/workflow-tasks/${first.id}/approve`,{user:'a-manager-1',method:'POST',body:{expectedRevision:first.revision}}))
 const second=ok(await call('/workflow-todos',{user:'a-manager-2'})).list.find(task=>task.requestId===id);ok(await call(`/workflow-tasks/${second.id}/approve`,{user:'a-manager-2',method:'POST',body:{expectedRevision:second.revision}}))
 assert.equal(ok(await call(`/business/records/${id}`,{user:'a-employee'})).status,'approved')
})
test('source, page and action permissions are independent and replay cannot recover a receipt after source permission is revoked',async()=>{
 const ctx=await fixture(),key=randomUUID(),receipt=ok(await run(ctx,'create',{fields:values},{key}))
 const permissions=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-employee'")).rows[0].permissions
 try{
  await pool.query("UPDATE memberships SET permissions=permissions-'business:create' WHERE tenant_id='tenant-a' AND user_id='a-employee'")
  assert.equal((await run(ctx,'create',{fields:values},{key})).status,403)
  assert.equal((await pool.query('SELECT id FROM business_records WHERE id=$1',[receipt.record.id])).rowCount,1)
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(permissions.filter(code=>code!=='business:read:self'))])
  assert.equal((await run(ctx,'query')).status,403)
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(permissions.filter(code=>code!=='low-code:page:run'))])
  assert.equal((await call(`/low-code/runtime/${ctx.page.id}`,{user:'a-employee'})).status,403)
 }finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(permissions)])}
 assert.equal((await call(`/low-code/pages/${ctx.page.id}`,{user:'a-employee'})).status,403)
})
test('published config and references remain immutable, rollout is stable, and stale writes do not execute after switching versions',async()=>{
 const ctx=await fixture(),page=ok(await call(`/low-code/pages/${ctx.page.id}`)),schema=structuredClone(page.schema);schema.title='第二发布页面'
 const saved=ok(await call(`/low-code/pages/${page.id}`,{method:'PUT',body:{name:page.name,schema,expectedRevision:page.revision}})),v2=ok(await call(`/low-code/pages/${page.id}/publish`,{method:'POST',body:{expectedRevision:saved.revision}}))
 await assert.rejects(pool.query('UPDATE low_code_releases SET schema_snapshot=$1 WHERE id=$2',[JSON.stringify(schema),ctx.release.id]),error=>error.code==='23514')
 let current=ok(await call(`/low-code/pages/${page.id}`))
 ok(await call(`/low-code/pages/${page.id}/rollout`,{method:'POST',body:{expectedRevision:current.revision,releaseId:ctx.release.id,rolloutReleaseId:v2.id,percent:0}}))
 assert.equal(ok(await call(`/low-code/runtime/${page.id}`,{user:'a-employee'})).releaseId,ctx.release.id)
 current=ok(await call(`/low-code/pages/${page.id}`));ok(await call(`/low-code/pages/${page.id}/rollout`,{method:'POST',body:{expectedRevision:current.revision,releaseId:ctx.release.id,rolloutReleaseId:v2.id,percent:100}}))
 assert.equal(ok(await call(`/low-code/runtime/${page.id}`,{user:'a-employee'})).releaseId,v2.id)
 assert.equal((await run(ctx,'create',{fields:values})).businessCode,'LOW_CODE_RELEASE_CHANGED')
 current=ok(await call(`/low-code/pages/${page.id}`));ok(await call(`/low-code/pages/${page.id}/rollout`,{method:'POST',body:{expectedRevision:current.revision,releaseId:ctx.release.id,rolloutReleaseId:v2.id,percent:50}}))
 const choice=ok(await call(`/low-code/runtime/${page.id}`,{user:'a-employee'})).releaseId
 for(let i=0;i<3;i++)assert.equal(ok(await call(`/low-code/runtime/${page.id}`,{user:'a-employee'})).releaseId,choice)
 assert.equal(ok(await call(`/low-code/pages/${page.id}`)).releases.find(release=>release.id===ctx.release.id).schema.title,ctx.page.schema.title)
})
test('real faults roll back business, history and both audits; the original key then executes once',async()=>{
 const ctx=await fixture(),key=randomUUID();failure='low-code:business-command'
 assert.equal((await run(ctx,'create',{fields:values},{key})).status,500)
 const records=await pool.query('SELECT r.id FROM business_records r WHERE r.application_release_id=$1',[ctx.appRelease.id]);assert.equal(records.rowCount,0)
 const created=ok(await run(ctx,'create',{fields:values},{key}));assert.deepEqual(ok(await run(ctx,'create',{fields:values},{key})),created)
 const audits=await pool.query("SELECT id FROM audit_events WHERE target_id=$1 AND action='create'",[created.record.id]);assert.equal(audits.rowCount,1)
 const bad={...ctx.page.schema,actions:ctx.page.schema.actions.map(action=>action.id==='new'?{...action,mode:'approve'}:action)}
 assert.equal((await call(`/low-code/pages/${ctx.page.id}`,{method:'PUT',body:{name:ctx.page.name,schema:bad,expectedRevision:2}})).status,422)
 assert.equal((await call('/low-code/sources',{method:'POST',body:{code:'illegal',name:'非法',kind:'application-records',resourceId:ctx.appRelease.id,status:'enabled',url:'https://example.invalid'}})).status,422)
})
test('source disable, archive, concurrent editor revisions and a real API replacement preserve definitions and deny stale effects',async()=>{
 const ctx=await fixture(),page=ok(await call(`/low-code/pages/${ctx.page.id}`)),source=ok(await call('/low-code/sources?pageSize=100')).list.find(item=>item.id===page.schema.sources[0])
 const changes=await Promise.all([call(`/low-code/pages/${page.id}`,{method:'PUT',body:{name:page.name,schema:{...page.schema,title:'编辑甲'},expectedRevision:page.revision}}),call(`/low-code/pages/${page.id}`,{method:'PUT',body:{name:page.name,schema:{...page.schema,title:'编辑乙'},expectedRevision:page.revision}})])
 assert.deepEqual(changes.map(result=>result.status).sort(),[200,409])
 ok(await call(`/low-code/sources/${source.id}`,{method:'PUT',body:{code:source.code,name:source.name,kind:source.kind,resourceId:source.resourceId,status:'disabled',expectedRevision:source.revision}}))
 assert.equal((await run(ctx,'query')).businessCode,'LOW_CODE_SOURCE_UNAVAILABLE')
 ok(await call(`/low-code/sources/${source.id}`,{method:'PUT',body:{code:source.code,name:source.name,kind:source.kind,resourceId:source.resourceId,status:'enabled',expectedRevision:source.revision+1}}))
 const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:['ignore','ignore','ignore','ipc']})
 try{const[ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)});assert.equal(ok(await call(`/low-code/runtime/${page.id}`,{user:'a-employee',origin:ready.base})).releaseId,ctx.release.id);ok(await run(ctx,'create',{fields:values},{origin:ready.base}))}finally{const stopped=once(child,'exit');child.kill('SIGTERM');await stopped}
 const current=ok(await call(`/low-code/pages/${page.id}`));ok(await call(`/low-code/pages/${page.id}/status`,{method:'POST',body:{status:'archived',expectedRevision:current.revision}}))
 assert.equal((await run(ctx,'query')).status,404)
})

test('registered dictionary queries enforce both underlying permissions and never accept an arbitrary source route',async()=>{
 const suffix=randomUUID().slice(0,8),dictionary=ok(await call('/system/dictionaries',{method:'POST',body:{dictName:'低代码字典',dictType:`lc-dict-${suffix}`,dictStatus:'enabled',description:''}}))
 ok(await call(`/system/dictionaries/${dictionary.id}/items`,{method:'PUT',body:{expectedRevision:1,items:[{label:'可用设备',value:'device',disabled:false},{label:'禁用项',value:'hidden',disabled:true}]}}))
 const registry=ok(await call('/form-data-sources',{method:'POST',body:{code:`lc-reg-${suffix}`,name:'低代码登记字典',kind:'dictionary',dictionaryId:dictionary.id,status:'enabled',description:''}}))
 const source=ok(await call('/low-code/sources',{method:'POST',body:{code:`lc-source-${suffix}`,name:'字典查询',kind:'registered-dictionary',resourceId:registry.id,status:'enabled'}}))
 const schema={version:2,title:'实际字典查询',sources:[source.id],materials:[{id:'options',type:'ProTable',name:'真实选项',sourceId:source.id,span:24,display:'inline',columns:['label','value']}],actions:[{id:'query',label:'查询',type:'query',targetId:'options',placement:'toolbar'}]}
 const page=ok(await call('/low-code/pages',{method:'POST',body:{name:'实际字典查询',schema}})),release=ok(await call(`/low-code/pages/${page.id}/publish`,{method:'POST',body:{expectedRevision:1}})),ctx={page,release}
 const permissions=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-employee'")).rows[0].permissions
 try{
  assert.equal((await run(ctx,'query')).status,403)
  await pool.query("UPDATE memberships SET permissions=permissions||'[\"form-source:read\"]'::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'");assert.equal((await run(ctx,'query')).status,403)
  await pool.query("UPDATE memberships SET permissions=permissions||'[\"system:dict:read\"]'::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'")
  const data=ok(await run(ctx,'query')).data;assert.equal(data.total,1);assert.equal(data.list[0].value,'device')
  assert.equal((await run(ctx,'query',{params:{url:'https://example.invalid'}})).status,422)
 }finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(permissions)])}
})

test('configuration metadata scope filters current rows and also blocks cached page and source receipts after a role scope change',async()=>{
 const ctx=await fixture(),employee=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-employee'")).rows[0].permissions,admin=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
 const role=`lc-meta-${randomUUID().slice(0,8)}`,scopeCodes=['low-code:page:list','low-code:page:update','low-code:source:list','low-code:source:update']
 try{
  await pool.query("UPDATE memberships SET permissions=permissions||$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(Object.values(c.LOW_CODE_PERMISSIONS))])
  const authored=ok(await call('/low-code/pages/from-application',{user:'a-employee',method:'POST',body:{name:'另一成员配置',applicationReleaseId:ctx.appRelease.id}})),source=ok(await call('/low-code/sources?pageSize=100')).list.find(item=>item.id===authored.schema.sources[0])
  const pageBody={name:authored.name,schema:authored.schema,expectedRevision:authored.revision},sourceBody={code:source.code,name:'已改来源名称',kind:source.kind,resourceId:source.resourceId,status:source.status,expectedRevision:source.revision},pageKey=randomUUID(),sourceKey=randomUUID()
  ok(await call(`/low-code/pages/${authored.id}`,{method:'PUT',body:pageBody,key:pageKey}));ok(await call(`/low-code/sources/${source.id}`,{method:'PUT',body:sourceBody,key:sourceKey}))
  await pool.query("INSERT INTO roles(tenant_id,id,role_name,role_key) VALUES('tenant-a',$1,'低代码元数据范围',$1)",[role])
  for(const code of scopeCodes)await pool.query("INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES('tenant-a',$1,$2)",[role,code])
  await pool.query("INSERT INTO role_member_scopes(tenant_id,role_id,data_scope,field_permissions) VALUES('tenant-a',$1,'self','[]'::jsonb)",[role])
  await pool.query("INSERT INTO member_roles(tenant_id,user_id,role_id) VALUES('tenant-a','a-admin',$1)",[role])
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(admin.filter(code=>!scopeCodes.includes(code)))])
  assert.equal((await call(`/low-code/pages/${authored.id}`)).status,404)
  assert.ok(!ok(await call('/low-code/pages?pageSize=100')).list.some(page=>page.id===authored.id))
  assert.ok(!ok(await call('/low-code/sources?pageSize=100')).list.some(item=>item.id===source.id))
  assert.equal((await call(`/low-code/pages/${authored.id}`,{method:'PUT',body:pageBody,key:pageKey})).status,404)
  assert.equal((await call(`/low-code/sources/${source.id}`,{method:'PUT',body:sourceBody,key:sourceKey})).status,404)
 }finally{
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(admin)])
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(employee)])
  await pool.query("DELETE FROM member_roles WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM role_member_scopes WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM role_permissions WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM roles WHERE tenant_id='tenant-a' AND id=$1",[role])
 }
})

test('the actual published application directory remains reachable past the first 100 entries without changing business versions',async()=>{
 const ctx=await fixture(),suffix=randomUUID().slice(0,8)
 for(let i=0;i<101;i++){
  const id=`directory-${suffix}-${i}`,releaseId=`directory-release-${suffix}-${i}`
  await pool.query("INSERT INTO applications(tenant_id,id,code,name,business_kind,status) VALUES('tenant-a',$1,$1,$2,'generic','enabled')",[id,`目录分页-${String(i).padStart(3,'0')}-${suffix}`])
  await pool.query("INSERT INTO application_releases(tenant_id,id,application_id,release_version,form_snapshot,workflow_snapshot,content_hash,published_by) SELECT tenant_id,$1,$2,1,form_snapshot,workflow_snapshot,content_hash,published_by FROM application_releases WHERE tenant_id='tenant-a' AND id=$3",[releaseId,id,ctx.appRelease.id])
  await pool.query("UPDATE applications SET active_release_id=$2 WHERE tenant_id='tenant-a' AND id=$1",[id,releaseId])
 }
 const first=ok(await call(`/business/applications?current=1&pageSize=100&keyword=${encodeURIComponent(suffix)}`,{user:'a-employee'})),second=ok(await call(`/business/applications?current=2&pageSize=100&keyword=${encodeURIComponent(suffix)}`,{user:'a-employee'}))
 assert.equal(first.length,100);assert.equal(second.length,1);assert.equal(new Set([...first,...second].map(app=>app.id)).size,101)
 assert.equal((await call('/business/applications?pageSize=101',{user:'a-employee'})).status,422)
})
