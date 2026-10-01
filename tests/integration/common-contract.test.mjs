import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import core from '@af-admin/workflow-core'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import { commonContract } from './helpers/common-contract.mjs'

const pool = db.createPool()
let server, base
const tokens = new Map()
before(async () => {
  await migrations.migrate(pool); await seeds.seedDemo(pool)
  server = api.createServer(pool)
  base = await server.listen({ host: '127.0.0.1', port: 0 })
})
after(async () => { await server.close(); await pool.end() })
test('the same public contract scenarios pass against the development memory adapter', async () => {
  const store = new core.R1DemoStore()
  await commonContract(async (path, { method = 'GET', user = 'a-employee', tenant = 'tenant-a', body, key } = {}) => {
    try { return { status: 200, data: store.request(method.toLowerCase(), path, user, tenant, body, key) } }
    catch (error) { return { status: error.status, businessCode: error.businessCode } }
  })
})
test('the same public contract scenarios pass over real HTTP and PostgreSQL', async () => {
  await commonContract(async (path, { method = 'GET', user = 'a-employee', tenant = 'tenant-a', body, key } = {}) => {
    if (!tokens.has(user)) {
      const result = await fetch(`${base}/api/user/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: user }) })
      assert.equal(result.status, 200)
      tokens.set(user, (await result.json()).data.token)
    }
    const headers = { 'x-access-token': tokens.get(user), 'x-tenant-id': tenant, 'content-type': 'application/json' }
    if (key) headers['idempotency-key'] = key
    if (body === undefined) delete headers['content-type']
    const result = await fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: result.status, ...await result.json() }
  })
})
