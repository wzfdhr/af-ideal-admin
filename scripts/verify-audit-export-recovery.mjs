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
import { Pool } from 'pg'
import { createServer } from '@af-admin/reference-api/dist/index.js'
import { verifyMigrationReadiness } from '@af-admin/reference-api/dist/migrate.js'
import { processAuditExports } from '@af-admin/reference-api/dist/audit-export-jobs.js'
import {
  LocalObjectStore,
  fileDigest,
} from '@af-admin/reference-api/dist/file-storage.js'
import { digest } from '@af-admin/reference-api/dist/security.js'
import { noFault } from '@af-admin/reference-api/dist/support.js'

const SOURCE_DATABASE = 'af_admin_full_c1b35e6ead774464986c87ea453d847e_demo'
const SOURCE_ORIGIN = 'http://127.0.0.1:10890'
const POSTGRES_CONTAINER = 'af-admin-r1-postgres'
const MIGRATION_030_SHA256 =
  'de317d346acdedfd72f50f55ab3917179f8ff95a5d51de44b41a1243db2e4d22'
const HISTORIC_MISSING_REFERENCE = path.resolve(
  'test-results/full-product/report-exports-20261013/database-and-file-copy/a5c1e941f1cf4424975b3aa39b64a758/report.json'
)
const HISTORIC_MISSING_REFERENCE_SHA256 =
  '06cc381e8071598f23e84878f63faf9313bceb21c60bd4f72b74e89895afa814'
const EVIDENCE_ROOT = path.resolve(
  'test-results/full-product/audit-exports-20261013/database-and-file-copy'
)
const runId = randomUUID()
const runKey = runId.replaceAll('-', '')
const runRoot = path.join(EVIDENCE_ROOT, runId)
const dumpPath = path.join(runRoot, 'database.dump')
const targetName = `af_audit_export_recovery_${runKey}_demo`
const scope =
  'current migration 030 database and every retained referenced local byte object restored into a random database and independent store on the same local PostgreSQL host'
const caveat =
  'This appends three fresh synthetic completed source export witnesses and one queued continuation fixture without rewriting historical rows. Completed witnesses remain for their normal seven-day lifecycle. This verifies one local pg_dump/pg_restore and local object-store recovery path, not a new physical server, customer restore, fresh-machine deployment, or binary rollback claim.'
const usage =
  'node --env-file=/absolute/path/to/api.env.local scripts/verify-audit-export-recovery.mjs'

const children = new Set()
const backendMarkers = new Set()
const uncertainOperations = new Set()
const cleanupFailures = []
const sourceJobIntents = []
const sourceWitnessJobs = new Set()
const sourceContinuationJobs = new Set()
const sourceJobCleanup = []
let sourceUrl
let source
let restored
let targetServer
let sourceFileRoot
let backupRoot
let restoreRoot
let token
let sourceJob
let sourceJobCancelled = false
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

const fileHash = async (file) => {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

const jsonHash = (value) => sha256(JSON.stringify(value))

const safeError = (error) => {
  let message =
    error instanceof Error
      ? error.message
      : 'Audit export recovery verification failed'
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
    sourceJobId: sourceJob?.id || null,
    sourceFixtureRace,
    uncertainOperations: [...uncertainOperations],
    backendMarkers: [...backendMarkers],
  })

const advance = async (next) => {
  stage = next
  await progress()
  process.stdout.write(`Audit export recovery phase: ${stage}\n`)
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

const delay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

const backendRows = async (marker) =>
  (
    await source.query(
      'SELECT pid,datname,state FROM pg_stat_activity WHERE application_name=$1 AND pid<>pg_backend_pid() ORDER BY pid',
      [marker]
    )
  ).rows

const stopOwnedBackends = async (marker, commandConfirmed) => {
  let rows = await backendRows(marker)
  const observed = rows.map((row) => ({
    pid: row.pid,
    database: row.datname,
    state: row.state,
  }))
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
  assert.equal(
    rows.length,
    0,
    `Owned PostgreSQL backend ${marker} must be confirmed stopped; observed ${JSON.stringify(
      observed
    )}`
  )
  backendMarkers.delete(marker)
  if (commandConfirmed) uncertainOperations.delete(`container:${marker}`)
}

const runDocker = async (executable, args, stdio, inputPath) => {
  assert.ok(['pg_dump', 'pg_restore'].includes(executable))
  const operation = executable === 'pg_dump' ? 'dump' : 'restore'
  const marker = `af_audit_export_recovery_${runKey}_${operation}`
  assert.match(marker, /^af_audit_export_recovery_[a-f0-9]{32}_(dump|restore)$/)
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
    assert.equal(result[0], 0, `${executable} must exit zero`)
    assert.equal(
      result[1],
      null,
      `${executable} must not exit through a signal`
    )
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
      `${executable} or its owned backend lifecycle failed: ${[
        commandError,
        ...lifecycleErrors,
      ]
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
  assert.ok(token, 'Every API continuation uses the same fresh source session')
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
  assert.equal(tables.length, 76)
  tables.forEach((table) => assert.match(table, /^[a-z][a-z0-9_]*$/))
  ;[
    'schema_migrations',
    'stored_files',
    'file_parts',
    'report_export_jobs',
    'report_export_artifacts',
    'audit_events',
    'audit_export_jobs',
    'audit_export_artifacts',
    'audit_export_events',
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
  assert.equal(rows.length, 30)
  assert.equal(rows.at(-1).name, '030_audit_export_menu.sql')
  assert.equal(rows.at(-1).checksum, MIGRATION_030_SHA256)
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

const login = async () => {
  const startedAt = (await source.query('SELECT clock_timestamp() AS time'))
    .rows[0].time
  const marker = `http:source-login:${runKey}`
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
  return { binding, user, traceId: envelope.traceId }
}

const sourceExportQuery = (traceId) => ({
  version: 1,
  current: 1,
  pageSize: 20,
  traceId,
  timeZone: 'America/New_York',
})

const createSourceJob = async (format, purpose, traceId) => {
  const key = randomUUID()
  const marker = `audit-export-create:${key}`
  sourceJobIntents.push({
    key,
    marker,
    operation: 'audit-export.create',
    purpose,
    format,
  })
  const job = await apiCall(SOURCE_ORIGIN, '/audit/exports', {
    method: 'POST',
    key,
    mutationMarker: marker,
    body: {
      version: 1,
      format,
      query: sourceExportQuery(traceId),
    },
  })
  ;(purpose === 'witness' ? sourceWitnessJobs : sourceContinuationJobs).add(
    job.id
  )
  return job
}

const createQueuedSourceJob = async (traceId) => {
  const job = await createSourceJob('csv', 'continuation', traceId)
  const delayMarker = `source-fixture-delay:${job.id}`
  uncertainOperations.add(delayMarker)
  const client = await source.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL statement_timeout='10000ms'")
    const { rows } = await client.query(
      "SELECT id,status,stage,revision,attempts,artifact_id,claimed_by,lease_until FROM audit_export_jobs WHERE tenant_id='tenant-a' AND id=$1 FOR UPDATE",
      [job.id]
    )
    assert.equal(rows.length, 1)
    const row = rows[0]
    if (
      row.status !== 'queued' ||
      row.stage !== 'queued' ||
      row.attempts !== 0 ||
      row.artifact_id !== null ||
      row.claimed_by !== null ||
      row.lease_until !== null
    ) {
      sourceFixtureRace = true
      await client.query('ROLLBACK')
      // A confirmed worker race is not rolled back by this verifier. Keep the
      // run marker active so every later evidence-cleanup gate retains the
      // independent recovery database/store if they were already created.
      throw new Error(
        'Source audit worker raced the owned fixture; preserve the witness and rerun only after investigating it'
      )
    }
    const delayed = (
      await client.query(
        "UPDATE audit_export_jobs SET next_attempt_at=clock_timestamp()+interval '30 days',updated_at=clock_timestamp() WHERE tenant_id='tenant-a' AND id=$1 AND status='queued' AND attempts=0 AND artifact_id IS NULL RETURNING id,status,stage,revision,attempts,artifact_id,next_attempt_at",
        [job.id]
      )
    ).rows
    assert.equal(delayed.length, 1)
    await client.query('COMMIT')
    uncertainOperations.delete(delayMarker)
    return delayed[0]
  } catch (error) {
    if (!sourceFixtureRace) {
      try {
        await client.query('ROLLBACK')
        uncertainOperations.delete(delayMarker)
      } catch {
        // The marker deliberately remains: a source mutation outcome is unknown.
      }
    }
    throw error
  } finally {
    client.release()
  }
}

const recoverSourceJobIntents = async () => {
  if (!source || !sourceJobIntents.length) return
  const marker = `source-intent-discovery:${runKey}`
  uncertainOperations.add(marker)
  const client = await source.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL statement_timeout='60000ms'")
    await sequence(sourceJobIntents, async (intent) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [JSON.stringify(['tenant-a', 'a-admin', intent.operation, intent.key])]
      )
    })
    const recovered = (
      await client.query(
        "SELECT DISTINCT r.key,j.id FROM idempotency_records r JOIN audit_export_jobs j ON j.tenant_id=r.tenant_id AND j.created_by=r.actor_id AND r.response->>'id'=j.id WHERE r.tenant_id='tenant-a' AND r.actor_id='a-admin' AND r.operation='audit-export.create' AND r.key=ANY($1::text[])",
        [sourceJobIntents.map((intent) => intent.key)]
      )
    ).rows
    recovered.forEach((row) => {
      const intent = sourceJobIntents.find(
        (candidate) => candidate.key === row.key
      )
      assert.ok(intent)
      ;(intent.purpose === 'witness'
        ? sourceWitnessJobs
        : sourceContinuationJobs
      ).add(row.id)
    })
    await client.query('COMMIT')
    const recoveredKeys = new Set(recovered.map((row) => row.key))
    sourceJobIntents.forEach((intent) => {
      // A completed HTTP response already cleared its own marker. After a
      // timeout, only a durable receipt joined to its exact created job proves
      // the mutation outcome. A zero-row advisory-lock check is not proof: the
      // delayed request may not have reached its idempotency lock yet.
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

const assertCompletedWitness = (job, expectedFormat, traceId) => {
  assert.equal(job.format, expectedFormat)
  assert.equal(job.status, 'completed')
  assert.equal(job.stage, 'completed')
  assert.equal(job.restricted, false)
  assert.equal(job.query.traceId, traceId)
  assert.equal(job.query.current, 1)
  assert.equal(job.query.pageSize, 20)
  assert.equal(job.query.timeZone, 'America/New_York')
  ;[
    'module',
    'eventType',
    'result',
    'operatorName',
    'targetId',
    'from',
    'to',
  ].forEach((field) => assert.equal(job.query[field], ''))
  assert.equal(job.totalRows, 1)
  assert.equal(job.processedRows, 1)
  assert.ok(job.allowedActions.includes('download'))
  assert.equal(job.archivedAt, null)
  assert.equal(job.expiredAt, null)
  assert.equal(
    Date.parse(job.retentionUntil) - Date.parse(job.createdAt),
    7 * 24 * 60 * 60 * 1000
  )
  assert.ok(job.artifact)
  assert.equal(job.artifact.format, expectedFormat)
  assert.equal(job.artifact.status, 'ready')
  assert.ok(job.artifact.size > 0)
  assert.match(job.artifact.sha256, /^[a-f0-9]{64}$/)
  assert.ok(job.artifact.scanEngine.startsWith('ClamAV '))
  return job
}

const createAndWaitForSourceWitnesses = async (traceId) => {
  const planned = []
  await sequence(['csv', 'xlsx', 'pdf'], async (format) => {
    planned.push(await createSourceJob(format, 'witness', traceId))
  })
  const deadline = Date.now() + 120000
  const completed = new Map()
  const poll = async () => {
    await sequence(planned, async (plannedJob) => {
      if (completed.has(plannedJob.id)) return
      const current = await apiCall(
        SOURCE_ORIGIN,
        `/audit/exports/${plannedJob.id}`
      )
      if (current.status === 'completed') {
        completed.set(
          current.id,
          assertCompletedWitness(current, plannedJob.format, traceId)
        )
        return
      }
      if (!['queued', 'processing'].includes(current.status))
        throw new Error(
          `Owned ${plannedJob.format} source witness stopped in ${current.status}; preserve it for investigation`
        )
    })
    if (completed.size === planned.length) return
    assert.ok(
      Date.now() < deadline,
      'Owned source witnesses must complete through the normal source worker within two minutes; retain them on timeout'
    )
    await delay(1000)
    await poll()
  }
  await poll()
  return planned.map((job) => completed.get(job.id))
}

const sourceWitnessArtifacts = async (witnesses) => {
  const ids = witnesses.map((job) => job.id)
  const { rows } = await source.query(
    "SELECT j.id,j.format,j.object_key,a.id AS artifact_id,a.size,a.sha256,a.mime_type,a.scan_engine FROM audit_export_jobs j JOIN audit_export_artifacts a ON a.tenant_id=j.tenant_id AND a.job_id=j.id AND a.id=j.artifact_id WHERE j.tenant_id='tenant-a' AND j.id=ANY($1::text[]) AND j.status='completed' AND j.retention_until>clock_timestamp() AND j.bytes_purged_at IS NULL AND a.status='ready' AND a.purged_at IS NULL ORDER BY j.format",
    [ids]
  )
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((row) => row.id).sort(), [...ids].sort())
  rows.forEach((row) => {
    const witness = witnesses.find((job) => job.id === row.id)
    assert.ok(witness)
    assert.equal(row.format, witness.format)
    assert.equal(row.artifact_id, witness.artifact.id)
    assert.equal(row.size, witness.artifact.size)
    assert.equal(row.sha256, witness.artifact.sha256)
    assert.equal(row.mime_type, witness.artifact.mimeType)
    assert.equal(row.scan_engine, witness.artifact.scanEngine)
    assert.match(row.object_key, /^[a-f0-9]{64}$/)
  })
  return rows
}

const readDownload = async (origin, job) => {
  assert.ok(job.artifact)
  const result = await apiCall(origin, `/audit/exports/${job.id}/download`, {
    binary: true,
    mutationMarker: `audit-export-download:${job.id}:${randomUUID()}`,
  })
  assert.equal(result.bytes.length, job.artifact.size)
  assert.equal(fileDigest(result.bytes), job.artifact.sha256)
  assert.equal(result.mimeType, job.artifact.mimeType)
  return result.bytes
}

const lockRetainedByteRows = async (db) => {
  // cleanupFileObjects locks the owning upload before reading part keys,
  // removes their bytes, then deletes file_parts. Lock every upload owning a
  // captured part first, in the same upload -> file/part order, so cleanup
  // cannot remove bytes while this transaction copies them.
  await db.query(
    'SELECT u.tenant_id,u.id FROM file_uploads u WHERE EXISTS(SELECT 1 FROM file_parts p WHERE p.tenant_id=u.tenant_id AND p.upload_id=u.id) ORDER BY u.tenant_id,u.id FOR SHARE OF u'
  )
  await db.query(
    "SELECT id FROM stored_files WHERE status<>'deleted' FOR SHARE"
  )
  await db.query('SELECT upload_id,part_index FROM file_parts FOR SHARE')
  // Export expiry takes job/artifact row locks before byte deletion. The
  // generic orphan sweep must also treat every unpurged artifact as referenced;
  // services/reference-api/src/file-jobs.ts enforces that runtime invariant.
  await db.query(
    'SELECT id FROM report_export_jobs WHERE retention_until>clock_timestamp() FOR SHARE'
  )
  await db.query(
    'SELECT id FROM report_export_artifacts WHERE purged_at IS NULL FOR SHARE'
  )
  await db.query(
    'SELECT id FROM audit_export_jobs WHERE bytes_purged_at IS NULL FOR SHARE'
  )
  await db.query(
    'SELECT id FROM audit_export_artifacts WHERE purged_at IS NULL FOR SHARE'
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
    'audit-job-reservation',
    (
      await db.query(
        'SELECT tenant_id,id,object_key,NULL::integer AS size,NULL::text AS sha256,status FROM audit_export_jobs WHERE bytes_purged_at IS NULL ORDER BY tenant_id,id'
      )
    ).rows,
    true
  )
  add(
    'audit-artifact',
    (
      await db.query(
        'SELECT tenant_id,id,object_key,size,sha256,status FROM audit_export_artifacts WHERE purged_at IS NULL ORDER BY tenant_id,id'
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
    HISTORIC_MISSING_REFERENCE_SHA256,
    'The historic missing-byte evidence must be the reviewed immutable reference'
  )
  const reference = JSON.parse(
    await readFile(HISTORIC_MISSING_REFERENCE, 'utf8')
  )
  assert.equal(reference.missingExistingFiles.length, 41)
  const items = reference.missingExistingFiles.map((item) => {
    assert.equal(item.kind, 'stored-file')
    assert.equal(item.reason, 'source-byte-object-missing')
    assert.equal(item.tenant_id, 'tenant-a')
    assert.match(item.id, /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/)
    assert.match(item.object_key, /^[a-f0-9]{64}$/)
    assert.ok(Number.isSafeInteger(item.size) && item.size > 0)
    assert.match(item.sha256, /^[a-f0-9]{64}$/)
    assert.equal(typeof item.status, 'string')
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

const jobFacts = async (db, id) => {
  const row = (
    await db.query(
      "SELECT j.status,j.stage,j.attempts,j.artifact_id,(SELECT count(*)::int FROM audit_export_artifacts a WHERE a.tenant_id=j.tenant_id AND a.job_id=j.id) AS artifacts,(SELECT count(*)::int FROM audit_export_events e WHERE e.tenant_id=j.tenant_id AND e.job_id=j.id) AS events,(SELECT count(*)::int FROM audit_events e WHERE e.tenant_id=j.tenant_id AND e.target_type='audit-export' AND e.target_id=j.id) AS audit_facts FROM audit_export_jobs j WHERE j.tenant_id='tenant-a' AND j.id=$1",
      [id]
    )
  ).rows
  assert.equal(row.length, 1)
  return row[0]
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
  assert.match(targetName, /^af_audit_export_recovery_[a-f0-9]{32}_demo$/)
  assert.notEqual(targetName, SOURCE_DATABASE)
  assert.equal(path.dirname(runRoot), EVIDENCE_ROOT)
  assert.equal(path.basename(runRoot), runId)
  assert.equal(path.dirname(dumpPath), runRoot)
  assert.ok(
    process.env.FILE_STORAGE_DIR,
    'The exact source API FILE_STORAGE_DIR must be explicit'
  )
  sourceFileRoot = await realpath(process.env.FILE_STORAGE_DIR)
  const backupDirectory = path.join(runRoot, 'object-backup')
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 })
  backupRoot = await realpath(backupDirectory)
  restoreRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), 'af-audit-export-restore-'))
  )
  assert.equal(path.dirname(restoreRoot), await realpath(tmpdir()))
  assert.match(
    path.basename(restoreRoot),
    /^af-audit-export-restore-[A-Za-z0-9]+$/
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

  await advance('fresh-source-session-and-three-owned-format-witnesses')
  const sourceIdentity = await login()
  const sourceSessionHash = jsonHash(sourceIdentity.binding)
  const sourceAuthFacts = (
    await source.query(
      "SELECT id,actor_id,module,action,result,target_type,target_id,trace_id FROM audit_events WHERE tenant_id='tenant-a' AND trace_id=$1 ORDER BY id",
      [sourceIdentity.traceId]
    )
  ).rows
  assert.equal(sourceAuthFacts.length, 1)
  assert.equal(sourceAuthFacts[0].actor_id, 'a-admin')
  assert.equal(sourceAuthFacts[0].module, 'auth')
  assert.equal(sourceAuthFacts[0].action, 'login')
  assert.equal(sourceAuthFacts[0].result, 'success')
  assert.equal(sourceAuthFacts[0].target_type, 'session')
  assert.equal(sourceAuthFacts[0].target_id, 'a-admin')
  assert.equal(sourceAuthFacts[0].trace_id, sourceIdentity.traceId)
  const sourceWitnesses = await createAndWaitForSourceWitnesses(
    sourceIdentity.traceId
  )
  const completedArtifacts = await sourceWitnessArtifacts(sourceWitnesses)
  const sourceArtifacts = {}
  const sourceDownloadBytes = new Map()
  await sequence(sourceWitnesses, async (witness) => {
    const bytes = await readDownload(SOURCE_ORIGIN, witness)
    sourceDownloadBytes.set(witness.id, bytes)
    sourceArtifacts[witness.format] = {
      jobId: witness.id,
      artifactId: witness.artifact.id,
      size: bytes.length,
      sha256: fileDigest(bytes),
      mimeType: witness.artifact.mimeType,
      scanEngine: witness.artifact.scanEngine,
      restricted: witness.restricted,
      retainedForNormalLifecycle: true,
    }
  })

  await advance('owned-queued-continuation-fixture')
  sourceJob = await createQueuedSourceJob(sourceIdentity.traceId)
  assert.equal(sourceJob.status, 'queued')
  assert.equal(sourceJob.attempts, 0)
  assert.equal(sourceJob.artifact_id, null)

  await advance('locked-repeatable-snapshot-dump-and-byte-copy')
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
        const allowedHistoricMissing = exact.every(
          (owner) =>
            owner.kind === 'stored-file' &&
            expectedHistoricMissingIdentities.has(byteIdentity(owner))
        )
        if (!allowedHistoricMissing)
          throw new Error(
            `New required source byte is missing for object ${key}`
          )
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
      expectedHistoricMissingReferences.map(byteIdentity).sort(),
      'Only the exact 41 reviewed historic stored-file tenant/id/object/size/hash tuples may be missing; mutable status is reported separately'
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
    0,
    'Random target database must not preexist'
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

  await advance('restored-original-session-three-format-downloads')
  const listenMarker = `target-server-listen:${runKey}`
  uncertainOperations.add(listenMarker)
  targetServer = createServer(restored, noFault, { storageRoot: restoreRoot })
  const targetOrigin = await targetServer.listen({
    host: '127.0.0.1',
    port: 0,
  })
  uncertainOperations.delete(listenMarker)
  const restoredBinding = await sessionBinding(restored)
  assert.equal(jsonHash(restoredBinding), sourceSessionHash)
  const restoredUser = await apiCall(targetOrigin, '/user/info')
  assert.equal(restoredUser.id, sourceIdentity.user.id)
  assert.equal(restoredUser.tenantId, sourceIdentity.user.tenantId)
  const restoredDownloads = {}
  await sequence(completedArtifacts, async (artifact) => {
    const restoredWitness = assertCompletedWitness(
      await apiCall(targetOrigin, `/audit/exports/${artifact.id}`),
      artifact.format,
      sourceIdentity.traceId
    )
    const bytes = await readDownload(targetOrigin, restoredWitness)
    assert.deepEqual(bytes, sourceDownloadBytes.get(artifact.id))
    assert.deepEqual(bytes, await backupStore.get(artifact.object_key))
    assert.deepEqual(bytes, await restoredStore.get(artifact.object_key))
    restoredDownloads[artifact.format] = {
      jobId: artifact.id,
      artifactId: artifact.artifact_id,
      size: bytes.length,
      sha256: fileDigest(bytes),
      mimeType: artifact.mime_type,
      scanEngine: artifact.scan_engine,
      restricted: restoredWitness.restricted,
      restoredWithOriginalSession: true,
      retainedForNormalLifecycle: true,
    }
    ;[
      'jobId',
      'artifactId',
      'size',
      'sha256',
      'mimeType',
      'scanEngine',
      'restricted',
    ].forEach((field) =>
      assert.deepEqual(
        restoredDownloads[artifact.format][field],
        sourceArtifacts[artifact.format][field]
      )
    )
  })

  await advance('restored-exact-owned-queued-continuation')
  const targetBefore = await jobFacts(restored, sourceJob.id)
  assert.equal(targetBefore.status, 'queued')
  assert.equal(targetBefore.stage, 'queued')
  assert.equal(targetBefore.attempts, 0)
  assert.equal(targetBefore.artifacts, 0)
  const dueMarker = `target-fixture-due:${sourceJob.id}`
  uncertainOperations.add(dueMarker)
  await restored.query(
    "UPDATE audit_export_jobs SET next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id='tenant-a' AND id=$1 AND status='queued' AND attempts=0 AND artifact_id IS NULL",
    [sourceJob.id]
  )
  uncertainOperations.delete(dueMarker)
  const processMarker = `target-fixture-process:${sourceJob.id}`
  uncertainOperations.add(processMarker)
  assert.equal(
    await processAuditExports(
      restored,
      { storageRoot: restoreRoot },
      noFault,
      1,
      { tenantId: 'tenant-a', jobIds: [sourceJob.id] }
    ),
    1
  )
  uncertainOperations.delete(processMarker)
  const targetCompleted = await jobFacts(restored, sourceJob.id)
  assert.equal(targetCompleted.status, 'completed')
  assert.equal(targetCompleted.stage, 'completed')
  assert.equal(targetCompleted.attempts, 1)
  assert.equal(targetCompleted.artifacts, 1)
  assert.ok(targetCompleted.events > targetBefore.events)
  assert.ok(targetCompleted.audit_facts > targetBefore.audit_facts)
  const targetJob = await apiCall(
    targetOrigin,
    `/audit/exports/${sourceJob.id}`
  )
  assert.equal(targetJob.status, 'completed')
  assert.equal(targetJob.artifact.status, 'ready')
  assert.ok(targetJob.artifact.scanEngine.startsWith('ClamAV '))
  const resumedDownload = await apiCall(
    targetOrigin,
    `/audit/exports/${sourceJob.id}/download`,
    {
      binary: true,
      mutationMarker: `target-download:${sourceJob.id}:${randomUUID()}`,
    }
  )
  assert.equal(resumedDownload.bytes.length, targetJob.artifact.size)
  assert.equal(fileDigest(resumedDownload.bytes), targetJob.artifact.sha256)
  const targetAfterDownload = await jobFacts(restored, sourceJob.id)
  const repeatMarker = `target-fixture-repeat:${sourceJob.id}`
  uncertainOperations.add(repeatMarker)
  assert.equal(
    await processAuditExports(
      restored,
      { storageRoot: restoreRoot },
      noFault,
      1,
      { tenantId: 'tenant-a', jobIds: [sourceJob.id] }
    ),
    0
  )
  uncertainOperations.delete(repeatMarker)
  assert.deepEqual(await jobFacts(restored, sourceJob.id), targetAfterDownload)

  const sourceStillQueued = await jobFacts(source, sourceJob.id)
  assert.equal(sourceStillQueued.status, 'queued')
  assert.equal(sourceStillQueued.stage, 'queued')
  assert.equal(sourceStillQueued.attempts, 0)
  assert.equal(sourceStillQueued.artifacts, 0)
  assert.equal(
    (
      await source.query(
        "SELECT count(*)::int AS total FROM audit_export_artifacts WHERE tenant_id='tenant-a' AND id=$1",
        [targetJob.artifact.id]
      )
    ).rows[0].total,
    0
  )

  await advance('verified-awaiting-confirmed-cleanup')
  reportData = {
    version: 1,
    status: 'verified-awaiting-cleanup',
    verifiedAt: new Date().toISOString(),
    runId,
    scope,
    caveat,
    method:
      'repeatable-read exported pg_dump snapshot plus retained-reference row locks held through actual object-byte copy',
    sourceDatabase: SOURCE_DATABASE,
    targetDatabase: targetName,
    tableCount: tables.length,
    tableFingerprintsMatch: true,
    migrationCount: migrationChecksums.length,
    migrationChecksumsMatch: true,
    dumpBytes: dumpInfo.size,
    dumpSha256,
    dumpFormat: 'PGDMP custom archive',
    sourceFileRoot,
    preservedOriginalSession: true,
    sourceSessionHash,
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
    historicMissingReference: path.relative(
      process.cwd(),
      HISTORIC_MISSING_REFERENCE
    ),
    historicMissingReferenceSha256: HISTORIC_MISSING_REFERENCE_SHA256,
    exactHistoricMissingTuplesMatched: true,
    historicMissingReferenceStatuses: expectedHistoricMissingReferences.map(
      (item) => ({
        tenantId: item.tenant_id,
        id: item.id,
        referenceStatus: item.referenceStatus,
      })
    ),
    sourceArtifacts,
    sourceWitnessJobIds: sourceWitnesses.map((job) => job.id),
    sourceWitnessLifecycle:
      'three completed synthetic format witnesses intentionally retained for their normal seven-day lifecycle',
    restoredDownloads,
    sourcePendingJobId: sourceJob.id,
    sourcePendingStayedQueuedUntilCleanup: true,
    restoredContinuation: {
      artifactId: targetJob.artifact.id,
      size: targetJob.artifact.size,
      sha256: targetJob.artifact.sha256,
      scanEngine: targetJob.artifact.scanEngine,
      processedExactlyOnce: true,
      sourceHasTargetArtifact: false,
    },
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
  await cleanup(recoverSourceJobIntents, `source-intent-discovery:${runKey}`)
  if (source && sourceWitnessJobs.size)
    await cleanup(async () => {
      const { rows } = await source.query(
        "SELECT id,status,retention_until>clock_timestamp() AS retained,(SELECT count(*)::int FROM audit_export_artifacts a WHERE a.tenant_id=j.tenant_id AND a.job_id=j.id) AS artifacts FROM audit_export_jobs j WHERE tenant_id='tenant-a' AND id=ANY($1::text[]) ORDER BY id",
        [Array.from(sourceWitnessJobs)]
      )
      assert.equal(rows.length, sourceWitnessJobs.size)
      rows.forEach((row) => {
        assert.equal(row.status, 'completed')
        assert.equal(row.artifacts, 1)
        assert.equal(row.retained, true)
        sourceJobCleanup.push({
          id: row.id,
          purpose: 'completed-format-witness',
          finalStatus: row.status,
          artifactCount: row.artifacts,
          retainedForNormalLifecycle: row.retained,
        })
      })
    })
  if (!sourceFixtureRace && token)
    await sequence(Array.from(sourceContinuationJobs), async (id) => {
      await cleanup(async () => {
        const current = await apiCall(SOURCE_ORIGIN, `/audit/exports/${id}`)
        if (
          ['queued', 'processing', 'failed', 'blocked'].includes(current.status)
        ) {
          const marker = `audit-export-cancel:${id}:${randomUUID()}`
          await apiCall(SOURCE_ORIGIN, `/audit/exports/${id}/cancel`, {
            method: 'POST',
            key: randomUUID(),
            mutationMarker: marker,
            body: { version: 1, expectedRevision: current.revision },
          })
          const cancelled = await apiCall(SOURCE_ORIGIN, `/audit/exports/${id}`)
          assert.equal(cancelled.status, 'cancelled')
          sourceJobCleanup.push({
            id,
            purpose: 'queued-continuation',
            previousStatus: current.status,
            finalStatus: cancelled.status,
          })
          if (id === sourceJob?.id) sourceJobCancelled = true
        } else {
          sourceFixtureRace = true
          uncertainOperations.add(`source-fixture-race:${id}`)
          sourceJobCleanup.push({
            id,
            purpose: 'queued-continuation',
            previousStatus: current.status,
            finalStatus: current.status,
            retained: true,
          })
          if (id === sourceJob?.id)
            throw new Error(
              'Owned source fixture reached an unexpected terminal state and was retained for investigation'
            )
        }
      })
    })
  if (targetServer)
    await cleanup(() => targetServer.close(), `target-server-close:${runKey}`)
  if (restored)
    await cleanup(() => restored.end(), `target-pool-close:${runKey}`)

  // Any ambiguous source mutation, database creation, container, child, HTTP,
  // pool, or close outcome retains both recovery targets for investigation.
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
    !uncertainOperations.size &&
    !sourceFixtureRace &&
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
  if (source) await cleanup(() => source.end())
}

if (
  validationFailure ||
  cleanupFailures.length ||
  sourceFixtureRace ||
  uncertainOperations.size ||
  !targetRemoved ||
  !restoreStoreRemoved ||
  !sourceJobCancelled
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
    sourceJobId: sourceJob?.id || null,
    sourceJobCancelled,
    sourceJobCleanup,
    sourceJobIntents,
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
    `Audit export recovery failed at ${stage}; recovery targets are retained whenever an outcome is uncertain`
  )
}

reportData.status = 'verified'
reportData.restoredDatabaseRemoved = targetRemoved
reportData.restoredStoreRemoved = restoreStoreRemoved
reportData.sourcePendingCancelled = sourceJobCancelled
reportData.sourceJobCleanup = sourceJobCleanup
assert.equal(targetRemoved, true)
assert.equal(restoreStoreRemoved, true)
assert.equal(sourceJobCancelled, true)
await writeReport(reportData)
process.stdout.write(
  `Audit export recovery verified ${reportData.tableCount} tables, ${reportData.migrationCount} migrations, ${reportData.copiedObjectCount} retained byte objects, three original-session format downloads, and one exact-owned durable continuation with real scanning. The source fixture was cancelled and the confirmed recovery database/store were removed.\n`
)
