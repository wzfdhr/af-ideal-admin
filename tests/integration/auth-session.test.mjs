import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import security from '../../services/reference-api/dist/security.js'

const pool=db.createPool()
const server=api.createServer(pool)
before(async()=>{await migrations.migrate(pool);await seeds.seedDemo(pool);await server.ready()})
after(async()=>{await server.close();await pool.end()})
const login=async(username='a-employee')=>{
  const result=await server.inject({method:'POST',url:'/api/user/login',payload:{username,password:username}})
  assert.equal(result.statusCode,200)
  const token=result.json().data.token
  assert.ok(typeof token==='string'&&token.length>30)
  return token
}
const headers=(token,tenant='tenant-a')=>({'x-access-token':token,'x-tenant-id':tenant})

test('real API authenticates salted password hashes and stores only session token hashes',async()=>{
  const token=await login()
  const result=await server.inject({method:'POST',url:'/api/user/info',headers:headers(token)})
  assert.equal(result.statusCode,200)
  assert.equal(result.json().data.id,'a-employee')
  const session=await pool.query('SELECT token_hash FROM sessions WHERE token_hash=$1',[security.digest(token)])
  assert.equal(session.rowCount,1)
  assert.ok(session.rows[0].token_hash!==token)
  const user=await pool.query("SELECT password_hash FROM users WHERE id='a-employee'")
  assert.ok(user.rows[0].password_hash.startsWith('scrypt:v1:'))
})
test('missing, forged, expired and logged-out sessions reject subsequent requests',async()=>{
  assert.equal((await server.inject({url:'/api/user/info'})).statusCode,401)
  assert.equal((await server.inject({url:'/api/user/info',headers:headers('invalid-fixture-token')})).statusCode,401)
  const expired=await login()
  await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[security.digest(expired)])
  assert.equal((await server.inject({url:'/api/user/info',headers:headers(expired)})).statusCode,401)
  const revoked=await login()
  assert.equal((await server.inject({method:'POST',url:'/api/user/logout',headers:headers(revoked)})).statusCode,200)
  assert.equal((await server.inject({url:'/api/user/info',headers:headers(revoked)})).statusCode,401)
})
test('tenant headers cannot forge membership and switching never mutates other tab defaults',async()=>{
  const single=await login()
  const denied=await server.inject({url:'/api/user/info',headers:headers(single,'tenant-b')})
  assert.equal(denied.statusCode,404)
  const shared=await login('cross-tenant-employee')
  const switched=await server.inject({method:'POST',url:'/api/tenants/switch',headers:headers(shared),payload:{tenantId:'tenant-b'}})
  assert.equal(switched.statusCode,200)
  assert.equal(switched.json().data.tenantId,'tenant-b')
  const original=await server.inject({url:'/api/user/info',headers:{'x-access-token':shared}})
  assert.equal(original.json().data.tenantId,'tenant-a')
  assert.equal((await server.inject({url:'/api/user/info',headers:headers(shared,'tenant-b')})).statusCode,200)
})
test('membership revocation affects the next API request',async()=>{
  const token=await login('a-auditor')
  try {
    await pool.query("UPDATE memberships SET status='disabled' WHERE tenant_id='tenant-a' AND user_id='a-auditor'")
    assert.equal((await server.inject({url:'/api/user/info',headers:headers(token)})).statusCode,404)
  } finally {
    await pool.query("UPDATE memberships SET status='enabled' WHERE tenant_id='tenant-a' AND user_id='a-auditor'")
  }
})
test('login throttling is bounded and invalid inputs do not reveal credentials',async()=>{
  let last
  for(let i=0;i<11;i++) last=await server.inject({method:'POST',url:'/api/user/login',payload:{username:'nonexistent-fixture',password:'invalid-fixture'}})
  assert.equal(last.statusCode,429)
  assert.ok(!last.body.includes('invalid-fixture'))
  assert.ok(!last.body.includes('token'))
})
