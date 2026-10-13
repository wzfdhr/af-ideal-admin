import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { unzipSync } from 'fflate'
import { Pool } from 'pg'
import { createServer } from '@af-admin/reference-api/dist/index.js'
import { verifyMigrationReadiness } from '@af-admin/reference-api/dist/migrate.js'
import { processAuditRetention } from '@af-admin/reference-api/dist/audit-retention-worker.js'
import {
  LocalObjectStore,
  fileDigest,
} from '@af-admin/reference-api/dist/file-storage.js'
import { digest } from '@af-admin/reference-api/dist/security.js'
import { noFault } from '@af-admin/reference-api/dist/support.js'

const SOURCE_DATABASE = 'af_admin_full_c1b35e6ead774464986c87ea453d847e_demo'
const SOURCE_ORIGIN = 'http://127.0.0.1:10890'
const POSTGRES_CONTAINER = 'af-admin-r1-postgres'
const MIGRATION_031_SHA256 =
  'b8a8290720509617a87987615db074696701f2f0329785d5aeaa31c33ae6e1b7'
const HISTORIC_MISSING_REFERENCE = path.resolve(
  'test-results/full-product/report-exports-20261013/database-and-file-copy/a5c1e941f1cf4424975b3aa39b64a758/report.json'
)
const HISTORIC_MISSING_REFERENCE_SHA256 =
  '06cc381e8071598f23e84878f63faf9313bceb21c60bd4f72b74e89895afa814'
const EVIDENCE_ROOT = path.resolve(
  'test-results/full-product/audit-retention-20261013/database-and-file-copy'
)
const runId = randomUUID()
const runKey = runId.replaceAll('-', '')
const runRoot = path.join(EVIDENCE_ROOT, runId)
const dumpPath = path.join(runRoot, 'database.dump')
const targetName = `af_ar_${runKey}_demo`
const scope =
  'migration 031 database plus every retained referenced local byte object restored into a random database and independent store on the same local PostgreSQL host'
const caveat =
  'This appends three clean synthetic archive witnesses and one queued continuation without rewriting raw audit facts or enabling tenant policy. Completed witnesses and logical memberships remain for the fixed 365-day artifact lifecycle. This is not a new physical server, customer restore, fresh-machine deployment, physical audit deletion, or binary rollback claim.'
const usage =
  'node --env-file=/absolute/path/to/api.env.local scripts/verify-audit-retention-recovery.mjs'

const children = new Set()
const backendMarkers = new Set()
const uncertainOperations = new Set()
const cleanupFailures = []
const sourceRunIntents = []
const sourceWitnessRuns = new Set()
const sourceContinuationRuns = new Set()
const sourceCleanup = []
let sourceUrl
let source
let restored
let targetServer
let sourceFileRoot
let backupRoot
let restoreRoot
let token
let sourcePendingRun
let sourcePendingCancelled = false
let sourceFixtureRace = false
let targetCreationAttempted = false
let targetCreated = false
let targetRemoved = false
let restoreStoreRemoved = false
let stage = 'guards'
let validationFailure
let reportData

const sequence = (values, run) =>
  values.reduce(async (previous, value) => {
    await previous
    await run(value)
  }, Promise.resolve())

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const jsonHash = (value) => sha256(JSON.stringify(value))
const fileHash = async (file) => {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}
const delay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

const safeError = (error) => {
  let message =
    error instanceof Error
      ? error.message
      : 'Audit retention recovery verification failed'
  let decodedPassword = ''
  try {
    decodedPassword = decodeURIComponent(sourceUrl?.password || '')
  } catch {
    decodedPassword = ''
  }
  ;[
    token,
    sourceUrl?.toString(),
    sourceUrl?.password,
    decodedPassword,
    process.env.DATABASE_URL,
  ]
    .filter(Boolean)
    .forEach((secret) => {
      message = message.replaceAll(secret, '[redacted]')
    })
  return message.slice(0, 1200)
}

const writeReport = async (report) => {
  const text = JSON.stringify(report, null, 2)
  const checksum = sha256(text)
  await writeFile(path.join(runRoot, 'report.json'), text, { mode: 0o600 })
  await writeFile(
    path.join(runRoot, 'report.sha256'),
    `${checksum}  report.json\n`,
    { mode: 0o600 }
  )
  await writeFile(
    path.join(EVIDENCE_ROOT, 'latest.json'),
    JSON.stringify(
      {
        runId,
        status: report.status,
        stage: report.stage || stage,
        reportPath: path.relative(
          process.cwd(),
          path.join(runRoot, 'report.json')
        ),
        reportSha256: checksum,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    { mode: 0o600 }
  )
}

const progress = () =>
  writeReport({
    version: 1,
    status: 'running',
    stage,
    runId,
    scope,
    caveat,
    sourceDatabase: SOURCE_DATABASE,
    targetDatabase: targetName,
    targetCreationAttempted,
    targetCreated,
    sourcePendingRunId: sourcePendingRun?.id || null,
    sourceFixtureRace,
    uncertainOperations: [...uncertainOperations],
    backendMarkers: [...backendMarkers],
  })

const advance = async (next) => {
  stage = next
  await progress()
  process.stdout.write(`Audit retention recovery phase: ${stage}\n`)
}

const assertIndependentRoots = (first, second) => {
  const contained = (parent, child) => {
    const relative = path.relative(parent, child)
    return (
      relative === '' ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== '..' &&
        !path.isAbsolute(relative))
    )
  }
  assert.ok(
    !contained(first, second) && !contained(second, first),
    'Source, backup, and restored stores must be independent directory trees'
  )
}

const stopChild = async (child) => {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    children.delete(child)
    return
  }
  const exited = once(child, 'exit', {
    signal: AbortSignal.timeout(5000),
  })
  const force = setTimeout(() => child.kill('SIGKILL'), 1000)
  child.kill('SIGTERM')
  try {
    await exited
  } finally {
    clearTimeout(force)
    children.delete(child)
  }
}

const backendRows = async (marker) =>
  (
    await source.query(
      'SELECT pid,datname,state FROM pg_stat_activity WHERE application_name=$1 AND pid<>pg_backend_pid() ORDER BY pid',
      [marker]
    )
  ).rows

const stopOwnedBackends = async (marker, commandConfirmed) => {
  let rows = await backendRows(marker)
  if (rows.length) {
    await source.query(
      'SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND pid<>pg_backend_pid()',
      [marker]
    )
    await delay(250)
    rows = await backendRows(marker)
  }
  if (rows.length) {
    await source.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND pid<>pg_backend_pid()',
      [marker]
    )
    await delay(500)
    rows = await backendRows(marker)
  }
  assert.equal(rows.length, 0, `Owned backend ${marker} must stop`)
  backendMarkers.delete(marker)
  if (commandConfirmed) uncertainOperations.delete(`container:${marker}`)
}

const runDocker = async (executable, args, stdio, inputPath) => {
  assert.ok(['pg_dump', 'pg_restore'].includes(executable))
  const operation = executable === 'pg_dump' ? 'dump' : 'restore'
  const marker = `af_ar_${runKey}_${operation}`
  assert.match(marker, /^af_ar_[a-f0-9]{32}_(dump|restore)$/)
  assert.ok(
    Buffer.byteLength(marker, 'utf8') <= 63,
    'PGAPPNAME must survive PostgreSQL application_name without truncation'
  )
  backendMarkers.add(marker)
  uncertainOperations.add(`container:${marker}`)
  const child = spawn(
    'docker',
    [
      'exec',
      ...(inputPath ? ['-i'] : []),
      '-e',
      `PGAPPNAME=${marker}`,
      POSTGRES_CONTAINER,
      'timeout',
      '--signal=TERM',
      '--kill-after=5s',
      '165s',
      executable,
      ...args,
    ],
    { stdio }
  )
  children.add(child)
  let commandConfirmed = false
  let commandError
  try {
    const transfer = inputPath
      ? pipeline(createReadStream(inputPath), child.stdin)
      : Promise.resolve()
    const [result] = await Promise.all([
      once(child, 'exit', { signal: AbortSignal.timeout(180000) }),
      transfer,
    ])
    assert.equal(result[0], 0)
    assert.equal(result[1], null)
    commandConfirmed = true
  } catch (error) {
    commandError = error
  }
  const lifecycleErrors = []
  try {
    await stopChild(child)
  } catch (error) {
    lifecycleErrors.push(error)
  }
  try {
    await stopOwnedBackends(marker, commandConfirmed)
  } catch (error) {
    lifecycleErrors.push(error)
  }
  if (commandError || lifecycleErrors.length)
    throw new Error(
      `${executable} lifecycle failed: ${[commandError, ...lifecycleErrors]
        .filter(Boolean)
        .map(safeError)
        .join('; ')}`
    )
}

const apiCall = async (
  origin,
  endpoint,
  {
    body,
    method = 'GET',
    binary = false,
    expectedStatus = 200,
    key,
    mutationMarker,
  } = {}
) => {
  assert.ok(token, 'Every continuation uses the current fresh bound session')
  if (mutationMarker) uncertainOperations.add(`http:${mutationMarker}`)
  const response = await fetch(`${origin}/api${endpoint}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      'x-access-token': token,
      'x-tenant-id': 'tenant-a',
      ...(key ? { 'idempotency-key': key } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (binary && response.status === expectedStatus) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (mutationMarker) uncertainOperations.delete(`http:${mutationMarker}`)
    return {
      bytes,
      mimeType: response.headers.get('content-type'),
      sha256: response.headers.get('x-content-sha256'),
    }
  }
  const payload = await response.json()
  if (mutationMarker) uncertainOperations.delete(`http:${mutationMarker}`)
  assert.equal(
    response.status,
    expectedStatus,
    `${payload.businessCode || 'HTTP_ERROR'}: ${payload.message || endpoint}`
  )
  if (expectedStatus !== 200) return payload
  assert.equal(payload.code, 20000)
  return payload.data
}

const publicTables = async (db) => {
  const tables = (
    await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
    )
  ).rows.map((row) => row.table_name)
  assert.equal(tables.length, 83)
  tables.forEach((table) => assert.match(table, /^[a-z][a-z0-9_]*$/))
  ;[
    'audit_retention_policies',
    'audit_archive_runs',
    'audit_archive_candidates',
    'audit_archive_batches',
    'audit_archive_artifacts',
    'audit_archive_memberships',
    'audit_archive_events',
  ].forEach((table) => assert.ok(tables.includes(table), `Missing ${table}`))
  return tables
}

const tableFingerprints = async (db, tables) => {
  const facts = {}
  await sequence(tables, async (table) => {
    const row = (
      await db.query(
        `SELECT count(*)::int AS count,md5(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),'')) AS checksum FROM (SELECT md5(to_jsonb(t)::text) AS row_hash FROM ${table} t) rows`
      )
    ).rows[0]
    facts[table] = { count: row.count, checksum: row.checksum }
  })
  return facts
}

const migrationFacts = async (db) => {
  const { rows } = await db.query(
    'SELECT name,checksum FROM schema_migrations ORDER BY name'
  )
  assert.equal(rows.length, 31)
  assert.equal(rows.at(-1).name, '031_audit_event_archive.sql')
  assert.equal(rows.at(-1).checksum, MIGRATION_031_SHA256)
  return rows
}

const sessionBinding = async (db) => {
  const { rows } = await db.query(
    "SELECT s.user_id,s.default_tenant_id,s.revoked_at,s.expires_at,scope.epoch,m.session_epoch,m.permissions,(SELECT COALESCE(jsonb_agg(mr.role_id ORDER BY mr.role_id),'[]'::jsonb) FROM member_roles mr WHERE mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id) AS roles FROM sessions s JOIN session_scopes scope ON scope.token_hash=s.token_hash AND scope.user_id=s.user_id AND scope.tenant_id='tenant-a' JOIN memberships m ON m.tenant_id=scope.tenant_id AND m.user_id=scope.user_id JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE s.token_hash=$1 AND s.user_id='a-admin' AND s.default_tenant_id='tenant-a' AND s.revoked_at IS NULL AND s.expires_at>now() AND scope.epoch=m.session_epoch AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled'",
    [digest(token)]
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].epoch, rows[0].session_epoch)
  return rows[0]
}

const freshLogin = async () => {
  const startedAt = (await source.query('SELECT clock_timestamp() AS time'))
    .rows[0].time
  const marker = `http:source-login:${randomUUID()}`
  uncertainOperations.add(marker)
  const response = await fetch(`${SOURCE_ORIGIN}/api/user/login`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'a-admin', password: 'a-admin' }),
  })
  assert.equal(response.status, 200)
  const envelope = await response.json()
  uncertainOperations.delete(marker)
  token = envelope.data.token
  assert.equal(typeof token, 'string')
  const binding = await sessionBinding(source)
  const createdAt = (
    await source.query('SELECT created_at FROM sessions WHERE token_hash=$1', [
      digest(token),
    ])
  ).rows[0].created_at
  assert.ok(new Date(createdAt) >= new Date(startedAt.getTime() - 60000))
  const user = await apiCall(SOURCE_ORIGIN, '/user/info')
  assert.equal(user.id, 'a-admin')
  assert.equal(user.tenantId, 'tenant-a')
  const facts = (
    await source.query(
      "SELECT * FROM audit_events WHERE tenant_id='tenant-a' AND trace_id=$1 ORDER BY id",
      [envelope.traceId]
    )
  ).rows
  assert.equal(facts.length, 1)
  assert.equal(facts[0].actor_id, 'a-admin')
  assert.equal(facts[0].module, 'auth')
  assert.equal(facts[0].action, 'login')
  assert.equal(facts[0].result, 'success')
  assert.equal(facts[0].target_type, 'session')
  assert.equal(facts[0].target_id, 'a-admin')
  return {
    token,
    traceId: envelope.traceId,
    eventId: facts[0].id,
    rawFactHash: jsonHash(facts[0]),
    binding,
    user,
  }
}

const auditQuery = (traceId) => ({
  version: 1,
  current: 1,
  pageSize: 20,
  module: '',
  eventType: '',
  result: '',
  operatorName: '',
  targetId: '',
  traceId,
  from: '',
  to: '',
  timeZone: 'America/New_York',
})

const queryAudit = (origin, traceId, archiveState) => {
  const params = new URLSearchParams({
    version: archiveState === undefined ? '1' : '2',
    current: '1',
    pageSize: '20',
    traceId,
    timeZone: 'America/New_York',
  })
  if (archiveState !== undefined) params.set('archiveState', archiveState)
  return apiCall(origin, `/audit/events?${params}`)
}

const assertArchiveQueries = async (origin, traceId, archived) => {
  const v1 = await queryAudit(origin, traceId)
  const all = await queryAudit(origin, traceId, 'all')
  const hot = await queryAudit(origin, traceId, 'hot')
  const archive = await queryAudit(origin, traceId, 'archived')
  ;[v1, all].forEach((page) => {
    assert.equal(page.total, 1)
    assert.equal(page.list.length, 1)
    assert.equal(page.list[0].traceId, traceId)
  })
  assert.equal(hot.total, archived ? 0 : 1)
  assert.equal(archive.total, archived ? 1 : 0)
  return {
    v1: v1.total,
    all: all.total,
    hot: hot.total,
    archived: archive.total,
  }
}

const createRun = async (identity, format, purpose) => {
  const key = randomUUID()
  const marker = `audit-archive-create:${key}`
  sourceRunIntents.push({
    key,
    marker,
    operation: 'audit-archive.create',
    purpose,
    format,
    traceId: identity.traceId,
  })
  const value = await apiCall(SOURCE_ORIGIN, '/audit/archive-runs', {
    method: 'POST',
    key,
    mutationMarker: marker,
    body: { version: 1, query: auditQuery(identity.traceId), format },
  })
  ;(purpose === 'witness' ? sourceWitnessRuns : sourceContinuationRuns).add(
    value.id
  )
  return value
}

const waitCompletedRun = async (run, identity, format) => {
  const deadline = Date.now() + 120000
  const poll = async () => {
    const current = await apiCall(
      SOURCE_ORIGIN,
      `/audit/archive-runs/${run.id}`
    )
    if (current.status === 'completed') {
      assert.equal(current.restricted, false)
      assert.equal(current.format, format)
      assert.equal(current.query.traceId, identity.traceId)
      assert.deepEqual(current.coverage, {
        candidateTotal: 1,
        coveredTotal: 1,
        remainingTotal: 0,
        batchTotal: 1,
        completedBatchTotal: 1,
      })
      return current
    }
    if (!['queued', 'processing'].includes(current.status))
      throw new Error(
        `Owned ${format} archive witness stopped in ${current.status}; retain it for investigation`
      )
    assert.ok(
      Date.now() < deadline,
      'Normal source retention worker did not complete the owned witness within two minutes'
    )
    await delay(1000)
    return poll()
  }
  return poll()
}

const runBatches = async (origin, id) => {
  const page = await apiCall(origin, `/audit/archive-runs/${id}/batches`)
  assert.equal(page.total, 1)
  assert.equal(page.list.length, 1)
  return page.list[0]
}

const downloadBatch = async (origin, run, batch) => {
  assert.ok(batch.artifact)
  assert.equal(batch.status, 'completed')
  assert.equal(batch.restricted, false)
  assert.equal(batch.artifact.status, 'ready')
  assert.ok(batch.artifact.scanEngine.startsWith('ClamAV '))
  const result = await apiCall(
    origin,
    `/audit/archive-runs/${run.id}/batches/${batch.id}/download`,
    {
      binary: true,
      mutationMarker: `audit-archive-download:${batch.id}:${randomUUID()}`,
    }
  )
  assert.equal(result.bytes.length, batch.artifact.size)
  assert.equal(fileDigest(result.bytes), batch.artifact.sha256)
  assert.equal(result.sha256, batch.artifact.sha256)
  assert.equal(result.mimeType, batch.artifact.mimeType)
  return result.bytes
}

const assertArchiveProvenance = (
  format,
  bytes,
  run,
  batch,
  semantic,
  eventId
) => {
  const { snapshot } = semantic.batches[0]
  assert.ok(snapshot)
  assert.equal(snapshot.kind, 'archive-batch')
  assert.equal(snapshot.producerVersion, 2)
  assert.equal(snapshot.source, 'server')
  assert.equal(snapshot.runId, run.id)
  assert.equal(snapshot.ordinal, batch.ordinal)
  assert.equal(snapshot.candidateTotal, 1)
  assert.deepEqual(snapshot.candidateRange, {
    firstOrdinal: 1,
    lastOrdinal: 1,
  })
  assert.equal(snapshot.snapshot.rows.length, 1)
  assert.equal(snapshot.snapshot.rows[0].id, eventId)
  if (format === 'csv') {
    assert.deepEqual(bytes.subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]))
    const text = bytes.toString('utf8')
    assert.ok(text.includes('archive-batch'))
    assert.ok(text.includes(run.id))
    assert.ok(text.includes(eventId))
  } else if (format === 'xlsx') {
    assert.deepEqual(bytes.subarray(0, 2), Buffer.from('PK'))
    const files = unzipSync(bytes)
    const xml = Object.values(files)
      .filter((value) => value.length < 5 * 1024 * 1024)
      .map((value) => Buffer.from(value).toString('utf8'))
      .join('\n')
    assert.ok(xml.includes(run.id))
    assert.ok(xml.includes(eventId))
  } else {
    assert.match(bytes.toString('latin1', 0, 8), /^%PDF-1\.7/)
    assert.match(
      bytes.toString('latin1', Math.max(0, bytes.length - 32)),
      /%%EOF/
    )
  }
}

const delayOwnedPendingRun = async (run) => {
  const marker = `source-archive-delay:${run.id}`
  uncertainOperations.add(marker)
  const client = await source.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL statement_timeout='10000ms'")
    const runRows = (
      await client.query(
        "SELECT * FROM audit_archive_runs WHERE tenant_id='tenant-a' AND id=$1 FOR UPDATE",
        [run.id]
      )
    ).rows
    assert.equal(runRows.length, 1)
    const current = runRows[0]
    const batchRows = (
      await client.query(
        "SELECT * FROM audit_archive_batches WHERE tenant_id='tenant-a' AND run_id=$1 ORDER BY ordinal FOR UPDATE",
        [run.id]
      )
    ).rows
    const facts = (
      await client.query(
        "SELECT (SELECT count(*)::int FROM audit_archive_artifacts a JOIN audit_archive_batches b ON b.tenant_id=a.tenant_id AND b.id=a.batch_id WHERE b.tenant_id='tenant-a' AND b.run_id=$1) AS artifacts,(SELECT count(*)::int FROM audit_archive_memberships WHERE tenant_id='tenant-a' AND run_id=$1) AS memberships",
        [run.id]
      )
    ).rows[0]
    if (
      current.status !== 'queued' ||
      current.attempts !== 0 ||
      current.claimed_by !== null ||
      current.lease_until !== null ||
      batchRows.length !== 1 ||
      batchRows[0].status !== 'queued' ||
      batchRows[0].attempts !== 0 ||
      batchRows[0].claimed_by !== null ||
      batchRows[0].lease_until !== null ||
      batchRows[0].snapshot !== null ||
      facts.artifacts !== 0 ||
      facts.memberships !== 0
    ) {
      sourceFixtureRace = true
      await client.query('ROLLBACK')
      throw new Error(
        'Source retention worker raced the owned continuation; preserve its terminal witness without reset or drain'
      )
    }
    const runChanged = await client.query(
      "UPDATE audit_archive_runs SET next_attempt_at=clock_timestamp()+interval '30 days',updated_at=clock_timestamp() WHERE tenant_id='tenant-a' AND id=$1 AND status='queued' AND attempts=0 AND claimed_by IS NULL RETURNING id",
      [run.id]
    )
    const batchChanged = await client.query(
      "UPDATE audit_archive_batches SET next_attempt_at=clock_timestamp()+interval '30 days' WHERE tenant_id='tenant-a' AND run_id=$1 AND status='queued' AND attempts=0 AND claimed_by IS NULL RETURNING id",
      [run.id]
    )
    assert.equal(runChanged.rowCount, 1)
    assert.equal(batchChanged.rowCount, 1)
    await client.query('COMMIT')
    uncertainOperations.delete(marker)
    return { run: current, batch: batchRows[0] }
  } catch (error) {
    if (!sourceFixtureRace) {
      try {
        await client.query('ROLLBACK')
        uncertainOperations.delete(marker)
      } catch {
        // Marker remains when rollback or the source mutation outcome is unknown.
      }
    }
    throw error
  } finally {
    client.release()
  }
}

const recoverSourceRunIntents = async () => {
  if (!source || !sourceRunIntents.length) return
  const marker = `source-run-intent-discovery:${runKey}`
  uncertainOperations.add(marker)
  const client = await source.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL statement_timeout='60000ms'")
    await sequence(sourceRunIntents, async (intent) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [JSON.stringify(['tenant-a', 'a-admin', intent.operation, intent.key])]
      )
    })
    const recovered = (
      await client.query(
        "SELECT DISTINCT r.key,run.id FROM idempotency_records r JOIN audit_archive_runs run ON run.tenant_id=r.tenant_id AND run.executor_id=r.actor_id AND r.response->>'id'=run.id WHERE r.tenant_id='tenant-a' AND r.actor_id='a-admin' AND r.operation='audit-archive.create' AND r.key=ANY($1::text[])",
        [sourceRunIntents.map((intent) => intent.key)]
      )
    ).rows
    recovered.forEach((row) => {
      const intent = sourceRunIntents.find(
        (candidate) => candidate.key === row.key
      )
      assert.ok(intent)
      ;(intent.purpose === 'witness'
        ? sourceWitnessRuns
        : sourceContinuationRuns
      ).add(row.id)
    })
    await client.query('COMMIT')
    const recoveredKeys = new Set(recovered.map((row) => row.key))
    sourceRunIntents.forEach((intent) => {
      if (recoveredKeys.has(intent.key))
        uncertainOperations.delete(`http:${intent.marker}`)
    })
    uncertainOperations.delete(marker)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

const semanticRun = async (db, id) => {
  const run = (
    await db.query(
      "SELECT tenant_id,id,executor_id,trigger,policy_revision,occurrence_date,occurrence_zone,occurrence_boundary,query,format,queried_at,data_cutoff_at,manifest_canonical,manifest_hash,candidate_total,status,revision,attempts,next_attempt_at,claimed_by,lease_until,error_code,created_at,updated_at,completed_at FROM audit_archive_runs WHERE tenant_id='tenant-a' AND id=$1",
      [id]
    )
  ).rows
  assert.equal(run.length, 1)
  const candidates = (
    await db.query(
      "SELECT event_id,ordinal,occurred_at,required_visible_fields,target_id_visible FROM audit_archive_candidates WHERE tenant_id='tenant-a' AND run_id=$1 ORDER BY ordinal",
      [id]
    )
  ).rows
  const batches = (
    await db.query(
      "SELECT id,run_id,ordinal,first_ordinal,last_ordinal,snapshot,snapshot_canonical,snapshot_hash,object_key,status,revision,attempts,next_attempt_at,claimed_by,lease_until,error_code,created_at,completed_at,retention_until,bytes_purged_at FROM audit_archive_batches WHERE tenant_id='tenant-a' AND run_id=$1 ORDER BY first_ordinal",
      [id]
    )
  ).rows
  const artifacts = (
    await db.query(
      "SELECT a.* FROM audit_archive_artifacts a JOIN audit_archive_batches b ON b.tenant_id=a.tenant_id AND b.id=a.batch_id WHERE a.tenant_id='tenant-a' AND b.run_id=$1 ORDER BY a.id",
      [id]
    )
  ).rows
  const memberships = (
    await db.query(
      "SELECT event_id,run_id,batch_id,artifact_id,snapshot_hash,archived_at FROM audit_archive_memberships WHERE tenant_id='tenant-a' AND run_id=$1 ORDER BY event_id",
      [id]
    )
  ).rows
  const events = (
    await db.query(
      "SELECT id,run_id,batch_id,action,actor_id,trace_id,detail,created_at FROM audit_archive_events WHERE tenant_id='tenant-a' AND run_id=$1 ORDER BY created_at,id",
      [id]
    )
  ).rows
  return { run: run[0], candidates, batches, artifacts, memberships, events }
}

const lockRetainedByteRows = async (db) => {
  await db.query(
    'SELECT u.tenant_id,u.id FROM file_uploads u WHERE EXISTS(SELECT 1 FROM file_parts p WHERE p.tenant_id=u.tenant_id AND p.upload_id=u.id) ORDER BY u.tenant_id,u.id FOR SHARE OF u'
  )
  await db.query(
    "SELECT tenant_id,id FROM stored_files WHERE status<>'deleted' ORDER BY tenant_id,id FOR SHARE"
  )
  await db.query(
    'SELECT tenant_id,upload_id,part_index FROM file_parts ORDER BY tenant_id,upload_id,part_index FOR SHARE'
  )
  await db.query(
    'SELECT tenant_id,id FROM report_export_jobs WHERE retention_until>clock_timestamp() ORDER BY tenant_id,id FOR SHARE'
  )
  await db.query(
    'SELECT tenant_id,id FROM report_export_artifacts WHERE purged_at IS NULL ORDER BY tenant_id,id FOR SHARE'
  )
  await db.query(
    'SELECT tenant_id,id FROM audit_export_jobs WHERE bytes_purged_at IS NULL ORDER BY tenant_id,id FOR SHARE'
  )
  await db.query(
    'SELECT tenant_id,id FROM audit_export_artifacts WHERE purged_at IS NULL ORDER BY tenant_id,id FOR SHARE'
  )
  // Retention cleanup locks run -> batch -> artifact. The backup holds the same
  // order through byte copy; generic GC must retain both unpurged reservations
  // and artifacts in its live-key union.
  await db.query(
    'SELECT r.tenant_id,r.id FROM audit_archive_runs r WHERE EXISTS(SELECT 1 FROM audit_archive_batches b WHERE b.tenant_id=r.tenant_id AND b.run_id=r.id AND b.bytes_purged_at IS NULL) ORDER BY r.tenant_id,r.id FOR SHARE OF r'
  )
  await db.query(
    'SELECT tenant_id,id FROM audit_archive_batches WHERE bytes_purged_at IS NULL ORDER BY tenant_id,id FOR SHARE'
  )
  await db.query(
    'SELECT tenant_id,id FROM audit_archive_artifacts WHERE purged_at IS NULL ORDER BY tenant_id,id FOR SHARE'
  )
}

const retainedByteReferences = async (db) => {
  const result = []
  const add = (kind, rows, reservedOnly = false) =>
    rows.forEach((row) =>
      result.push({
        ...row,
        kind,
        reservedOnly,
        size: row.size === null ? null : Number(row.size),
      })
    )
  add(
    'stored-file',
    (
      await db.query(
        "SELECT tenant_id,id,object_key,size,sha256,status FROM stored_files WHERE status<>'deleted' ORDER BY tenant_id,id"
      )
    ).rows
  )
  add(
    'file-part',
    (
      await db.query(
        'SELECT tenant_id,upload_id AS id,part_index,object_key,size,sha256 FROM file_parts ORDER BY tenant_id,upload_id,part_index'
      )
    ).rows
  )
  add(
    'report-job-reservation',
    (
      await db.query(
        'SELECT tenant_id,id,object_key,NULL::integer AS size,NULL::text AS sha256,status FROM report_export_jobs WHERE retention_until>clock_timestamp() ORDER BY tenant_id,id'
      )
    ).rows,
    true
  )
  add(
    'report-artifact',
    (
      await db.query(
        'SELECT tenant_id,id,object_key,size,sha256,status FROM report_export_artifacts WHERE purged_at IS NULL ORDER BY tenant_id,id'
      )
    ).rows
  )
  add(
    'audit-export-reservation',
    (
      await db.query(
        'SELECT tenant_id,id,object_key,NULL::integer AS size,NULL::text AS sha256,status FROM audit_export_jobs WHERE bytes_purged_at IS NULL ORDER BY tenant_id,id'
      )
    ).rows,
    true
  )
  add(
    'audit-export-artifact',
    (
      await db.query(
        'SELECT tenant_id,id,object_key,size,sha256,status FROM audit_export_artifacts WHERE purged_at IS NULL ORDER BY tenant_id,id'
      )
    ).rows
  )
  add(
    'audit-archive-batch-reservation',
    (
      await db.query(
        'SELECT tenant_id,id,object_key,NULL::integer AS size,NULL::text AS sha256,status FROM audit_archive_batches WHERE bytes_purged_at IS NULL ORDER BY tenant_id,id'
      )
    ).rows,
    true
  )
  add(
    'audit-archive-artifact',
    (
      await db.query(
        'SELECT tenant_id,id,object_key,size,sha256,status,scan_engine FROM audit_archive_artifacts WHERE purged_at IS NULL ORDER BY tenant_id,id'
      )
    ).rows
  )
  return result
}

const groupReferences = (references) => {
  const grouped = new Map()
  references.forEach((reference) => {
    assert.match(reference.object_key, /^[a-f0-9]{64}$/)
    const group = grouped.get(reference.object_key) || []
    const exact = group.filter((owner) => !owner.reservedOnly)
    if (!reference.reservedOnly && exact.length) {
      assert.equal(reference.size, exact[0].size)
      assert.equal(reference.sha256, exact[0].sha256)
    }
    group.push(reference)
    grouped.set(reference.object_key, group)
  })
  return grouped
}

const byteIdentity = (item) =>
  JSON.stringify([
    item.tenant_id,
    item.id,
    item.object_key,
    Number(item.size),
    item.sha256,
  ])

const historicMissingReferences = async () => {
  assert.equal(
    await fileHash(HISTORIC_MISSING_REFERENCE),
    HISTORIC_MISSING_REFERENCE_SHA256
  )
  const reference = JSON.parse(
    await readFile(HISTORIC_MISSING_REFERENCE, 'utf8')
  )
  assert.equal(reference.missingExistingFiles.length, 41)
  const items = reference.missingExistingFiles.map((item) => {
    assert.equal(item.kind, 'stored-file')
    assert.equal(item.reason, 'source-byte-object-missing')
    assert.match(item.object_key, /^[a-f0-9]{64}$/)
    assert.match(item.sha256, /^[a-f0-9]{64}$/)
    return {
      tenant_id: item.tenant_id,
      id: item.id,
      object_key: item.object_key,
      size: item.size,
      sha256: item.sha256,
      referenceStatus: item.status,
    }
  })
  assert.equal(new Set(items.map(byteIdentity)).size, 41)
  return items.sort((left, right) =>
    byteIdentity(left).localeCompare(byteIdentity(right))
  )
}

const policyState = async (db) => {
  const { rows } = await db.query(
    "SELECT tenant_id,revision,enabled,hot_days,time_zone,executor_id,updated_at,last_run_id,next_run_at FROM audit_retention_policies WHERE tenant_id='tenant-a'"
  )
  assert.ok(rows.length <= 1)
  if (rows.length) assert.equal(rows[0].enabled, false)
  return rows
}

const targetAuthorityState = async (db) => {
  const membership = (
    await db.query(
      "SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'"
    )
  ).rows[0]
  const required = [
    'audit:retention:manage',
    'audit:read',
    'audit:export:create',
    'audit:export:archive',
    'audit:export:download',
  ]
  required.forEach((permission) =>
    assert.ok(membership.permissions.includes(permission))
  )
  const roleId = `audit-retention-recovery-${runKey}`
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      "INSERT INTO roles(tenant_id,id,role_name,role_key,role_sort,status,remark) VALUES('tenant-a',$1,'Target recovery authority',$2,0,'enabled','temporary target-only recovery control')",
      [roleId, `audit-retention-recovery-${runKey}`]
    )
    await client.query(
      "INSERT INTO role_permissions(tenant_id,role_id,permission_code) SELECT 'tenant-a',$1,code FROM unnest($2::text[]) code",
      [roleId, required]
    )
    await client.query(
      'INSERT INTO role_member_scopes(tenant_id,role_id,data_scope,field_permissions) VALUES(\'tenant-a\',$1,\'all\',\'["username","name","role"]\'::jsonb)',
      [roleId]
    )
    await client.query(
      "INSERT INTO member_roles(tenant_id,user_id,role_id) VALUES('tenant-a','a-admin',$1)",
      [roleId]
    )
    await client.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",
      [
        JSON.stringify(
          membership.permissions.filter(
            (permission) => !required.includes(permission)
          )
        ),
      ]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return { membership, roleId }
}

const revokeTargetFields = async (db, state) => {
  await db.query(
    "UPDATE role_member_scopes SET field_permissions='[]'::jsonb WHERE tenant_id='tenant-a' AND role_id=$1",
    [state.roleId]
  )
}

const restoreTargetFields = async (db, state) => {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",
      [JSON.stringify(state.membership.permissions)]
    )
    await client.query(
      "DELETE FROM member_roles WHERE tenant_id='tenant-a' AND user_id='a-admin' AND role_id=$1",
      [state.roleId]
    )
    await client.query(
      "DELETE FROM role_member_scopes WHERE tenant_id='tenant-a' AND role_id=$1",
      [state.roleId]
    )
    await client.query(
      "DELETE FROM role_permissions WHERE tenant_id='tenant-a' AND role_id=$1",
      [state.roleId]
    )
    await client.query(
      "DELETE FROM roles WHERE tenant_id='tenant-a' AND id=$1",
      [state.roleId]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

try {
  await mkdir(runRoot, { recursive: true, mode: 0o700 })
  await progress()
  const envFileArgument = process.execArgv.find((argument) =>
    /^--env-file(?:-if-exists)?=.+$/u.test(argument)
  )
  assert.ok(
    envFileArgument && envFileArgument.split('=').slice(1).join('=').trim(),
    `Invoke this protected verifier with: ${usage}`
  )
  assert.equal(process.env.APP_MODE, 'demo')
  assert.equal(process.env.R1_API_URL, SOURCE_ORIGIN)
  sourceUrl = new URL(process.env.DATABASE_URL || '')
  assert.equal(decodeURIComponent(sourceUrl.pathname.slice(1)), SOURCE_DATABASE)
  assert.notEqual(SOURCE_DATABASE, 'af_admin_r1')
  assert.equal(sourceUrl.hostname, '127.0.0.1')
  assert.equal(sourceUrl.port, '15438')
  assert.ok(['postgres:', 'postgresql:'].includes(sourceUrl.protocol))
  assert.ok(sourceUrl.username)
  assert.equal(sourceUrl.search, '')
  assert.equal(sourceUrl.hash, '')
  assert.equal(POSTGRES_CONTAINER, 'af-admin-r1-postgres')
  assert.match(targetName, /^af_ar_[a-f0-9]{32}_demo$/)
  assert.equal(Buffer.byteLength(targetName, 'utf8'), 43)
  assert.ok(
    Buffer.byteLength(targetName, 'utf8') <= 63,
    'Recovery database name must survive PostgreSQL identifier storage without truncation'
  )
  assert.notEqual(targetName, SOURCE_DATABASE)
  assert.equal(path.dirname(runRoot), EVIDENCE_ROOT)
  assert.equal(path.basename(runRoot), runId)
  assert.equal(path.dirname(dumpPath), runRoot)
  assert.ok(process.env.FILE_STORAGE_DIR)
  sourceFileRoot = await realpath(process.env.FILE_STORAGE_DIR)
  const backupDirectory = path.join(runRoot, 'object-backup')
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 })
  backupRoot = await realpath(backupDirectory)
  restoreRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), 'af-audit-retention-restore-'))
  )
  assert.equal(path.dirname(restoreRoot), await realpath(tmpdir()))
  assert.match(
    path.basename(restoreRoot),
    /^af-audit-retention-restore-[A-Za-z0-9]+$/
  )
  assertIndependentRoots(sourceFileRoot, backupRoot)
  assertIndependentRoots(sourceFileRoot, restoreRoot)
  assertIndependentRoots(backupRoot, restoreRoot)
  const originalStore = new LocalObjectStore(sourceFileRoot)
  const backupStore = new LocalObjectStore(backupRoot)
  const restoredStore = new LocalObjectStore(restoreRoot)

  source = new Pool({
    connectionString: sourceUrl.toString(),
    connectionTimeoutMillis: 5000,
    statement_timeout: 60000,
  })
  source.on('error', (error) => {
    validationFailure ||= error
    uncertainOperations.add('pool:source-background-error')
  })
  assert.equal(
    (await source.query('SELECT current_database() AS name')).rows[0].name,
    SOURCE_DATABASE
  )
  await verifyMigrationReadiness(source)
  await publicTables(source)
  await migrationFacts(source)
  const ready = await fetch(`${SOURCE_ORIGIN}/ready`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(ready.status, 200)
  const runtime = await fetch(`${SOURCE_ORIGIN}/api/runtime-context`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(runtime.status, 200)
  assert.equal((await runtime.json()).data.mode, 'demo')
  const originalPolicy = await policyState(source)
  const witnessFormats = ['csv', 'xlsx', 'pdf']
  const witnesses = []
  const sourceDownloadBytes = new Map()

  await advance('three-distinct-source-login-facts-and-archive-witnesses')
  await sequence(witnessFormats, async (format) => {
    const identity = await freshLogin()
    assert.ok(
      !witnesses.some((item) => item.identity.traceId === identity.traceId)
    )
    const created = await createRun(identity, format, 'witness')
    const completed = await waitCompletedRun(created, identity, format)
    const batch = await runBatches(SOURCE_ORIGIN, completed.id)
    assert.equal(batch.candidateRange.firstOrdinal, 1)
    assert.equal(batch.candidateRange.lastOrdinal, 1)
    assert.equal(batch.candidateTotal, 1)
    assert.equal(batch.artifact.format, format)
    assert.equal(
      Date.parse(batch.artifact.expiresAt) -
        Date.parse(batch.artifact.createdAt),
      365 * 24 * 60 * 60 * 1000
    )
    const bytes = await downloadBatch(SOURCE_ORIGIN, completed, batch)
    sourceDownloadBytes.set(completed.id, bytes)
    const queries = await assertArchiveQueries(
      SOURCE_ORIGIN,
      identity.traceId,
      true
    )
    const semantic = await semanticRun(source, completed.id)
    assert.equal(semantic.candidates.length, 1)
    assert.equal(semantic.memberships.length, 1)
    assert.equal(semantic.memberships[0].event_id, identity.eventId)
    assert.equal(semantic.artifacts.length, 1)
    assert.ok(semantic.events.length >= 4)
    assertArchiveProvenance(
      format,
      bytes,
      completed,
      batch,
      semantic,
      identity.eventId
    )
    witnesses.push({ identity, run: completed, batch, queries, semantic })
  })

  await advance('fourth-owned-queued-continuation')
  const pendingIdentity = await freshLogin()
  assert.ok(
    !witnesses.some((item) => item.identity.traceId === pendingIdentity.traceId)
  )
  const pendingCreated = await createRun(pendingIdentity, 'csv', 'continuation')
  sourcePendingRun = pendingCreated
  const pendingLocked = await delayOwnedPendingRun(pendingCreated)
  assert.equal(pendingLocked.run.candidate_total, 1)
  assert.equal(pendingLocked.batch.first_ordinal, 1)
  assert.equal(pendingLocked.batch.last_ordinal, 1)
  const pendingSourceQueries = await assertArchiveQueries(
    SOURCE_ORIGIN,
    pendingIdentity.traceId,
    false
  )
  const sourceSessionHash = jsonHash(await sessionBinding(source))
  const finalTokenHash = digest(token)
  await sequence(witnesses, async (witness) => {
    const visible = await apiCall(
      SOURCE_ORIGIN,
      `/audit/archive-runs/${witness.run.id}`
    )
    assert.equal(visible.restricted, false)
    assert.equal(visible.executor.id, 'a-admin')
    const batch = await runBatches(SOURCE_ORIGIN, visible.id)
    assert.equal(batch.restricted, false)
    assert.equal(batch.artifact.sha256, witness.batch.artifact.sha256)
  })
  const sourceSemantics = {}
  await sequence(
    [...witnesses.map((item) => item.run.id), pendingCreated.id],
    async (id) => {
      sourceSemantics[id] = await semanticRun(source, id)
    }
  )

  await advance('locked-repeatable-snapshot-dump-and-all-byte-copy')
  const expectedHistoricMissingReferences = await historicMissingReferences()
  const expectedHistoricMissingIdentities = new Set(
    expectedHistoricMissingReferences.map(byteIdentity)
  )
  const snapshot = await source.connect()
  const dump = await open(dumpPath, 'wx', 0o600)
  const dumpLog = await open(path.join(runRoot, 'dump.log'), 'wx', 0o600)
  let tables
  let sourceFingerprints
  let migrationChecksums
  let references
  const copiedObjects = []
  const absentReservedObjects = []
  const missingExistingFiles = []
  try {
    await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    await snapshot.query("SET LOCAL statement_timeout='180000ms'")
    await lockRetainedByteRows(snapshot)
    tables = await publicTables(snapshot)
    sourceFingerprints = await tableFingerprints(snapshot, tables)
    migrationChecksums = await migrationFacts(snapshot)
    references = await retainedByteReferences(snapshot)
    const grouped = groupReferences(references)
    const snapshotId = (
      await snapshot.query('SELECT pg_export_snapshot() AS id')
    ).rows[0].id
    await writeFile(
      path.join(runRoot, 'object-manifest.json'),
      JSON.stringify(
        {
          status: 'planned',
          rowLocksHeld: true,
          references,
          copiedObjects,
          absentReservedObjects,
          missingExistingFiles,
        },
        null,
        2
      ),
      { mode: 0o600 }
    )
    await runDocker(
      'pg_dump',
      [
        '-Fc',
        '--no-owner',
        '--no-acl',
        '--no-password',
        '-U',
        decodeURIComponent(sourceUrl.username),
        '-d',
        SOURCE_DATABASE,
        '--snapshot',
        snapshotId,
      ],
      ['ignore', dump.fd, dumpLog.fd]
    )
    await sequence(Array.from(grouped.entries()), async ([key, owners]) => {
      const exact = owners.filter((owner) => !owner.reservedOnly)
      let bytes
      try {
        bytes = await originalStore.get(key)
      } catch (error) {
        if (error.businessCode !== 'STORAGE_UNAVAILABLE') throw error
        if (!exact.length) {
          absentReservedObjects.push({
            objectKey: key,
            references: owners,
            reason: 'reserved-key-has-no-byte-object',
          })
          return
        }
        if (
          !exact.every(
            (owner) =>
              owner.kind === 'stored-file' &&
              expectedHistoricMissingIdentities.has(byteIdentity(owner))
          )
        )
          throw new Error(`New required source byte is missing for ${key}`)
        missingExistingFiles.push(
          ...exact.map((owner) => ({
            ...owner,
            reason: 'exact-reviewed-historic-source-byte-missing',
          }))
        )
        return
      }
      if (exact.length) {
        assert.equal(bytes.length, exact[0].size)
        assert.equal(fileDigest(bytes), exact[0].sha256)
        exact
          .filter((owner) => owner.kind === 'audit-archive-artifact')
          .forEach((owner) =>
            assert.ok(owner.scan_engine.startsWith('ClamAV '))
          )
      }
      await backupStore.put(bytes, key)
      const saved = await backupStore.get(key)
      assert.deepEqual(saved, bytes)
      await restoredStore.put(saved, key)
      assert.deepEqual(await restoredStore.get(key), bytes)
      copiedObjects.push({
        objectKey: key,
        size: bytes.length,
        sha256: fileDigest(bytes),
        references: owners,
      })
    })
    assert.deepEqual(
      missingExistingFiles.map(byteIdentity).sort(),
      expectedHistoricMissingReferences.map(byteIdentity).sort()
    )
    await snapshot.query('COMMIT')
  } catch (error) {
    await snapshot.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    snapshot.release()
    await dump.close()
    await dumpLog.close()
  }
  await writeFile(
    path.join(runRoot, 'object-manifest.json'),
    JSON.stringify(
      {
        status: 'copied-under-source-row-locks',
        references,
        copiedObjects,
        absentReservedObjects,
        missingExistingFiles,
      },
      null,
      2
    ),
    { mode: 0o600 }
  )
  const dumpInfo = await stat(dumpPath)
  assert.ok(dumpInfo.size > 5)
  const dumpHeader = await open(dumpPath, 'r')
  try {
    const magic = Buffer.alloc(5)
    assert.equal((await dumpHeader.read(magic, 0, 5, 0)).bytesRead, 5)
    assert.equal(magic.toString(), 'PGDMP')
  } finally {
    await dumpHeader.close()
  }
  const dumpSha256 = await fileHash(dumpPath)

  await advance('confirmed-random-target-create-and-restore')
  assert.equal(
    (
      await source.query(
        'SELECT count(*)::int AS total FROM pg_database WHERE datname=$1',
        [targetName]
      )
    ).rows[0].total,
    0
  )
  targetCreationAttempted = true
  uncertainOperations.add(`database-create:${targetName}`)
  await source.query(`CREATE DATABASE ${targetName}`)
  assert.equal(
    (
      await source.query(
        'SELECT count(*)::int AS total FROM pg_database WHERE datname=$1',
        [targetName]
      )
    ).rows[0].total,
    1
  )
  targetCreated = true
  uncertainOperations.delete(`database-create:${targetName}`)
  const restoreLog = await open(path.join(runRoot, 'restore.log'), 'wx', 0o600)
  try {
    await runDocker(
      'pg_restore',
      [
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '--no-password',
        '-U',
        decodeURIComponent(sourceUrl.username),
        '-d',
        targetName,
      ],
      ['pipe', 'ignore', restoreLog.fd],
      dumpPath
    )
  } finally {
    await restoreLog.close()
  }
  const targetUrl = new URL(sourceUrl)
  targetUrl.pathname = `/${targetName}`
  restored = new Pool({
    connectionString: targetUrl.toString(),
    connectionTimeoutMillis: 5000,
    statement_timeout: 60000,
  })
  restored.on('error', (error) => {
    validationFailure ||= error
    uncertainOperations.add('pool:target-background-error')
  })
  assert.equal(
    (await restored.query('SELECT current_database() AS name')).rows[0].name,
    targetName
  )
  await verifyMigrationReadiness(restored)
  assert.deepEqual(await publicTables(restored), tables)
  assert.deepEqual(await migrationFacts(restored), migrationChecksums)
  assert.deepEqual(
    await tableFingerprints(restored, tables),
    sourceFingerprints
  )
  assert.deepEqual(await policyState(restored), originalPolicy)
  await sequence(Object.entries(sourceSemantics), async ([id, expected]) => {
    assert.deepEqual(await semanticRun(restored, id), expected)
  })

  await advance('restored-original-session-witness-downloads-and-queries')
  const listenMarker = `target-server-listen:${runKey}`
  uncertainOperations.add(listenMarker)
  targetServer = createServer(restored, noFault, { storageRoot: restoreRoot })
  const targetOrigin = await targetServer.listen({
    host: '127.0.0.1',
    port: 0,
  })
  uncertainOperations.delete(listenMarker)
  assert.equal(digest(token), finalTokenHash)
  assert.equal(jsonHash(await sessionBinding(restored)), sourceSessionHash)
  const restoredUser = await apiCall(targetOrigin, '/user/info')
  assert.equal(restoredUser.id, 'a-admin')
  assert.equal(restoredUser.tenantId, 'tenant-a')
  const restoredWitnesses = []
  await sequence(witnesses, async (witness) => {
    const run = await apiCall(
      targetOrigin,
      `/audit/archive-runs/${witness.run.id}`
    )
    assert.equal(run.restricted, false)
    assert.deepEqual(run.coverage, witness.run.coverage)
    const batch = await runBatches(targetOrigin, run.id)
    assert.equal(batch.snapshotHash, witness.batch.snapshotHash)
    assert.equal(batch.artifact.sha256, witness.batch.artifact.sha256)
    const bytes = await downloadBatch(targetOrigin, run, batch)
    assert.deepEqual(bytes, sourceDownloadBytes.get(run.id))
    const dbBatch = sourceSemantics[run.id].batches[0]
    assert.deepEqual(bytes, await backupStore.get(dbBatch.object_key))
    assert.deepEqual(bytes, await restoredStore.get(dbBatch.object_key))
    const queries = await assertArchiveQueries(
      targetOrigin,
      witness.identity.traceId,
      true
    )
    restoredWitnesses.push({
      runId: run.id,
      batchId: batch.id,
      format: run.format,
      candidateHash: run.candidateHash,
      snapshotHash: batch.snapshotHash,
      candidateRange: batch.candidateRange,
      artifactId: batch.artifact.id,
      size: bytes.length,
      sha256: fileDigest(bytes),
      scanEngine: batch.artifact.scanEngine,
      queries,
    })
  })

  await advance('target-only-current-field-revocation-and-restoration')
  const authorityMarker = `target-authority-mutation:${runKey}`
  uncertainOperations.add(authorityMarker)
  const authority = await targetAuthorityState(restored)
  const roleBacked = await apiCall(
    targetOrigin,
    `/audit/archive-runs/${witnesses[0].run.id}`
  )
  assert.equal(roleBacked.restricted, false)
  assert.equal(roleBacked.coverage.candidateTotal, 1)
  await revokeTargetFields(restored, authority)
  const restricted = await apiCall(
    targetOrigin,
    `/audit/archive-runs/${witnesses[0].run.id}`
  )
  assert.equal(restricted.restricted, true)
  assert.equal(restricted.query, null)
  assert.equal(restricted.coverage.candidateTotal, null)
  await restoreTargetFields(restored, authority)
  const restoredAccess = await apiCall(
    targetOrigin,
    `/audit/archive-runs/${witnesses[0].run.id}`
  )
  assert.equal(restoredAccess.restricted, false)
  assert.equal(restoredAccess.coverage.candidateTotal, 1)
  uncertainOperations.delete(authorityMarker)

  await advance('target-exact-owned-continuation-once')
  const pendingBefore = await semanticRun(restored, pendingCreated.id)
  assert.equal(pendingBefore.run.status, 'queued')
  assert.equal(pendingBefore.candidates.length, 1)
  assert.equal(pendingBefore.batches.length, 1)
  assert.equal(pendingBefore.artifacts.length, 0)
  assert.equal(pendingBefore.memberships.length, 0)
  const dueMarker = `target-archive-due:${pendingCreated.id}`
  uncertainOperations.add(dueMarker)
  const dueClient = await restored.connect()
  try {
    await dueClient.query('BEGIN')
    await dueClient.query(
      "SELECT id FROM audit_archive_runs WHERE tenant_id='tenant-a' AND id=$1 FOR UPDATE",
      [pendingCreated.id]
    )
    await dueClient.query(
      "SELECT id FROM audit_archive_batches WHERE tenant_id='tenant-a' AND run_id=$1 FOR UPDATE",
      [pendingCreated.id]
    )
    await dueClient.query(
      "UPDATE audit_archive_runs SET next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id='tenant-a' AND id=$1 AND status='queued' AND attempts=0",
      [pendingCreated.id]
    )
    await dueClient.query(
      "UPDATE audit_archive_batches SET next_attempt_at=clock_timestamp() WHERE tenant_id='tenant-a' AND run_id=$1 AND status='queued' AND attempts=0",
      [pendingCreated.id]
    )
    await dueClient.query('COMMIT')
    uncertainOperations.delete(dueMarker)
  } catch (error) {
    await dueClient.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    dueClient.release()
  }
  const processMarker = `target-archive-process:${pendingCreated.id}`
  uncertainOperations.add(processMarker)
  assert.equal(
    await processAuditRetention(
      restored,
      { storageRoot: restoreRoot },
      noFault,
      1,
      { tenantId: 'tenant-a', runIds: [pendingCreated.id] }
    ),
    1
  )
  uncertainOperations.delete(processMarker)
  const pendingCompleted = await apiCall(
    targetOrigin,
    `/audit/archive-runs/${pendingCreated.id}`
  )
  assert.equal(pendingCompleted.status, 'completed')
  assert.deepEqual(pendingCompleted.coverage, {
    candidateTotal: 1,
    coveredTotal: 1,
    remainingTotal: 0,
    batchTotal: 1,
    completedBatchTotal: 1,
  })
  const pendingBatch = await runBatches(targetOrigin, pendingCreated.id)
  const pendingBytes = await downloadBatch(
    targetOrigin,
    pendingCompleted,
    pendingBatch
  )
  assert.ok(pendingBatch.artifact.scanEngine.startsWith('ClamAV '))
  const pendingAfterDownload = await semanticRun(restored, pendingCreated.id)
  assert.equal(pendingAfterDownload.memberships.length, 1)
  assert.equal(
    pendingAfterDownload.memberships[0].event_id,
    pendingIdentity.eventId
  )
  assert.equal(pendingAfterDownload.artifacts.length, 1)
  assert.equal(pendingAfterDownload.batches[0].status, 'completed')
  assert.equal(
    fileDigest(pendingBytes),
    pendingAfterDownload.artifacts[0].sha256
  )
  const repeatMarker = `target-archive-repeat:${pendingCreated.id}`
  uncertainOperations.add(repeatMarker)
  assert.equal(
    await processAuditRetention(
      restored,
      { storageRoot: restoreRoot },
      noFault,
      1,
      { tenantId: 'tenant-a', runIds: [pendingCreated.id] }
    ),
    0
  )
  uncertainOperations.delete(repeatMarker)
  assert.deepEqual(
    await semanticRun(restored, pendingCreated.id),
    pendingAfterDownload
  )
  const targetPendingQueries = await assertArchiveQueries(
    targetOrigin,
    pendingIdentity.traceId,
    true
  )
  const sourcePendingSemantic = await semanticRun(source, pendingCreated.id)
  assert.equal(sourcePendingSemantic.run.status, 'queued')
  assert.equal(sourcePendingSemantic.memberships.length, 0)
  assert.equal(sourcePendingSemantic.artifacts.length, 0)
  assert.deepEqual(
    await assertArchiveQueries(SOURCE_ORIGIN, pendingIdentity.traceId, false),
    pendingSourceQueries
  )

  await advance('source-raw-facts-and-policy-unchanged')
  await sequence(
    [...witnesses.map((item) => item.identity), pendingIdentity],
    async (identity) => {
      const { rows } = await source.query(
        "SELECT * FROM audit_events WHERE tenant_id='tenant-a' AND id=$1",
        [identity.eventId]
      )
      assert.equal(rows.length, 1)
      assert.equal(jsonHash(rows[0]), identity.rawFactHash)
    }
  )
  assert.deepEqual(await policyState(source), originalPolicy)

  await advance('verified-awaiting-confirmed-cleanup')
  reportData = {
    version: 1,
    status: 'verified-awaiting-cleanup',
    verifiedAt: new Date().toISOString(),
    runId,
    scope,
    caveat,
    method:
      'repeatable-read exported pg_dump snapshot with upload/file and archive run/batch/artifact locks held through actual object-byte copy',
    sourceDatabase: SOURCE_DATABASE,
    targetDatabase: targetName,
    tableCount: tables.length,
    tableFingerprintsMatch: true,
    migrationCount: migrationChecksums.length,
    migrationChecksumsMatch: true,
    dumpBytes: dumpInfo.size,
    dumpSha256,
    dumpFormat: 'PGDMP custom archive',
    preservedFinalOriginalSession: true,
    copiedObjectCount: copiedObjects.length,
    copiedObjectBytes: copiedObjects.reduce(
      (total, object) => total + object.size,
      0
    ),
    referenceCounts: references.reduce((counts, reference) => {
      counts[reference.kind] = (counts[reference.kind] || 0) + 1
      return counts
    }, {}),
    absentReservedObjects,
    missingExistingFiles,
    exactHistoricMissingTuplesMatched: true,
    historicMissingReferenceStatuses: expectedHistoricMissingReferences.map(
      (item) => ({
        tenantId: item.tenant_id,
        id: item.id,
        referenceStatus: item.referenceStatus,
      })
    ),
    witnessRuns: restoredWitnesses,
    sourceWitnessRunsRetained: witnesses.map((item) => item.run.id),
    sourcePendingRunId: pendingCreated.id,
    sourcePendingStayedQueuedUntilCleanup: true,
    targetContinuation: {
      runId: pendingCreated.id,
      batchId: pendingBatch.id,
      candidateHash: pendingCompleted.candidateHash,
      snapshotHash: pendingBatch.snapshotHash,
      candidateRange: pendingBatch.candidateRange,
      artifactId: pendingBatch.artifact.id,
      membershipEventId: pendingIdentity.eventId,
      size: pendingBytes.length,
      sha256: fileDigest(pendingBytes),
      scanEngine: pendingBatch.artifact.scanEngine,
      processedExactlyOnce: true,
    },
    sourcePolicyRemainedDisabled: true,
    rawAuditFactsUnchanged: true,
    targetFieldRevocationAndRestorationVerified: true,
    sourceQueries: witnesses.map((item) => item.queries),
    targetPendingQueries,
    objectManifest: path.join(runRoot, 'object-manifest.json'),
    privateEvidenceDirectory: runRoot,
  }
} catch (error) {
  validationFailure = error
} finally {
  const cleanup = async (run, uncertaintyMarker) => {
    try {
      if (uncertaintyMarker) uncertainOperations.add(uncertaintyMarker)
      await run()
      if (uncertaintyMarker) uncertainOperations.delete(uncertaintyMarker)
    } catch (error) {
      cleanupFailures.push(error)
    }
  }
  await sequence(Array.from(children), async (child) => {
    const marker = `child-stop:${child.pid || 'unknown'}:${runKey}`
    uncertainOperations.add(marker)
    try {
      await stopChild(child)
      uncertainOperations.delete(marker)
    } catch (error) {
      cleanupFailures.push(error)
    }
  })
  await cleanup(
    recoverSourceRunIntents,
    `source-run-intent-discovery:${runKey}`
  )
  if (source && sourceWitnessRuns.size)
    await cleanup(async () => {
      const { rows } = await source.query(
        "SELECT r.id,r.status,r.completed_at,(SELECT count(*)::int FROM audit_archive_memberships m WHERE m.tenant_id=r.tenant_id AND m.run_id=r.id) AS memberships,(SELECT count(*)::int FROM audit_archive_artifacts a JOIN audit_archive_batches b ON b.tenant_id=a.tenant_id AND b.id=a.batch_id WHERE b.tenant_id=r.tenant_id AND b.run_id=r.id AND a.status='ready' AND a.purged_at IS NULL AND a.expires_at>clock_timestamp()) AS artifacts FROM audit_archive_runs r WHERE r.tenant_id='tenant-a' AND r.id=ANY($1::text[]) ORDER BY r.id",
        [Array.from(sourceWitnessRuns)]
      )
      assert.equal(rows.length, sourceWitnessRuns.size)
      rows.forEach((row) => {
        assert.equal(row.status, 'completed')
        assert.equal(row.memberships, 1)
        assert.equal(row.artifacts, 1)
        sourceCleanup.push({
          id: row.id,
          purpose: 'completed-format-witness',
          finalStatus: row.status,
          logicalMembershipsRetainedPermanently: row.memberships,
          liveArtifactsRetainedFor365DayLifecycle: row.artifacts,
        })
      })
    })
  if (!sourceFixtureRace && token)
    await sequence(Array.from(sourceContinuationRuns), async (id) => {
      await cleanup(async () => {
        const current = await apiCall(
          SOURCE_ORIGIN,
          `/audit/archive-runs/${id}`
        )
        if (['queued', 'processing'].includes(current.status)) {
          const key = randomUUID()
          await apiCall(SOURCE_ORIGIN, `/audit/archive-runs/${id}/cancel`, {
            method: 'POST',
            key,
            mutationMarker: `audit-archive-cancel:${id}:${key}`,
            body: { version: 1, expectedRevision: current.revision },
          })
          const cancelled = await apiCall(
            SOURCE_ORIGIN,
            `/audit/archive-runs/${id}`
          )
          assert.equal(cancelled.status, 'cancelled')
          const facts = await semanticRun(source, id)
          assert.equal(facts.artifacts.length, 0)
          assert.equal(facts.memberships.length, 0)
          sourceCleanup.push({
            id,
            purpose: 'queued-continuation',
            previousStatus: current.status,
            finalStatus: cancelled.status,
          })
          if (id === sourcePendingRun?.id) sourcePendingCancelled = true
        } else {
          sourceFixtureRace = true
          uncertainOperations.add(`source-retention-race:${id}`)
          sourceCleanup.push({
            id,
            purpose: 'queued-continuation',
            finalStatus: current.status,
            retained: true,
          })
          throw new Error(
            'Owned source continuation reached an unexpected terminal state and was retained'
          )
        }
      })
    })
  if (targetServer)
    await cleanup(() => targetServer.close(), `target-server-close:${runKey}`)
  if (restored)
    await cleanup(() => restored.end(), `target-pool-close:${runKey}`)
  if (
    !sourceFixtureRace &&
    !uncertainOperations.size &&
    targetCreated &&
    source
  )
    await cleanup(async () => {
      await source.query(`DROP DATABASE ${targetName}`)
      assert.equal(
        (
          await source.query(
            'SELECT count(*)::int AS total FROM pg_database WHERE datname=$1',
            [targetName]
          )
        ).rows[0].total,
        0
      )
      targetRemoved = true
    }, `database-drop:${targetName}`)
  if (
    !sourceFixtureRace &&
    !uncertainOperations.size &&
    (!targetCreationAttempted || targetRemoved) &&
    restoreRoot
  )
    await cleanup(async () => {
      await rm(restoreRoot, { recursive: true, force: true })
      await assert.rejects(
        stat(restoreRoot),
        (error) => error?.code === 'ENOENT'
      )
      restoreStoreRemoved = true
    }, `restore-store-remove:${restoreRoot}`)
  // This final control-pool close is after confirmed temporary target cleanup.
  // Its failure fails the report but cannot recreate already removed targets.
  if (source) await cleanup(() => source.end())
}

if (
  validationFailure ||
  cleanupFailures.length ||
  sourceFixtureRace ||
  uncertainOperations.size ||
  !targetRemoved ||
  !restoreStoreRemoved ||
  !sourcePendingCancelled
) {
  const failed = {
    version: 1,
    status: 'failed',
    failedAt: new Date().toISOString(),
    stage,
    error: safeError(validationFailure || cleanupFailures[0]),
    cleanupFailures: cleanupFailures.map(safeError),
    uncertainOperations: [...uncertainOperations],
    scope,
    caveat,
    runId,
    sourceDatabase: SOURCE_DATABASE,
    targetDatabase: targetName,
    targetCreationAttempted,
    targetCreated,
    targetRemoved,
    restoreStoreRemoved,
    sourceFixtureRace,
    sourcePendingRunId: sourcePendingRun?.id || null,
    sourcePendingCancelled,
    sourceCleanup,
    sourceRunIntents,
    retainedRecoveryDatabase: targetCreated && !targetRemoved,
    retainedRecoveryStore: !!restoreRoot && !restoreStoreRemoved,
    privateEvidenceDirectory: runRoot,
  }
  await writeReport(failed)
  await writeFile(
    path.join(runRoot, 'failure.json'),
    JSON.stringify(failed, null, 2),
    { mode: 0o600 }
  )
  throw new Error(
    `Audit retention recovery failed at ${stage}; uncertain recovery targets and raced source witnesses are retained`
  )
}

reportData.status = 'verified'
reportData.restoredDatabaseRemoved = targetRemoved
reportData.restoredStoreRemoved = restoreStoreRemoved
reportData.sourcePendingCancelled = sourcePendingCancelled
reportData.sourceCleanup = sourceCleanup
assert.equal(targetRemoved, true)
assert.equal(restoreStoreRemoved, true)
assert.equal(sourcePendingCancelled, true)
await writeReport(reportData)
process.stdout.write(
  `Audit retention recovery verified ${reportData.tableCount} tables, ${reportData.migrationCount} migrations, ${reportData.copiedObjectCount} retained byte objects, three 365-day source archive witnesses, v1/all/hot/archived queries, current-rights restoration, and one exact scoped continuation. The source continuation was cancelled and confirmed temporary targets were removed.\n`
)
