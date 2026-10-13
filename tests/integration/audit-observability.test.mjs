import assert from 'node:assert/strict'
import { test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migration from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'

test('a failed diagnostic write preserves the original rejection and emits only bounded trace metadata', async (t) => {
  const pool = db.createPool()
  let server
  let originalPermissions
  try {
    assert.equal(process.env.APP_MODE, 'demo')
    assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name, /^af_admin_tests_[a-z0-9]+_demo$/)
    await migration.migrate(pool)
    await seed.seedDemo(pool)
    originalPermissions = (await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
    await pool.query("UPDATE memberships SET permissions=permissions||'[\"audit:read\"]'::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'")
    server = api.createServer(pool)
    await server.ready()
    const session = await server.inject({method:'POST',url:'/api/user/login',payload:{username:'a-admin',password:'a-admin'}})
    assert.equal(session.statusCode,200)
    const token = session.json().data.token
    const log = []
    const originalWrite = process.stderr.write
    t.mock.method(process.stderr,'write',function (chunk,...rest) {
      if (typeof chunk === 'string' && chunk.includes('AUDIT_PERSIST_FAILED')) {
        log.push(chunk)
        return true
      }
      return originalWrite.call(this,chunk,...rest)
    })
    const query = pool.query.bind(pool)
    const privateMarker = 'private-database-password-body-never-log'
    let rejectedFacts = 0
    const queryMock = t.mock.method(pool,'query',function (sql,values,...rest) {
      if (typeof sql === 'string' && sql.startsWith('INSERT INTO audit_events') && values?.[4] === 'request') {
        rejectedFacts += 1
        return Promise.reject(new Error(`${privateMarker}:${token}`))
      }
      return query(sql,values,...rest)
    })
    const response = await server.inject({method:'GET',url:'/api/audit/events?pageSize=101',headers:{'x-access-token':token,'x-tenant-id':'tenant-a'}})
    assert.equal(response.statusCode,422)
    const envelope = response.json()
    assert.equal(envelope.businessCode,'VALIDATION_ERROR')
    assert.equal(envelope.data,null)
    assert.equal(rejectedFacts,1)
    assert.equal(log.length,1)
    assert.deepEqual(JSON.parse(log[0]),{traceId:envelope.traceId,component:'audit',stage:'request.failure.persist',code:'AUDIT_PERSIST_FAILED'})
    assert.ok(!log.join('').includes(privateMarker))
    assert.ok(!log.join('').includes(token))
    assert.ok(!response.body.includes(privateMarker))
    queryMock.mock.restore()
    assert.equal(Number((await pool.query('SELECT count(*) AS n FROM audit_events WHERE trace_id=$1',[envelope.traceId])).rows[0].n),0)
    const recovered = await server.inject({method:'GET',url:'/api/audit/events?pageSize=1',headers:{'x-access-token':token,'x-tenant-id':'tenant-a'}})
    assert.equal(recovered.statusCode,200)
    assert.equal(recovered.json().data.source,'server')
  } finally {
    t.mock.restoreAll()
    if (server) await server.close()
    if (originalPermissions) await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(originalPermissions)])
    await pool.end()
  }
})
