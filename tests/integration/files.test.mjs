import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import {mkdtemp,rm,utimes,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {before,after,test} from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import jobs from '../../services/reference-api/dist/file-jobs.js'
const pool=db.createPool(),tokens=new Map(),hash=bytes=>createHash('sha256').update(bytes).digest('hex')
let server,base,root,originals
before(async()=>{
 await migrations.migrate(pool);await seeds.seedDemo(pool);root=await mkdtemp(path.join(tmpdir(),'af-admin-files-tests-'))
 originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','a-employee')")).rows
 const codes=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin','a-employee')",[JSON.stringify(codes)])
 server=api.createServer(pool,undefined,{storageRoot:root});base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();for(const item of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[item.tenant_id,item.user_id,JSON.stringify(item.permissions)]);await pool.end();await rm(root,{recursive:true,force:true})})
const call=async(url,{user='a-employee',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,bytes,key=randomUUID(),binary=false,origin=base}={})=>{
 if(!tokens.has(user)){
  const result=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(result.status,200);tokens.set(user,(await result.json()).data.token)
 }
 const result=await fetch(`${origin}/api${url}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(bytes?{'content-type':'application/octet-stream'}:body?{'content-type':'application/json'}:{})},body:bytes|| (body?JSON.stringify(body):undefined)})
 if(binary&&result.status===200)return {status:200,bytes:Buffer.from(await result.arrayBuffer()),headers:result.headers}
 return {status:result.status,...await result.json()}
}
const ok=value=>{assert.equal(value.status,200,value.businessCode);return value.data}
const begin=async(bytes,extra={})=>ok(await call('/files/uploads',{method:'POST',body:{fileName:`file-${randomUUID()}.txt`,mimeType:'text/plain',size:bytes.length,sha256:hash(bytes),...extra}}))
const finish=async(upload,bytes)=>{
 let revision=upload.revision
 for(let index=0;index<Math.ceil(bytes.length/1048576);index++)revision=ok(await call(`/files/uploads/${upload.id}/parts/${index}`,{method:'PUT',bytes:bytes.subarray(index*1048576,(index+1)*1048576)})).revision
 return ok(await call(`/files/uploads/${upload.id}/complete`,{method:'POST',body:{expectedRevision:revision}}))
}
const clean=async()=>jobs.processFileScan(pool,{storageRoot:root,scanner:async()=>({clean:true,engine:'controlled-test-scanner'})})
test('real byte chunks persist, replay identical content and reject replacement; downloads return exactly the verified object',async()=>{
 const bytes=Buffer.alloc(1048576+27,65),upload=await begin(bytes)
 const first=ok(await call(`/files/uploads/${upload.id}/parts/0`,{method:'PUT',bytes:bytes.subarray(0,1048576)}))
 assert.equal(ok(await call(`/files/uploads/${upload.id}/parts/0`,{method:'PUT',bytes:bytes.subarray(0,1048576)})).revision,first.revision)
 assert.equal((await call(`/files/uploads/${upload.id}/parts/0`,{method:'PUT',bytes:Buffer.alloc(1048576,66)})).businessCode,'PART_CONFLICT')
 const file=await finish(upload,bytes)
 assert.equal((await call(`/files/resources/${file.id}/content`)).businessCode,'FILE_NOT_READY')
 await clean()
 const downloaded=await call(`/files/resources/${file.id}/content`,{binary:true});assert.equal(downloaded.status,200);assert.deepEqual(downloaded.bytes,bytes);assert.equal(downloaded.headers.get('x-content-type-options'),'nosniff')
 assert.equal((await call(`/files/resources/${file.id}/content`,{user:'b-admin'})).status,404)
 assert.equal((await call(`/files/resources/${file.id}/content`,{user:'a-admin'})).status,404)
})
test('metadata identity, path, size and actual bytes are validated rather than accepting a fake file name',async()=>{
 const bytes=Buffer.from('real text')
 for(const extra of [{fileName:'../secret.txt'},{owner:'a-admin'},{tenantId:'tenant-b'},{size:20971521},{mimeType:'text/html'},{sha256:'bad'}])assert.equal((await call('/files/uploads',{method:'POST',body:{fileName:'file.txt',mimeType:'text/plain',size:bytes.length,sha256:hash(bytes),...extra}})).status,422)
 const bad=await begin(bytes,{fileName:'fake.png',mimeType:'image/png'})
 const part=ok(await call(`/files/uploads/${bad.id}/parts/0`,{method:'PUT',bytes}))
 assert.equal((await call(`/files/uploads/${bad.id}/complete`,{method:'POST',body:{expectedRevision:part.revision}})).businessCode,'FILE_TYPE_MISMATCH')
 ok(await call(`/files/uploads/${bad.id}/cancel`,{method:'POST',body:{expectedRevision:part.revision}}))
 const wrong=await begin(bytes,{sha256:hash(Buffer.from('wrong'))})
 const saved=ok(await call(`/files/uploads/${wrong.id}/parts/0`,{method:'PUT',bytes}))
 assert.equal((await call(`/files/uploads/${wrong.id}/complete`,{method:'POST',body:{expectedRevision:saved.revision}})).businessCode,'FILE_DIGEST_MISMATCH')
})
test('scanner outages quarantine bytes, infections never become readable, and deletion does not resurrect them',async()=>{
 const bytes=Buffer.from('quarantine fixture'),file=await finish(await begin(bytes),bytes)
 await jobs.processFileScan(pool,{storageRoot:root,scanner:async()=>{throw new Error('offline')}})
 assert.equal((await call(`/files/resources/${file.id}/content`)).businessCode,'FILE_NOT_READY')
 const state=ok(await call('/files/resources',{body:undefined})).list.find(row=>row.id===file.id);assert.equal(state.status,'scan-failed')
 ok(await call(`/files/resources/${file.id}/retry-scan`,{method:'POST',body:{expectedRevision:state.revision}}))
 await jobs.processFileScan(pool,{storageRoot:root,scanner:async()=>({clean:false,engine:'controlled-test-scanner',threat:'controlled infection'})})
 const infected=ok(await call('/files/resources')).list.find(row=>row.id===file.id);assert.equal(infected.status,'infected')
 assert.equal((await call(`/files/resources/${file.id}/content?preview=1`)).businessCode,'FILE_NOT_READY')
 ok(await call(`/files/resources/${file.id}`,{method:'DELETE',body:{expectedRevision:infected.revision}}))
 assert.equal((await call(`/files/resources/${file.id}/content`)).status,404)
})
test('expired upload sessions and aged unreferenced filesystem objects are cleaned without deleting referenced ready objects',async()=>{
 const abandoned=await begin(Buffer.from('abandoned'))
 await pool.query("UPDATE file_uploads SET expires_at=now()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1",[abandoned.id])
 const key=hash(Buffer.from('orphan-key'));await writeFile(path.join(root,key),'unreferenced');await utimes(path.join(root,key),new Date(0),new Date(0))
 const result=await jobs.cleanupFileObjects(pool,root);assert.ok(result.expired>=1);assert.ok(result.objects>=1)
 assert.equal(ok(await call(`/files/uploads/${abandoned.id}`)).status,'expired')
})
test('business attachments enforce draft ownership, block submission until ready and become immutable with submitted history',async()=>{
 const application=ok(await call('/applications/leave'))
 const record=ok(await call('/leave-requests',{method:'POST',body:{applicationReleaseId:application.activeReleaseId,fields:{leaveType:'personal',startDate:'2026-10-01',startSlot:'am',endDate:'2026-10-02',endSlot:'pm',reason:'真实附件关联'}}}))
 const bytes=Buffer.from('record attachment bytes'),metadata={fileName:'proof.txt',mimeType:'text/plain',size:bytes.length,sha256:hash(bytes),recordId:record.id}
 assert.equal((await call('/files/uploads',{user:'a-admin',method:'POST',body:metadata})).status,404)
 const upload=await begin(bytes,{recordId:record.id})
 assert.equal((await call(`/leave-requests/${record.id}/submit`,{method:'POST',body:{expectedRevision:record.revision}})).businessCode,'FILES_NOT_READY')
 const file=await finish(upload,bytes)
 assert.equal((await call(`/leave-requests/${record.id}/submit`,{method:'POST',body:{expectedRevision:record.revision}})).businessCode,'FILES_NOT_READY')
 await clean()
 const submitted=ok(await call(`/leave-requests/${record.id}/submit`,{method:'POST',body:{expectedRevision:record.revision}}));assert.equal(submitted.status,'running')
 const listed=ok(await call(`/files/resources?recordId=${record.id}`)).list.find(value=>value.id===file.id)
 assert.ok(listed)
 assert.equal((await call(`/files/resources/${file.id}`,{method:'DELETE',body:{expectedRevision:listed.revision}})).businessCode,'ATTACHMENTS_LOCKED')
 const original=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-employee'")).rows[0].permissions
 await pool.query("UPDATE memberships SET permissions=permissions-'leave:read:self' WHERE tenant_id='tenant-a' AND user_id='a-employee'")
 try{
  assert.equal((await call(`/files/resources/${file.id}/content`,{binary:true})).status,404)
  assert.equal(ok(await call('/files/resources')).list.some(value=>value.id===file.id),false)
 }finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(original)])}
})

test('pending real file chunks survive an actual API process replacement and complete without repeated part effects',async()=>{
 const bytes=Buffer.from('durable part fixture'),upload=await begin(bytes)
 const part=ok(await call(`/files/uploads/${upload.id}/parts/0`,{method:'PUT',bytes}))
 const start=async()=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo',FILE_STORAGE_DIR:root},stdio:['ignore','ignore','ignore','ipc']})
  try{const [ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)});return {child,origin:ready.base}}catch(error){child.kill('SIGKILL');throw error}
 }
 const stop=async(child)=>{const closed=once(child,'exit');child.kill('SIGTERM');const [status]=await closed;assert.equal(status,0)}
 const first=await start()
 try{assert.equal(ok(await call(`/files/uploads/${upload.id}`,{origin:first.origin})).parts.length,1)}finally{await stop(first.child)}
 const replacement=await start()
 try{
  const restored=ok(await call(`/files/uploads/${upload.id}`,{origin:replacement.origin}));assert.equal(restored.revision,part.revision)
  assert.equal(ok(await call(`/files/uploads/${upload.id}/parts/0`,{origin:replacement.origin,method:'PUT',bytes})).revision,part.revision)
  ok(await call(`/files/uploads/${upload.id}/complete`,{origin:replacement.origin,method:'POST',body:{expectedRevision:part.revision}}))
 }finally{await stop(replacement.child)}
})
