import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {before,after,test} from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migration from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import support from '../../services/reference-api/dist/support.js'
const pool=db.createPool(),tokens=new Map();let server,base,originals
before(async()=>{await migration.migrate(pool);await seeds.seedDemo(pool);originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','b-employee')")).rows;const caps=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code);await pool.query("UPDATE memberships SET permissions=$1 WHERE user_id IN ('a-admin','b-admin','b-employee')",[JSON.stringify(caps)]);server=api.createServer(pool);base=await server.listen({host:'127.0.0.1',port:0})})
after(async()=>{await server.close();for(const row of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,JSON.stringify(row.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',method='GET',body,key=randomUUID()}={})=>{if(!tokens.has(user)){const r=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(r.status,200);tokens.set(user,(await r.json()).data.token)}const r=await fetch(`${base}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':user.startsWith('b-')?'tenant-b':'tenant-a','idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,...await r.json()}}
const ok=x=>{assert.equal(x.status,200,x.businessCode);return x.data}
const source=async(user,label,value)=>{const suffix=randomUUID().slice(0,8),dictionary=ok(await call('/system/dictionaries',{user,method:'POST',body:{dictName:label,dictType:`pkg-${suffix}`,dictStatus:'enabled',description:''}}));ok(await call(`/system/dictionaries/${dictionary.id}/items`,{user,method:'PUT',body:{expectedRevision:1,items:[{label,value,disabled:false}]}}));return ok(await call('/form-data-sources',{user,method:'POST',body:{code:`pkg-${suffix}`,name:label,kind:'dictionary',dictionaryId:dictionary.id,status:'enabled',description:''}}))}
const fixture=async()=>{
 const origin=await source('a-admin','源内部数据','source-private'),target=await source('b-admin','目标设备','target-device')
 const app=ok(await call('/application-center',{method:'POST',body:{code:`pkg-${randomUUID().slice(0,8)}`,name:'重绑应用',description:'',template:'equipment'}}))
 const f=ok(await call(`/form-schemas/${app.formDraftId}`)),w=ok(await call(`/workflows/${app.workflowDraftId}`));const schema=structuredClone(f.schema);schema.version=2;schema.dataSources=[{key:origin.id,name:'设备类别',kind:'registered',registryId:origin.id}];schema.widgetsConfig.push({uid:'category',type:'select',name:'设备类别',config:{id:'category',label:'设备类别',required:true,optionsType:'registered',optionsSourceKey:origin.id,options:[]}})
 ok(await call(`/form-schemas/${f.id}`,{method:'PUT',body:{schema,expectedRevision:1}}));ok(await call(`/applications/${app.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:2,workflowRevision:1,expectedRevision:1}}))
 const pkg=ok(await call(`/application-center/${app.id}/package`,{method:'POST',body:{expectedRevision:2}}))
 const bindings=Object.fromEntries(pkg.people.map((slot,index)=>[slot.key,slot.kind==='copy'?'b-auditor':index===0?'b-manager-1':'b-manager-2']))
 return{origin,target,pkg,body:{package:pkg,code:`import-${randomUUID().slice(0,8)}`,name:'目标重绑设备',description:'',bindings,sourceBindings:{'source-1':target.id}}}
}
test('source-aware package removes origin data and references, imports target bindings, publishes a target snapshot and executes business',async()=>{
 const{origin,target,pkg,body}=await fixture();assert.equal(pkg.version,2)
 for(const forbidden of [origin.id,origin.dictionaryId,'source-private','源内部数据','registryRevision','dictionaryRevision','optionsSnapshot'])assert.equal(JSON.stringify(pkg).includes(forbidden),false,forbidden)
 const key=randomUUID(),imported=ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body,key}));assert.equal(ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body,key})).application.id,imported.application.id)
 const app=imported.application,f=ok(await call(`/form-schemas/${app.formDraftId}`,{user:'b-admin'})),w=ok(await call(`/workflows/${app.workflowDraftId}`,{user:'b-admin'}));assert.equal(f.schema.dataSources[0].registryId,target.id);assert.equal(f.schema.dataSources[0].optionsSnapshot,undefined)
 const release=ok(await call(`/applications/${app.id}/releases`,{user:'b-admin',method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:1,workflowRevision:1,expectedRevision:1}}));assert.deepEqual(release.formSnapshot.dataSources[0].optionsSnapshot,[{label:'目标设备',value:'target-device'}])
 const fields={itemName:'目标设备',quantity:1,reason:'目标源真实运行',category:'target-device'},record=ok(await call('/business/records',{user:'b-employee',method:'POST',body:{applicationReleaseId:release.id,fields}}));ok(await call(`/business/records/${record.id}/submit`,{user:'b-employee',method:'POST',body:{expectedRevision:1}}))
 for(const user of ['b-manager-1','b-manager-2']){const task=ok(await call('/workflow-todos',{user})).list.find(row=>row.requestId===record.id);assert.ok(task);ok(await call(`/workflow-tasks/${task.id}/approve`,{user,method:'POST',body:{expectedRevision:task.revision}}))}
 assert.equal(ok(await call(`/business/records/${record.id}`,{user:'b-employee'})).status,'approved')
 assert.equal((await call('/business/records',{user:'b-employee',method:'POST',body:{applicationReleaseId:release.id,fields:{...fields,category:'source-private'}}})).status,422)
})
test('packages reject missing/extra/foreign target source slots and forged source snapshots',async()=>{
 const{origin,pkg,body}=await fixture()
 for(const sourceBindings of [{},{'source-1':origin.id},{...body.sourceBindings,'source-2':'extra'}]){const result=await call('/application-packages/import',{user:'b-admin',method:'POST',body:{...body,sourceBindings}});assert.ok([404,422].includes(result.status))}
 const forged=structuredClone(pkg);Object.assign(forged.form.dataSources[0],{registryRevision:1,dictionaryRevision:1,optionsSnapshot:[{label:'私有',value:'source-private'}]});const payload={...forged};delete payload.checksum;forged.checksum=support.contentHash(payload)
 assert.equal((await call('/application-packages/import',{user:'b-admin',method:'POST',body:{...body,package:forged}})).status,422)
 const original=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-b' AND user_id='b-admin'")).rows[0].permissions
 try{await pool.query("UPDATE memberships SET permissions=permissions - 'form-source:read' WHERE tenant_id='tenant-b' AND user_id='b-admin'");assert.equal((await call('/application-packages/import',{user:'b-admin',method:'POST',body})).status,403)}finally{await pool.query("UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-b' AND user_id='b-admin'",[JSON.stringify(original)])}
})
