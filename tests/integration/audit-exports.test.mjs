import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import routes from '../../services/reference-api/dist/audit-exports.js'
import jobs from '../../services/reference-api/dist/audit-export-jobs.js'
import support from '../../services/reference-api/dist/support.js'
import storage from '../../services/reference-api/dist/file-storage.js'
import scanners from '../../services/reference-api/dist/file-scanner.js'
import contracts from '@af-admin/contracts'
import { before, after, test } from 'node:test'

const pool = db.createPool(),
  tokens = new Map(),
  passwords = new Map(),
  members = [],
  roles = [],
  children = new Set()
let server,
  storageRoot,
  originals = [],
  isolated = false,
  failure = ''
let listBarrier
before(async () => {
  assert.equal(process.env.APP_MODE, 'demo')
  assert.match(
    (await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^af_admin_tests_[a-z0-9]+_demo$/
  )
  isolated = true
  await migrations.migrate(pool)
  await seed.seedDemo(pool)
  if (
    !(
      await pool.query("SELECT to_regclass('public.audit_export_jobs') AS name")
    ).rows[0].name
  ) {
    const pending = await readFile(
      new URL(
        '../../services/reference-api/migrations/029_audit_exports.sql.pending',
        import.meta.url
      ),
      'utf8'
    )
    await db.transaction(pool, (client) => client.query(pending))
  }
  storageRoot = await mkdtemp(join(tmpdir(), 'af-audit-export-tests-'))
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin','a-employee')"
    )
  ).rows
  const permissions = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((row) => row.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin','a-employee')",
    [JSON.stringify(permissions)]
  )
  const inject = (point) => {
    if (point === 'audit-export.list.after-query' && listBarrier)
      return listBarrier()
    if (point === failure) {
      failure = ''
      throw new Error('Controlled audit export rollback')
    }
  }
  server = api.createServer(pool, inject, { storageRoot })
  if (!server.hasRoute({ method: 'POST', url: '/api/audit/exports' }))
    routes.registerAuditExports(server, pool, inject, { storageRoot })
  await server.ready()
  const capabilities = ok(await call('/audit/export-capabilities'))
  assert.ok(
    capabilities.formats.every((format) => format.available),
    'Actual storage, shipped CJK font and real ClamAV must be ready'
  )
})
after(async () => {
  const stopped = await Promise.allSettled(Array.from(children).map(stop))
  if (server) await server.close()
  if (isolated) {
    for (const row of originals)
      await pool.query(
        'UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',
        [row.tenant_id, row.user_id, JSON.stringify(row.permissions)]
      )
    await pool.query(
      "UPDATE memberships SET status='disabled',deleted_at=now() WHERE user_id=ANY($1::text[])",
      [members]
    )
    await pool.query(
      "UPDATE roles SET status='disabled',deleted_at=now() WHERE id=ANY($1::text[])",
      [roles]
    )
  }
  await pool.end()
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true })
  const failed = stopped.find((value) => value.status === 'rejected')
  if (failed) throw failed.reason
})
const login = async (user) => {
  if (tokens.has(user)) return tokens.get(user)
  const response = await server.inject({
    method: 'POST',
    url: '/api/user/login',
    payload: { username: user, password: passwords.get(user) || user },
  })
  assert.equal(response.statusCode, 200)
  const token = response.json().data.token
  tokens.set(user, token)
  return token
}
const call = async (
  path,
  {
    user = 'a-admin',
    method = 'GET',
    body,
    key = randomUUID(),
    binary = false,
  } = {}
) => {
  const response = await server.inject({
    method,
    url: `/api${path}`,
    headers: {
      'x-access-token': await login(user),
      'x-tenant-id': user.startsWith('b-') ? 'tenant-b' : 'tenant-a',
      'idempotency-key': key,
    },
    ...(body === undefined ? {} : { payload: body }),
  })
  if (binary && response.statusCode === 200)
    return {
      status: 200,
      bytes: response.rawPayload,
      headers: response.headers,
    }
  return { status: response.statusCode, ...response.json() }
}
const ok = (response) => {
  assert.equal(
    response.status,
    200,
    `${response.businessCode}: ${response.message}`
  )
  return response.data
}
const permissions = [
  ...Object.values(contracts.AUDIT_EXPORT_PERMISSIONS),
  'audit:read',
  'leave:create',
  'leave:read:self',
  'leave:update:self',
]
const user = async ({
  scope = 'self',
  name = `审计导出-${randomUUID().slice(0, 8)}`,
  fields = ['username', 'name'],
  codes = permissions,
} = {}) => {
  const username = `audit-out-${randomUUID().slice(0, 8)}`,
    password = 'Audit-export-private-test-2026'
  const person = ok(
    await call('/system/users', {
      method: 'POST',
      body: {
        username,
        name,
        phone: '',
        email: '',
        initialPassword: password,
        status: 'enabled',
      },
    })
  )
  members.push(person.id)
  passwords.set(username, password)
  const role = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: `Audit export ${randomUUID()}`,
        roleKey: `audit-out-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions: codes,
      },
    })
  )
  roles.push(role.id)
  await pool.query(
    'UPDATE role_member_scopes SET data_scope=$2,field_permissions=$3::jsonb WHERE role_id=$1',
    [role.id, scope, JSON.stringify(fields)]
  )
  ok(
    await call(`/system/users/${person.id}/authorization`, {
      method: 'POST',
      body: {
        roleIds: [role.id],
        directPermissions: [],
        expectedRevision: person.revision,
      },
    })
  )
  return { ...person, username, roleId: role.id }
}
const fields = (reason = 'Private leave data never exported') => ({
  leaveType: 'personal',
  startDate: '2026-10-01',
  startSlot: 'am',
  endDate: '2026-10-02',
  endSlot: 'pm',
  reason,
})
const fact = async (owner, updates = 0) => {
  const app = ok(await call('/applications/leave', { user: owner.username }))
  const response = await call('/leave-requests', {
    user: owner.username,
    method: 'POST',
    body: { applicationReleaseId: app.activeReleaseId, fields: fields() },
  })
  let record = ok(response)
  for (let i = 0; i < updates; i += 1)
    record = ok(
      await call(`/leave-requests/${record.id}`, {
        user: owner.username,
        method: 'PATCH',
        body: {
          expectedRevision: record.revision,
          fields: fields(`Private ${i}`),
        },
      })
    )
  return { record, traceId: response.traceId }
}
const create = async (owner, query, format = 'csv', key = randomUUID()) =>
  call('/audit/exports', {
    user: owner.username,
    method: 'POST',
    body: { query, format },
    key,
  })
const detail = async (job, owner) =>
  ok(await call(`/audit/exports/${job.id}`, { user: owner.username }))
const command = async (job, owner, action, extra = {}, key = randomUUID()) =>
  call(`/audit/exports/${job.id}/${action}`, {
    user: owner.username,
    method: 'POST',
    key,
    body: { expectedRevision: job.revision, ...extra },
  })
const scope = (job) => ({ tenantId: 'tenant-a', jobIds: [job.id] })
const processOne = (job, fault = () => undefined) =>
  jobs.processAuditExports(pool, { storageRoot }, fault, 1, scope(job))
const download = (job, owner) =>
  call(`/audit/exports/${job.id}/download`, {
    user: owner.username,
    binary: true,
  })
const stored = async (job) =>
  (
    await pool.query(
      "SELECT * FROM audit_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
      [job.id]
    )
  ).rows[0]
const eventCount = async (job, action) =>
  Number(
    (
      await pool.query(
        "SELECT count(*) AS n FROM audit_export_events WHERE tenant_id='tenant-a' AND job_id=$1 AND action=$2",
        [job.id, action]
      )
    ).rows[0].n
  )

test('real CSV/XLSX/PDF capture the full matching fact set and download only scanned actual bytes under independent audit permissions', async () => {
  const owner = await user(),
    source = await fact(owner, 4)
  for (const format of ['csv', 'xlsx', 'pdf']) {
    const created = ok(
      await create(
        owner,
        { targetId: source.record.id, current: 9, pageSize: 1 },
        format
      )
    )
    assert.equal(created.totalRows, 5)
    const plan = await stored(created)
    assert.equal(plan.event_ids.length, 5)
    assert.equal(plan.snapshot.rows.length, 5)
    assert.equal(
      Buffer.byteLength(plan.snapshot_canonical) <=
        contracts.AUDIT_EXPORT_MAX_SNAPSHOT_BYTES,
      true
    )
    assert.equal(
      createHash('sha256').update(plan.snapshot_canonical).digest('hex'),
      plan.snapshot_hash
    )
    await processOne(created)
    const completed = await detail(created, owner)
    assert.equal(completed.status, 'completed')
    assert.equal(completed.artifact.status, 'ready')
    assert.match(completed.artifact.scanEngine, /^ClamAV /)
    const bytes = await download(created, owner)
    assert.equal(bytes.status, 200)
    assert.equal(bytes.bytes.length, completed.artifact.size)
    assert.equal(
      createHash('sha256').update(bytes.bytes).digest('hex'),
      completed.artifact.sha256
    )
    assert.equal(bytes.headers['cache-control'], 'no-store')
    if (format === 'csv') {
      assert.deepEqual([...bytes.bytes.subarray(0, 3)], [239, 187, 191])
      assert.ok(bytes.bytes.toString().includes('事实ID'))
      assert.equal(bytes.bytes.toString().includes('Private leave data'), false)
    }
    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(bytes.bytes)
      assert.equal(workbook.getWorksheet('审计事实').rowCount, 6)
    }
    if (format === 'pdf') {
      assert.match(bytes.bytes.toString('latin1'), /^%PDF-1\.7/)
      assert.match(bytes.bytes.toString('latin1'), /%%EOF\s*$/)
    }
    assert.equal(await processOne(created), 0)
    assert.equal(await eventCount(created, 'completed'), 1)
    assert.equal(
      (await call(`/audit/exports/${created.id}`, { user: 'b-admin' })).status,
      404
    )
    assert.equal(
      (
        await call(`/audit/exports/${created.id}/download`, {
          user: 'b-admin',
          binary: true,
        })
      ).status,
      404
    )
  }
})

test('capture rollback, immutable same-tenant manifests and concurrent idempotent creation retain one plan and reject body facts', async () => {
  const owner = await user(),
    source = await fact(owner),
    query = { traceId: source.traceId },
    key = randomUUID()
  failure = 'audit-export.create.before-commit'
  const before = Number(
    (await pool.query('SELECT count(*) AS n FROM audit_export_jobs')).rows[0].n
  )
  assert.equal((await create(owner, query, 'csv', key)).status, 500)
  assert.equal(
    Number(
      (await pool.query('SELECT count(*) AS n FROM audit_export_jobs')).rows[0]
        .n
    ),
    before
  )
  const [a, b] = await Promise.all([
    create(owner, query, 'csv', key),
    create(owner, query, 'csv', key),
  ])
  const job = ok(a)
  assert.equal(ok(b).id, job.id)
  assert.equal(await eventCount(job, 'created'), 1)
  assert.equal(
    (await create(owner, { traceId: randomUUID() }, 'csv', key)).status,
    409
  )
  assert.equal(
    (
      await call('/audit/exports', {
        user: owner.username,
        method: 'POST',
        body: { format: 'csv', query, rows: [], total: 1, scanEngine: 'clean' },
      })
    ).status,
    422
  )
  await assert.rejects(
    pool.query(
      "UPDATE audit_export_jobs SET snapshot_hash=repeat('0',64) WHERE tenant_id='tenant-a' AND id=$1",
      [job.id]
    ),
    /immutable/
  )
  await assert.rejects(
    pool.query(
      "DELETE FROM audit_export_events WHERE tenant_id='tenant-a' AND job_id=$1",
      [job.id]
    ),
    /immutable/
  )
  const outcomes = await Promise.all([
    command(job, owner, 'cancel'),
    command(job, owner, 'cancel'),
  ])
  assert.deepEqual(outcomes.map((x) => x.status).sort(), [200, 409])
})

test('selected ID rechecks ignore unrelated query growth but refuse revoked captured actor fields and idempotent replay', async () => {
  const owner = await user(),
    source = await fact(owner),
    key = randomUUID(),
    query = {}
  const job = ok(await create(owner, query, 'csv', key)),
    plan = await stored(job)
  await fact(owner, 3)
  await processOne(job)
  let current = await detail(job, owner)
  assert.equal(current.status, 'completed')
  assert.equal(current.totalRows, plan.total_rows)
  const originalHash = current.artifact.sha256
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username"]\'::jsonb WHERE role_id=$1',
    [owner.roleId]
  )
  current = await detail(job, owner)
  assert.equal(current.restricted, true)
  assert.equal(current.query, null)
  assert.equal(current.totalRows, null)
  assert.equal(current.processedRows, null)
  assert.equal(current.artifact, null)
  assert.equal((await download(job, owner)).status, 403)
  assert.equal((await create(owner, query, 'csv', key)).status, 403)
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username","name"]\'::jsonb WHERE role_id=$1',
    [owner.roleId]
  )
  assert.equal((await download(job, owner)).status, 200)
  assert.equal((await detail(job, owner)).artifact.sha256, originalHash)
  assert.ok(
    plan.event_ids.includes(
      (
        await pool.query(
          "SELECT id FROM audit_events WHERE trace_id=$1 AND tenant_id='tenant-a'",
          [source.traceId]
        )
      ).rows[0].id
    )
  )
})

test('current row scope loss blocks worker completion and keeps restricted metadata without snapshot contents', async () => {
  const sourceOwner = await user(),
    source = await fact(sourceOwner),
    owner = await user({ scope: 'tenant' })
  const job = ok(await create(owner, { traceId: source.traceId }))
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='self' WHERE role_id=$1",
    [owner.roleId]
  )
  await processOne(job)
  const denied = await detail(job, owner)
  assert.equal(denied.status, 'blocked')
  assert.equal(denied.restricted, true)
  assert.equal(denied.artifact, null)
  assert.equal((await download(job, owner)).status, 403)
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='tenant' WHERE role_id=$1",
    [owner.roleId]
  )
  const retry = ok(await command(await detail(job, owner), owner, 'retry'))
  await processOne(retry)
  assert.equal((await detail(job, owner)).status, 'completed')
})

test('after-scan cancellation and stale lease callbacks cannot publish an artifact; later claims preserve one completion', async () => {
  const owner = await user(),
    source = await fact(owner),
    job = ok(await create(owner, { traceId: source.traceId }))
  await processOne(job, async (point) => {
    if (point === 'audit-export.after-scan')
      ok(await command(await detail(job, owner), owner, 'cancel'))
  })
  assert.equal((await detail(job, owner)).status, 'cancelled')
  assert.equal(await eventCount(job, 'completed'), 0)
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM audit_export_artifacts WHERE tenant_id='tenant-a' AND job_id=$1",
          [job.id]
        )
      ).rows[0].n
    ),
    0
  )
  const stale = ok(await create(owner, { traceId: source.traceId }))
  await processOne(stale, async (point) => {
    if (point === 'audit-export.after-scan')
      await pool.query(
        "UPDATE audit_export_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1",
        [stale.id]
      )
  })
  assert.equal(await eventCount(stale, 'completed'), 0)
  await processOne(stale)
  assert.equal((await detail(stale, owner)).status, 'completed')
  assert.equal(await eventCount(stale, 'completed'), 1)
})

test('completion failure rolls back artifact/event/audit together, and automatic retries are finite with bounded errors', async () => {
  const owner = await user(),
    source = await fact(owner),
    job = ok(await create(owner, { traceId: source.traceId }))
  await processOne(job, (point) => {
    if (point === 'audit-export.before-commit')
      throw new Error('PRIVATE_BACKEND_ERROR_SECRET')
  })
  assert.equal(await eventCount(job, 'completed'), 0)
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM audit_export_artifacts WHERE tenant_id='tenant-a' AND job_id=$1",
          [job.id]
        )
      ).rows[0].n
    ),
    0
  )
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='audit-export.completed'",
          [job.id]
        )
      ).rows[0].n
    ),
    0
  )
  for (let i = 1; i < 5; i += 1) {
    await pool.query(
      "UPDATE audit_export_jobs SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1",
      [job.id]
    )
    await processOne(job, (point) => {
      if (point === 'audit-export.after-claim')
        throw new Error('PRIVATE_BACKEND_ERROR_SECRET')
    })
  }
  const failed = await detail(job, owner)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.attempts, 5)
  assert.equal(
    JSON.stringify(failed).includes('PRIVATE_BACKEND_ERROR_SECRET'),
    false
  )
  assert.equal((await command(failed, owner, 'retry')).status, 409)
  assert.equal(await processOne(job), 0)
})

test('actual capture rejects more than 2000 matching facts rather than exporting one requested page', async () => {
  const owner = await user(),
    source = await fact(owner, 2000)
  const result = await create(owner, {
    targetId: source.record.id,
    pageSize: 1,
    current: 999,
  })
  assert.equal(result.status, 422)
  assert.equal(result.businessCode, 'AUDIT_EXPORT_TOO_MANY_ROWS')
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM audit_export_jobs WHERE tenant_id='tenant-a' AND created_by=$1",
          [owner.id]
        )
      ).rows[0].n
    ),
    0
  )
})

// Source event rows are untouched: only a fresh export fixture is assigned an
// earlier creation time to exercise its immutable 7/365-day clock without sleeping days.
const expiredFixture = async (job) => {
  const original = await stored(job),
    id = randomUUID(),
    objectKey = support.contentHash(['expired-audit-test', id])
  await pool.query(
    "INSERT INTO audit_export_jobs(tenant_id,id,created_by,created_name,format,query,snapshot,snapshot_canonical,snapshot_hash,event_ids,object_key,total_rows,created_at,retention_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()-interval '8 days',now()-interval '1 day')",
    [
      original.tenant_id,
      id,
      original.created_by,
      original.created_name,
      original.format,
      JSON.stringify(original.query),
      JSON.stringify(original.snapshot),
      original.snapshot_canonical,
      original.snapshot_hash,
      original.event_ids,
      objectKey,
      original.total_rows,
    ]
  )
  const store = new storage.LocalObjectStore(storageRoot)
  await store.put(
    Buffer.from('Owned already expired audit fixture bytes'),
    objectKey
  )
  return { id, objectKey, store }
}

test('archive retention is creation-based, unarchive keeps seven days, and expiry deletes owned bytes without reviving or editing facts', async () => {
  const owner = await user(),
    source = await fact(owner),
    job = ok(await create(owner, { traceId: source.traceId }))
  await processOne(job)
  const exactExpiry = async (days) => {
    const checked = (
      await pool.query(
        "SELECT j.retention_until=j.created_at+($3::integer*interval '1 day') AS fixed,a.expires_at=j.retention_until AS artifact_fixed FROM audit_export_jobs j JOIN audit_export_artifacts a ON a.tenant_id=j.tenant_id AND a.job_id=j.id WHERE j.tenant_id=$1 AND j.id=$2",
        ['tenant-a', job.id, days]
      )
    ).rows[0]
    assert.deepEqual(checked, { fixed: true, artifact_fixed: true })
  }
  await exactExpiry(7)
  let current = await detail(job, owner)
  assert.equal(
    Date.parse(current.retentionUntil) - Date.parse(current.createdAt),
    7 * 86400000
  )
  current = ok(await command(current, owner, 'archive', { archived: true }))
  await exactExpiry(365)
  assert.equal(
    Date.parse(current.retentionUntil) - Date.parse(current.createdAt),
    365 * 86400000
  )
  current = ok(await command(current, owner, 'archive', { archived: false }))
  await exactExpiry(7)
  assert.equal(
    Date.parse(current.retentionUntil) - Date.parse(current.createdAt),
    7 * 86400000
  )
  const expired = await expiredFixture(job),
    scopeValue = { tenantId: 'tenant-a', jobIds: [expired.id] }
  await jobs.expireAuditExports(pool, { storageRoot }, scopeValue)
  await assert.rejects(() => expired.store.get(expired.objectKey))
  const state = await detail(expired, owner)
  assert.equal(state.status, 'expired')
  assert.ok(state.expiredAt)
  assert.equal(
    (await command(state, owner, 'archive', { archived: true })).status,
    409
  )
  assert.equal(
    await jobs.expireAuditExports(pool, { storageRoot }, scopeValue),
    0
  )
  assert.equal(await eventCount(expired, 'expired'), 1)
  assert.equal(
    ok(
      await call(`/audit/events?traceId=${source.traceId}`, {
        user: owner.username,
      })
    ).total,
    1
  )
})

const stop = async (child) => {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    children.delete(child)
    return
  }
  const exited = once(child, 'exit')
  const force = setTimeout(() => child.kill('SIGKILL'), 5000)
  let timeout
  try {
    child.kill('SIGTERM')
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Owned audit child did not exit')),
          10000
        )
      }),
    ])
  } finally {
    clearTimeout(force)
    clearTimeout(timeout)
    children.delete(child)
  }
}
const crashedWorker = async (job) => {
  const script =
    "const db=require('./services/reference-api/dist/database.js');const worker=require('./services/reference-api/dist/audit-export-jobs.js');const pool=db.createPool();(async()=>{try{const result=await pool.query('SELECT current_database() AS name');if(!/^af_admin_tests_[a-z0-9]+_demo$/.test(result.rows[0].name)||process.env.APP_MODE!=='demo')throw new Error('Unsafe test database');await worker.processAuditExports(pool,{storageRoot:process.env.AUDIT_TEST_STORAGE},point=>{if(point==='audit-export.after-write')return new Promise(()=>process.stdout.write('after-write\\n',()=>process.kill(process.pid,'SIGKILL')))},1,{tenantId:'tenant-a',jobIds:[process.env.AUDIT_TEST_JOB]});process.exitCode=2}catch{process.exitCode=3}finally{await pool.end()}})();"
  const child = spawn(process.execPath, ['-e', script], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: {
      ...process.env,
      AUDIT_TEST_STORAGE: storageRoot,
      AUDIT_TEST_JOB: job.id,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  let witness = ''
  child.stdout.on('data', (chunk) => {
    witness += chunk.toString()
  })
  child.stderr.resume()
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000)
  try {
    const [, signal] = await once(child, 'exit')
    assert.equal(signal, 'SIGKILL')
    assert.equal(
      witness.trim(),
      'after-write',
      'SIGKILL must occur after actual immutable byte write, not the timeout'
    )
  } finally {
    clearTimeout(timer)
    children.delete(child)
  }
}
test('real SIGKILL after immutable byte write recovers the expired claim with one artifact and one completion', async () => {
  const owner = await user(),
    source = await fact(owner),
    job = ok(await create(owner, { traceId: source.traceId }))
  await crashedWorker(job)
  assert.equal((await stored(job)).status, 'processing')
  assert.equal(await eventCount(job, 'completed'), 0)
  await pool.query(
    "UPDATE audit_export_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1",
    [job.id]
  )
  await Promise.all([processOne(job), processOne(job)])
  assert.equal((await detail(job, owner)).status, 'completed')
  assert.equal(await eventCount(job, 'completed'), 1)
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM audit_export_artifacts WHERE tenant_id='tenant-a' AND job_id=$1",
          [job.id]
        )
      ).rows[0].n
    ),
    1
  )
  assert.equal((await download(job, owner)).status, 200)
})

test('maintenance scope rejects missing/foreign/ambiguous/unknown IDs and never executes getters or touches unrelated jobs', async () => {
  const owner = await user(),
    source = await fact(owner),
    job = ok(await create(owner, { traceId: source.traceId })),
    other = ok(await create(owner, { traceId: source.traceId }))
  const sparse = []
  sparse.length = 1
  const accessors = []
  Object.defineProperty(accessors, '0', {
    get() {
      throw new Error('Getter must not execute')
    },
    enumerable: true,
  })
  for (const invalid of [
    { tenantId: 'tenant-a', jobIds: [] },
    { tenantId: 'tenant-b', jobIds: [job.id] },
    { tenantId: 'tenant-a', jobIds: [randomUUID()] },
    { tenantId: 'tenant-a', jobIds: [job.id, job.id] },
    { tenantId: 'tenant-a', jobIds: [job.id], all: true },
    { tenantId: 'tenant-a', jobIds: sparse },
    { tenantId: 'tenant-a', jobIds: accessors },
  ])
    await assert.rejects(
      () =>
        jobs.processAuditExports(
          pool,
          { storageRoot },
          () => undefined,
          1,
          invalid
        ),
      /scope|same-tenant/
    )
  await processOne(job)
  assert.equal((await stored(other)).status, 'queued')
  ok(await command(await detail(other, owner), owner, 'cancel'))
})

test('empty captures still require current audit read permission at metadata, replay, worker and download boundaries', async () => {
  const owner = await user(),
    key = randomUUID(),
    query = {
      module: 'no-such-registered-facts',
      operatorName: 'Private requested filter',
    }
  const job = ok(await create(owner, query, 'csv', key))
  assert.equal(job.totalRows, 0)
  await pool.query(
    "DELETE FROM role_permissions WHERE tenant_id='tenant-a' AND role_id=$1 AND permission_code='audit:read'",
    [owner.roleId]
  )
  const restricted = await detail(job, owner)
  assert.equal(restricted.restricted, true)
  assert.equal(restricted.query, null)
  assert.equal(restricted.totalRows, null)
  assert.equal(restricted.artifact, null)
  assert.equal(
    JSON.stringify(restricted).includes('Private requested filter'),
    false
  )
  assert.equal((await create(owner, query, 'csv', key)).status, 403)
  await processOne(job)
  assert.equal((await detail(job, owner)).status, 'blocked')
  assert.equal((await download(job, owner)).status, 403)
  await pool.query(
    "INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES('tenant-a',$1,'audit:read')",
    [owner.roleId]
  )
  const retry = ok(await command(await detail(job, owner), owner, 'retry'))
  await processOne(retry)
  const output = await download(job, owner)
  assert.equal(output.status, 200)
  assert.deepEqual([...output.bytes.subarray(0, 3)], [239, 187, 191])
  assert.equal((await detail(job, owner)).totalRows, 0)
})

test('real bare-EICAR witness drives an explicit controlled negative scan boundary without claiming the generated CSV is infected', async (context) => {
  const eicar = Buffer.from(
    `X5O!P%@AP[4${String.fromCharCode(
      92
    )}PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`
  )
  assert.equal(eicar.length, 68)
  const scan = scanners.clamavScanner(
    process.env.CLAMAV_HOST || '127.0.0.1',
    Number(process.env.CLAMAV_PORT || 3310)
  )
  const actualBareVerdict = await scan(eicar)
  assert.equal(actualBareVerdict.clean, false)
  assert.match(actualBareVerdict.engine, /^ClamAV /)
  assert.ok(actualBareVerdict.threat)
  const owner = await user(),
    source = await fact(owner),
    job = ok(await create(owner, { traceId: source.traceId }))
  let negativeCalls = 0
  // Test-only fault injection returns the actual bare-EICAR negative verdict for
  // ordinary generated bytes. This is not a positive scan bypass and does not
  // claim that the generated CSV contains an AV-detectable infection.
  const boundary = context.mock.method(
    scanners,
    'clamavScanner',
    () => async (bytes) => {
      negativeCalls += 1
      assert.notDeepEqual(bytes, eicar)
      assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191])
      return actualBareVerdict
    }
  )
  try {
    await processOne(job)
  } finally {
    boundary.mock.restore()
  }
  assert.equal(negativeCalls, 1)
  const infected = await detail(job, owner)
  assert.equal(infected.status, 'infected')
  assert.equal(infected.artifact.status, 'quarantined')
  assert.equal(infected.artifact.scanEngine, actualBareVerdict.engine)
  assert.equal(infected.allowedActions.includes('download'), false)
  assert.equal((await download(job, owner)).status, 409)
})

test('a genuinely generated and scanned artifact expires, loses download authority and has its bytes removed once', async () => {
  const owner = await user(),
    source = await fact(owner),
    seed = ok(await create(owner, { traceId: source.traceId })),
    original = await stored(seed),
    id = randomUUID(),
    key = support.contentHash(['near-expiry-audit', randomUUID()])
  // A fresh owned plan's clock is near its seventh day. Its original audit event
  // rows are never rewritten, and rendering/scanning remain the real production path.
  await pool.query(
    "INSERT INTO audit_export_jobs(tenant_id,id,created_by,created_name,format,query,snapshot,snapshot_canonical,snapshot_hash,event_ids,object_key,total_rows,created_at,retention_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()-interval '7 days'+interval '5 seconds',now()+interval '5 seconds')",
    [
      original.tenant_id,
      id,
      original.created_by,
      original.created_name,
      original.format,
      JSON.stringify(original.query),
      JSON.stringify(original.snapshot),
      original.snapshot_canonical,
      original.snapshot_hash,
      original.event_ids,
      key,
      original.total_rows,
    ]
  )
  const near = { id }
  await processOne(near)
  const ready = await detail(near, owner)
  assert.equal(ready.status, 'completed')
  assert.equal((await download(near, owner)).status, 200)
  const remaining = (
    await pool.query(
      "SELECT GREATEST(0,EXTRACT(EPOCH FROM(retention_until-clock_timestamp()))*1000)::float AS ms FROM audit_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
      [id]
    )
  ).rows[0].ms
  await new Promise((resolve) => setTimeout(resolve, remaining + 100))
  await jobs.expireAuditExports(pool, { storageRoot }, scope(near))
  const expired = await detail(near, owner)
  assert.equal(expired.status, 'expired')
  assert.equal(expired.artifact.status, 'expired')
  assert.ok(expired.artifact.expiredAt)
  assert.equal((await download(near, owner)).status, 409)
  await assert.rejects(() => new storage.LocalObjectStore(storageRoot).get(key))
  assert.equal(
    await jobs.expireAuditExports(pool, { storageRoot }, scope(near)),
    0
  )
  assert.equal(await eventCount(near, 'expired'), 1)
  ok(await command(await detail(seed, owner), owner, 'cancel'))
})

test('empty named-query metadata requires current audit name access to its capture principal for capture, other viewers, replay and worker completion', async () => {
  const owner = await user(),
    sensitive = `Identity-filter-${randomUUID()}`,
    query = { module: 'no-matching-audit-facts', operatorName: sensitive },
    key = randomUUID()
  const complete = ok(await create(owner, query, 'xlsx', key))
  assert.equal(complete.totalRows, 0)
  await processOne(complete)
  assert.equal((await detail(complete, owner)).status, 'completed')
  const viewer = await user({ scope: 'tenant', fields: ['username'] })
  const assertRestricted = (value) => {
    assert.equal(value.restricted, true)
    assert.equal(value.query, null)
    assert.equal(value.totalRows, null)
    assert.equal(value.processedRows, null)
    assert.equal(value.queriedAt, null)
    assert.equal(value.dataCutoffAt, null)
    assert.equal(value.artifact, null)
    assert.equal(JSON.stringify(value).includes(sensitive), false)
    assert.ok(
      (value.events || []).every(
        (event) => Object.keys(event.detail).length === 0
      )
    )
  }
  assertRestricted(await detail(complete, viewer))
  const listed = ok(
    await call('/audit/exports?pageSize=100', { user: viewer.username })
  ).list.find((item) => item.id === complete.id)
  assert.ok(listed)
  assertRestricted(listed)
  const forbiddenDownload = await download(complete, viewer)
  assert.equal(forbiddenDownload.status, 403)
  assert.equal(
    forbiddenDownload.businessCode,
    'AUDIT_EXPORT_QUERY_METADATA_FORBIDDEN'
  )
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username","name"]\'::jsonb WHERE role_id=$1',
    [viewer.roleId]
  )
  assert.equal((await detail(complete, viewer)).restricted, false)
  assert.equal((await download(complete, viewer)).status, 200)
  const waiting = ok(await create(owner, query))
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username"]\'::jsonb WHERE role_id=$1',
    [owner.roleId]
  )
  assertRestricted(await detail(complete, owner))
  assertRestricted(await detail(complete, viewer))
  assert.equal((await download(complete, owner)).status, 403)
  assert.equal((await download(complete, viewer)).status, 403)
  const replay = await create(owner, query, 'xlsx', key)
  assert.equal(replay.status, 403)
  assert.equal(replay.businessCode, 'AUDIT_EXPORT_QUERY_METADATA_FORBIDDEN')
  const denied = await create(owner, query)
  assert.equal(denied.status, 403)
  assert.equal(denied.businessCode, 'AUDIT_EXPORT_QUERY_METADATA_FORBIDDEN')
  await processOne(waiting)
  assert.equal((await detail(waiting, owner)).status, 'blocked')
  assert.equal(await eventCount(waiting, 'completed'), 0)
  const narrow = await user({ fields: ['username'] })
  const before = Number(
    (
      await pool.query(
        "SELECT count(*) AS n FROM audit_export_jobs WHERE tenant_id='tenant-a' AND created_by=$1",
        [narrow.id]
      )
    ).rows[0].n
  )
  assert.equal((await create(narrow, query)).status, 403)
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM audit_export_jobs WHERE tenant_id='tenant-a' AND created_by=$1",
          [narrow.id]
        )
      ).rows[0].n
    ),
    before
  )
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username","name"]\'::jsonb WHERE role_id=$1',
    [owner.roleId]
  )
  assert.equal((await download(complete, owner)).status, 200)
  const retry = ok(await command(await detail(waiting, owner), owner, 'retry'))
  await processOne(retry)
  assert.equal((await detail(waiting, owner)).status, 'completed')
})

test('job listing returns page and total from one SQL snapshot despite a concurrent new matching export', async () => {
  const owner = await user(),
    source = await fact(owner),
    first = ok(await create(owner, { traceId: source.traceId }))
  let observed, release
  const selected = new Promise((resolve) => {
    observed = resolve
  })
  const proceed = new Promise((resolve) => {
    release = resolve
  })
  listBarrier = () => {
    observed()
    return proceed
  }
  const response = call('/audit/exports?status=queued&pageSize=100', {
    user: owner.username,
  })
  let timeout
  try {
    await Promise.race([
      selected,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(new Error('Listing did not reach its selected snapshot')),
          5000
        )
      }),
    ])
    const second = ok(await create(owner, { traceId: source.traceId }))
    listBarrier = undefined
    release()
    const captured = ok(await response)
    assert.equal(captured.total, 1)
    assert.deepEqual(
      captured.list.map((job) => job.id),
      [first.id]
    )
    assert.equal(captured.list[0].status, 'queued')
    assert.ok(Number.isFinite(Date.parse(captured.list[0].createdAt)))
    const refreshed = ok(
      await call('/audit/exports?status=queued&pageSize=100', {
        user: owner.username,
      })
    )
    assert.equal(refreshed.total, 2)
    assert.equal(refreshed.list.length, 2)
    assert.ok(refreshed.list.some((job) => job.id === second.id))
    ok(await command(await detail(second, owner), owner, 'cancel'))
  } finally {
    clearTimeout(timeout)
    listBarrier = undefined
    release()
    await response
  }
  ok(await command(await detail(first, owner), owner, 'cancel'))
})
