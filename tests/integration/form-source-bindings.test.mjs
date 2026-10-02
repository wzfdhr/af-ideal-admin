import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before,after,test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
const pool=db.createPool(),tokens=new Map()
let server,base,originals
before(async()=>{await migrations.migrate(pool);await seeds.seedDemo(pool);originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','a-employee')")).rows;const caps=(await pool.query('SELECT code FROM permission_definitions')).rows.map(x=>x.code);await pool.query("UPDATE memberships SET permissions=$1 WHERE user_id IN ('a-admin','b-admin','a-employee')",[JSON.stringify(caps)]);server=api.createServer(pool);base=await server.listen({host:'127.0.0.1',port:0})})
after(async()=>{await server.close();for(const row of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,JSON.stringify(row.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',method='GET',body,key=randomUUID()}={})=>{if(!tokens.has(user)){const r=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(r.status,200);tokens.set(user,(await r.json()).data.token)}const r=await fetch(`${base}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':user.startsWith('b-')?'tenant-b':'tenant-a','idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,...await r.json()}}
const ok=x=>{assert.equal(x.status,200,x.businessCode);return x.data}
const setup=async()=>{
 const code=`bind-${randomUUID().slice(0,8)}`
 const dictionary=ok(await call('/system/dictionaries',{method:'POST',body:{dictName:'领用类别',dictType:code,dictStatus:'enabled',description:''}}))
 ok(await call(`/system/dictionaries/${dictionary.id}/items`,{method:'PUT',body:{expectedRevision:1,items:[{label:'笔记本',value:'laptop',disabled:false},{label:'未选择的内部选项',value:'private-choice',disabled:false}]}}))
 const source=ok(await call('/form-data-sources',{method:'POST',body:{code,name:'领用类别',kind:'dictionary',dictionaryId:dictionary.id,status:'enabled',description:''}}))
 const app=ok(await call('/application-center',{method:'POST',body:{code,name:'绑定设备',description:'',template:'equipment'}}))
 const f=ok(await call(`/form-schemas/${app.formDraftId}`)),w=ok(await call(`/workflows/${app.workflowDraftId}`))
 const schema=structuredClone(f.schema);schema.version=2;schema.dataSources=[{key:'device-type',name:'设备类别',kind:'registered',registryId:source.id}];schema.widgetsConfig.push({uid:'deviceType',type:'select',name:'设备类别',config:{id:'deviceType',label:'设备类别',required:true,optionsType:'registered',optionsSourceKey:'device-type',options:[]}})
 return{dictionary,source,app,f,w,schema}
}
test('bound drafts and published sources persist references, freeze choices and validate real submissions',async()=>{
 const fixture=await setup(),{dictionary,source,app,f,w,schema}=fixture
 const saved=ok(await call(`/form-schemas/${f.id}`,{method:'PUT',body:{schema,expectedRevision:f.revision}}));assert.equal(saved.schema.dataSources[0].registryId,source.id)
 const before=(await pool.query('SELECT count(*) AS total FROM business_records')).rows[0].total
 const preview=ok(await call(`/form-runtime/${f.id}/submit`,{method:'POST',body:{values:{itemName:'预览设备',quantity:1,reason:'服务端预览',deviceType:'laptop'}}}));assert.equal(preview.mode,'preview')
 assert.equal((await pool.query('SELECT count(*) AS total FROM business_records')).rows[0].total,before)
 assert.equal((await call(`/form-runtime/${f.id}/submit`,{method:'POST',body:{values:{itemName:'预览设备',quantity:1,reason:'服务端预览',deviceType:'forged'}}})).status,422)
 const body={formDraftId:f.id,workflowDraftId:w.id,formRevision:saved.revision,workflowRevision:w.revision,expectedRevision:app.revision},key=randomUUID()
 const release=ok(await call(`/applications/${app.id}/releases`,{method:'POST',body,key}))
 assert.deepEqual(release.formSnapshot.dataSources[0].optionsSnapshot.map(x=>x.value),['laptop','private-choice'])
 assert.equal((await pool.query('SELECT source_id FROM release_form_sources WHERE tenant_id=$1 AND release_id=$2',['tenant-a',release.id])).rows[0].source_id,source.id)
 ok(await call(`/system/dictionaries/${dictionary.id}/items`,{method:'PUT',body:{expectedRevision:2,items:[{label:'笔记本新名称',value:'laptop',disabled:false},{label:'新版本设备',value:'new-device',disabled:false}]}}))
 const fields={itemName:'设备',quantity:1,reason:'实际领用',deviceType:'laptop'}
 const draft=ok(await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:release.id,fields}}))
 assert.equal((await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:release.id,fields:{...fields,deviceType:'new-device'}}})).status,422)
 ok(await call(`/business/records/${draft.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:draft.revision}}))
 assert.equal(ok(await call(`/business/records/${draft.id}`,{user:'a-employee'})).release.formSnapshot.dataSources[0].optionsSnapshot[0].label,'笔记本')
 await pool.query("UPDATE memberships SET permissions=permissions - 'form-source:read' WHERE tenant_id='tenant-a' AND user_id='a-admin'")
 assert.equal((await call(`/applications/${app.id}/releases`,{method:'POST',body,key})).businessCode,'DATA_SOURCE_FORBIDDEN')
 const employeeCaps=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-employee'")).rows[0].permissions
 try{
  await pool.query("UPDATE memberships SET permissions=permissions - 'form-source:read' WHERE tenant_id='tenant-a' AND user_id='a-employee'")
  const detail=ok(await call(`/business/records/${draft.id}`,{user:'a-employee'}));assert.equal(JSON.stringify(detail.release.formSnapshot).includes('private-choice'),false);assert.equal(detail.fields.deviceType,'laptop')
 }finally{await pool.query("UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(employeeCaps)])}
 const admin=originals.find(row=>row.user_id==='a-admin');const caps=(await pool.query('SELECT code FROM permission_definitions')).rows.map(x=>x.code);await pool.query("UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(caps)])
 assert.ok(admin)
})
test('source bindings reject tenant escape, forged snapshots and inactive sources before publication',async()=>{
 const {source,app,f,w,schema}=await setup()
 const forged=structuredClone(schema);Object.assign(forged.dataSources[0],{registryRevision:1,dictionaryRevision:1,optionsSnapshot:[{label:'伪造',value:'forged'}]})
 assert.equal((await call(`/form-schemas/${f.id}`,{method:'PUT',body:{schema:forged,expectedRevision:1}})).status,422)
 assert.equal((await call('/form-schemas',{user:'b-admin',method:'POST',body:{name:'跨租户来源',schema}})).status,404)
 ok(await call(`/form-schemas/${f.id}`,{method:'PUT',body:{schema,expectedRevision:1}}))
 ok(await call(`/form-data-sources/${source.id}`,{method:'PUT',body:{code:source.code,name:source.name,kind:'dictionary',dictionaryId:source.dictionaryId,status:'disabled',description:'',expectedRevision:1}}))
 assert.equal((await call(`/applications/${app.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:2,workflowRevision:1,expectedRevision:1}})).businessCode,'DATA_SOURCE_UNAVAILABLE')
 assert.equal((await pool.query('SELECT id FROM application_releases WHERE tenant_id=$1 AND application_id=$2',['tenant-a',app.id])).rowCount,0)
})
