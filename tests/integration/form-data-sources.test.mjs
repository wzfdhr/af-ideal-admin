import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {before,after,test} from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
const pool=db.createPool(),tokens=new Map()
let server,base,originals,fail=false
const makeServer=()=>api.createServer(pool,point=>{if(fail && point==='form-source:written'){fail=false;throw new Error('Controlled source failure')}})
before(async()=>{await migrations.migrate(pool);await seeds.seedDemo(pool);originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin')")).rows;const caps=(await pool.query('SELECT code FROM permission_definitions')).rows.map(x=>x.code);await pool.query("UPDATE memberships SET permissions=$1 WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(caps)]);server=makeServer();base=await server.listen({host:'127.0.0.1',port:0})})
after(async()=>{await server.close();for(const row of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,JSON.stringify(row.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,key=randomUUID()}={})=>{
 if(!tokens.has(user)){const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(response.status,200);tokens.set(user,(await response.json()).data.token)}
 const response=await fetch(`${base}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,...await response.json()}
}
const ok=x=>{assert.equal(x.status,200,x.businessCode);return x.data}
const setup=async()=>{
 const suffix=randomUUID().slice(0,8)
 const dictionary=ok(await call('/system/dictionaries',{method:'POST',body:{dictName:'来源设备',dictType:`source-${suffix}`,dictStatus:'enabled',description:''}}))
 ok(await call(`/system/dictionaries/${dictionary.id}/items`,{method:'PUT',body:{expectedRevision:1,items:[{label:'笔记本',value:'laptop',disabled:false},{label:'禁用',value:'disabled',disabled:true}]}}))
 const input={code:`source-${suffix}`,name:'真实字典来源',kind:'dictionary',dictionaryId:dictionary.id,status:'enabled',description:''}
 const source=ok(await call('/form-data-sources',{method:'POST',body:input}));return {dictionary,input,source}
}
test('registered dictionary source reads actual tenant options, persists revisions and refuses unavailable or foreign resources',async()=>{
 const {dictionary,input,source}=await setup()
 const query=ok(await call(`/form-data-sources/${source.id}/options`));assert.deepEqual(query.options,[{label:'笔记本',value:'laptop'}]);assert.equal(query.dictionaryRevision,2)
 await server.close();server=makeServer();base=await server.listen({host:'127.0.0.1',port:0})
 assert.equal(ok(await call(`/form-data-sources/${source.id}`)).revision,1)
 assert.equal((await call(`/form-data-sources/${source.id}/options`,{user:'b-admin'})).status,404)
 assert.equal((await call('/form-data-sources',{user:'b-admin',method:'POST',body:{...input,code:'foreign'}})).status,404)
 const disabled=ok(await call(`/form-data-sources/${source.id}`,{method:'PUT',body:{...input,status:'disabled',expectedRevision:1}}));assert.equal(disabled.revision,2)
 assert.equal((await call(`/form-data-sources/${source.id}/options`)).businessCode,'DATA_SOURCE_UNAVAILABLE')
 assert.equal((await call(`/form-data-sources/${source.id}`,{method:'PUT',body:{...input,expectedRevision:1}})).businessCode,'REVISION_CONFLICT')
 ok(await call(`/form-data-sources/${source.id}`,{method:'PUT',body:{...input,expectedRevision:2}}))
 ok(await call(`/system/dictionaries/${dictionary.id}`,{method:'PUT',body:{dictName:dictionary.dictName,dictType:dictionary.dictType,dictStatus:'disabled',description:'',expectedRevision:2}}))
 assert.equal((await call(`/form-data-sources/${source.id}/options`)).businessCode,'DATA_SOURCE_UNAVAILABLE')
})
test('data source use does not delegate dictionary permission, arbitrary targets or transaction results',async()=>{
 const {input,source}=await setup(),original=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
 try{
  await pool.query("UPDATE memberships SET permissions=permissions - 'system:dict:read' WHERE tenant_id='tenant-a' AND user_id='a-admin'")
  assert.equal((await call(`/form-data-sources/${source.id}/options`)).status,403)
  assert.equal((await call('/form-data-sources',{method:'POST',body:{...input,code:'cannot-delegate'}})).status,403)
 }finally{await pool.query("UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(original)])}
 assert.equal((await call(`/form-data-sources/${source.id}/options`,{user:'a-employee'})).status,403)
 assert.equal((await call(`/form-data-sources/${source.id}/options?url=http://localhost/private`)).status,422)
 assert.equal((await call('/form-data-sources',{method:'POST',body:{...input,url:'http://localhost/private'}})).status,422)
 const changed={...input,name:'恢复一次',expectedRevision:1},key=randomUUID()
 fail=true;assert.equal((await call(`/form-data-sources/${source.id}`,{method:'PUT',body:changed,key})).status,500)
 assert.equal(ok(await call(`/form-data-sources/${source.id}`)).name,input.name)
 const results=await Promise.all([call(`/form-data-sources/${source.id}`,{method:'PUT',body:changed,key}),call(`/form-data-sources/${source.id}`,{method:'PUT',body:changed,key})])
 assert.equal(ok(results[0]).revision,2);assert.equal(ok(results[1]).revision,2)
 assert.equal((await pool.query("SELECT count(*) AS n FROM audit_events WHERE target_id=$1 AND action='form-source.update' AND result='success'",[source.id])).rows[0].n,'1')
})
