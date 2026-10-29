import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, after, test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import scans from '../../services/reference-api/dist/file-jobs.js'

const pool = db.createPool()
const tokens = new Map()
let server, root, originals
before(async () => {
  assert.equal(process.env.APP_MODE, 'demo')
  assert.match(
    (await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^af_admin_tests_[a-z0-9]+_demo$/
  )
  await migrations.migrate(pool)
  await seed.seedDemo(pool)
  root = await mkdtemp(path.join(tmpdir(), 'af-file-scan-scope-'))
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin')"
    )
  ).rows
  const codes = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((row) => row.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin')",
    [JSON.stringify(codes)]
  )
  server = api.createServer(pool, undefined, { storageRoot: root })
  await server.ready()
})
after(async () => {
  if (server) await server.close()
  if (originals)
    for (const row of originals)
      await pool.query(
        'UPDATE memberships SET permissions=$3::jsonb WHERE tenant_id=$1 AND user_id=$2',
        [row.tenant_id, row.user_id, JSON.stringify(row.permissions)]
      )
  await pool.end()
  if (root) await rm(root, { recursive: true, force: true })
})
const call = async (url, user = 'a-admin', method = 'GET', payload) => {
  if (!tokens.has(user)) {
    const result = await server.inject({
      method: 'POST',
      url: '/api/user/login',
      payload: { username: user, password: user },
    })
    assert.equal(result.statusCode, 200)
    tokens.set(user, result.json().data.token)
  }
  return server.inject({
    method,
    url: `/api${url}`,
    headers: {
      'x-access-token': tokens.get(user),
      'x-tenant-id': user.startsWith('b-') ? 'tenant-b' : 'tenant-a',
      'idempotency-key': randomUUID(),
      ...(Buffer.isBuffer(payload)
        ? { 'content-type': 'application/octet-stream' }
        : {}),
    },
    ...(payload === undefined ? {} : { payload }),
  })
}
const ok = (response) => {
  assert.equal(response.statusCode, 200, response.body)
  return response.json().data
}
const upload = async (user, label) => {
  const bytes = Buffer.from(`Actual scoped scan ${label}\n`)
  const value = ok(
    await call('/files/uploads', user, 'POST', {
      fileName: `${label}.txt`,
      mimeType: 'text/plain',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  )
  const part = ok(
    await call(`/files/uploads/${value.id}/parts/0`, user, 'PUT', bytes)
  )
  const file = ok(
    await call(`/files/uploads/${value.id}/complete`, user, 'POST', {
      expectedRevision: part.revision,
    })
  )
  return { file, bytes }
}
const fact = async (id) =>
  (
    await pool.query(
      'SELECT tenant_id,id,status,attempts,claimed_by,lease_until,scan_engine,revision FROM stored_files WHERE id=$1',
      [id]
    )
  ).rows[0]

test('exact file scan scope produces a real ClamAV result while same-tenant and foreign files remain unchanged', async () => {
  const owned = await upload('a-admin', 'owned')
  const other = await upload('a-admin', 'other')
  const foreign = await upload('b-admin', 'foreign')
  const beforeOther = await fact(other.file.id)
  const beforeForeign = await fact(foreign.file.id)
  const scope = { tenantId: 'tenant-a', fileIds: [owned.file.id] }
  assert.equal(
    await scans.processFileScan(pool, { storageRoot: root }, scope),
    true
  )
  const completed = await fact(owned.file.id)
  assert.equal(completed.status, 'ready')
  assert.match(completed.scan_engine, /^ClamAV /)
  assert.deepEqual(await fact(other.file.id), beforeOther)
  assert.deepEqual(await fact(foreign.file.id), beforeForeign)
  const content = await call(`/files/resources/${owned.file.id}/content`)
  assert.equal(content.statusCode, 200)
  assert.deepEqual(content.rawPayload, owned.bytes)
  assert.equal(
    await scans.processFileScan(pool, { storageRoot: root }, scope),
    false
  )
  assert.deepEqual(await fact(owned.file.id), completed)
})

test('malformed, unknown, foreign, duplicate and accessor scopes fail before claiming a file', async () => {
  const owned = await upload('a-admin', 'negative-owned')
  const foreign = await upload('b-admin', 'negative-foreign')
  const original = await fact(owned.file.id)
  let reads = 0
  const getter = Object.defineProperty({}, 'fileIds', {
    enumerable: true,
    get() {
      reads += 1
      return [owned.file.id]
    },
  })
  const sparse = new Array(1)
  for (const scope of [
    null,
    {},
    { tenantId: 'tenant-a', fileIds: [] },
    { tenantId: 'tenant-a', fileIds: [foreign.file.id] },
    { tenantId: 'tenant-a', fileIds: [randomUUID()] },
    { tenantId: 'tenant-a', fileIds: [owned.file.id, owned.file.id] },
    { tenantId: 'tenant-a', fileIds: sparse },
    { tenantId: 'tenant-a', fileIds: [owned.file.id], all: true },
    getter,
  ]) {
    await assert.rejects(
      () => scans.processFileScan(pool, { storageRoot: root }, scope),
      /Invalid file scan maintenance scope/
    )
    assert.deepEqual(await fact(owned.file.id), original)
  }
  assert.equal(reads, 0)
})
