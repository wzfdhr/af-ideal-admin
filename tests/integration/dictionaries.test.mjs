import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migration from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
const pool=db.createPool(), tokens=new Map()
let server,base,originals,fail=false
before(async()=>{
 await migration.migrate(pool); await seeds.seedDemo(pool)
 originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin')")).rows
 const permissions=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(permissions)])
 server=api.createServer(pool,point=>{if(fail&&point==='dictionary:written'){fail=false;throw new Error('Controlled dictionary failure')}})
 base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();for(const row of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,JSON.stringify(row.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,key=randomUUID()}={})=>{
 if(!tokens.has(user)){const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(response.status,200);tokens.set(user,(await response.json()).data.token)}
 const response=await fetch(`${base}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,...await response.json()}
}
const ok=result=>{assert.equal(result.status,200,result.businessCode);return result.data}
const metadata=type=>({dictName:'设备分类',dictType:type||`device-${randomUUID().slice(0,8)}`,dictStatus:'enabled',description:'真实字典'})
test('tenant dictionaries and primitive options persist, isolate tenants, disable and tombstone without reference reuse',async()=>{
 const body=metadata(),key=randomUUID(),created=ok(await call('/system/dictionaries',{method:'POST',body,key}))
 assert.equal(ok(await call('/system/dictionaries',{method:'POST',body,key})).id,created.id)
 const items=[{label:'笔记本',value:'laptop',disabled:false},{label:'已停用',value:'obsolete',disabled:true},{label:'零',value:0,disabled:false},{label:'否',value:false,disabled:false}]
 const saved=ok(await call(`/system/dictionaries/${created.id}/items`,{method:'PUT',body:{expectedRevision:1,items}}));assert.equal(saved.revision,2)
 assert.deepEqual(ok(await call(`/sys/dic/${body.dictType}`)).map(x=>x.value),['laptop',0,false])
 await server.close(); server=api.createServer(pool,point=>{if(fail&&point==='dictionary:written'){fail=false;throw new Error('Controlled dictionary failure')}}); base=await server.listen({host:'127.0.0.1',port:0})
 const reopened=ok(await call(`/system/dictionaries/${created.id}`));assert.deepEqual(reopened.items,items)
 assert.equal((await call(`/system/dictionaries/${created.id}`,{user:'b-admin'})).status,404)
 assert.equal((await call(`/sys/dic/${body.dictType}`,{user:'b-admin'})).status,404)
 const other=ok(await call('/system/dictionaries',{user:'b-admin',method:'POST',body}));assert.notEqual(other.id,created.id)
 assert.equal((await call(`/system/dictionaries/${created.id}`,{method:'PUT',body:{...body,dictType:'renamed',expectedRevision:2}})).businessCode,'DICTIONARY_TYPE_IMMUTABLE')
 const disabled=ok(await call(`/system/dictionaries/${created.id}`,{method:'PUT',body:{...body,dictStatus:'disabled',expectedRevision:2}}))
 assert.equal((await call(`/sys/dic/${body.dictType}`)).businessCode,'DICTIONARY_UNAVAILABLE')
 ok(await call(`/system/dictionaries/${created.id}`,{method:'DELETE',body:{expectedRevision:disabled.revision}}))
 assert.equal((await call(`/system/dictionaries/${created.id}`)).status,404)
 assert.equal((await call('/system/dictionaries',{method:'POST',body})).businessCode,'DICTIONARY_TYPE_EXISTS')
 assert.equal((await pool.query('SELECT count(*) AS n FROM dictionary_items WHERE tenant_id=$1 AND dictionary_id=$2',['tenant-a',created.id])).rows[0].n,'4')
})
test('dictionary commands reject stale or invalid writes, preserve transaction history and recover same-key faults once',async()=>{
 const body=metadata(),created=ok(await call('/system/dictionaries',{method:'POST',body}))
 const items=[{label:'同一值',value:'x',disabled:false}]
 const command={expectedRevision:1,items},key=randomUUID()
 fail=true;assert.equal((await call(`/system/dictionaries/${created.id}/items`,{method:'PUT',body:command,key})).status,500)
 assert.equal(ok(await call(`/system/dictionaries/${created.id}`)).revision,1)
 assert.deepEqual(ok(await call(`/system/dictionaries/${created.id}`)).items,[])
 const results=await Promise.all([call(`/system/dictionaries/${created.id}/items`,{method:'PUT',body:command,key}),call(`/system/dictionaries/${created.id}/items`,{method:'PUT',body:command,key})])
 assert.equal(ok(results[0]).revision,2);assert.equal(ok(results[1]).revision,2)
 assert.equal((await call(`/system/dictionaries/${created.id}/items`,{method:'PUT',body:command})).businessCode,'REVISION_CONFLICT')
 assert.equal((await call(`/system/dictionaries/${created.id}/items`,{method:'PUT',body:{expectedRevision:2,items:[...items,...items]}})).status,422)
 assert.equal((await call('/system/dictionaries',{method:'POST',body:{...metadata(),tenantId:'tenant-b'}})).status,422)
 assert.equal((await call('/system/dictionaries',{method:'POST',body:{...metadata(),dictType:'dictStatus'}})).status,422)
 assert.equal((await pool.query("SELECT count(*) AS n FROM audit_events WHERE target_id=$1 AND action='dictionary.items-update' AND result='success'",[created.id])).rows[0].n,'1')
})
test('runtime dictionary reads recheck permission and sessions; unauthorized members cannot enumerate or modify tenant options',async()=>{
 const body=metadata(),created=ok(await call('/system/dictionaries',{method:'POST',body}))
 assert.equal((await call('/system/dictionaries',{user:'a-employee'})).status,403)
 assert.equal((await call(`/sys/dic/${body.dictType}`,{user:'a-employee'})).status,403)
 assert.equal((await call(`/system/dictionaries/${created.id}/items`,{user:'a-employee',method:'PUT',body:{expectedRevision:1,items:[]}})).status,403)
 const original=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
 try {
  await pool.query("UPDATE memberships SET permissions=permissions - 'system:dict:read' WHERE tenant_id='tenant-a' AND user_id='a-admin'")
  assert.equal((await call(`/sys/dic/${body.dictType}`)).status,403)
  assert.equal(ok(await call(`/system/dictionaries/${created.id}`)).id,created.id)
 } finally {await pool.query("UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(original)])}
})
