import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import initialization from '../../services/reference-api/dist/initialize-pilot.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'

test('an empty pilot database accepts private identities once and exposes no demo reset route', async () => {
  const adminPool = db.createPool()
  const database = `r1_pilot_test_${randomUUID().replaceAll('-', '')}`
  const previousMode = process.env.APP_MODE
  let pool, server
  await adminPool.query(`CREATE DATABASE ${database}`)
  try {
    const url = new URL(process.env.DATABASE_URL)
    url.pathname = `/${database}`
    pool = new Pool({ connectionString: url.toString() })
    await pool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
    await assert.rejects(migrations.verifyMigrationReadiness(pool))
    await migrations.migrate(pool)
    await migrations.verifyMigrationReadiness(pool)
    process.env.APP_MODE = 'pilot'
    const members = ['admin', 'manager', 'manager', 'employee', 'auditor'].map((kind, i) => ({ username: `pilot-member-${i}`, name: `试点成员 ${i}`, department: '验收部门', kind, password: randomUUID() }))
    const input = { tenantId: 'pilot-fixture', tenantName: '试点合成环境', members }
    await assert.rejects(initialization.initializePilot(pool, { ...input, members: members.map((member) => ({ ...member, password: member.username })) }), (error) => error.status === 422)
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM tenants')).rows[0].total, 0)
    await initialization.initializePilot(pool, input)
    await assert.rejects(initialization.initializePilot(pool, input), (error) => error.businessCode === 'ALREADY_INITIALIZED')
    await assert.rejects(seeds.seedDemo(pool), /explicit APP_MODE=demo/)
    assert.equal((await pool.query("SELECT count(*)::int AS total FROM users WHERE username LIKE 'a-%' OR username LIKE 'b-%'")).rows[0].total, 0)
    server = api.createServer(pool)
    const login = await server.inject({ method: 'POST', url: '/api/user/login', payload: { username: members[0].username, password: members[0].password } })
    assert.equal(login.statusCode, 200)
    const token = login.json().data.token
    const headers = { 'x-access-token': token, 'x-tenant-id': 'pilot-fixture' }
    assert.equal((await server.inject({ url: '/api/user/info', headers })).json().data.permissions.includes('application:publish'), true)
    const app = await server.inject({ url: '/api/applications/leave', headers })
    assert.equal(app.json().data.activeReleaseId, null)
    const released = await server.inject({ method: 'POST', url: '/api/applications/leave/releases', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { formDraftId: 'form-leave', workflowDraftId: 'workflow-leave', formRevision: 1, workflowRevision: 1, expectedRevision: 1 } })
    assert.equal(released.statusCode, 200)
    for (const endpoint of ['/api/demo/reset', '/api/reset', '/api/mock/reset']) assert.equal((await server.inject({ method: 'POST', url: endpoint, headers, payload: {} })).statusCode, 404)
  } finally {
    process.env.APP_MODE = previousMode
    if (server) await server.close()
    if (pool) await pool.end()
    await adminPool.query(`DROP DATABASE ${database}`)
    await adminPool.end()
  }
})
test('explicit empty-platform initialization creates a private governor without wildcard or later silent upgrades',async()=>{
 const adminPool=db.createPool(),database=`platform_pilot_${randomUUID().replaceAll('-','')}`,previous=process.env.APP_MODE
 let pool,server
 await adminPool.query(`CREATE DATABASE ${database}`)
 try{
  const url=new URL(process.env.DATABASE_URL);url.pathname=`/${database}`
  pool=new Pool({connectionString:url.toString()});await migrations.migrate(pool);process.env.APP_MODE='pilot'
  const members=['admin','manager','manager'].map((kind,i)=>({username:`platform-member-${i}`,name:`平台私有成员${i}`,department:'合成组织',kind,password:randomUUID()}))
  const input={tenantId:'platform-fixture',tenantName:'平台私有初始化验收',members,platformGovernance:true}
  await initialization.initializePilot(pool,input)
  server=api.createServer(pool)
  const login=await server.inject({method:'POST',url:'/api/user/login',payload:{username:members[0].username,password:members[0].password}})
  assert.equal(login.statusCode,200)
  const headers={'x-access-token':login.json().data.token,'x-tenant-id':'platform-fixture'}
  const info=(await server.inject({url:'/api/user/info',headers})).json().data
  assert.ok(info.permissions.includes('system:role:assign'));assert.ok(info.permissions.includes('system:user:create'));assert.ok(!info.permissions.includes('*'))
  assert.equal((await server.inject({url:'/api/system/roles',headers})).statusCode,200)
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM users WHERE owner_tenant_id=$1',['platform-fixture'])).rows[0].count,3)
  await assert.rejects(initialization.initializePilot(pool,input),error=>error.businessCode==='ALREADY_INITIALIZED')
 }finally{process.env.APP_MODE=previous;if(server)await server.close();if(pool)await pool.end();await adminPool.query(`DROP DATABASE ${database}`);await adminPool.end()}
})
