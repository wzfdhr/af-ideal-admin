import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import {before,after,test} from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrate from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
const pool=db.createPool(),tokens=new Map();let server,base,originals,failure=null
before(async()=>{
 await migrate.migrate(pool);await seed.seedDemo(pool)
 originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','b-employee')")).rows
 const all=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(all)])
 await pool.query("UPDATE memberships SET permissions=permissions||'[\"business:read:self\",\"business:create\",\"business:update:self\",\"business:submit\",\"low-code:page:run\"]'::jsonb WHERE user_id='b-employee'")
 server=api.createServer(pool,point=>{if(point===failure){failure=null;throw new Error('Controlled package page rollback')}});base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();for(const row of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,JSON.stringify(row.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',method='GET',body,key=randomUUID(),origin=base}={})=>{
 if(!tokens.has(user)){const r=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(r.status,200);tokens.set(user,(await r.json()).data.token)}
 const r=await fetch(`${origin}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':user.startsWith('b-')?'tenant-b':'tenant-a','idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,...await r.json()}
}
const ok=r=>{assert.equal(r.status,200,r.message);return r.data}
const publish=async(app,user='a-admin')=>{
 const form=ok(await call(`/form-schemas/${app.formDraftId}`,{user})),workflow=ok(await call(`/workflows/${app.workflowDraftId}`,{user}));return ok(await call(`/applications/${app.id}/releases`,{user,method:'POST',body:{formDraftId:form.id,workflowDraftId:workflow.id,formRevision:form.revision,workflowRevision:workflow.revision,expectedRevision:app.revision}}))
}
const fixture=async()=>{
 const app=ok(await call('/application-center',{method:'POST',body:{name:'页面包设备模板',code:`pp-src-${randomUUID().slice(0,8)}`,template:'equipment'}})),release=await publish(app)
 const page=ok(await call('/low-code/pages/from-application',{method:'POST',body:{name:'可移植设备管理页',applicationReleaseId:release.id}}));ok(await call(`/low-code/pages/${page.id}/publish`,{method:'POST',body:{expectedRevision:page.revision}}))
 const current=ok(await call(`/application-center/${app.id}`)),pkg=ok(await call(`/application-center/${app.id}/package`,{method:'POST',body:{expectedRevision:current.revision,pageIds:[page.id]}}))
 return{app,release,page,pkg}
}
const importPackage=async(pkg,key=randomUUID(),sourceBindings={})=>ok(await call('/application-packages/import',{user:'b-admin',method:'POST',key,body:{package:pkg,name:'目标页面包设备',code:`pp-target-${randomUUID().slice(0,8)}`,bindings:Object.fromEntries(pkg.people.map((slot,index)=>[slot.key,index===0?'b-manager-1':'b-manager-2'])),sourceBindings}}))

test('v3 exports only typed symbolic page dependencies and imports as pending until actual target business publication',async()=>{
 const source=await fixture();assert.equal(source.pkg.version,3);assert.equal(source.pkg.pages[0].schema.version,2)
 for(const id of [source.app.id,source.release.id,source.page.id,...source.page.schema.sources])assert.ok(!JSON.stringify(source.pkg).includes(id))
 const imported=await importPackage(source.pkg);assert.equal(imported.pendingPages.status,'pending')
 assert.equal((await pool.query('SELECT id FROM low_code_sources WHERE tenant_id=$1 AND application_release_id IN(SELECT id FROM application_releases WHERE tenant_id=$1 AND application_id=$2)',['tenant-b',imported.application.id])).rowCount,0)
 const rejected=await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body:{expectedRevision:1,applicationReleaseId:source.release.id}});assert.equal(rejected.businessCode,'PACKAGE_PAGE_TARGET_RELEASE_CHANGED')
 const targetRelease=await publish(imported.application,'b-admin'),key=randomUUID(),body={expectedRevision:1,applicationReleaseId:targetRelease.id}
 const bound=ok(await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body,key}));assert.deepEqual(ok(await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body,key})),bound)
 const page=ok(await call(`/low-code/pages/${bound.pages[0].id}`,{user:'b-admin'}));assert.ok(page.schema.sources.every(id=>!source.page.schema.sources.includes(id)))
 const published=ok(await call(`/low-code/pages/${page.id}/publish`,{user:'b-admin',method:'POST',body:{expectedRevision:page.revision}}))
 const created=ok(await call(`/low-code/runtime/${page.id}/actions/create`,{user:'b-employee',method:'POST',body:{releaseId:published.id,fields:{itemName:'目标独立设备',quantity:1,reason:'实际页面导入运行'}}}))
 const started=ok(await call(`/low-code/runtime/${page.id}/actions/start`,{user:'b-employee',method:'POST',body:{releaseId:published.id,recordId:created.record.id,expectedRevision:created.record.revision}}));assert.ok(started.record.instanceId)
 for(const user of ['b-manager-1','b-manager-2']){const task=ok(await call('/workflow-todos',{user})).list.find(task=>task.requestId===created.record.id);ok(await call(`/workflow-tasks/${task.id}/approve`,{user,method:'POST',body:{expectedRevision:task.revision}}))}
 assert.equal(ok(await call(`/business/records/${created.record.id}`,{user:'b-employee'})).status,'approved')
 assert.equal((await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{method:'POST',body})).status,404)
 assert.equal((await pool.query('SELECT id FROM low_code_pages WHERE tenant_id=$1 AND id=$2',['tenant-a',source.page.id])).rowCount,1)
})
test('binding faults roll back the whole graph and competing keys create exactly one set of target sources and pages',async()=>{
 const source=await fixture(),imported=await importPackage(source.pkg),target=await publish(imported.application,'b-admin'),body={expectedRevision:1,applicationReleaseId:target.id},key=randomUUID()
 const before=(await pool.query("SELECT count(*)::int AS count FROM low_code_pages WHERE tenant_id='tenant-b'")).rows[0].count
 failure='package:pages-created';assert.equal((await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body,key})).status,500)
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM low_code_pages WHERE tenant_id='tenant-b'")).rows[0].count,before)
 const results=await Promise.all([call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body,key}),call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body})]);assert.deepEqual(results.map(result=>result.status).sort(),[200,409])
 assert.equal((await pool.query('SELECT page_id FROM application_package_page_bindings WHERE set_id=$1',[imported.pendingPages.id])).rowCount,1)
})
test('pending definitions survive API replacement and receipts cannot be replayed after page creation capability is revoked',async()=>{
 const source=await fixture(),imported=await importPackage(source.pkg),target=await publish(imported.application,'b-admin'),body={expectedRevision:1,applicationReleaseId:target.id},key=randomUUID()
 const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:['ignore','ignore','ignore','ipc']})
 try{const[ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)});assert.equal(ok(await call(`/application-center/${imported.application.id}/package-pages`,{user:'b-admin',origin:ready.base}))[0].status,'pending');ok(await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',origin:ready.base,method:'POST',body,key}))}finally{const stop=once(child,'exit');child.kill('SIGTERM');await stop}
 const permissions=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-b' AND user_id='b-admin'")).rows[0].permissions
 try{await pool.query("UPDATE memberships SET permissions=permissions-'low-code:page:create' WHERE tenant_id='tenant-b' AND user_id='b-admin'");assert.equal((await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body,key})).status,403)}finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-b' AND user_id='b-admin'",[JSON.stringify(permissions)])}
 const set=(await pool.query('SELECT * FROM application_package_page_sets WHERE id=$1',[imported.pendingPages.id])).rows[0]
 await assert.rejects(pool.query('UPDATE application_package_page_sets SET pages=$1 WHERE id=$2',[JSON.stringify([]),set.id]),error=>error.code==='23514')
})
test('source page business definitions must equal the selected export version and unpublished or foreign pages cannot be smuggled into a package',async()=>{
 const source=await fixture(),other=ok(await call('/application-center',{method:'POST',body:{name:'另一业务',code:`pp-other-${randomUUID().slice(0,8)}`,template:'equipment'}})),another=await publish(other)
 const page=ok(await call('/low-code/pages/from-application',{method:'POST',body:{name:'不同来源页',applicationReleaseId:another.id}}));ok(await call(`/low-code/pages/${page.id}/publish`,{method:'POST',body:{expectedRevision:1}}))
 let current=ok(await call(`/application-center/${source.app.id}`));assert.equal((await call(`/application-center/${source.app.id}/package`,{method:'POST',body:{expectedRevision:current.revision,pageIds:[page.id]}})).businessCode,'PACKAGE_PAGE_EXTERNAL_APPLICATION')
 const form=ok(await call(`/form-schemas/${source.app.formDraftId}`));form.schema.widgetsConfig[0].config.label='新版设备字段';ok(await call(`/form-schemas/${form.id}`,{method:'PUT',body:{schema:form.schema,expectedRevision:form.revision}}));current=ok(await call(`/application-center/${source.app.id}`));await publish(current)
 current=ok(await call(`/application-center/${source.app.id}`));assert.equal((await call(`/application-center/${source.app.id}/package`,{method:'POST',body:{expectedRevision:current.revision,pageIds:[source.page.id]}})).businessCode,'PACKAGE_PAGE_RELEASE_MISMATCH')
})

const dictionarySource=async(user,label,value)=>{
 const suffix=randomUUID().slice(0,8),dictionary=ok(await call('/system/dictionaries',{user,method:'POST',body:{dictName:label,dictType:`pp-dict-${suffix}`,dictStatus:'enabled',description:''}}))
 ok(await call(`/system/dictionaries/${dictionary.id}/items`,{user,method:'PUT',body:{expectedRevision:1,items:[{label,value,disabled:false}]}}))
 return ok(await call('/form-data-sources',{user,method:'POST',body:{code:`pp-reg-${suffix}`,name:label,kind:'dictionary',dictionaryId:dictionary.id,status:'enabled',description:''}}))
}
test('page-only dictionaries use explicit target slots; revoked read/configure rights and disabled mappings deny binding and cached receipts',async()=>{
 const source=await fixture(),origin=await dictionarySource('a-admin','源私有选项','source-private'),target=await dictionarySource('b-admin','目标独立选项','target-option')
 const registry=ok(await call('/low-code/sources',{method:'POST',body:{code:`pp-lc-${randomUUID().slice(0,8)}`,name:'页面字典',kind:'registered-dictionary',resourceId:origin.id,status:'enabled'}}))
 const current=ok(await call(`/low-code/pages/${source.page.id}`)),schema=structuredClone(current.schema);schema.sources.push(registry.id);schema.materials.push({id:'options',type:'ProTable',name:'目标字典选项',sourceId:registry.id,span:24,display:'inline',columns:['label','value']});schema.actions.push({id:'options-query',label:'查询选项',type:'query',targetId:'options',placement:'toolbar'})
 const saved=ok(await call(`/low-code/pages/${current.id}`,{method:'PUT',body:{name:current.name,schema,expectedRevision:current.revision}}));ok(await call(`/low-code/pages/${saved.id}/publish`,{method:'POST',body:{expectedRevision:saved.revision}}))
 const app=ok(await call(`/application-center/${source.app.id}`)),pkg=ok(await call(`/application-center/${app.id}/package`,{method:'POST',body:{expectedRevision:app.revision,pageIds:[saved.id]}}))
 assert.equal(pkg.form.dataSources.length,0);assert.equal(pkg.sources.length,1);assert.equal(pkg.pageSources.length,2)
 for(const forbidden of [origin.id,origin.dictionaryId,registry.id,'source-private'])assert.ok(!JSON.stringify(pkg).includes(forbidden))
 assert.equal((await call('/application-packages/import',{user:'b-admin',method:'POST',body:{package:pkg,name:'非法源绑定',code:`pp-bad-${randomUUID().slice(0,8)}`,bindings:Object.fromEntries(pkg.people.map((slot,index)=>[slot.key,index===0?'b-manager-1':'b-manager-2'])),sourceBindings:{'source-1':origin.id}}})).status,404)
 const importKey=randomUUID(),imported=await importPackage(pkg,importKey,{'source-1':target.id}),release=await publish(imported.application,'b-admin'),body={expectedRevision:1,applicationReleaseId:release.id},key=randomUUID()
 const permissions=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-b' AND user_id='b-admin'")).rows[0].permissions
 try{
  await pool.query("UPDATE memberships SET permissions=permissions-'form-source:read' WHERE tenant_id='tenant-b' AND user_id='b-admin'");assert.equal((await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body,key})).status,403)
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-b' AND user_id='b-admin'",[JSON.stringify(permissions)])
  await pool.query("UPDATE form_data_sources SET status='disabled' WHERE tenant_id='tenant-b' AND id=$1",[target.id]);assert.equal((await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body,key})).status,404)
  await pool.query("UPDATE form_data_sources SET status='enabled' WHERE tenant_id='tenant-b' AND id=$1",[target.id])
  const bound=ok(await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body,key})),page=ok(await call(`/low-code/pages/${bound.pages[0].id}`,{user:'b-admin'})),published=ok(await call(`/low-code/pages/${page.id}/publish`,{user:'b-admin',method:'POST',body:{expectedRevision:1}}))
  const options=ok(await call(`/low-code/runtime/${page.id}/actions/options-query`,{user:'b-admin',method:'POST',body:{releaseId:published.id}})).data;assert.equal(options.list[0].value,'target-option');assert.equal(options.total,1)
  for(const permission of ['form-source:read','system:dict:read','application:configure']){
   await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-b' AND user_id='b-admin'",[JSON.stringify(permissions.filter(code=>code!==permission))]);assert.equal((await call(`/application-package-pages/${imported.pendingPages.id}/bind`,{user:'b-admin',method:'POST',body,key})).status,403,permission)
  }
 }finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-b' AND user_id='b-admin'",[JSON.stringify(permissions)]);await pool.query("UPDATE form_data_sources SET status='enabled' WHERE tenant_id='tenant-b' AND id=$1",[target.id])}
})
test('package binding directories page beyond 100 without truncating members or registered dictionary mappings',async()=>{
 const registry=await dictionarySource('b-admin','目录分页','paging'),suffix=randomUUID().slice(0,8)
 await pool.query("INSERT INTO users(id,username,name,password_hash) SELECT $1||g,$1||g,'分页成员 '||g,'not-a-login-hash' FROM generate_series(1,110) g",[`zz-pp-${suffix}-`])
 await pool.query("INSERT INTO memberships(tenant_id,user_id,department_name,role,permissions) SELECT 'tenant-b',id,'分页部门','user','[]'::jsonb FROM users WHERE id LIKE $1",[`zz-pp-${suffix}-%`])
 await pool.query("INSERT INTO form_data_sources(tenant_id,id,code,name,dictionary_id) SELECT 'tenant-b',$1||g,$1||g,'分页来源 '||g,$2 FROM generate_series(1,110) g",[`pp-source-${suffix}-`,registry.dictionaryId])
 for(const endpoint of ['people','sources']){
  const first=ok(await call(`/application-packages/${endpoint}?current=1&pageSize=100`,{user:'b-admin'})),second=ok(await call(`/application-packages/${endpoint}?current=2&pageSize=100`,{user:'b-admin'}));assert.equal(first.length,100);assert.ok(second.length>0);assert.equal(new Set([...first,...second].map(row=>row.id)).size,first.length+second.length)
  assert.equal((await call(`/application-packages/${endpoint}?pageSize=101`,{user:'b-admin'})).status,422)
  assert.ok(ok(await call(`/application-packages/${endpoint}`,{user:'a-admin'})).every(row=>!row.id.includes(suffix)))
 }
})

test('a fault after staging imported pages rolls back application, pending set and success audit together; the original key recovers exactly once',async()=>{
 const source=await fixture(),key=randomUUID(),body={package:source.pkg,name:'故障后恢复页面包',code:`pp-fault-${randomUUID().slice(0,8)}`,bindings:Object.fromEntries(source.pkg.people.map((slot,index)=>[slot.key,index===0?'b-manager-1':'b-manager-2'])),sourceBindings:{}}
 const counts=async()=>{
  const row=(await pool.query("SELECT (SELECT count(*) FROM applications WHERE tenant_id='tenant-b')::int AS applications,(SELECT count(*) FROM application_package_page_sets WHERE tenant_id='tenant-b')::int AS pending,(SELECT count(*) FROM audit_events WHERE tenant_id='tenant-b' AND result='success')::int AS audits")).rows[0];return row
 }
 const before=await counts(),failures=(await pool.query("SELECT count(*)::int AS total FROM audit_events WHERE tenant_id='tenant-b' AND result='failure'")).rows[0].total;failure='package:application-created'
 assert.equal((await call('/application-packages/import',{user:'b-admin',method:'POST',body,key})).status,500);assert.deepEqual(await counts(),before)
 assert.equal((await pool.query("SELECT count(*)::int AS total FROM audit_events WHERE tenant_id='tenant-b' AND result='failure'")).rows[0].total,failures+1)
 const imported=ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body,key}));assert.deepEqual(ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body,key})),imported)
 assert.equal((await pool.query("SELECT id FROM applications WHERE tenant_id='tenant-b' AND code=$1",[body.code])).rowCount,1)
 assert.equal((await pool.query("SELECT id FROM application_package_page_sets WHERE tenant_id='tenant-b' AND application_id=$1",[imported.application.id])).rowCount,1)
 const permissions=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-b' AND user_id='b-admin'")).rows[0].permissions
 try{await pool.query("UPDATE memberships SET permissions=permissions-'low-code:source:create' WHERE tenant_id='tenant-b' AND user_id='b-admin'");assert.equal((await call('/application-packages/import',{user:'b-admin',method:'POST',body,key})).status,403)}finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-b' AND user_id='b-admin'",[JSON.stringify(permissions)])}
})
