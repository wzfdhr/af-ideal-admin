import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  mkdir,
  mkdtemp,
  open,
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
import { digest } from '@af-admin/reference-api/dist/security.js'
import { noFault } from '@af-admin/reference-api/dist/support.js'

const SOURCE_FULL_DATABASE =
  'af_admin_full_c1b35e6ead774464986c87ea453d847e_demo'
const SOURCE_ORIGIN = 'http://127.0.0.1:10890'
const POSTGRES_CONTAINER = 'af-admin-r1-postgres'
const MIGRATION_028_SHA256 =
  '1915f5f4862c2d38fa993735d6830333d9dc4953b217ad0e8ec5f84439af1d26'
const EVIDENCE_ROOT = path.resolve(
  'test-results/full-product/audit-query-20261013/database-copy'
)
const runId = randomUUID()
const runKey = runId.replaceAll('-', '')
const runRoot = path.join(EVIDENCE_ROOT, runId)
const targetName = `af_audit_recovery_${runKey}_demo`
const dumpPath = path.join(runRoot, 'database.dump')
const scope =
  'database-only pg_dump and pg_restore into a random independent database in the existing local PostgreSQL instance'
const caveat =
  'No stored file bytes are backed up or restored. This is not a new physical server, customer dataset, fresh-machine deployment, file-byte recovery, or binary compatibility rollback claim.'
const usage =
  'node --env-file=/absolute/path/to/api.env.local scripts/verify-audit-recovery.mjs (or use --env-file-if-exists=PATH)'

const children = new Set()
const ownedBackendMarkers = new Set()
const uncertainContainerCommands = new Set()
const backendLifecycle = []
const cleanupFailures = []
const targetMutationIds = []
let sourceUrl
let source
let restored
let targetServer
let targetStore
let token
let loginTraceId
let stage = 'guards'
let targetCreationAttempted = false
let targetCreated = false
let targetRemoved = false
let targetStoreRemoved = false
let cleanupBarrierConfirmed = false
let targetCleanupStoppedByBarrier = false
let validationFailure
let reportData

const sequence = (values, run) =>
  values.reduce(async (previous, value) => {
    await previous
    await run(value)
  }, Promise.resolve())

const jsonHash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

const fileHash = async (file) => {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

const safeError = (error) => {
  let message =
    error instanceof Error
      ? error.message
      : 'Audit recovery verification failed'
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

const combinedError = (errors, message) =>
  new Error(`${message}: ${errors.map(safeError).join('; ')}`)

const writeReport = async (report) => {
  const text = JSON.stringify(report, null, 2)
  const checksum = createHash('sha256').update(text).digest('hex')
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
  return checksum
}

const progress = () =>
  writeReport({
    version: 1,
    status: 'running',
    stage,
    runId,
    scope,
    caveat,
    sourceDatabase: SOURCE_FULL_DATABASE,
    targetDatabase: targetName,
    targetCreationAttempted,
    targetCreated,
    ownedBackendMarkers: [...ownedBackendMarkers],
    uncertainContainerCommands: [...uncertainContainerCommands],
    backendLifecycle,
    targetMutationIds,
  })

const advance = async (value) => {
  stage = value
  await progress()
  process.stdout.write(`Audit recovery phase: ${stage}\n`)
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
    children.delete(child)
  } finally {
    clearTimeout(force)
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

const stopOwnedBackends = async (
  marker,
  containerCommandCompletionConfirmed = true
) => {
  let rows = await backendRows(marker)
  const observed = rows.map((row) => ({
    pid: row.pid,
    database: row.datname,
    state: row.state,
  }))
  let forced = false
  if (rows.length) {
    forced = true
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
    `Owned PostgreSQL backend ${marker} must be confirmed stopped`
  )
  backendLifecycle.push({
    marker,
    observed,
    forced,
    confirmedStopped: true,
    containerCommandCompletionConfirmed,
  })
  if (containerCommandCompletionConfirmed) {
    ownedBackendMarkers.delete(marker)
    uncertainContainerCommands.delete(marker)
  }
}

const runDocker = async (args, stdio, inputPath) => {
  assert.equal(args[0], POSTGRES_CONTAINER)
  assert.ok(
    ['pg_dump', 'pg_restore'].includes(args[1]),
    'Only the exact PostgreSQL dump or restore executable is allowed'
  )
  const operation = args[1] === 'pg_dump' ? 'dump' : 'restore'
  const marker = `af_audit_recovery_${runKey}_${operation}`
  assert.match(marker, /^af_audit_recovery_[a-f0-9]{32}_(dump|restore)$/)
  ownedBackendMarkers.add(marker)
  const child = spawn(
    'docker',
    [
      'exec',
      ...(inputPath ? ['-i'] : []),
      '-e',
      `PGAPPNAME=${marker}`,
      args[0],
      'timeout',
      '--signal=TERM',
      '--kill-after=5s',
      '165s',
      ...args.slice(1),
    ],
    { stdio }
  )
  children.add(child)
  const exited = once(child, 'exit', {
    signal: AbortSignal.timeout(180000),
  })
  let commandFailure
  let containerCommandCompletionConfirmed = false
  const lifecycleErrors = []
  try {
    const transfer = inputPath
      ? pipeline(createReadStream(inputPath), child.stdin)
      : Promise.resolve()
    const [result] = await Promise.all([exited, transfer])
    assert.equal(result[0], 0, 'Actual pg_dump or pg_restore must succeed')
    assert.equal(
      result[1],
      null,
      'Successful docker exec must not exit through a signal'
    )
    containerCommandCompletionConfirmed = true
  } catch (error) {
    commandFailure = error
    if (!containerCommandCompletionConfirmed)
      uncertainContainerCommands.add(marker)
  }
  try {
    await stopChild(child)
  } catch (error) {
    lifecycleErrors.push(error)
  }
  try {
    await stopOwnedBackends(marker, containerCommandCompletionConfirmed)
  } catch (error) {
    lifecycleErrors.push(error)
  }
  if (commandFailure || lifecycleErrors.length)
    throw combinedError(
      [commandFailure, ...lifecycleErrors].filter(Boolean),
      `Owned ${operation} command or lifecycle failed`
    )
}

const apiCall = async (origin, endpoint, { expectedStatus = 200 } = {}) => {
  assert.ok(token, 'Every API continuation uses the fresh bound session')
  const response = await fetch(`${origin}/api${endpoint}`, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      'x-access-token': token,
      'x-tenant-id': 'tenant-a',
    },
  })
  const payload = await response.json()
  assert.equal(
    response.status,
    expectedStatus,
    `${payload.businessCode || 'HTTP_ERROR'}: ${payload.message || endpoint}`
  )
  if (expectedStatus !== 200) return payload
  assert.equal(payload.code, 20000)
  return payload.data
}

const auditQueryEndpoint = (traceId) => {
  assert.match(traceId, /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/)
  const params = new URLSearchParams({
    version: '1',
    current: '1',
    pageSize: '20',
    traceId,
    timeZone: 'America/New_York',
  })
  return `/audit/events?${params}`
}

const stableAuditPage = (page) => ({
  version: page.version,
  source: page.source,
  projectionVersion: page.projectionVersion,
  query: page.query,
  list: page.list,
  total: page.total,
  current: page.current,
  pageSize: page.pageSize,
})

const publicTables = async (db) => {
  const tables = (
    await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
    )
  ).rows.map((row) => row.table_name)
  assert.ok(tables.length >= 60)
  tables.forEach((table) => assert.match(table, /^[a-z][a-z0-9_]*$/))
  ;[
    'schema_migrations',
    'tenants',
    'users',
    'memberships',
    'sessions',
    'session_scopes',
    'roles',
    'role_permissions',
    'member_roles',
    'role_member_scopes',
    'audit_events',
    'client_telemetry',
    'auth_failures',
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
  assert.equal(rows.length, 28)
  assert.equal(rows.at(-1).name, '028_audit_query.sql')
  assert.equal(rows.at(-1).checksum, MIGRATION_028_SHA256)
  return rows
}

const sessionBinding = async (db) => {
  const row = (
    await db.query(
      "SELECT s.user_id,s.default_tenant_id,s.revoked_at,s.expires_at,scope.epoch,m.session_epoch,m.permissions,(SELECT COALESCE(jsonb_agg(mr.role_id ORDER BY mr.role_id),'[]'::jsonb) FROM member_roles mr WHERE mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id) AS roles FROM sessions s JOIN session_scopes scope ON scope.token_hash=s.token_hash AND scope.user_id=s.user_id AND scope.tenant_id='tenant-a' JOIN memberships m ON m.tenant_id=scope.tenant_id AND m.user_id=scope.user_id JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE s.token_hash=$1 AND s.user_id='a-admin' AND s.default_tenant_id='tenant-a' AND s.revoked_at IS NULL AND s.expires_at>now() AND scope.epoch=m.session_epoch AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled'",
      [digest(token)]
    )
  ).rows
  assert.equal(row.length, 1)
  assert.equal(row[0].epoch, row[0].session_epoch)
  return row[0]
}

const factDatabaseRow = async (db, traceId) => {
  const { rows } = await db.query(
    "SELECT id,tenant_id,actor_id,actor_name,module,action,result,target_type,target_id,trace_id,detail,created_at FROM audit_events WHERE tenant_id='tenant-a' AND trace_id=$1 ORDER BY id",
    [traceId]
  )
  assert.equal(rows.length, 1)
  return rows[0]
}

const bindFreshSourceSession = async () => {
  const startedAt = (await source.query('SELECT clock_timestamp() AS time'))
    .rows[0].time
  const response = await fetch(`${SOURCE_ORIGIN}/api/user/login`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'a-admin', password: 'a-admin' }),
  })
  assert.equal(response.status, 200)
  const envelope = await response.json()
  token = envelope.data.token
  loginTraceId = envelope.traceId
  assert.equal(typeof token, 'string')
  assert.match(loginTraceId, /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/)
  const binding = await sessionBinding(source)
  const created = (
    await source.query('SELECT created_at FROM sessions WHERE token_hash=$1', [
      digest(token),
    ])
  ).rows[0].created_at
  assert.ok(new Date(created) >= new Date(startedAt.getTime() - 60000))
  const current = await apiCall(SOURCE_ORIGIN, '/user/info')
  assert.equal(current.id, 'a-admin')
  assert.equal(current.tenantId, 'tenant-a')
  return { binding, current }
}

const assertAuthProjection = (page) => {
  assert.equal(page.version, 1)
  assert.equal(page.source, 'server')
  assert.equal(page.projectionVersion, 1)
  assert.equal(page.total, 1)
  assert.equal(page.list.length, 1)
  const fact = page.list[0]
  assert.equal(fact.source, 'server')
  assert.equal(fact.projectionVersion, 1)
  assert.equal(fact.module, 'auth')
  assert.equal(fact.action, 'login')
  assert.equal(fact.eventType, 'security')
  assert.equal(fact.result, 'success')
  assert.equal(fact.operator.id, 'a-admin')
  assert.ok(fact.operator.name)
  assert.equal(fact.target.type, 'session')
  assert.equal(fact.target.id, 'a-admin')
  assert.equal(fact.traceId, loginTraceId)
  assert.deepEqual(fact.detail, {})
  assert.ok(fact.visibleFields.includes('operator.id'))
  assert.ok(fact.visibleFields.includes('operator.name'))
  return fact
}

const targetOwner = async (db) => {
  const row = (
    await db.query(`
      SELECT kind,id FROM (
        SELECT 'schedule' AS kind,id,created_by AS owner FROM report_schedules WHERE tenant_id='tenant-a'
        UNION ALL SELECT 'export',id,created_by FROM report_export_jobs WHERE tenant_id='tenant-a'
        UNION ALL SELECT 'message',r.id,j.created_by FROM message_recipients r JOIN message_send_jobs j ON j.tenant_id=r.tenant_id AND j.id=r.job_id WHERE r.tenant_id='tenant-a'
        UNION ALL SELECT 'timer',t.id,r.applicant_id FROM workflow_timers t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id JOIN business_records r ON r.tenant_id=i.tenant_id AND r.id=i.request_id WHERE t.tenant_id='tenant-a'
      ) owned WHERE owner IS NOT NULL AND EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id='tenant-a' AND m.user_id=owned.owner) ORDER BY kind,id LIMIT 1`)
  ).rows[0]
  assert.ok(
    row,
    'Restored database must contain one registered background owner'
  )
  const mapping = {
    schedule: {
      module: 'report-schedule',
      action: 'report-schedule.run.completed',
      targetType: 'report-schedule',
    },
    export: {
      module: 'report-export',
      action: 'report-export.completed',
      targetType: 'report-export',
    },
    message: {
      module: 'messaging',
      action: 'delivery.sent',
      targetType: 'message-recipient',
    },
    timer: {
      module: 'workflow',
      action: 'timer.deadline',
      targetType: 'workflow-timer',
    },
  }
  return { ...row, ...mapping[row.kind] }
}

const installTargetAuditReader = async (db) => {
  const roleId = `audit-recovery-role-${runKey}`
  assert.match(roleId, /^audit-recovery-role-[a-f0-9]{32}$/)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      "UPDATE memberships SET permissions='[]'::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'"
    )
    await client.query(
      "DELETE FROM member_roles WHERE tenant_id='tenant-a' AND user_id='a-admin'"
    )
    await client.query(
      "INSERT INTO roles(tenant_id,id,role_name,role_key,status,remark) VALUES('tenant-a',$1,'Audit recovery reader',$2,'enabled','target-only recovery verification')",
      [roleId, `audit-recovery-${runKey}`]
    )
    await client.query(
      "INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES('tenant-a',$1,'audit:read')",
      [roleId]
    )
    await client.query(
      "INSERT INTO role_member_scopes(tenant_id,role_id,data_scope,field_permissions) VALUES('tenant-a',$1,'all','[\"username\"]'::jsonb)",
      [roleId]
    )
    await client.query(
      "INSERT INTO member_roles(tenant_id,user_id,role_id) VALUES('tenant-a','a-admin',$1)",
      [roleId]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return roleId
}

try {
  await mkdir(runRoot, { recursive: true, mode: 0o700 })
  await progress()
  const envFileArgument = process.execArgv.find((argument) =>
    /^--env-file(?:-if-exists)?=.+$/u.test(argument)
  )
  assert.ok(
    envFileArgument && envFileArgument.split('=').slice(1).join('=').trim(),
    `Audit recovery must be invoked exactly with: ${usage}`
  )
  assert.equal(process.env.APP_MODE, 'demo')
  assert.equal(
    process.env.R1_API_URL,
    SOURCE_ORIGIN,
    'R1_API_URL must name the exact dedicated audit demo API'
  )
  sourceUrl = new URL(process.env.DATABASE_URL || '')
  assert.equal(
    decodeURIComponent(sourceUrl.pathname.slice(1)),
    SOURCE_FULL_DATABASE
  )
  assert.notEqual(SOURCE_FULL_DATABASE, 'af_admin_r1')
  assert.equal(sourceUrl.hostname, '127.0.0.1')
  assert.equal(sourceUrl.port, '15438')
  assert.ok(['postgres:', 'postgresql:'].includes(sourceUrl.protocol))
  assert.ok(sourceUrl.username)
  assert.equal(sourceUrl.search, '')
  assert.equal(sourceUrl.hash, '')
  assert.equal(POSTGRES_CONTAINER, 'af-admin-r1-postgres')
  assert.match(targetName, /^af_audit_recovery_[a-f0-9]{32}_demo$/)
  assert.notEqual(targetName, SOURCE_FULL_DATABASE)
  assert.equal(path.dirname(runRoot), EVIDENCE_ROOT)
  assert.equal(path.basename(runRoot), runId)
  assert.equal(path.dirname(dumpPath), runRoot)

  source = new Pool({
    connectionString: sourceUrl.toString(),
    connectionTimeoutMillis: 5000,
    statement_timeout: 60000,
  })
  source.on('error', (error) => {
    validationFailure ||= error
  })
  assert.equal(
    (await source.query('SELECT current_database() AS name')).rows[0].name,
    SOURCE_FULL_DATABASE
  )
  await verifyMigrationReadiness(source)
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

  await advance('fresh-source-session-and-auth-fact')
  const sourceIdentity = await bindFreshSourceSession()
  const sourceSessionHash = jsonHash(sourceIdentity.binding)
  const sourcePage = await apiCall(
    SOURCE_ORIGIN,
    auditQueryEndpoint(loginTraceId)
  )
  const authFact = assertAuthProjection(sourcePage)
  const sourceFactRow = await factDatabaseRow(source, loginTraceId)
  assert.equal(sourceFactRow.id, authFact.id)
  assert.equal(sourceFactRow.actor_id, 'a-admin')
  assert.equal(sourceFactRow.module, 'auth')
  assert.equal(sourceFactRow.action, 'login')
  assert.equal(sourceFactRow.trace_id, loginTraceId)
  const sourceFactHash = jsonHash(sourceFactRow)
  const immutableTrigger = (
    await source.query(
      "SELECT count(*)::int AS total FROM pg_trigger WHERE tgname='audit_append_only' AND tgrelid='audit_events'::regclass AND NOT tgisinternal"
    )
  ).rows[0].total
  assert.equal(immutableTrigger, 1)

  await advance('repeatable-read-snapshot-and-dump')
  const tables = await publicTables(source)
  const snapshot = await source.connect()
  const dump = await open(dumpPath, 'wx', 0o600)
  const dumpLog = await open(path.join(runRoot, 'dump.log'), 'wx', 0o600)
  let sourceFingerprints
  let migrationChecksums
  let snapshotStartedAt
  try {
    await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    snapshotStartedAt = (
      await snapshot.query('SELECT clock_timestamp() AS time')
    ).rows[0].time
    sourceFingerprints = await tableFingerprints(snapshot, tables)
    migrationChecksums = await migrationFacts(snapshot)
    const snapshotId = (
      await snapshot.query('SELECT pg_export_snapshot() AS id')
    ).rows[0].id
    await runDocker(
      [
        POSTGRES_CONTAINER,
        'pg_dump',
        '-Fc',
        '--no-owner',
        '--no-acl',
        '--no-password',
        '-U',
        decodeURIComponent(sourceUrl.username),
        '-d',
        SOURCE_FULL_DATABASE,
        '--snapshot',
        snapshotId,
      ],
      ['ignore', dump.fd, dumpLog.fd]
    )
    await snapshot.query('COMMIT')
  } catch (error) {
    await snapshot.query('ROLLBACK')
    throw error
  } finally {
    snapshot.release()
    await dump.close()
    await dumpLog.close()
  }
  const dumpInfo = await stat(dumpPath)
  assert.ok(dumpInfo.size > 5)
  const dumpReader = await open(dumpPath, 'r')
  try {
    const magic = Buffer.alloc(5)
    assert.equal((await dumpReader.read(magic, 0, 5, 0)).bytesRead, 5)
    assert.equal(magic.toString(), 'PGDMP')
  } finally {
    await dumpReader.close()
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
    'Random target must not preexist'
  )
  targetCreationAttempted = true
  await source.query(`CREATE DATABASE ${targetName}`)
  targetCreated = true
  const restoreLog = await open(path.join(runRoot, 'restore.log'), 'wx', 0o600)
  try {
    await runDocker(
      [
        POSTGRES_CONTAINER,
        'pg_restore',
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
  })
  assert.equal(
    (await restored.query('SELECT current_database() AS name')).rows[0].name,
    targetName
  )
  await verifyMigrationReadiness(restored)
  assert.deepEqual(await publicTables(restored), tables)
  const restoredFingerprints = await tableFingerprints(restored, tables)
  assert.deepEqual(restoredFingerprints, sourceFingerprints)
  assert.deepEqual(await migrationFacts(restored), migrationChecksums)
  assert.equal(
    jsonHash(await factDatabaseRow(restored, loginTraceId)),
    sourceFactHash
  )

  targetStore = await realpath(
    await mkdtemp(path.join(tmpdir(), 'af-audit-recovery-'))
  )
  assert.equal(path.dirname(targetStore), await realpath(tmpdir()))
  assert.match(path.basename(targetStore), /^af-audit-recovery-[A-Za-z0-9]+$/)
  await advance('restored-api-original-session-and-projection')
  targetServer = createServer(restored, noFault, { storageRoot: targetStore })
  let targetOrigin = await targetServer.listen({ host: '127.0.0.1', port: 0 })
  const restoredUser = await apiCall(targetOrigin, '/user/info')
  assert.equal(restoredUser.id, sourceIdentity.current.id)
  assert.equal(restoredUser.tenantId, sourceIdentity.current.tenantId)
  const restoredPage = await apiCall(
    targetOrigin,
    auditQueryEndpoint(loginTraceId)
  )
  assert.deepEqual(stableAuditPage(restoredPage), stableAuditPage(sourcePage))
  assert.equal(assertAuthProjection(restoredPage).id, authFact.id)

  await advance('target-only-current-field-mask-and-null-actor')
  const targetRoleId = await installTargetAuditReader(restored)
  targetMutationIds.push(targetRoleId)
  const maskedPage = await apiCall(
    targetOrigin,
    auditQueryEndpoint(loginTraceId)
  )
  assert.equal(maskedPage.total, 1)
  assert.equal(maskedPage.list[0].operator.id, 'a-admin')
  assert.equal(maskedPage.list[0].operator.name, null)
  assert.ok(maskedPage.list[0].visibleFields.includes('operator.id'))
  assert.ok(maskedPage.list[0].hiddenFields.includes('operator.name'))

  const owner = await targetOwner(restored)
  const systemFactId = randomUUID()
  const systemTraceId = randomUUID()
  const unknownFactId = randomUUID()
  const unknownTraceId = randomUUID()
  await restored.query(
    "INSERT INTO audit_events(tenant_id,id,actor_id,actor_name,module,action,result,target_type,target_id,trace_id,detail) VALUES('tenant-a',$1,NULL,'system',$2,$3,'success',$4,$5,$6,'{}'::jsonb),('tenant-a',$7,NULL,'system','future-unknown','unknown.background','success','legacy-resource',$8,$9,'{}'::jsonb)",
    [
      systemFactId,
      owner.module,
      owner.action,
      owner.targetType,
      owner.id,
      systemTraceId,
      unknownFactId,
      randomUUID(),
      unknownTraceId,
    ]
  )
  targetMutationIds.push(systemFactId, unknownFactId)
  const systemPage = await apiCall(
    targetOrigin,
    auditQueryEndpoint(systemTraceId)
  )
  assert.equal(systemPage.total, 1)
  assert.equal(systemPage.list[0].id, systemFactId)
  assert.equal(systemPage.list[0].operator.id, null)
  assert.equal(systemPage.list[0].operator.name, null)
  assert.deepEqual(systemPage.list[0].visibleFields, [])
  assert.ok(systemPage.list[0].hiddenFields.includes('operator.id'))
  assert.ok(systemPage.list[0].hiddenFields.includes('operator.name'))
  const unknownPage = await apiCall(
    targetOrigin,
    auditQueryEndpoint(unknownTraceId)
  )
  assert.equal(unknownPage.total, 0)
  assert.deepEqual(unknownPage.list, [])
  await assert.rejects(
    restored.query(
      "UPDATE audit_events SET result='failure' WHERE tenant_id='tenant-a' AND id=$1",
      [systemFactId]
    ),
    /append-only/
  )

  await advance('target-api-restart-and-current-revocation')
  await targetServer.close()
  targetServer = undefined
  targetServer = createServer(restored, noFault, { storageRoot: targetStore })
  targetOrigin = await targetServer.listen({ host: '127.0.0.1', port: 0 })
  const restartedMasked = await apiCall(
    targetOrigin,
    auditQueryEndpoint(loginTraceId)
  )
  assert.equal(restartedMasked.list[0].operator.name, null)
  await restored.query(
    "UPDATE roles SET status='disabled',revision=revision+1,updated_at=now() WHERE tenant_id='tenant-a' AND id=$1",
    [targetRoleId]
  )
  const denied = await apiCall(targetOrigin, auditQueryEndpoint(loginTraceId), {
    expectedStatus: 403,
  })
  assert.ok(
    ['FORBIDDEN', 'PERMISSION_DENIED'].includes(denied.businessCode),
    `Unexpected revocation code ${denied.businessCode}`
  )

  await advance('source-session-fact-and-projection-unchanged')
  const finalSourceUser = await apiCall(SOURCE_ORIGIN, '/user/info')
  assert.deepEqual(finalSourceUser, sourceIdentity.current)
  assert.equal(jsonHash(await sessionBinding(source)), sourceSessionHash)
  assert.equal(
    jsonHash(await factDatabaseRow(source, loginTraceId)),
    sourceFactHash
  )
  const finalSourcePage = await apiCall(
    SOURCE_ORIGIN,
    auditQueryEndpoint(loginTraceId)
  )
  assert.deepEqual(
    stableAuditPage(finalSourcePage),
    stableAuditPage(sourcePage)
  )
  assert.equal(
    (
      await source.query(
        "SELECT count(*)::int AS total FROM audit_events WHERE tenant_id='tenant-a' AND (id=ANY($1::text[]) OR trace_id=ANY($2::text[]))",
        [
          [systemFactId, unknownFactId],
          [systemTraceId, unknownTraceId],
        ]
      )
    ).rows[0].total,
    0
  )
  const finalSourceFingerprints = await tableFingerprints(source, tables)
  const sourceTableDifferences = Object.fromEntries(
    tables.flatMap((table) =>
      JSON.stringify(finalSourceFingerprints[table]) ===
      JSON.stringify(sourceFingerprints[table])
        ? []
        : [
            [
              table,
              {
                snapshot: sourceFingerprints[table],
                final: finalSourceFingerprints[table],
              },
            ],
          ]
    )
  )

  reportData = {
    version: 1,
    status: 'validated-awaiting-cleanup',
    stage,
    validatedAt: new Date().toISOString(),
    runId,
    scope,
    caveat,
    sourceDatabase: SOURCE_FULL_DATABASE,
    sourceOrigin: SOURCE_ORIGIN,
    postgresContainer: POSTGRES_CONTAINER,
    targetDatabase: targetName,
    publicTableCount: tables.length,
    sourceTableFingerprints: sourceFingerprints,
    restoredTableFingerprints: restoredFingerprints,
    finalSourceTableFingerprints: finalSourceFingerprints,
    sourceTableDifferences,
    sourceCountsClaimedStaticAfterSnapshot: false,
    migrationCount: migrationChecksums.length,
    migrationChecksums,
    migration028Sha256: MIGRATION_028_SHA256,
    dumpPath: path.relative(process.cwd(), dumpPath),
    dumpBytes: dumpInfo.size,
    dumpSha256,
    dumpFormat: 'PGDMP custom archive',
    snapshotStartedAt: snapshotStartedAt.toISOString(),
    sourceSession: {
      actorId: sourceIdentity.binding.user_id,
      tenantId: sourceIdentity.binding.default_tenant_id,
      epoch: sourceIdentity.binding.epoch,
      unchangedAfterTargetVerification: true,
    },
    immutableSourceFact: {
      id: authFact.id,
      traceId: loginTraceId,
      module: authFact.module,
      action: authFact.action,
      source: authFact.source,
      projectionVersion: authFact.projectionVersion,
      visibleFields: authFact.visibleFields,
      hiddenFields: authFact.hiddenFields,
      databaseHash: sourceFactHash,
      appendOnlyTriggerVerified: true,
    },
    restoredProjectionMatchesSource: true,
    targetOnlyFieldMask: {
      operatorIdVisible: true,
      operatorNameHidden: true,
      roleId: targetRoleId,
    },
    targetOnlyNullActor: {
      factId: systemFactId,
      traceId: systemTraceId,
      ownerKind: owner.kind,
      operatorRemainedNull: true,
      scopeOwnerNotProjectedAsOperator: true,
      unknownFactId,
      unknownTraceId,
      unknownDefaultHidden: true,
    },
    targetApiRestarted: true,
    targetCurrentPermissionRevocationDenied: true,
    sourceFactSessionAndProjectionUnchanged: true,
    targetCreationAttempted,
    targetCreated,
    targetMutationIds,
    copiedFileObjects: 0,
    fileByteRecoveryClaimed: false,
    newPhysicalServerClaimed: false,
    customerDatasetClaimed: false,
    binaryRollbackClaimed: false,
    privateEvidenceDirectory: runRoot,
  }
} catch (error) {
  validationFailure = error
} finally {
  let closureConfirmed = true
  const closeCritical = async (label, run) => {
    try {
      await run()
      return true
    } catch (error) {
      cleanupFailures.push(
        combinedError([error], `${label} was not confirmed closed`)
      )
      closureConfirmed = false
      return false
    }
  }
  await sequence(Array.from(children), async (child) => {
    await closeCritical('docker exec client', () => stopChild(child))
  })
  await sequence(Array.from(ownedBackendMarkers), async (marker) => {
    await closeCritical(`PostgreSQL backend ${marker}`, () =>
      stopOwnedBackends(marker, !uncertainContainerCommands.has(marker))
    )
  })
  if (
    children.size ||
    ownedBackendMarkers.size ||
    uncertainContainerCommands.size
  ) {
    closureConfirmed = false
    cleanupFailures.push(
      new Error(
        `Owned dump/restore lifecycle remains uncertain: clients=${children.size}, backends=${ownedBackendMarkers.size}, containerCommands=${uncertainContainerCommands.size}`
      )
    )
  }
  if (targetServer) {
    const closed = await closeCritical('restored HTTP server', () =>
      targetServer.close()
    )
    if (closed) targetServer = undefined
  }
  if (restored) {
    const closed = await closeCritical('restored PostgreSQL pool', () =>
      restored.end()
    )
    if (closed) restored = undefined
  }
  if (targetCreated && source && closureConfirmed) {
    const dropped = await closeCritical(
      'restored target database',
      async () => {
        assert.match(targetName, /^af_audit_recovery_[a-f0-9]{32}_demo$/)
        assert.ok(targetName.endsWith(`${runKey}_demo`))
        assert.notEqual(targetName, SOURCE_FULL_DATABASE)
        const exists = (
          await source.query(
            'SELECT count(*)::int AS total FROM pg_database WHERE datname=$1',
            [targetName]
          )
        ).rows[0].total
        if (exists === 1) await source.query(`DROP DATABASE ${targetName}`)
        else assert.equal(exists, 0)
        targetRemoved = true
      }
    )
    if (!dropped) closureConfirmed = false
  }
  if (targetStore && closureConfirmed && (!targetCreated || targetRemoved)) {
    const removed = await closeCritical(
      'isolated restored storage',
      async () => {
        assert.equal(path.dirname(targetStore), await realpath(tmpdir()))
        assert.match(
          path.basename(targetStore),
          /^af-audit-recovery-[A-Za-z0-9]+$/
        )
        await rm(targetStore, { recursive: true, force: false })
        targetStoreRemoved = true
      }
    )
    if (!removed) closureConfirmed = false
  }
  if (!closureConfirmed && (targetCreationAttempted || targetStore)) {
    targetCleanupStoppedByBarrier = true
    cleanupFailures.push(
      new Error(
        'Target cleanup stopped before further DROP/rm operations because resource closure was not fully confirmed; the target may remain and requires manual evidence-led inspection'
      )
    )
  }
  if (source) {
    const closed = await closeCritical('source PostgreSQL pool', () =>
      source.end()
    )
    if (closed) source = undefined
  }
  cleanupBarrierConfirmed = closureConfirmed
}

if (validationFailure || cleanupFailures.length) {
  const failed = {
    version: 1,
    status: 'failed',
    stage,
    failedAt: new Date().toISOString(),
    runId,
    scope,
    caveat,
    error: safeError(validationFailure || cleanupFailures[0]),
    cleanupFailures: cleanupFailures.map(safeError),
    sourceDatabase: SOURCE_FULL_DATABASE,
    targetDatabase: targetName,
    targetCreationAttempted,
    targetCreated,
    cleanupBarrierConfirmed,
    targetCleanupStoppedByBarrier,
    ownedDockerClientsRemaining: children.size,
    ownedBackendMarkersRemaining: [...ownedBackendMarkers],
    uncertainContainerCommands: [...uncertainContainerCommands],
    backendLifecycle,
    restoredDatabaseRemoved: targetRemoved,
    restoredStoreRemoved: targetStoreRemoved,
    targetMutationIds,
    dumpPresent: Boolean(await stat(dumpPath).catch(() => undefined)),
    copiedFileObjects: 0,
    fileByteRecoveryClaimed: false,
    newPhysicalServerClaimed: false,
    customerDatasetClaimed: false,
    binaryRollbackClaimed: false,
    privateEvidenceDirectory: runRoot,
  }
  await writeReport(failed)
  throw new Error(
    `Audit recovery failed safely at ${stage}; inspect ${path.relative(
      process.cwd(),
      path.join(runRoot, 'report.json')
    )}`
  )
}

assert.ok(reportData)
assert.equal(targetRemoved, true)
assert.equal(targetStoreRemoved, true)
Object.assign(reportData, {
  status: 'verified',
  stage: 'verified-after-cleanup',
  verifiedAt: new Date().toISOString(),
  restoredDatabaseRemoved: targetRemoved,
  restoredStoreRemoved: targetStoreRemoved,
  cleanupBarrierConfirmed,
  targetCleanupStoppedByBarrier,
  ownedDockerClientsRemaining: children.size,
  ownedBackendMarkersRemaining: [...ownedBackendMarkers],
  uncertainContainerCommands: [...uncertainContainerCommands],
  backendLifecycle,
})
const reportSha256 = await writeReport(reportData)
process.stdout.write(
  `Audit recovery verified ${reportData.publicTableCount} public table counts and checksums, 28 migration checksums, immutable source fact ${reportData.immutableSourceFact.id}, restored current projection, target-only field masking, null-actor ownership, current permission revocation, and API restart. Dump SHA-256 ${reportData.dumpSha256}; report SHA-256 ${reportSha256}. Source count changes after the snapshot are reported without claiming zero drift. No file-byte, new-server, customer-data, or binary rollback recovery is claimed. Target database and isolated store were removed.\n`
)
