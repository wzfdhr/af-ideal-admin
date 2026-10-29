import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, after, test } from 'node:test'
import ExcelJS from 'exceljs'
import { unzipSync, unzlibSync } from 'fflate'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import routes from '../../services/reference-api/dist/audit-retention.js'
import worker from '../../services/reference-api/dist/audit-retention-worker.js'
import renderer from '../../services/reference-api/dist/audit-archive-generators.js'
import support from '../../services/reference-api/dist/support.js'
import contracts from '@af-admin/contracts'

const pool = db.createPool(),
  tokens = new Map(),
  passwords = new Map(),
  loginIps = new Map(),
  members = [],
  roles = [],
  privateTenants = [],
  ownedChildren = new Set()
let server,
  storageRoot,
  originals = [],
  isolated = false,
  failure = ''
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
      await pool.query(
        "SELECT to_regclass('public.audit_archive_runs') AS name"
      )
    ).rows[0].name
  ) {
    const sql = await readFile(
      new URL(
        '../../services/reference-api/migrations/031_audit_event_archive.sql',
        import.meta.url
      ),
      'utf8'
    )
    await db.transaction(pool, (client) => client.query(sql))
  }
  storageRoot = await mkdtemp(join(tmpdir(), 'af-audit-retention-'))
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin')"
    )
  ).rows
  const permissions = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((row) => row.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin')",
    [JSON.stringify(permissions)]
  )
  const inject = (point) => {
    if (point === failure) {
      failure = ''
      throw new Error('Controlled archive transaction failure')
    }
  }
  server = api.createServer(pool, inject, { storageRoot })
  if (!server.hasRoute({ method: 'POST', url: '/api/audit/archive-runs' }))
    routes.registerAuditRetention(server, pool, inject, { storageRoot })
  await server.ready()
})
after(async () => {
  await Promise.all(Array.from(ownedChildren).map(stopArchiveChild))
  if (server) await server.close()
  if (isolated) {
    for (const row of originals)
      await pool.query(
        'UPDATE memberships SET permissions=$3::jsonb WHERE tenant_id=$1 AND user_id=$2',
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
  if (isolated)
    await pool.query(
      "UPDATE tenants SET status='disabled' WHERE id=ANY($1::text[])",
      [privateTenants]
    )
  await pool.end()
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true })
})
const stopArchiveChild = async (child) => {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    ownedChildren.delete(child)
    return
  }
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
  }, 5000)
  try {
    await exited
  } finally {
    clearTimeout(timer)
    ownedChildren.delete(child)
  }
}
const startArchiveChild = (run, { haltAfterWrite = false } = {}) => {
  const program = String.raw`
    const {createPool}=require(process.env.ARCHIVE_TEST_DATABASE_MODULE);
    const {processAuditRetention}=require(process.env.ARCHIVE_TEST_WORKER_MODULE);
    const pool=createPool();
    (async()=>{
      if(process.env.APP_MODE!=='demo'||!/^af_admin_tests_[a-z0-9]+_demo$/.test((await pool.query('SELECT current_database() AS name')).rows[0].name))throw new Error('Isolated test database required');
      const fault=async(point)=>{if(point==='audit-archive.after-write'&&process.env.ARCHIVE_TEST_HALT==='1'){process.stdout.write(JSON.stringify({stage:'written'})+'\n');await new Promise(()=>{});}};
      await processAuditRetention(pool,{storageRoot:process.env.ARCHIVE_TEST_STORAGE},fault,1,{tenantId:'tenant-a',runIds:[process.env.ARCHIVE_TEST_RUN]});
      await pool.end();process.stdout.write(JSON.stringify({stage:'completed'})+'\n');
    })().catch(async()=>{process.stderr.write('Owned archive child failed\n');await pool.end().catch(()=>{});process.exitCode=1;});
  `
  const child = spawn(process.execPath, ['-e', program], {
    env: {
      ...process.env,
      ARCHIVE_TEST_DATABASE_MODULE: fileURLToPath(
        new URL(
          '../../services/reference-api/dist/database.js',
          import.meta.url
        )
      ),
      ARCHIVE_TEST_WORKER_MODULE: fileURLToPath(
        new URL(
          '../../services/reference-api/dist/audit-retention-worker.js',
          import.meta.url
        )
      ),
      ARCHIVE_TEST_STORAGE: storageRoot,
      ARCHIVE_TEST_RUN: run.id,
      ARCHIVE_TEST_HALT: haltAfterWrite ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  ownedChildren.add(child)
  const target = haltAfterWrite ? 'written' : 'completed'
  const ready = new Promise((resolve, reject) => {
    let text = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Owned archive child timed out'))
    }, 30000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      ownedChildren.delete(child)
      clearTimeout(timer)
      if (!text.includes(`"stage":"${target}"`))
        reject(
          new Error(
            `Owned archive child stopped before ${target}: ${code}/${signal}`
          )
        )
    })
    child.stdout.on('data', (chunk) => {
      text += chunk.toString()
      if (text.length > 4096) {
        clearTimeout(timer)
        child.kill('SIGKILL')
        reject(new Error('Unexpected owned child output'))
        return
      }
      if (text.includes(`"stage":"${target}"`)) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.stderr.resume()
  })
  return { child, ready }
}
const login = async (user) => {
  if (tokens.has(user)) return tokens.get(user)
  if (!loginIps.has(user))
    loginIps.set(user, `10.20.0.${(loginIps.size % 240) + 1}`)
  const response = await server.inject({
    method: 'POST',
    url: '/api/user/login',
    remoteAddress: loginIps.get(user),
    payload: { username: user, password: passwords.get(user) || user },
  })
  assert.equal(response.statusCode, 200, response.body)
  const token = response.json().data.token
  tokens.set(user, token)
  return token
}
const call = async (
  path,
  { user = 'a-admin', method = 'GET', body, key = randomUUID(), tenantId } = {}
) =>
  server.inject({
    method,
    url: `/api${path}`,
    headers: {
      'x-access-token': await login(user),
      'x-tenant-id':
        tenantId || (user.startsWith('b-') ? 'tenant-b' : 'tenant-a'),
      'idempotency-key': key,
    },
    ...(body === undefined ? {} : { payload: body }),
  })
const ok = (response) => {
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().code, 20000)
  return response.json().data
}
const person = async ({
  scope = 'self',
  fields = ['username', 'name'],
  name = `归档执行者-${randomUUID().slice(0, 8)}`,
} = {}) => {
  const username = `archive-${randomUUID().slice(0, 8)}`,
    password = 'Archive-private-test-2026'
  const value = ok(
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
  members.push(value.id)
  passwords.set(username, password)
  const role = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: `Archive ${randomUUID()}`,
        roleKey: `archive-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions: [
          ...Object.values(contracts.AUDIT_EXPORT_PERMISSIONS),
          contracts.AUDIT_RETENTION_PERMISSIONS.manage,
          'audit:read',
          'leave:create',
          'leave:read:self',
          'leave:update:self',
        ],
      },
    })
  )
  roles.push(role.id)
  await pool.query(
    'UPDATE role_member_scopes SET data_scope=$2,field_permissions=$3::jsonb WHERE role_id=$1',
    [role.id, scope, JSON.stringify(fields)]
  )
  ok(
    await call(`/system/users/${value.id}/authorization`, {
      method: 'POST',
      body: {
        roleIds: [role.id],
        directPermissions: [],
        expectedRevision: value.revision,
      },
    })
  )
  return { ...value, username, roleId: role.id }
}
const fact = async (owner) => {
  const app = ok(await call('/applications/leave', { user: owner.username }))
  const response = await call('/leave-requests', {
    user: owner.username,
    method: 'POST',
    body: {
      applicationReleaseId: app.activeReleaseId,
      fields: {
        leaveType: 'personal',
        startDate: '2026-10-01',
        startSlot: 'am',
        endDate: '2026-10-02',
        endSlot: 'pm',
        reason: 'Never place private business values in archive',
      },
    },
  })
  const record = ok(response)
  return { record, traceId: response.json().traceId }
}
const create = async (owner, query, format = 'csv', key = randomUUID()) =>
  call('/audit/archive-runs', {
    user: owner.username,
    method: 'POST',
    body: { query, format },
    key,
  })
const detail = async (run, owner) =>
  ok(await call(`/audit/archive-runs/${run.id}`, { user: owner.username }))
const scope = (run) => ({ tenantId: 'tenant-a', runIds: [run.id] })
const processRun = (run, fault = () => undefined, batches = 10) =>
  worker.processAuditRetention(
    pool,
    { storageRoot },
    fault,
    batches,
    scope(run)
  )
const batches = async (run) =>
  (
    await pool.query(
      "SELECT * FROM audit_archive_batches WHERE tenant_id='tenant-a' AND run_id=$1 ORDER BY first_ordinal",
      [run.id]
    )
  ).rows
const membershipCount = async (run) =>
  Number(
    (
      await pool.query(
        "SELECT count(*) AS n FROM audit_archive_memberships WHERE tenant_id='tenant-a' AND run_id=$1",
        [run.id]
      )
    ).rows[0].n
  )
const download = async (run, batch, owner) =>
  call(`/audit/archive-runs/${run.id}/batches/${batch.id}/download`, {
    user: owner.username,
  })

// Re-read actual PDF xref objects and Flate streams, then decode its Type0 ToUnicode mapping.
// This checks emitted text without relying on the writer's in-memory source values.
const readPdf = (bytes) => {
  const source = bytes.toString('latin1')
  assert.match(source, /^%PDF-1\.7/)
  assert.match(source, /%%EOF\s*$/)
  const start = Number(/startxref\s+(\d+)\s+%%EOF/.exec(source)[1])
  const xref = source.slice(start)
  const header = /^xref\s+0\s+(\d+)\s+/.exec(xref)
  assert.ok(header, 'PDF has a readable cross-reference table')
  const entries = xref
    .slice(header[0].length)
    .split(/\r?\n/)
    .slice(0, Number(header[1]))
  const offsets = entries.map((entry) => Number(entry.slice(0, 10)))
  const objects = new Map()
  for (let index = 1; index < offsets.length; index++) {
    const end = offsets[index + 1] || start
    // Objects are written in finalization order, so choose the next physical offset.
    const physicalEnd = Math.min(
      start,
      ...offsets.filter((value) => value > offsets[index])
    )
    const objectBytes = bytes.subarray(offsets[index], physicalEnd || end)
    const objectText = objectBytes.toString('latin1')
    assert.match(objectText, new RegExp(`^${index} 0 obj`))
    const marker = objectText.indexOf('stream\n')
    let stream
    if (marker >= 0) {
      const length = Number(/\/Length\s+(\d+)/.exec(objectText)[1])
      const raw = objectBytes.subarray(marker + 7, marker + 7 + length)
      stream = /\/Filter\s*\/FlateDecode/.test(objectText)
        ? Buffer.from(unzlibSync(raw)).toString('latin1')
        : raw.toString('latin1')
    }
    objects.set(index, { text: objectText, stream })
  }
  const font = Array.from(objects.values()).find((value) =>
    /\/Subtype\s*\/Type0\b/.test(value.text)
  )
  assert.ok(font, 'PDF embeds a Unicode Type0 font')
  const cmapId = Number(/\/ToUnicode\s+(\d+) 0 R/.exec(font.text)[1])
  const cmap = objects.get(cmapId).stream
  assert.match(cmap, /begincmap/)
  const unicode = new Map()
  for (const match of cmap.matchAll(
    /<([0-9a-f]{4})>\s*<([0-9a-f]{4})>\s*\[([^\]]*)\]/gi
  )) {
    const first = parseInt(match[1], 16)
    const values = Array.from(match[3].matchAll(/<([0-9a-f ]*)>/gi)).map(
      (value) => value[1].replaceAll(' ', '')
    )
    assert.equal(values.length, parseInt(match[2], 16) - first + 1)
    values.forEach((hex, index) =>
      unicode.set(
        first + index,
        Buffer.from(hex, 'hex').swap16().toString('utf16le')
      )
    )
  }
  const content = Array.from(objects.values())
    .map((value) => value.stream || '')
    .filter((value) => /\bBT\b/.test(value))
  const lines = []
  for (const stream of content)
    for (const block of stream.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
      let text = ''
      for (const hex of block[1].matchAll(/<([0-9a-f]+)>/gi))
        for (let index = 0; index < hex[1].length; index += 4) {
          const character = unicode.get(
            parseInt(hex[1].slice(index, index + 4), 16)
          )
          assert.notEqual(
            character,
            undefined,
            'Every emitted glyph has a Unicode mapping'
          )
          text += character
        }
      lines.push(text)
    }
  const pages = Array.from(objects.values()).filter((value) =>
    /\/Type\s*\/Page\b/.test(value.text)
  ).length
  return { source, objects, pages, lines, text: lines.join('\n') }
}

for (const format of ['csv', 'xlsx', 'pdf'])
  test(`archive ${format} generates real scanned bytes with distinct batch provenance and permanent membership`, async () => {
    const owner = await person(),
      source = await fact(owner),
      run = ok(
        await create(
          owner,
          { traceId: source.traceId, timeZone: 'America/New_York' },
          format
        )
      )
    assert.equal(run.coverage.candidateTotal, 1)
    assert.equal(await processRun(run), 1)
    const final = await detail(run, owner)
    assert.equal(final.status, 'completed')
    assert.equal(final.coverage.coveredTotal, 1)
    const [batch] = await batches(run),
      artifact = (
        await pool.query(
          'SELECT * FROM audit_archive_artifacts WHERE batch_id=$1',
          [batch.id]
        )
      ).rows[0]
    assert.equal(batch.snapshot.kind, 'archive-batch')
    assert.equal(batch.snapshot.producerVersion, 2)
    assert.equal(batch.snapshot.snapshot.producerVersion, 1)
    assert.equal(batch.snapshot.snapshot.rows[0].traceId, source.traceId)
    assert.equal(batch.snapshot.snapshot.rows[0].source, 'server')
    const capturedFact = batch.snapshot.snapshot.rows[0]
    assert.equal(Object.hasOwn(capturedFact.operator, 'role'), false)
    assert.deepEqual(
      [...capturedFact.visibleFields, ...capturedFact.hiddenFields].sort(),
      ['operator.id', 'operator.name']
    )
    assert.ok(!JSON.stringify(batch.snapshot).includes('Never place private'))
    assert.equal(artifact.status, 'ready')
    assert.match(artifact.scan_engine, /^ClamAV /)
    assert.equal(await membershipCount(run), 1)
    const factId = batch.snapshot.snapshot.rows[0].id
    for (const state of [undefined, 'all', 'hot', 'archived']) {
      const page = ok(
        await call(
          `/audit/events?traceId=${encodeURIComponent(source.traceId)}${
            state === undefined ? '' : `&version=2&archiveState=${state}`
          }`,
          { user: owner.username }
        )
      )
      assert.deepEqual(
        page.list.map((row) => row.id),
        state === 'hot' ? [] : [factId]
      )
    }
    const response = await download(run, batch, owner)
    assert.equal(response.statusCode, 200, response.body)
    const bytes = response.rawPayload
    assert.equal(bytes.length, artifact.size)
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      artifact.sha256
    )
    const regenerated = await renderer.generateAuditArchiveBatch(
      format,
      batch.snapshot
    )
    assert.deepEqual(bytes, regenerated.bytes)
    if (format === 'csv') {
      assert.ok(bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])))
      assert.match(bytes.toString(), /逻辑归档批次 archive-batch/)
      assert.match(bytes.toString(), /不是原始查询的完整匹配导出/)
    }
    if (format === 'xlsx') {
      const book = new ExcelJS.Workbook()
      await book.xlsx.load(bytes)
      assert.equal(book.getWorksheet('归档批次来源').getCell('B2').value, 2)
      assert.ok(Object.keys(unzipSync(bytes)).includes('xl/workbook.xml'))
      assert.ok(
        !book
          .getWorksheet('查询口径')
          .getCell('B20')
          .text.includes('导出完整匹配')
      )
    }
    if (format === 'pdf') {
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
      assert.match(bytes.toString('latin1'), /\/Type \/Page\b/)
      const parsed = readPdf(bytes)
      assert.ok(parsed.pages >= 2)
      assert.match(parsed.text, /审计逻辑归档批次/)
      assert.match(parsed.text, /不是原始查询的完整匹配导出/)
      assert.ok(parsed.text.includes(source.traceId))
      assert.ok(parsed.text.includes('America/New_York'))
      assert.ok(!parsed.text.includes('Never place private'))
    }
    assert.equal(
      (await call(`/audit/archive-runs/${run.id}`, { user: 'b-admin' }))
        .statusCode,
      404
    )
  })

test('2001 matching facts capture completely despite pageSize 1, retain stable coverage and do not mutate originals', async () => {
  const owner = await person(),
    traceId = `bulk-${randomUUID()}`
  // Trusted server fixture facts, not client-supplied rows or mocked HTTP responses.
  await pool.query(
    "INSERT INTO audit_events(tenant_id,id,actor_id,actor_name,module,action,result,target_type,target_id,trace_id,detail) SELECT 'tenant-a',$1||'-'||n,$2,$3,'auth','login','success','user',$2,$1,'{}'::jsonb FROM generate_series(1,2001) n",
    [traceId, owner.id, owner.name]
  )
  const before = (
    await pool.query(
      "SELECT md5(string_agg(row_to_json(e)::text,'' ORDER BY id)) AS hash FROM audit_events e WHERE trace_id=$1",
      [traceId]
    )
  ).rows[0].hash
  const run = ok(await create(owner, { traceId, pageSize: 1 }))
  assert.equal(run.coverage.candidateTotal, 2001)
  assert.equal(run.coverage.batchTotal, 2)
  const fixed = (
    await pool.query(
      'SELECT manifest_hash FROM audit_archive_runs WHERE id=$1',
      [run.id]
    )
  ).rows[0].manifest_hash
  assert.equal(await processRun(run), 2)
  const final = await detail(run, owner)
  assert.equal(final.status, 'completed')
  assert.equal(final.coverage.coveredTotal, 2001)
  assert.equal(final.candidateHash, fixed)
  const records = await batches(run)
  assert.equal(records[0].snapshot.snapshot.total, 2000)
  assert.equal(records[1].snapshot.snapshot.total, 1)
  assert.equal(
    (
      await pool.query(
        "SELECT md5(string_agg(row_to_json(e)::text,'' ORDER BY id)) AS hash FROM audit_events e WHERE trace_id=$1",
        [traceId]
      )
    ).rows[0].hash,
    before
  )
})

test('creation and completion faults roll back candidates, memberships, artifacts and audit facts atomically', async () => {
  const owner = await person(),
    source = await fact(owner)
  failure = 'audit-archive.create.before-commit'
  const response = await create(owner, { traceId: source.traceId })
  assert.equal(response.statusCode, 500)
  assert.equal(
    Number(
      (
        await pool.query(
          'SELECT count(*) AS n FROM audit_archive_runs WHERE executor_id=$1',
          [owner.id]
        )
      ).rows[0].n
    ),
    0
  )
  const run = ok(await create(owner, { traceId: source.traceId }))
  let injected = false
  await processRun(
    run,
    (point) => {
      if (point === 'audit-archive.before-commit' && !injected) {
        injected = true
        throw new Error('Controlled completion rollback')
      }
    },
    1
  )
  assert.ok(injected)
  assert.equal(await membershipCount(run), 0)
  assert.equal(
    (
      await pool.query(
        'SELECT * FROM audit_archive_artifacts a JOIN audit_archive_batches b ON b.id=a.batch_id WHERE b.run_id=$1',
        [run.id]
      )
    ).rowCount,
    0
  )
  await pool.query(
    'UPDATE audit_archive_runs SET next_attempt_at=now() WHERE id=$1',
    [run.id]
  )
  await processRun(run)
  assert.equal((await detail(run, owner)).status, 'completed')
  assert.equal(await membershipCount(run), 1)
  assert.equal(
    (
      await pool.query(
        "SELECT * FROM audit_archive_events WHERE run_id=$1 AND action='batch.completed'",
        [run.id]
      )
    ).rowCount,
    1
  )
})

test('idempotency rechecks current permissions; empty named metadata and captured fields fail closed after revocation', async () => {
  const owner = await person(),
    key = randomUUID(),
    query = { module: 'no-facts', operatorName: owner.name }
  const run = ok(await create(owner, query, 'csv', key))
  assert.equal(run.status, 'completed')
  assert.equal(run.coverage.candidateTotal, 0)
  assert.equal(ok(await create(owner, query, 'csv', key)).id, run.id)
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username"]\'::jsonb WHERE role_id=$1',
    [owner.roleId]
  )
  const restricted = await detail(run, owner)
  assert.equal(restricted.restricted, true)
  assert.equal(restricted.query, null)
  assert.equal(restricted.coverage.candidateTotal, null)
  assert.equal(restricted.candidateHash, null)
  const replay = ok(await create(owner, query, 'csv', key))
  assert.equal(replay.restricted, true)
  assert.equal(replay.query, null)
  assert.equal((await create(owner, query)).statusCode, 403)
  const other = await person({ scope: 'tenant', fields: ['username'] })
  assert.equal((await detail(run, other)).restricted, true)
})

test('current row/field loss blocks worker; restoring grants retries the original manifest and exact capture only', async () => {
  const owner = await person(),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId }))
  const captured = run.candidateHash
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username"]\'::jsonb WHERE role_id=$1',
    [owner.roleId]
  )
  await processRun(run)
  assert.equal(await membershipCount(run), 0)
  assert.equal((await detail(run, owner)).restricted, true)
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username","name"]\'::jsonb WHERE role_id=$1',
    [owner.roleId]
  )
  const blocked = await detail(run, owner)
  assert.equal(blocked.status, 'blocked')
  ok(
    await call(`/audit/archive-runs/${run.id}/retry`, {
      user: owner.username,
      method: 'POST',
      body: { expectedRevision: blocked.revision },
    })
  )
  await processRun(run)
  const final = await detail(run, owner)
  assert.equal(final.status, 'completed')
  assert.equal(final.candidateHash, captured)
  const [batch] = await batches(run)
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username"]\'::jsonb WHERE role_id=$1',
    [owner.roleId]
  )
  assert.equal((await download(run, batch, owner)).statusCode, 403)
})

test('parallel run workers preserve first membership and each owns immutable artifact provenance', async () => {
  const owner = await person(),
    source = await fact(owner),
    first = ok(await create(owner, { traceId: source.traceId })),
    second = ok(await create(owner, { traceId: source.traceId }))
  await Promise.all([processRun(first), processRun(second)])
  assert.equal((await detail(first, owner)).coverage.coveredTotal, 1)
  assert.equal((await detail(second, owner)).coverage.coveredTotal, 1)
  const count = Number(
    (
      await pool.query(
        'SELECT count(*) AS n FROM audit_archive_memberships WHERE run_id=ANY($1::text[])',
        [[first.id, second.id]]
      )
    ).rows[0].n
  )
  assert.equal(count, 1)
  await assert.rejects(
    pool.query(
      "UPDATE audit_archive_memberships SET snapshot_hash=repeat('0',64) WHERE run_id=ANY($1::text[])",
      [[first.id, second.id]]
    ),
    /immutable/i
  )
})

test('cancellation fences a worker callback; command revisions and immutable history remain exact', async () => {
  const owner = await person(),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId }))
  let callback = false
  await processRun(
    run,
    async (point) => {
      if (point === 'audit-archive.after-scan' && !callback) {
        callback = true
        const current = await detail(run, owner)
        ok(
          await call(`/audit/archive-runs/${run.id}/cancel`, {
            user: owner.username,
            method: 'POST',
            body: { expectedRevision: current.revision },
          })
        )
      }
    },
    1
  )
  assert.ok(callback)
  assert.equal((await detail(run, owner)).status, 'cancelled')
  assert.equal(await membershipCount(run), 0)
  assert.equal(
    (
      await call(`/audit/archive-runs/${run.id}/retry`, {
        user: owner.username,
        method: 'POST',
        body: { expectedRevision: (await detail(run, owner)).revision },
      })
    ).statusCode,
    409
  )
})

test('archive maintenance rejects foreign, sparse, accessor and unspecified extra scopes without side effects', async () => {
  const owner = await person(),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId }))
  for (const bad of [
    { tenantId: 'tenant-b', runIds: [run.id] },
    { tenantId: 'tenant-a', runIds: [] },
    { tenantId: 'tenant-a', runIds: [, run.id] },
    { ...scope(run), other: true },
  ])
    await assert.rejects(
      worker.processAuditRetention(
        pool,
        { storageRoot },
        () => undefined,
        1,
        bad
      )
    )
  let touched = false
  const bad = {
    tenantId: 'tenant-a',
    get runIds() {
      touched = true
      return [run.id]
    },
  }
  await assert.rejects(
    worker.processAuditRetention(pool, { storageRoot }, () => undefined, 1, bad)
  )
  assert.equal(touched, false)
  assert.equal((await detail(run, owner)).status, 'queued')
  assert.equal(await membershipCount(run), 0)
})

test('policy binds current actor, controls IANA natural-day occurrence, and disabled policy cannot borrow a new executor', async () => {
  const owner = await person({ scope: 'tenant' }),
    policy = ok(await call('/audit/retention-policy', { user: owner.username }))
  assert.equal(
    (
      await call('/audit/retention-policy', {
        user: owner.username,
        method: 'PUT',
        body: {
          expectedRevision: policy.revision,
          enabled: true,
          hotDays: 30,
          timeZone: 'America/New_York',
          executorId: 'a-admin',
        },
      })
    ).statusCode,
    422
  )
  const saved = ok(
    await call('/audit/retention-policy', {
      user: owner.username,
      method: 'PUT',
      body: {
        expectedRevision: policy.revision,
        enabled: true,
        hotDays: 30,
        timeZone: 'America/New_York',
      },
    })
  )
  assert.equal(saved.executor.id, owner.id)
  await pool.query(
    "UPDATE audit_retention_policies SET next_run_at=now()-interval '1 second' WHERE tenant_id='tenant-a'"
  )
  assert.equal(await worker.materializeAuditRetentionPolicies(pool, 1), 1)
  const current = ok(
    await call('/audit/retention-policy', { user: owner.username })
  )
  const run = ok(
    await call(`/audit/archive-runs/${current.lastRunId}`, {
      user: owner.username,
    })
  )
  assert.equal(run.trigger, 'policy')
  assert.equal(run.occurrence.timeZone, 'America/New_York')
  await pool.query(
    "UPDATE audit_retention_policies SET next_run_at=now()-interval '1 second' WHERE tenant_id='tenant-a'"
  )
  assert.equal(await worker.materializeAuditRetentionPolicies(pool, 1), 0)
  ok(
    await call('/audit/retention-policy', {
      user: owner.username,
      method: 'PUT',
      body: {
        expectedRevision: current.revision,
        enabled: false,
        hotDays: 30,
        timeZone: 'America/New_York',
      },
    })
  )
  assert.equal(await worker.materializeAuditRetentionPolicies(pool, 1), 0)
})

test('producer 2 rejects forged or future envelope and non-data properties before evaluating accessors', async () => {
  const owner = await person(),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId }))
  await processRun(run)
  const [batch] = await batches(run)
  for (const patch of [
    { producerVersion: 3 },
    { kind: 'audit-export' },
    { candidateTotal: 0 },
    { candidateRange: { firstOrdinal: 1, lastOrdinal: 2 } },
    { snapshot: null },
    { future: true },
  ])
    await assert.rejects(
      renderer.generateAuditArchiveBatch('csv', {
        ...batch.snapshot,
        ...patch,
      }),
      (error) => error.name === 'DomainError'
    )
  let invoked = false
  const forged = { ...batch.snapshot }
  Object.defineProperty(forged, 'future', {
    enumerable: true,
    get() {
      invoked = true
      return 'bad'
    },
  })
  await assert.rejects(renderer.generateAuditArchiveBatch('csv', forged))
  assert.equal(invoked, false)
})

test('expired claimed lease is recovered by a different claimant; stale callback cannot publish a second artifact', async () => {
  const owner = await person(),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId }))
  let interrupted = false
  await processRun(
    run,
    async (point) => {
      if (point === 'audit-archive.after-claim' && !interrupted) {
        interrupted = true
        await pool.query(
          "UPDATE audit_archive_runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
          [run.id]
        )
        await pool.query(
          "UPDATE audit_archive_batches SET lease_until=clock_timestamp()-interval '1 second' WHERE run_id=$1 AND status='processing'",
          [run.id]
        )
        assert.equal(await processRun(run, () => undefined, 1), 1)
      }
    },
    1
  )
  assert.ok(interrupted)
  assert.equal((await detail(run, owner)).status, 'completed')
  assert.equal(await membershipCount(run), 1)
  const [batch] = await batches(run)
  assert.equal(batch.attempts, 2)
  assert.equal(
    (
      await pool.query(
        'SELECT * FROM audit_archive_artifacts WHERE batch_id=$1',
        [batch.id]
      )
    ).rowCount,
    1
  )
})

test('five real processing failures stop finite retries while candidate identity and raw facts remain preserved', async () => {
  const owner = await person(),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId }))
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await pool.query(
      'UPDATE audit_archive_runs SET next_attempt_at=clock_timestamp() WHERE id=$1',
      [run.id]
    )
    await processRun(
      run,
      (point) => {
        if (point === 'audit-archive.after-write')
          throw new Error('Controlled failing write boundary')
      },
      1
    )
  }
  const failed = await detail(run, owner)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.attempts, 5)
  assert.equal(failed.candidateHash, run.candidateHash)
  assert.equal(await membershipCount(run), 0)
  assert.equal(
    (
      await call(`/audit/archive-runs/${run.id}/retry`, {
        user: owner.username,
        method: 'POST',
        body: { expectedRevision: failed.revision },
      })
    ).statusCode,
    409
  )
  assert.equal(
    (
      await pool.query('SELECT * FROM audit_events WHERE trace_id=$1', [
        source.traceId,
      ])
    ).rowCount,
    1
  )
})

test('candidate resource cap rejects 100001 wholly with no truncated run or logical memberships', async () => {
  const owner = await person(),
    traceId = `bound-${randomUUID()}`,
    tenantId = `archive-bound-${randomUUID()}`
  await pool.query('INSERT INTO tenants(id,name) VALUES($1,$1)', [tenantId])
  privateTenants.push(tenantId)
  await pool.query(
    "INSERT INTO memberships(tenant_id,user_id,department_name,role,permissions) VALUES($1,$2,'Archive fixture','user',$3::jsonb)",
    [
      tenantId,
      owner.id,
      JSON.stringify([
        ...Object.values(contracts.AUDIT_EXPORT_PERMISSIONS),
        contracts.AUDIT_RETENTION_PERMISSIONS.manage,
        'audit:read',
      ]),
    ]
  )
  await pool.query(
    "INSERT INTO audit_events(tenant_id,id,actor_id,actor_name,module,action,result,target_type,target_id,trace_id,detail) SELECT $4,$1||'-'||n,$2,$3,'auth','login','success','user',$2,$1,'{}'::jsonb FROM generate_series(1,100001) n",
    [traceId, owner.id, owner.name, tenantId]
  )
  const response = await call('/audit/archive-runs', {
    user: owner.username,
    tenantId,
    method: 'POST',
    body: { query: { traceId, pageSize: 1 }, format: 'csv' },
  })
  assert.equal(response.statusCode, 422, response.body)
  assert.equal(
    (
      await pool.query(
        'SELECT * FROM audit_archive_runs WHERE executor_id=$1',
        [owner.id]
      )
    ).rowCount,
    0
  )
  assert.equal(
    Number(
      (
        await pool.query(
          'SELECT count(*) AS n FROM audit_events WHERE trace_id=$1',
          [traceId]
        )
      ).rows[0].n
    ),
    100001
  )
})

test('actual expired archive bytes cannot be purged through a held backup artifact lock; membership survives', async () => {
  const owner = await person(),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId })),
    [batch] = await batches(run)
  const suffix = randomUUID().replaceAll('-', ''),
    functionName = `archive_expiry_fixture_${suffix}`,
    triggerName = `archive_expiry_fixture_${suffix}`
  // Disposable, exact-batch time fixture: keep the real 365-day constraint and all
  // production rendering, ClamAV, membership guards and byte checks intact.
  await pool.query(
    `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.batch_id='${batch.id}' THEN NEW.expires_at=clock_timestamp()+interval '3 seconds'; NEW.created_at=NEW.expires_at-interval '365 days'; END IF; RETURN NEW; END $$`
  )
  await pool.query(
    `CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_archive_artifacts FOR EACH ROW EXECUTE FUNCTION ${functionName}()`
  )
  const lock = await pool.connect()
  let inTransaction = false,
    purging
  try {
    assert.equal(await processRun(run), 1)
    assert.equal((await detail(run, owner)).status, 'completed')
    const artifact = (
      await pool.query(
        'SELECT * FROM audit_archive_artifacts WHERE batch_id=$1',
        [batch.id]
      )
    ).rows[0]
    assert.match(artifact.scan_engine, /^ClamAV /)
    assert.equal(artifact.status, 'ready')
    assert.equal(await membershipCount(run), 1)
    const path = join(storageRoot, artifact.object_key, 'content'),
      original = await readFile(path)
    await lock.query('BEGIN')
    inTransaction = true
    await lock.query(
      'SELECT id FROM audit_archive_artifacts WHERE tenant_id=$1 AND id=$2 FOR SHARE',
      ['tenant-a', artifact.id]
    )
    const remaining = (
      await pool.query(
        'SELECT GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp()))*1000)::int AS ms',
        [artifact.expires_at]
      )
    ).rows[0].ms
    await new Promise((resolve) => setTimeout(resolve, remaining + 50))
    let settled = false
    purging = worker
      .expireAuditArchiveArtifacts(pool, { storageRoot }, scope(run))
      .finally(() => {
        settled = true
      })
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(
      settled,
      false,
      'purge must wait for backup row lock before deleting bytes'
    )
    assert.deepEqual(await readFile(path), original)
    await lock.query('COMMIT')
    inTransaction = false
    assert.equal(await purging, 1)
    await assert.rejects(readFile(path), (error) => error.code === 'ENOENT')
    const expired = (
      await pool.query(
        'SELECT status,purged_at FROM audit_archive_artifacts WHERE id=$1',
        [artifact.id]
      )
    ).rows[0]
    assert.equal(expired.status, 'expired')
    assert.ok(expired.purged_at)
    assert.equal(await membershipCount(run), 1)
    assert.equal((await detail(run, owner)).coverage.coveredTotal, 1)
    assert.equal((await download(run, batch, owner)).statusCode, 404)
    const all = ok(
      await call(
        `/audit/events?traceId=${encodeURIComponent(source.traceId)}`,
        { user: owner.username }
      )
    )
    assert.equal(all.total, 1)
    assert.equal(all.list[0].traceId, source.traceId)
    for (const state of ['all', 'hot', 'archived']) {
      const page = ok(
        await call(
          `/audit/events?version=2&archiveState=${state}&traceId=${encodeURIComponent(
            source.traceId
          )}`,
          { user: owner.username }
        )
      )
      assert.deepEqual(
        page.list.map((row) => row.id),
        state === 'hot' ? [] : [all.list[0].id]
      )
    }
    assert.ok((await batches(run))[0].bytes_purged_at)
  } finally {
    if (inTransaction) await lock.query('ROLLBACK')
    lock.release()
    if (purging) await purging
    await pool.query(
      `DROP TRIGGER IF EXISTS ${triggerName} ON audit_archive_artifacts`
    )
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`)
  }
})

test('policy update and due materialization serialize tenant before policy without deadlocking or changing executor', async () => {
  const owner = await person({ scope: 'tenant' })
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = ok(
      await call('/audit/retention-policy', { user: owner.username })
    )
    const enabled = ok(
      await call('/audit/retention-policy', {
        user: owner.username,
        method: 'PUT',
        body: {
          expectedRevision: current.revision,
          enabled: true,
          hotDays: 3650,
          timeZone: 'America/New_York',
        },
      })
    )
    await pool.query(
      "UPDATE audit_retention_policies SET next_run_at=clock_timestamp()-interval '1 second' WHERE tenant_id='tenant-a'"
    )
    const [response, materialized] = await Promise.all([
      call('/audit/retention-policy', {
        user: owner.username,
        method: 'PUT',
        body: {
          expectedRevision: enabled.revision,
          enabled: false,
          hotDays: 3650,
          timeZone: 'Asia/Shanghai',
        },
      }),
      worker.materializeAuditRetentionPolicies(pool, 1),
    ])
    const updated = ok(response)
    assert.equal(updated.enabled, false)
    assert.equal(updated.executor.id, owner.id)
    assert.ok([0, 1].includes(materialized))
    const stored = (
      await pool.query(
        "SELECT executor_id,revision,enabled FROM audit_retention_policies WHERE tenant_id='tenant-a'"
      )
    ).rows[0]
    assert.equal(stored.executor_id, owner.id)
    assert.equal(stored.revision, enabled.revision + 1)
    assert.equal(stored.enabled, false)
  }
})

test('five expired batch claims exhaust retry even without a reported processing failure, preserving fixed candidates', async () => {
  const owner = await person(),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId }))
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await processRun(
      run,
      async (point) => {
        if (point === 'audit-archive.after-claim') {
          await pool.query(
            "UPDATE audit_archive_runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1 AND status='processing'",
            [run.id]
          )
          await pool.query(
            "UPDATE audit_archive_batches SET lease_until=clock_timestamp()-interval '1 second' WHERE run_id=$1 AND status='processing'",
            [run.id]
          )
        }
      },
      1
    )
  }
  assert.equal((await batches(run))[0].attempts, 5)
  assert.equal(await processRun(run, () => undefined, 1), 1)
  const exhausted = await detail(run, owner)
  assert.equal(exhausted.attempts, 0)
  assert.equal(exhausted.status, 'failed')
  assert.equal(exhausted.errorCode, 'AUDIT_ARCHIVE_ATTEMPTS_EXHAUSTED')
  assert.deepEqual(exhausted.allowedActions, [])
  assert.equal(exhausted.candidateHash, run.candidateHash)
  const response = await call(`/audit/archive-runs/${run.id}/retry`, {
    user: owner.username,
    method: 'POST',
    body: { expectedRevision: exhausted.revision },
  })
  assert.equal(response.statusCode, 409)
  assert.equal(response.json().businessCode, 'AUDIT_ARCHIVE_ATTEMPTS_EXHAUSTED')
  assert.equal(await membershipCount(run), 0)
  assert.equal((await detail(run, owner)).revision, exhausted.revision)
  const replacement = ok(await create(owner, { traceId: source.traceId }))
  assert.notEqual(replacement.id, run.id)
  assert.equal(replacement.coverage.candidateTotal, 1)
})

test('exact batch metadata shares paged current authority and rejects wrong-run, foreign-tenant and revoked-field access', async () => {
  const owner = await person(),
    source = await fact(owner),
    first = ok(await create(owner, { traceId: source.traceId })),
    second = ok(await create(owner, { traceId: source.traceId }))
  await processRun(first)
  const [batch] = await batches(first),
    path = `/audit/archive-runs/${first.id}/batches/${batch.id}`
  const exact = ok(await call(path, { user: owner.username }))
  const page = ok(
    await call(`/audit/archive-runs/${first.id}/batches?current=1&pageSize=1`, {
      user: owner.username,
    })
  )
  assert.deepEqual(exact, page.list[0])
  assert.equal(exact.artifact.status, 'ready')
  assert.equal(exact.snapshotHash, batch.snapshot_hash)
  assert.equal(
    (
      await call(`/audit/archive-runs/${second.id}/batches/${batch.id}`, {
        user: owner.username,
      })
    ).statusCode,
    404
  )
  assert.equal((await call(path, { user: 'b-admin' })).statusCode, 404)
  assert.equal(
    (await call(`${path}?current=1`, { user: owner.username })).statusCode,
    422
  )
  assert.equal(
    (
      await call(`/audit/archive-runs/${first.id}/batches/${'x'.repeat(101)}`, {
        user: owner.username,
      })
    ).statusCode,
    414 // Fastify rejects parameters beyond its 100-character router bound.
  )
  const before = (
    await pool.query(
      'SELECT count(*)::int AS n FROM audit_archive_events WHERE run_id=$1',
      [first.id]
    )
  ).rows[0].n
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username"]\'::jsonb WHERE role_id=$1',
    [owner.roleId]
  )
  const denied = await call(path, { user: owner.username })
  assert.equal(denied.statusCode, 403)
  assert.equal(denied.json().data, null)
  const restricted = await detail(first, owner)
  assert.equal(restricted.restricted, true)
  assert.equal(restricted.query, null)
  assert.equal(restricted.candidateHash, null)
  assert.equal(restricted.coverage.candidateTotal, null)
  assert.equal(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM audit_archive_events WHERE run_id=$1',
        [first.id]
      )
    ).rows[0].n,
    before
  )
})

test('archive-state query preserves current tenant, row and actor-field authority after membership creation', async () => {
  const owner = await person(),
    observer = await person({ scope: 'tenant' }),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId }))
  await processRun(run)
  const [batch] = await batches(run),
    factId = batch.snapshot.snapshot.rows[0].id
  const query = (state, user = observer.username) =>
    call(
      `/audit/events?version=2&archiveState=${state}&traceId=${encodeURIComponent(
        source.traceId
      )}`,
      { user }
    )
  for (const state of ['all', 'hot', 'archived']) {
    assert.deepEqual(
      ok(await query(state)).list.map((row) => row.id),
      state === 'hot' ? [] : [factId]
    )
    assert.deepEqual(ok(await query(state, 'b-admin')).list, [])
  }
  await pool.query(
    "UPDATE role_member_scopes SET field_permissions='[]'::jsonb WHERE role_id=$1",
    [observer.roleId]
  )
  const masked = ok(await query('archived'))
  assert.equal(masked.list[0].operator.name, null)
  assert.equal(masked.list[0].operator.id, null)
  assert.ok(!JSON.stringify(masked).includes(owner.name))
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='self' WHERE role_id=$1",
    [observer.roleId]
  )
  for (const state of ['all', 'hot', 'archived'])
    assert.deepEqual(ok(await query(state)).list, [])
  assert.equal(
    (await call(`/audit/archive-runs/${run.id}`, { user: observer.username }))
      .statusCode,
    404
  )
})

for (const terminal of ['cancelled', 'failed'])
  test(`expired ${terminal} reservation retires actual unregistered bytes only inside its owned scope`, async () => {
    const owner = await person(),
      source = await fact(owner),
      foreignOwner = await person(),
      foreignSource = await fact(foreignOwner)
    const foreignRun = ok(
      await create(foreignOwner, { traceId: foreignSource.traceId })
    )
    await processRun(
      foreignRun,
      (point) => {
        if (point === 'audit-archive.after-write')
          throw new Error('Controlled foreign-scope write failure')
      },
      1
    )
    const [foreignBatch] = await batches(foreignRun),
      foreignPath = join(storageRoot, foreignBatch.object_key, 'content'),
      foreignBytes = await readFile(foreignPath)
    const suffix = randomUUID().replaceAll('-', ''),
      functionName = `archive_reservation_fixture_${suffix}`,
      triggerName = `archive_reservation_fixture_${suffix}`
    // Change only initial timestamps for the exact owner's disposable fixture;
    // immutable lifetime, real generator bytes, and all subsequent guards remain active.
    await pool.query(
      `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM audit_archive_runs WHERE tenant_id=NEW.tenant_id AND id=NEW.run_id AND executor_id='${owner.id}') THEN NEW.retention_until=clock_timestamp()+interval '8 seconds'; NEW.created_at=NEW.retention_until-interval '365 days'; END IF; RETURN NEW; END $$`
    )
    await pool.query(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_archive_batches FOR EACH ROW EXECUTE FUNCTION ${functionName}()`
    )
    try {
      const run = ok(await create(owner, { traceId: source.traceId }))
      for (
        let attempt = 0;
        attempt < (terminal === 'failed' ? 5 : 1);
        attempt += 1
      ) {
        await pool.query(
          'UPDATE audit_archive_runs SET next_attempt_at=clock_timestamp() WHERE id=$1',
          [run.id]
        )
        await processRun(
          run,
          (point) => {
            if (point === 'audit-archive.after-write')
              throw new Error(
                'Controlled actual write before artifact registration'
              )
          },
          1
        )
      }
      let current = await detail(run, owner)
      if (terminal === 'cancelled')
        current = ok(
          await call(`/audit/archive-runs/${run.id}/cancel`, {
            user: owner.username,
            method: 'POST',
            body: { expectedRevision: current.revision },
          })
        )
      assert.equal(current.status, terminal)
      const [batch] = await batches(run),
        path = join(storageRoot, batch.object_key, 'content'),
        bytes = await readFile(path)
      assert.ok(bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])))
      assert.equal(batch.bytes_purged_at, null)
      assert.equal(
        (
          await pool.query(
            'SELECT * FROM audit_archive_artifacts WHERE batch_id=$1',
            [batch.id]
          )
        ).rowCount,
        0
      )
      const left = (
        await pool.query(
          'SELECT GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp()))*1000)::int AS ms',
          [batch.retention_until]
        )
      ).rows[0].ms
      await new Promise((resolve) => setTimeout(resolve, left + 50))
      assert.equal(
        await worker.expireAuditArchiveReservations(
          pool,
          { storageRoot },
          scope(run)
        ),
        1
      )
      await assert.rejects(readFile(path), (error) => error.code === 'ENOENT')
      const [retired] = await batches(run)
      assert.ok(retired.bytes_purged_at)
      assert.equal(retired.status, terminal)
      assert.equal(await membershipCount(run), 0)
      assert.equal((await detail(run, owner)).candidateHash, run.candidateHash)
      assert.deepEqual(await readFile(foreignPath), foreignBytes)
      assert.equal((await batches(foreignRun))[0].bytes_purged_at, null)
      assert.equal(
        await worker.expireAuditArchiveReservations(
          pool,
          { storageRoot },
          scope(run)
        ),
        0
      )
      assert.equal(await processRun(run), 0)
      assert.equal(
        (
          await call(`/audit/archive-runs/${run.id}/retry`, {
            user: owner.username,
            method: 'POST',
            body: { expectedRevision: (await detail(run, owner)).revision },
          })
        ).statusCode,
        409
      )
      await assert.rejects(
        pool.query(
          'UPDATE audit_archive_batches SET bytes_purged_at=NULL WHERE id=$1',
          [batch.id]
        ),
        /cannot change or revive/i
      )
      await assert.rejects(
        pool.query(
          "UPDATE audit_archive_batches SET status='queued' WHERE id=$1",
          [batch.id]
        ),
        /cannot restart/i
      )
    } finally {
      await pool.query(
        `DROP TRIGGER IF EXISTS ${triggerName} ON audit_archive_batches`
      )
      await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`)
    }
  })

test('a real SIGKILL after durable byte write recovers in a different OS process without recapture or duplicate membership', async () => {
  const owner = await person(),
    source = await fact(owner),
    run = ok(await create(owner, { traceId: source.traceId })),
    first = startArchiveChild(run, { haltAfterWrite: true })
  let second
  try {
    await first.ready
    assert.ok(first.child.pid > 0)
    assert.notEqual(first.child.pid, process.pid)
    const exited = once(first.child, 'exit')
    first.child.kill('SIGKILL')
    const [code, signal] = await exited
    assert.equal(code, null)
    assert.equal(signal, 'SIGKILL')
    const [interrupted] = await batches(run),
      path = join(storageRoot, interrupted.object_key, 'content'),
      bytes = await readFile(path)
    assert.equal(interrupted.status, 'processing')
    assert.equal(interrupted.attempts, 1)
    assert.equal(interrupted.bytes_purged_at, null)
    assert.ok(bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])))
    assert.equal(await membershipCount(run), 0)
    assert.equal(
      (
        await pool.query(
          'SELECT * FROM audit_archive_artifacts WHERE batch_id=$1',
          [interrupted.id]
        )
      ).rowCount,
      0
    )
    // Advance only the dead process's owned lease to exercise recovery without a 90s sleep.
    await pool.query(
      "UPDATE audit_archive_runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
      [run.id]
    )
    await pool.query(
      "UPDATE audit_archive_batches SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
      [interrupted.id]
    )
    second = startArchiveChild(run)
    assert.notEqual(second.child.pid, first.child.pid)
    await second.ready
    if (second.child.exitCode === null && second.child.signalCode === null) {
      const [exitCode] = await once(second.child, 'exit')
      assert.equal(exitCode, 0)
    } else assert.equal(second.child.exitCode, 0)
    const [recovered] = await batches(run)
    assert.equal(recovered.status, 'completed')
    assert.equal(recovered.attempts, 2)
    assert.equal(recovered.snapshot_hash, interrupted.snapshot_hash)
    assert.equal((await detail(run, owner)).candidateHash, run.candidateHash)
    assert.equal(await membershipCount(run), 1)
    assert.deepEqual(await readFile(path), bytes)
    const artifact = (
      await pool.query(
        'SELECT * FROM audit_archive_artifacts WHERE batch_id=$1',
        [recovered.id]
      )
    ).rows[0]
    assert.match(artifact.scan_engine, /^ClamAV /)
    assert.equal(
      artifact.sha256,
      createHash('sha256').update(bytes).digest('hex')
    )
    assert.equal((await download(run, recovered, owner)).statusCode, 200)
  } finally {
    await stopArchiveChild(first.child)
    if (second) await stopArchiveChild(second.child)
  }
})

test('policy executor replacement blocks the old principal; restoring the same executor resumes the fixed candidate manifest', async () => {
  const first = await person(),
    second = await person(),
    tenantId = `archive-policy-${randomUUID()}`,
    traceId = `policy-source-${randomUUID()}`
  await pool.query('INSERT INTO tenants(id,name) VALUES($1,$1)', [tenantId])
  privateTenants.push(tenantId)
  const permissions = JSON.stringify([
    ...Object.values(contracts.AUDIT_EXPORT_PERMISSIONS),
    contracts.AUDIT_RETENTION_PERMISSIONS.manage,
    'audit:read',
  ])
  for (const owner of [first, second])
    await pool.query(
      "INSERT INTO memberships(tenant_id,user_id,department_name,role,permissions) VALUES($1,$2,'Archive policy fixture','user',$3::jsonb)",
      [tenantId, owner.id, permissions]
    )
  await pool.query(
    "INSERT INTO audit_events(tenant_id,id,actor_id,actor_name,module,action,result,target_type,target_id,trace_id,detail,created_at) VALUES($1,$2,$3,$4,'auth','login','success','user',$3,$2,'{}'::jsonb,clock_timestamp()-interval '365 days')",
    [tenantId, traceId, first.id, first.name]
  )
  const update = async (owner, revision) =>
    ok(
      await call('/audit/retention-policy', {
        user: owner.username,
        tenantId,
        method: 'PUT',
        body: {
          expectedRevision: revision,
          enabled: true,
          hotDays: 1,
          timeZone: 'Asia/Shanghai',
        },
      })
    )
  const policy = await update(first, 1)
  await pool.query(
    "UPDATE audit_retention_policies SET next_run_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1",
    [tenantId]
  )
  assert.equal(await worker.materializeAuditRetentionPolicies(pool, 1), 1)
  const selected = ok(
      await call('/audit/retention-policy', { user: first.username, tenantId })
    ),
    run = ok(
      await call(`/audit/archive-runs/${selected.lastRunId}`, {
        user: first.username,
        tenantId,
      })
    )
  assert.equal(run.coverage.candidateTotal, 1)
  assert.equal(run.executor.id, first.id)
  const changed = await update(second, policy.revision),
    ownedScope = { tenantId, runIds: [run.id] }
  await worker.processAuditRetention(
    pool,
    { storageRoot },
    () => undefined,
    1,
    ownedScope
  )
  const blocked = ok(
    await call(`/audit/archive-runs/${run.id}`, {
      user: first.username,
      tenantId,
    })
  )
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.candidateHash, run.candidateHash)
  assert.equal(
    (
      await pool.query(
        'SELECT * FROM audit_archive_memberships WHERE tenant_id=$1 AND run_id=$2',
        [tenantId, run.id]
      )
    ).rowCount,
    0
  )
  const restored = await update(first, changed.revision)
  assert.equal(restored.executor.id, first.id)
  ok(
    await call(`/audit/archive-runs/${run.id}/retry`, {
      user: first.username,
      tenantId,
      method: 'POST',
      body: { expectedRevision: blocked.revision },
    })
  )
  await worker.processAuditRetention(
    pool,
    { storageRoot },
    () => undefined,
    1,
    ownedScope
  )
  const final = ok(
    await call(`/audit/archive-runs/${run.id}`, {
      user: first.username,
      tenantId,
    })
  )
  assert.equal(final.status, 'completed')
  assert.equal(final.executor.id, first.id)
  assert.equal(final.candidateHash, run.candidateHash)
  assert.equal(final.coverage.coveredTotal, 1)
  const already = ok(
    await call('/audit/archive-runs', {
      user: first.username,
      tenantId,
      method: 'POST',
      body: { query: { traceId }, format: 'csv' },
    })
  )
  assert.equal(already.coverage.candidateTotal, 0)
  assert.equal(already.status, 'completed')
})

test('policy capture failure keeps a null actor and immutable attempt executor scope after the policy changes principal', async () => {
  const original = await person(),
    replacement = await person(),
    unrelated = await person()
  const before = ok(
    await call('/audit/retention-policy', { user: original.username })
  )
  const policy = ok(
    await call('/audit/retention-policy', {
      user: original.username,
      method: 'PUT',
      body: {
        expectedRevision: before.revision,
        enabled: true,
        hotDays: 90,
        timeZone: 'Asia/Shanghai',
      },
    })
  )
  await pool.query(
    "DELETE FROM role_permissions WHERE tenant_id='tenant-a' AND role_id=$1 AND permission_code='audit:export:create'",
    [original.roleId]
  )
  let latestRevision = policy.revision,
    currentExecutor = original
  try {
    await pool.query(
      "UPDATE audit_retention_policies SET next_run_at=clock_timestamp()-interval '1 second' WHERE tenant_id='tenant-a'"
    )
    assert.equal(await worker.materializeAuditRetentionPolicies(pool, 1), 0)
    const facts = (
      await pool.query(
        "SELECT id,actor_id,actor_name,result,target_type,target_id,trace_id,detail,created_at::text AS created_at FROM audit_events WHERE tenant_id='tenant-a' AND module='audit-retention' AND action='policy.capture-failed' AND target_id=$1 ORDER BY created_at DESC,id",
        [original.id]
      )
    ).rows
    assert.equal(facts.length, 1)
    const stored = facts[0]
    assert.equal(stored.actor_id, null)
    assert.equal(stored.actor_name, '')
    assert.equal(stored.result, 'failure')
    assert.equal(stored.target_type, 'membership')
    assert.equal(stored.target_id, original.id)
    assert.deepEqual(stored.detail, {
      code: 'AUDIT_ARCHIVE_POLICY_CAPTURE_FAILED',
    })
    const query = (owner) =>
      call(`/audit/events?traceId=${encodeURIComponent(stored.trace_id)}`, {
        user: owner.username,
      })
    const visible = ok(await query(original))
    assert.equal(visible.total, 1)
    assert.equal(visible.list[0].id, stored.id)
    assert.equal(visible.list[0].operator.id, null)
    assert.equal(visible.list[0].operator.name, null)
    assert.equal(visible.list[0].result, 'failure')
    assert.equal(visible.list[0].target.id, original.id)
    assert.equal(ok(await query(unrelated)).total, 0)
    const changed = ok(
      await call('/audit/retention-policy', {
        user: replacement.username,
        method: 'PUT',
        body: {
          expectedRevision: policy.revision,
          enabled: true,
          hotDays: 90,
          timeZone: 'Asia/Shanghai',
        },
      })
    )
    latestRevision = changed.revision
    currentExecutor = replacement
    assert.equal(changed.executor.id, replacement.id)
    assert.equal(
      ok(await query(replacement)).total,
      0,
      'new policy executor must not inherit the previous failed attempt scope'
    )
    assert.deepEqual(ok(await query(original)).list, visible.list)
    assert.equal(
      ok(
        await call(
          `/audit/events?traceId=${encodeURIComponent(stored.trace_id)}`,
          { user: 'b-admin' }
        )
      ).total,
      0
    )
    const after = (
      await pool.query(
        'SELECT id,actor_id,actor_name,result,target_type,target_id,trace_id,detail,created_at::text AS created_at FROM audit_events WHERE id=$1',
        [stored.id]
      )
    ).rows[0]
    assert.deepEqual(after, stored)
  } finally {
    await pool.query(
      "INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES('tenant-a',$1,'audit:export:create') ON CONFLICT DO NOTHING",
      [original.roleId]
    )
    ok(
      await call('/audit/retention-policy', {
        user: currentExecutor.username,
        method: 'PUT',
        body: {
          expectedRevision: latestRevision,
          enabled: false,
          hotDays: 90,
          timeZone: 'Asia/Shanghai',
        },
      })
    )
  }
})
