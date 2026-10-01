import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before,after,test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import security from '../../services/reference-api/dist/security.js'
const pool=db.createPool()
let server,base,admin
before(async()=>{
 await migrations.migrate(pool);await seeds.seedDemo(pool)
 await pool.query("UPDATE memberships SET permissions=permissions || '[\"system:user:create\",\"system:user:reset-password\"]'::jsonb WHERE user_id='a-admin' AND tenant_id='tenant-a'")
 server=api.createServer(pool);base=await server.listen({host:'127.0.0.1',port:0})
 admin=await login('a-admin','a-admin')
})
after(async()=>{await server.close();await pool.end()})
const login=async(username,password)=>{
 const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})})
 assert.equal(response.status,200)
 return (await response.json()).data.token
}
const call=async(path,token,body,tenant='tenant-a',key=randomUUID())=>{
 const response=await fetch(`${base}/api${path}`,{method:body?'POST':'GET',headers:{'x-access-token':token,'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,...await response.json()}
}
const ok=value=>{assert.equal(value.status,200,value.businessCode);return value.data}
const fixture=async(shared=false)=>{
 const username=`credential-${randomUUID().slice(0,8)}`,password='Initial-private-fixture-2026'
 const user=ok(await call('/system/users',admin,{username,name:'凭据合成身份',initialPassword:password,status:'enabled'}))
 if(shared) await pool.query("INSERT INTO memberships (tenant_id,user_id,department_name,role,permissions) VALUES ('tenant-b',$1,'业务部','user','[]')",[user.id])
 return {user,username,password,a:await login(username,password),b:await login(username,password)}
}
test('self credential state and validation never expose or change secrets on rejected inputs',async()=>{
 const f=await fixture(),state=ok(await call('/user/credential-state',f.a))
 assert.deepEqual(state,{credentialRevision:1})
 const wrong=await call('/user/password',f.a,{oldPassword:'Wrong-private-fixture-2026',newPassword:'Next-private-fixture-2026',expectedRevision:1})
 assert.equal(wrong.status,422);assert.equal(wrong.businessCode,'OLD_PASSWORD_INVALID')
 assert.ok(!JSON.stringify(wrong).includes('Wrong-private-fixture-2026'))
 assert.equal((await call('/user/password',f.a,{oldPassword:f.password,newPassword:'Next-private-fixture-2026',expectedRevision:1,userId:'a-admin'})).status,422)
 assert.equal(ok(await call('/user/credential-state',f.a)).credentialRevision,1)
})
test('self password change persists one fact, revokes all old tenant sessions and recovers an idempotent acknowledgement after new login',async()=>{
 const f=await fixture(true),key=randomUUID(),command={oldPassword:f.password,newPassword:'Changed-private-fixture-2026',expectedRevision:1}
 const changed=ok(await call('/user/password',f.a,command,'tenant-a',key))
 assert.deepEqual(changed,{credentialRevision:2})
 assert.equal((await call('/user/info',f.a)).status,401)
 assert.equal((await call('/user/info',f.b,undefined,'tenant-b')).status,401)
 const fresh=await login(f.username,command.newPassword)
 assert.deepEqual(ok(await call('/user/password',fresh,command,'tenant-a',key)),changed)
 const stored=(await pool.query('SELECT password_hash,credential_revision FROM users WHERE id=$1',[f.user.id])).rows[0]
 assert.equal(stored.credential_revision,2)
 assert.equal(await security.verifyPassword(command.newPassword,stored.password_hash),true)
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE target_id=$1 AND action='password.change' AND result='success'",[f.user.id])).rows[0].count,1)
 const failure=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:f.username,password:f.password})})
 assert.equal(failure.status,401)
})
test('shared identity changing credentials from two tenants serializes without lock upgrade deadlock',{timeout:10000},async()=>{
 const f=await fixture(true)
 const results=await Promise.all(['tenant-a','tenant-b'].map((tenant,i)=>call('/user/password',i?f.b:f.a,{oldPassword:f.password,newPassword:`Concurrent-private-fixture-${i}-2026`,expectedRevision:1},tenant)))
 assert.equal(results.filter(value=>value.status===200).length,1)
 assert.ok(results.every(value=>[200,401,404,409].includes(value.status)))
 assert.equal((await pool.query('SELECT credential_revision FROM users WHERE id=$1',[f.user.id])).rows[0].credential_revision,2)
})
test('administrator reset and self change compare the same credential version',{timeout:10000},async()=>{
 const f=await fixture()
 const results=await Promise.all([
  call(`/system/users/${f.user.id}/reset-password`,admin,{initialPassword:'Admin-private-fixture-2026',expectedRevision:f.user.revision,expectedCredentialRevision:1}),
  call('/user/password',f.a,{oldPassword:f.password,newPassword:'Self-private-fixture-2026',expectedRevision:1}),
 ])
 assert.equal(results.filter(value=>value.status===200).length,1)
 assert.ok(results.every(value=>[200,401,404,409].includes(value.status)))
 assert.equal((await pool.query('SELECT credential_revision FROM users WHERE id=$1',[f.user.id])).rows[0].credential_revision,2)
})
test('a login verified before credential rotation cannot mint a valid old-password session afterwards',{timeout:10000},async()=>{
 const f=await fixture(),holder=await pool.connect()
 let pending
 try {
  await holder.query('BEGIN')
  await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`credential:${f.user.id}`])
  pending=fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:f.username,password:f.password})})
  let waiting=false
  for(let attempt=0;attempt<100;attempt++){
   const blocked=await pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock%'")
   if(blocked.rows[0].count){waiting=true;break}
   await new Promise(resolve=>setTimeout(resolve,20))
  }
  assert.equal(waiting,true,'the actual login must be blocked after verification at the credential gate')
  await holder.query('UPDATE users SET password_hash=$2,credential_revision=credential_revision+1 WHERE id=$1',[f.user.id,await security.hashPassword('Rotated-during-login-fixture-2026')])
  await holder.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1',[f.user.id])
  await holder.query('COMMIT')
  assert.equal((await pending).status,401)
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM sessions WHERE user_id=$1 AND revoked_at IS NULL',[f.user.id])).rows[0].count,0)
 } finally {await holder.query('ROLLBACK');holder.release();if(pending)await pending}
})
