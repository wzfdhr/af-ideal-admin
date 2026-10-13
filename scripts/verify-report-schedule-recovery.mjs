import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  mkdir,
  open,
  writeFile,
  mkdtemp,
  rm,
  realpath,
  stat,
} from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pipeline } from 'node:stream/promises'
import { Pool } from 'pg'
import { createServer } from '@af-admin/reference-api/dist/index.js'
import { verifyMigrationReadiness } from '@af-admin/reference-api/dist/migrate.js'
import {
  processReportSchedules,
  REPORT_SCHEDULE_MAINTENANCE_SCOPE_VERSION,
} from '@af-admin/reference-api/dist/report-schedules-worker.js'
import {
  nextReportScheduleOccurrence,
  localReportScheduleDate,
} from '@af-admin/reference-api/dist/report-schedule-calendar.js'
import {
  REPORT_SCHEDULE_PERMISSIONS as S,
  REPORT_EXPORT_PERMISSIONS as E,
  REPORTING_PERMISSIONS as P,
  MEMBER_SCOPE_FIELDS,
} from '@af-admin/contracts'
import {
  processReportExports,
  REPORT_EXPORT_MAINTENANCE_SCOPE_VERSION,
} from '@af-admin/reference-api/dist/report-export-jobs.js'
import { digest } from '@af-admin/reference-api/dist/security.js'
import {
  LocalObjectStore,
  fileDigest,
} from '@af-admin/reference-api/dist/file-storage.js'

assert.equal(
  REPORT_SCHEDULE_MAINTENANCE_SCOPE_VERSION,
  1,
  'Recovery validation requires the scoped report schedule maintenance worker build'
)
assert.equal(
  REPORT_EXPORT_MAINTENANCE_SCOPE_VERSION,
  1,
  'Recovery validation requires the scoped report export maintenance worker build'
)

const evidenceRoot = path.resolve(
  'test-results/full-product/report-schedules-20261013/database-and-file-copy'
)
const runId = randomUUID().replaceAll('-', '')
const runRoot = path.join(evidenceRoot, runId)
const continuationPollFile = path.join(
  runRoot,
  'restored-continuation-poll.jsonl'
)
const targetName = `af_schedule_recovery_${runId}_demo`
const expectedSourceName =
  process.env.REPORT_SCHEDULE_RECOVERY_SOURCE_DATABASE ||
  'af_admin_full_c1b35e6ead774464986c87ea453d847e_demo'
const container =
  process.env.REPORT_SCHEDULE_RECOVERY_POSTGRES_CONTAINER ||
  'af-admin-r1-postgres'
const scope =
  'random independent database inside existing local PostgreSQL, with an independent restored local object store'
const caveat =
  'not a new physical PostgreSQL server, fresh-machine deployment, or verification of every historical attachment; missing preexisting file bytes are explicitly reported'
const children = new Set()
const cleanupFailures = []
const sourceOwnedJobs = new Set()
const mutationIntents = []
const sourceOwnedSchedules = new Set()
const sourceRunCleanup = []
const sessionTokens = new Map()
const actorIds = new Map()
const creatorPassword = `Schedule-recovery-${randomUUID()}`
const sourceJobCleanup = []
const failedByteReferences = []
const fixtures = {}
let sourceUrl
let sourceName
let apiOrigin
let source
let restored
let server
let restoreRoot
let stage = 'guards'
let targetCreated = false
let targetCreationAttempted = false
let targetRemoved = false
let restoreStoreRemoved = false
let sourcePendingSettled = false
let sourceReportClosed = false
let continuationPollStarted = false
let validationFailure
let reportData
let sourceFileRoot

const sequence = (values, run) =>
  values.reduce(async (previous, value) => {
    await previous
    await run(value)
  }, Promise.resolve())
const safeError = (error) => {
  let message =
    error instanceof Error ? error.message : 'Recovery validation failed'
  let decodedPassword = ''
  try {
    decodedPassword = decodeURIComponent(sourceUrl?.password || '')
  } catch {
    decodedPassword = ''
  }
  const secrets = [
    ...sessionTokens.values(),
    creatorPassword,
    sourceUrl?.toString(),
    sourceUrl?.password,
    decodedPassword,
  ].filter(Boolean)
  secrets.forEach((secret) => {
    message = message.replaceAll(secret, '[redacted]')
  })
  return message.slice(0, 1000)
}
const writeReport = async (report) => {
  const text = JSON.stringify(report, null, 2)
  await writeFile(path.join(runRoot, 'report.json'), text, { mode: 0o600 })
  await writeFile(path.join(evidenceRoot, 'report.json'), text, { mode: 0o600 })
}
const parseUrl = (input) => {
  try {
    return new URL(input || '')
  } catch {
    throw new Error(
      'An explicit valid dedicated local recovery connection is required'
    )
  }
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
    'Source, private backup, and restored object stores must be separate directory trees'
  )
}
const stopChild = async (child) => {
  try {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null)
      return
    const exited = once(child, 'exit', { signal: AbortSignal.timeout(5000) })
    const force = setTimeout(() => child.kill('SIGKILL'), 1000)
    child.kill('SIGTERM')
    try {
      await exited
    } finally {
      clearTimeout(force)
    }
  } finally {
    children.delete(child)
  }
}
const runDocker = async (args, stdio, inputPath) => {
  const child = spawn('docker', ['exec', ...args], { stdio })
  children.add(child)
  const exited = once(child, 'exit', { signal: AbortSignal.timeout(120000) })
  try {
    const transfer = inputPath
      ? pipeline(createReadStream(inputPath), child.stdin)
      : Promise.resolve()
    const [result] = await Promise.all([exited, transfer])
    assert.equal(
      result[0],
      0,
      'Actual pg_dump / pg_restore must finish successfully'
    )
  } finally {
    await stopChild(child)
  }
}
const progress = async () =>
  writeReport({
    status: 'running',
    stage,
    scope,
    caveat,
    runId,
    fixtures,
    mutationIntents,
    privateEvidenceDirectory: runRoot,
  })
const advance = async (value) => {
  stage = value
  await progress()
  process.stdout.write(`Schedule recovery phase: ${stage}\n`)
}
const call = async (
  origin,
  endpoint,
  {
    body,
    method = 'GET',
    binary = false,
    expectedStatus = 200,
    key = randomUUID(),
    actor = 'admin',
    operation,
  } = {}
) => {
  const accessToken = sessionTokens.get(actor)
  assert.ok(
    accessToken,
    'Continuation must use the guarded original source session'
  )
  let intent
  if (origin === apiOrigin && method !== 'GET') {
    assert.ok(
      operation,
      'Every source mutation must record its exact server idempotency operation'
    )
    intent = { actorId: actorIds.get(actor), operation, key, method, endpoint }
    assert.ok(intent.actorId)
    mutationIntents.push(intent)
    await progress()
  }
  const response = await fetch(`${origin}/api${endpoint}`, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      'x-access-token': accessToken,
      'x-tenant-id': 'tenant-a',
      'idempotency-key': key,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (binary && response.status === 200)
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type'),
    }
  const payload = await response.json()
  assert.equal(
    response.status,
    expectedStatus,
    `${payload.businessCode || 'HTTP_ERROR'}: ${payload.message || endpoint}`
  )
  if (expectedStatus !== 200) return payload
  assert.equal(payload.code, 20000)
  if (intent) {
    intent.responseId = payload.data?.id || null
    await progress()
  }
  return payload.data
}
const bindSourceSession = async (username, password, actor, expectedId) => {
  const startedAt = (await source.query('SELECT clock_timestamp() AS time'))
    .rows[0].time
  const response = await fetch(`${apiOrigin}/api/user/login`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  assert.equal(response.status, 200)
  const accessToken = (await response.json()).data.token
  assert.equal(typeof accessToken, 'string')
  sessionTokens.set(actor, accessToken)
  const bound = (
    await source.query(
      "SELECT s.user_id,s.default_tenant_id FROM sessions s JOIN session_scopes scope ON scope.token_hash=s.token_hash AND scope.user_id=s.user_id AND scope.tenant_id='tenant-a' JOIN memberships m ON m.tenant_id=scope.tenant_id AND m.user_id=scope.user_id JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE s.token_hash=$1 AND s.user_id=$2 AND s.default_tenant_id='tenant-a' AND s.revoked_at IS NULL AND s.expires_at>now() AND s.created_at>=$3::timestamptz-interval '1 minute' AND scope.epoch=m.session_epoch AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled'",
      [digest(accessToken), expectedId, startedAt]
    )
  ).rows
  assert.equal(
    bound.length,
    1,
    'The fresh HTTP token and session scope must belong to the exact guarded source DB before business writes'
  )
  actorIds.set(actor, expectedId)
  const current = await call(apiOrigin, '/user/info', { actor })
  assert.equal(current.id, expectedId)
  assert.equal(current.tenantId, 'tenant-a')
  return current
}
const registeredTables = async (db) => {
  const names = (
    await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
    )
  ).rows.map((row) => row.table_name)
  assert.ok(names.length >= 24)
  names.forEach((name) =>
    assert.match(
      name,
      /^[a-z][a-z0-9_]*$/,
      'Table counts only use the closed actual application table catalogue'
    )
  )
  const required = [
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
    'applications',
    'application_releases',
    'form_drafts',
    'workflow_drafts',
    'business_records',
    'workflow_instances',
    'workflow_tasks',
    'audit_events',
    'idempotency_records',
    'stored_files',
    'file_uploads',
    'file_parts',
    'report_definitions',
    'report_definition_versions',
    'report_export_jobs',
    'report_export_artifacts',
    'report_export_events',
    'report_schedules',
    'report_schedule_versions',
    'report_schedule_periods',
    'report_schedule_runs',
    'report_schedule_run_recipients',
    'report_export_recipient_grants',
    'report_schedule_events',
  ]
  required.forEach((name) =>
    assert.ok(
      names.includes(name),
      `Complete database backup must include ${name}`
    )
  )
  return names
}
const counts = async (db, tables) => {
  const result = {}
  await sequence(tables, async (table) => {
    result[table] = (
      await db.query(`SELECT count(*)::int AS total FROM ${table}`)
    ).rows[0].total
  })
  return result
}
const assertExportWorkerOwnsOnlyFixtures = async (db, ids = []) => {
  const foreign = (
    await db.query(
      "SELECT count(*)::int AS total FROM report_export_jobs j WHERE NOT(j.tenant_id='tenant-a' AND j.id=ANY($1::text[])) AND (j.status IN('queued','processing') OR (j.retention_until<=now() AND EXISTS(SELECT 1 FROM report_export_artifacts a WHERE a.tenant_id=j.tenant_id AND a.job_id=j.id AND a.status<>'expired'))) ",
      [ids]
    )
  ).rows[0].total
  const purges = (
    await db.query(
      "SELECT count(*)::int AS total FROM report_export_artifacts WHERE status='expired' AND purged_at IS NULL"
    )
  ).rows[0].total
  assert.equal(
    foreign,
    0,
    'Pause the source export worker and settle older queued/processing/expiring jobs before this isolated fixture-only validation'
  )
  assert.equal(
    purges,
    0,
    'Preexisting artifact purge work must finish before fixture-only recovery validation'
  )
}
const ownJobIds = async (db) =>
  fixtures.definitionVersionId && fixtures.creatorId
    ? (
        await db.query(
          "SELECT id FROM report_export_jobs WHERE tenant_id='tenant-a' AND created_by=$1 AND definition_version_id=$2",
          [fixtures.creatorId, fixtures.definitionVersionId]
        )
      ).rows.map((row) => row.id)
    : []
const assertWorkerOwnsOnlyFixtures = async (
  db,
  scheduleIds = [],
  jobIds = []
) => {
  await assertExportWorkerOwnsOnlyFixtures(db, jobIds)
  const foreign = (
    await db.query(
      "SELECT (SELECT count(*) FROM report_schedules WHERE enabled AND NOT(tenant_id='tenant-a' AND id=ANY($1::text[])))::int AS active,(SELECT count(*) FROM report_schedule_periods WHERE NOT(tenant_id='tenant-a' AND schedule_id=ANY($1::text[])) AND cursor_at<=clock_timestamp() AND (closed_at IS NULL OR cursor_at<=closed_at))::int AS due,(SELECT count(*) FROM report_schedule_runs WHERE NOT(tenant_id='tenant-a' AND schedule_id=ANY($1::text[])) AND status IN('queued','processing','waiting-exports'))::int AS runs,(SELECT count(*) FROM report_schedule_run_recipients recipient JOIN report_schedule_runs run ON run.tenant_id=recipient.tenant_id AND run.id=recipient.run_id WHERE NOT(run.tenant_id='tenant-a' AND run.schedule_id=ANY($1::text[])) AND recipient.status IN('queued','processing','waiting-export'))::int AS recipients,(SELECT count(*) FROM report_schedule_runs run JOIN memberships m ON m.tenant_id=run.tenant_id AND m.user_id=run.created_by JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE NOT(run.tenant_id='tenant-a' AND run.schedule_id=ANY($1::text[])) AND run.status IN('failed','blocked','partial-failed') AND run.alert_notified_at IS NULL AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled' AND (af_effective_permissions(m.tenant_id,m.user_id) ? 'report:schedule:run:read' OR af_effective_permissions(m.tenant_id,m.user_id) ? '*') AND af_historical_member_scope_visible(m.tenant_id,m.user_id,'report:schedule:run:read',run.created_by))::int AS alerts",
      [scheduleIds]
    )
  ).rows[0]
  assert.deepEqual(
    foreign,
    { active: 0, due: 0, runs: 0, recipients: 0, alerts: 0 },
    'Pause the complete source worker and settle foreign active schedules, durable backlog, recipients and actionable alerts before fixture-only recovery'
  )
}
const clock = async (db) =>
  (await db.query('SELECT clock_timestamp() AS time')).rows[0].time
const pause = async (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
const waitBeforeArming = async () => {
  const deadline = performance.now() + 120000
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  })
  let now = await clock(source)
  const waiting = () =>
    now.getUTCSeconds() > 30 || formatter.format(now) === '23:59'
  await sequence(Array.from({ length: 120 }), async () => {
    if (!waiting()) return
    assert.ok(
      performance.now() < deadline,
      'A safe natural minute must become available without a forced clock'
    )
    await pause(1000)
    now = await clock(source)
  })
  assert.equal(
    waiting(),
    false,
    'Arming must occur within a real early minute and cannot cross local midnight'
  )
  return now
}
const waitUntilSlot = async (db, slot) => {
  const deadline = performance.now() + 120000
  let now = await clock(db)
  let lastProgress = performance.now()
  await sequence(Array.from({ length: 120 }), async () => {
    if (now >= slot) return
    assert.ok(
      performance.now() < deadline,
      'The restored real clock must reach the durable next natural minute'
    )
    if (performance.now() - lastProgress >= 10000) {
      process.stdout.write(
        'Schedule recovery is waiting for the actual restored calendar slot.\n'
      )
      lastProgress = performance.now()
    }
    await pause(Math.min(1000, Math.max(50, slot.getTime() - now.getTime())))
    now = await clock(db)
  })
  assert.ok(now >= slot, 'No worker execution may precede the actual slot')
}
const diagnosticCode = (value) =>
  typeof value === 'string'
    ? value.replace(/[^A-Z0-9_.:-]/g, '?').slice(0, 120)
    : null
const diagnosticState = (kind, row) => ({
  id: row.id,
  status: row.status,
  stage: row.stage ?? null,
  attempts: row.attempts,
  nextAttemptAt: row.next_attempt_at.toISOString(),
  errorCode: diagnosticCode(row.error_code),
  message: row.error_code
    ? `${kind} worker error code recorded; dynamic error text omitted.`
    : `${kind} worker state observed; dynamic payloads omitted.`,
})
const continuationState = async (db, scheduleId) => {
  const [time, runs, recipients, exports] = await Promise.all([
    db.query('SELECT clock_timestamp() AS time'),
    db.query(
      "SELECT id,status,attempts,next_attempt_at,error_code FROM report_schedule_runs WHERE tenant_id='tenant-a' AND schedule_id=$1 ORDER BY slot_at,id",
      [scheduleId]
    ),
    db.query(
      "SELECT recipient.id,recipient.status,recipient.attempts,recipient.next_attempt_at,recipient.error_code FROM report_schedule_run_recipients recipient JOIN report_schedule_runs run ON run.tenant_id=recipient.tenant_id AND run.id=recipient.run_id WHERE run.tenant_id='tenant-a' AND run.schedule_id=$1 ORDER BY recipient.id",
      [scheduleId]
    ),
    db.query(
      "SELECT job.id,job.status,job.stage,job.attempts,job.next_attempt_at,job.error_code FROM report_export_jobs job JOIN report_schedule_run_recipients recipient ON recipient.tenant_id=job.tenant_id AND recipient.export_job_id=job.id JOIN report_schedule_runs run ON run.tenant_id=recipient.tenant_id AND run.id=recipient.run_id WHERE run.tenant_id='tenant-a' AND run.schedule_id=$1 ORDER BY job.id",
      [scheduleId]
    ),
  ])
  return {
    pgClock: time.rows[0].time.toISOString(),
    hostClock: new Date().toISOString(),
    runs: runs.rows.map((row) => diagnosticState('Schedule run', row)),
    recipients: recipients.rows.map((row) =>
      diagnosticState('Schedule recipient', row)
    ),
    exports: exports.rows.map((row) => diagnosticState('Report export', row)),
  }
}
const appendContinuationDiagnostic = async (record, overwrite = false) =>
  writeFile(continuationPollFile, `${JSON.stringify(record)}\n`, {
    mode: 0o600,
    flag: overwrite ? 'w' : 'a',
  })
const nextContinuationPause = (snapshot) => {
  const pgTime = Date.parse(snapshot.pgClock)
  const nextAttempts = [
    ...snapshot.runs.filter((row) => row.status === 'queued'),
    ...snapshot.recipients.filter((row) => row.status === 'queued'),
    ...snapshot.exports.filter((row) => row.status === 'queued'),
  ]
    .map((row) => Date.parse(row.nextAttemptAt))
    .filter((value) => Number.isFinite(value) && value > pgTime)
  if (!nextAttempts.length) return 500
  return Math.min(10000, Math.max(250, Math.min(...nextAttempts) - pgTime + 50))
}
const terminalContinuation = (snapshot) => {
  const terminal = [
    ...snapshot.runs
      .filter((row) =>
        ['partial-failed', 'failed', 'blocked', 'cancelled'].includes(
          row.status
        )
      )
      .map((row) => ({ kind: 'run', ...row })),
    ...snapshot.recipients
      .filter((row) =>
        ['failed', 'blocked', 'skipped', 'cancelled'].includes(row.status)
      )
      .map((row) => ({ kind: 'recipient', ...row })),
    ...snapshot.exports
      .filter((row) =>
        ['failed', 'blocked', 'cancelled', 'infected'].includes(row.status)
      )
      .map((row) => ({ kind: 'export', ...row })),
  ]
  return terminal[0]
}
const completeRestoredContinuation = async (
  db,
  storageRoot,
  schedule,
  scheduleScope
) => {
  const timeoutMilliseconds = 360000
  const started = performance.now()
  const deadline = started + timeoutMilliseconds
  let iteration = 0
  continuationPollStarted = true
  await appendContinuationDiagnostic(
    {
      type: 'poll-start',
      timeoutMilliseconds,
      hostClock: new Date().toISOString(),
      message:
        'Private worker-state evidence; dynamic error text, tokens, and business payloads are omitted.',
    },
    true
  )
  let snapshot = await continuationState(db, schedule.id)
  await appendContinuationDiagnostic({
    type: 'state',
    phase: 'before-worker',
    iteration,
    elapsedMilliseconds: Math.round(performance.now() - started),
    ...snapshot,
  })
  const poll = async () => {
    if (performance.now() >= deadline) return null
    iteration += 1
    const jobs = await ownJobIds(db)
    await assertWorkerOwnsOnlyFixtures(db, [schedule.id], jobs)
    await processReportSchedules(
      db,
      { storageRoot },
      undefined,
      10,
      scheduleScope
    )
    const exportJobs = await ownJobIds(db)
    await assertWorkerOwnsOnlyFixtures(db, [schedule.id], exportJobs)
    if (exportJobs.length)
      await processReportExports(db, { storageRoot }, undefined, 10, {
        tenantId: 'tenant-a',
        jobIds: exportJobs,
      })
    await processReportSchedules(
      db,
      { storageRoot },
      undefined,
      10,
      scheduleScope
    )
    snapshot = await continuationState(db, schedule.id)
    await appendContinuationDiagnostic({
      type: 'state',
      phase: 'after-worker',
      iteration,
      elapsedMilliseconds: Math.round(performance.now() - started),
      ...snapshot,
    })
    assert.ok(
      snapshot.runs.length <= 1,
      'The restored natural slot must materialize exactly one run'
    )
    if (snapshot.runs[0]?.status === 'completed') return snapshot.runs[0]
    const terminal = terminalContinuation(snapshot)
    if (terminal)
      throw new Error(
        `Restored continuation entered terminal ${terminal.kind} status ${
          terminal.status
        } (${
          terminal.errorCode || 'NO_ERROR_CODE'
        }); dynamic error text omitted`
      )
    const remaining = deadline - performance.now()
    if (remaining <= 0) return null
    await pause(Math.min(nextContinuationPause(snapshot), remaining))
    return poll()
  }
  const completed = await poll()
  if (completed) return completed
  snapshot = await continuationState(db, schedule.id)
  await appendContinuationDiagnostic({
    type: 'poll-timeout',
    iteration,
    elapsedMilliseconds: Math.round(performance.now() - started),
    ...snapshot,
  })
  throw new Error(
    `Restored continuation did not complete within ${timeoutMilliseconds}ms; inspect the private PostgreSQL/host-clock and next-attempt diagnostics`
  )
}
const assertSourceUnexecuted = async () => {
  if (!fixtures.scheduleId) return
  const facts = (
    await source.query(
      "SELECT (SELECT count(*) FROM report_schedule_runs WHERE tenant_id='tenant-a' AND schedule_id=$1)::int AS runs,(SELECT count(*) FROM report_schedule_run_recipients recipient JOIN report_schedule_runs run ON run.tenant_id=recipient.tenant_id AND run.id=recipient.run_id WHERE run.tenant_id='tenant-a' AND run.schedule_id=$1)::int AS recipients,(SELECT count(*) FROM report_export_jobs WHERE tenant_id='tenant-a' AND created_by=$2 AND definition_version_id=$3)::int AS exports",
      [fixtures.scheduleId, fixtures.creatorId, fixtures.definitionVersionId]
    )
  ).rows[0]
  assert.deepEqual(
    facts,
    { runs: 0, recipients: 0, exports: 0 },
    'Source workers must remain paused; target continuation cannot execute source facts'
  )
}
const civilDate = (timestamp, timeZone) => {
  assert.ok(Number.isFinite(Date.parse(timestamp)))
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const part = (type) => parts.find((value) => value.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}
const metadata = (id) => ({ kind: 'metadata', id })
const field = (catalogue, label) => {
  const match = catalogue.visibleFields.find(
    (value) => value.reference.kind === 'field' && value.label === label
  )
  assert.ok(match, `The actual current source must register ${label}`)
  return match.reference
}
const exportFacts = async (db, id) =>
  (
    await db.query(
      "SELECT (SELECT count(*) FROM report_export_artifacts WHERE tenant_id='tenant-a' AND job_id=$1)::int AS artifacts,(SELECT count(*) FROM report_export_events WHERE tenant_id='tenant-a' AND job_id=$1 AND action='completed')::int AS events,(SELECT count(*) FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='report-export.completed')::int AS audits",
      [id]
    )
  ).rows[0]
const readyJob = async (origin, id) => {
  const job = await call(origin, `/reporting/exports/${id}`, {
    actor: 'creator',
  })
  assert.equal(
    job.status,
    'completed',
    `${job.errorCode || 'EXPORT_NOT_COMPLETED'}: ${
      job.errorMessage || 'Actual export must complete'
    }`
  )
  assert.equal(job.stage, 'completed')
  assert.equal(job.totalRows, 1)
  assert.equal(job.processedRows, 1)
  assert.equal(job.artifact.status, 'ready')
  assert.match(job.artifact.scanEngine, /^ClamAV /)
  assert.ok(job.allowedActions.includes('download'))
  return job
}
const readBytes = async (origin, job) => {
  const download = await call(origin, `/reporting/exports/${job.id}/content`, {
    binary: true,
    actor: 'creator',
  })
  assert.equal(download.bytes.length, job.artifact.size)
  assert.equal(fileDigest(download.bytes), job.artifact.sha256)
  assert.equal(download.mimeType, job.artifact.mimeType)
  return download.bytes
}
try {
  await mkdir(runRoot, { recursive: true, mode: 0o700 })
  await writeReport({
    status: 'running',
    startedAt: new Date().toISOString(),
    scope,
    caveat,
    runId,
  })
  sourceUrl = parseUrl(process.env.DATABASE_URL)
  sourceName = decodeURIComponent(sourceUrl.pathname.slice(1))
  const apiUrl = parseUrl(process.env.R1_API_URL || 'http://127.0.0.1:10890')
  apiOrigin = apiUrl.origin
  if (
    process.env.APP_MODE !== 'demo' ||
    process.env.REPORT_SCHEDULE_RECOVERY_WORKERS_PAUSED !== 'yes' ||
    !/^[A-Za-z][A-Za-z0-9_]*_demo$/.test(expectedSourceName) ||
    expectedSourceName === 'af_admin_r1' ||
    sourceName !== expectedSourceName ||
    sourceName === 'af_admin_r1' ||
    sourceUrl.hostname !== '127.0.0.1' ||
    !['postgres:', 'postgresql:'].includes(sourceUrl.protocol) ||
    !sourceUrl.username ||
    sourceUrl.search ||
    sourceUrl.hash ||
    apiOrigin !== 'http://127.0.0.1:10890' ||
    apiUrl.pathname !== '/' ||
    apiUrl.search ||
    apiUrl.hash ||
    apiUrl.username ||
    apiUrl.password
  )
    throw new Error(
      'Report schedule recovery requires the exact explicitly expected local demo database and credential-free http://127.0.0.1:10890 origin, plus REPORT_SCHEDULE_RECOVERY_WORKERS_PAUSED=yes after explicitly pausing the complete source worker; af_admin_r1 is forbidden'
    )
  assert.match(
    container,
    /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
    'The PostgreSQL container name must be explicit and valid'
  )
  assert.match(targetName, /^af_schedule_recovery_[a-f0-9]{32}_demo$/)
  assert.notEqual(targetName, sourceName)
  assert.ok(
    process.env.FILE_STORAGE_DIR,
    'The source API actual FILE_STORAGE_DIR must be explicit'
  )
  sourceFileRoot = await realpath(process.env.FILE_STORAGE_DIR)
  const objectBackupDirectory = path.join(runRoot, 'object-backup')
  await mkdir(objectBackupDirectory, { recursive: true, mode: 0o700 })
  const objectBackupRoot = await realpath(objectBackupDirectory)
  restoreRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), 'af-report-schedule-restore-'))
  )
  assertIndependentRoots(sourceFileRoot, objectBackupRoot)
  assertIndependentRoots(sourceFileRoot, restoreRoot)
  assertIndependentRoots(objectBackupRoot, restoreRoot)
  const originalStore = new LocalObjectStore(sourceFileRoot)
  const backupStore = new LocalObjectStore(objectBackupRoot)
  const restoredStore = new LocalObjectStore(restoreRoot)
  source = new Pool({
    connectionString: sourceUrl.toString(),
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  })
  source.on('error', (error) => {
    validationFailure ||= error
  })
  assert.equal(
    (await source.query('SELECT current_database() AS name')).rows[0].name,
    sourceName
  )
  await verifyMigrationReadiness(source)
  assert.equal(
    (await source.query('SELECT count(*)::int AS total FROM schema_migrations'))
      .rows[0].total,
    26
  )
  await assertWorkerOwnsOnlyFixtures(source)
  assert.equal(
    (
      await source.query(
        "SELECT checksum FROM schema_migrations WHERE name='026_report_schedules.sql'"
      )
    ).rows[0].checksum,
    'e982560131cac3497c3534fcc021a24edb5517002c48e12cdfbeec8b4602c474'
  )
  const ready = await fetch(`${apiOrigin}/ready`, {
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(ready.status, 200)
  const context = await fetch(`${apiOrigin}/api/runtime-context`, {
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(context.status, 200)
  assert.equal((await context.json()).data.mode, 'demo')
  await advance('source-session-binding')
  await bindSourceSession('a-admin', 'a-admin', 'admin', 'a-admin')
  await advance('synthetic-origin-and-source')
  const suffix = runId.slice(0, 8)
  fixtures.creatorUsername = `schedule-recovery-${suffix}`
  const user = await call(apiOrigin, '/system/users', {
    method: 'POST',
    operation: 'user:create',
    body: {
      username: `schedule-recovery-${suffix}`,
      name: `定时恢复合成主体-${suffix}`,
      phone: '',
      email: '',
      initialPassword: creatorPassword,
      status: 'enabled',
    },
  })
  fixtures.creatorId = user.id
  const role = await call(apiOrigin, '/system/roles', {
    method: 'POST',
    operation: 'role:create',
    body: {
      roleName: `定时恢复唯一收件角色-${suffix}`,
      roleKey: `schedule-recovery-${suffix}`,
      roleSort: 0,
      status: 'enabled',
      remark: '独立恢复合成角色',
      permissions: [
        ...Object.values(S),
        ...Object.values(E),
        P.query,
        P.fieldApplicant,
        P.fieldBusiness,
        'business:read:self',
        'business:create',
        'business:update:self',
        'business:submit',
      ],
    },
  })
  fixtures.recipientRoleId = role.id
  const scopes = await call(
    apiOrigin,
    `/permissions/data-scopes?keyword=${encodeURIComponent(
      role.roleName
    )}&pageSize=100`
  )
  const scopeRule = scopes.list.find((value) => value.roleId === role.id)
  assert.ok(
    scopeRule,
    'Read the exact newly created role scope rather than assume revision'
  )
  await call(apiOrigin, `/permissions/data-scopes/${role.id}`, {
    method: 'PUT',
    operation: `data-scope:${role.id}`,
    body: {
      dataScope: 'self',
      departmentIds: [],
      fieldPermissions: MEMBER_SCOPE_FIELDS,
      expectedRevision: scopeRule.revision,
    },
  })
  await call(apiOrigin, `/system/users/${user.id}/authorization`, {
    method: 'POST',
    operation: `authorization:${user.id}`,
    body: {
      roleIds: [role.id],
      directPermissions: [],
      expectedRevision: user.revision,
    },
  })
  await bindSourceSession(
    fixtures.creatorUsername,
    creatorPassword,
    'creator',
    user.id
  )
  const app = await call(apiOrigin, '/application-center', {
    method: 'POST',
    operation: 'application:create',
    body: {
      name: `定时恢复真实来源-${suffix}`,
      code: `schedule-recovery-${suffix}`,
      template: 'equipment',
    },
  })
  fixtures.applicationId = app.id
  const form = await call(apiOrigin, `/form-schemas/${app.formDraftId}`)
  const workflow = await call(apiOrigin, `/workflows/${app.workflowDraftId}`)
  const release = await call(apiOrigin, `/applications/${app.id}/releases`, {
    method: 'POST',
    operation: `publish:${app.id}`,
    body: {
      formDraftId: form.id,
      workflowDraftId: workflow.id,
      formRevision: form.revision,
      workflowRevision: workflow.revision,
      expectedRevision: app.revision,
    },
  })
  fixtures.sourceReleaseId = release.id
  const catalogues = await call(
    apiOrigin,
    `/reporting/sources?applicationId=${encodeURIComponent(app.id)}`
  )
  assert.equal(catalogues.total, 1)
  assert.equal(catalogues.list.length, 1)
  const catalogue = catalogues.list[0]
  assert.equal(catalogue.sourceReleaseId, release.id)
  const quantity = field(catalogue, '领用数量')
  const price = field(catalogue, '参考单价（元）')
  const item = field(catalogue, '设备名称')
  const originalReportName = `定时恢复固定报表-${suffix}`
  const schema = {
    version: 1,
    name: originalReportName,
    source: { kind: 'application-records', applicationId: app.id },
    kind: 'detail',
    metric: 'count',
    factTime: 'createdAt',
    timeZone: 'Asia/Shanghai',
    fields: [
      metadata('id'),
      metadata('createdAt'),
      metadata('status'),
      item,
      quantity,
      price,
    ],
  }
  const draft = await call(apiOrigin, '/reporting/definitions', {
    method: 'POST',
    operation: 'reporting.create',
    body: { schema },
  })
  fixtures.reportId = draft.id
  const definition = await call(
    apiOrigin,
    `/reporting/definitions/${draft.id}/publish`,
    {
      method: 'POST',
      operation: `reporting.publish:${draft.id}`,
      body: { expectedRevision: draft.revision },
    }
  )
  fixtures.definitionVersionId = definition.activeVersionId
  assert.equal(definition.versions.length, 1)
  await waitBeforeArming()
  const record = await call(apiOrigin, '/business/records', {
    actor: 'creator',
    method: 'POST',
    operation: 'business:create',
    body: {
      applicationReleaseId: release.id,
      fields: {
        itemName: `定时恢复合成设备-${suffix}`,
        quantity: 1,
        unitPrice: '12.34',
        reason: '自然时隙和独立数据库、字节存储恢复验证',
      },
    },
  })
  fixtures.recordId = record.id
  const actualRecord = await call(apiOrigin, `/business/records/${record.id}`, {
    actor: 'creator',
  })
  assert.equal(actualRecord.status, 'draft')
  assert.equal(actualRecord.fields.unitPrice, '12.34')
  const boundFixture = (
    await source.query(
      "SELECT r.applicant_id,r.fields,d.active_version_id FROM business_records r JOIN report_definitions d ON d.tenant_id=r.tenant_id AND d.id=$2 WHERE r.tenant_id='tenant-a' AND r.id=$1",
      [record.id, definition.id]
    )
  ).rows[0]
  assert.equal(boundFixture.applicant_id, user.id)
  assert.equal(boundFixture.fields.unitPrice, '12.34')
  assert.equal(boundFixture.active_version_id, definition.activeVersionId)
  await assertWorkerOwnsOnlyFixtures(source)
  await advance('arm-next-natural-minute')
  const beforeArming = await waitBeforeArming()
  const proposedSlot = new Date(
    Math.floor(beforeArming.getTime() / 60000) * 60000 + 60000
  )
  assert.equal(
    localReportScheduleDate(schema.timeZone, proposedSlot),
    civilDate(actualRecord.createdAt, schema.timeZone),
    'The true current-period slot must include the actual owned record date; midnight drift is an explicit failure'
  )
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: schema.timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(proposedSlot)
  const scheduleSchema = {
    version: 1,
    name: `定时恢复待执行规则-${suffix}`,
    definitionVersionId: definition.activeVersionId,
    timing: { frequency: 'daily', timeZone: schema.timeZone, time },
    dataWindow: 'current-period',
    recipients: { kind: 'role', roleId: role.id },
    format: 'csv',
  }
  assert.equal(
    nextReportScheduleOccurrence(scheduleSchema.timing, beforeArming).getTime(),
    proposedSlot.getTime()
  )
  const schedule = await call(apiOrigin, '/reporting/schedules', {
    actor: 'creator',
    method: 'POST',
    operation: 'report-schedule.create',
    body: { schema: scheduleSchema, enabled: true },
  })
  fixtures.scheduleId = schedule.id
  sourceOwnedSchedules.add(schedule.id)
  fixtures.ruleVersionId = schedule.activeVersionId
  const pendingPeriod = (
    await source.query(
      "SELECT * FROM report_schedule_periods WHERE tenant_id='tenant-a' AND id=(SELECT active_period_id FROM report_schedules WHERE tenant_id='tenant-a' AND id=$1)",
      [schedule.id]
    )
  ).rows[0]
  fixtures.periodId = pendingPeriod.id
  fixtures.slotAt = pendingPeriod.cursor_at.toISOString()
  assert.equal(schedule.nextRunAt, fixtures.slotAt)
  assert.equal(pendingPeriod.cursor_at.getTime(), proposedSlot.getTime())
  assert.ok(pendingPeriod.started_at < proposedSlot)
  await assertSourceUnexecuted()
  await assertWorkerOwnsOnlyFixtures(source, [schedule.id])
  await advance('source-snapshot-and-byte-backup')
  const snapshotStartedAt = await clock(source)
  assert.ok(
    snapshotStartedAt < proposedSlot,
    'The complete backup must start before the first natural slot'
  )
  const dumpPath = path.join(runRoot, 'snapshot.dump')
  const dump = await open(dumpPath, 'w', 0o600)
  const dumpLog = await open(path.join(runRoot, 'restore.log'), 'w', 0o600)
  const snapshot = await source.connect()
  let sourceCounts
  let tables
  let migrationChecksums
  let references
  const copiedObjects = []
  const missingExistingFiles = []
  try {
    await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const snapshotId = (
      await snapshot.query('SELECT pg_export_snapshot() AS id')
    ).rows[0].id
    tables = await registeredTables(snapshot)
    sourceCounts = await counts(snapshot, tables)
    migrationChecksums = (
      await snapshot.query(
        'SELECT name,checksum FROM schema_migrations ORDER BY name'
      )
    ).rows
    assert.equal(migrationChecksums.length, 26)
    const artifacts = (
      await snapshot.query(
        "SELECT tenant_id,id,job_id,object_key,size,sha256,status FROM report_export_artifacts WHERE status<>'expired' ORDER BY tenant_id,id"
      )
    ).rows.map((row) => ({ ...row, kind: 'report-artifact' }))
    const files = (
      await snapshot.query(
        "SELECT tenant_id,id,object_key,size,sha256,status FROM stored_files WHERE status<>'deleted' ORDER BY tenant_id,id"
      )
    ).rows.map((row) => ({ ...row, kind: 'stored-file' }))
    const parts = (
      await snapshot.query(
        'SELECT tenant_id,upload_id AS "uploadId",part_index AS "partIndex",object_key,size,sha256 FROM file_parts ORDER BY tenant_id,upload_id,part_index'
      )
    ).rows.map((row) => ({ ...row, kind: 'file-part' }))
    references = [...artifacts, ...files, ...parts]
    await writeFile(
      path.join(runRoot, 'object-manifest.json'),
      JSON.stringify(
        { status: 'planned', references, copiedObjects, missingExistingFiles },
        null,
        2
      ),
      { mode: 0o600 }
    )
    const grouped = new Map()
    references.forEach((reference) => {
      assert.match(reference.object_key, /^[a-f0-9]{64}$/)
      const previous = grouped.get(reference.object_key)
      if (previous) {
        assert.equal(previous[0].size, reference.size)
        assert.equal(previous[0].sha256, reference.sha256)
        previous.push(reference)
      } else grouped.set(reference.object_key, [reference])
    })
    await runDocker(
      [
        container,
        'pg_dump',
        '-Fc',
        '--no-owner',
        '--no-acl',
        '--no-password',
        '-U',
        decodeURIComponent(sourceUrl.username),
        '-d',
        sourceName,
        '--snapshot',
        snapshotId,
      ],
      ['ignore', dump.fd, dumpLog.fd]
    )
    await sequence(Array.from(grouped.entries()), async ([key, owners]) => {
      let bytes
      try {
        bytes = await originalStore.get(key)
      } catch (error) {
        if (
          error.businessCode === 'STORAGE_UNAVAILABLE' &&
          owners.every((owner) => owner.kind === 'stored-file')
        ) {
          missingExistingFiles.push(
            ...owners.map((owner) => ({
              ...owner,
              reason: 'source-byte-object-missing',
            }))
          )
          return
        }
        failedByteReferences.push(
          ...owners.map((owner) => ({
            ...owner,
            reason: 'required-source-byte-read-failed',
          }))
        )
        throw error
      }
      const expected = owners[0]
      try {
        assert.equal(bytes.length, expected.size)
        assert.equal(fileDigest(bytes), expected.sha256)
      } catch (error) {
        failedByteReferences.push(
          ...owners.map((owner) => ({
            ...owner,
            reason: 'source-byte-size-or-hash-mismatch',
          }))
        )
        throw error
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
    references
      .filter((reference) => reference.kind === 'file-part')
      .forEach((part) =>
        assert.ok(
          copiedObjects.some(
            (object) =>
              object.objectKey === part.object_key &&
              object.sha256 === part.sha256 &&
              object.size === part.size
          ),
          'Every captured file part must have actual copied and restored bytes'
        )
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
  await writeFile(
    path.join(runRoot, 'object-manifest.json'),
    JSON.stringify(
      { references, copiedObjects, missingExistingFiles },
      null,
      2
    ),
    { mode: 0o600 }
  )
  const dumpInfo = await stat(dumpPath)
  const dumpHeader = await open(dumpPath, 'r')
  try {
    const magic = Buffer.alloc(5)
    assert.equal((await dumpHeader.read(magic, 0, 5, 0)).bytesRead, 5)
    assert.equal(magic.toString(), 'PGDMP')
    assert.ok(dumpInfo.size > 5)
  } finally {
    await dumpHeader.close()
  }
  await advance('database-restore')
  assert.equal(
    (
      await source.query(
        'SELECT count(*)::int AS total FROM pg_database WHERE datname=$1',
        [targetName]
      )
    ).rows[0].total,
    0,
    'The random restore target must not preexist'
  )
  targetCreationAttempted = true
  await source.query(`CREATE DATABASE ${targetName}`)
  targetCreated = true
  const restoreLog = await open(path.join(runRoot, 'restore.log'), 'a', 0o600)
  try {
    await runDocker(
      [
        '-i',
        container,
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
    statement_timeout: 15000,
  })
  restored.on('error', (error) => {
    validationFailure ||= error
  })
  assert.equal(
    (await restored.query('SELECT current_database() AS name')).rows[0].name,
    targetName
  )
  await verifyMigrationReadiness(restored)
  assert.deepEqual(await registeredTables(restored), tables)
  const restoredCounts = await counts(restored, tables)
  assert.deepEqual(restoredCounts, sourceCounts)
  assert.equal(restoredCounts.schema_migrations, 26)
  assert.deepEqual(
    (
      await restored.query(
        'SELECT name,checksum FROM schema_migrations ORDER BY name'
      )
    ).rows,
    migrationChecksums
  )
  const restoreCompletedAt = await clock(restored)
  assert.ok(
    restoreCompletedAt < proposedSlot,
    'Database and all referenced byte objects must finish restoring before the first natural slot; do not relabel a late restore'
  )
  await advance('restored-original-session-and-fixed-rule')
  server = createServer(restored, undefined, { storageRoot: restoreRoot })
  let restoredOrigin = await server.listen({ host: '127.0.0.1', port: 0 })
  const restoredAdmin = await call(restoredOrigin, '/user/info')
  assert.equal(restoredAdmin.id, 'a-admin')
  assert.equal(restoredAdmin.tenantId, 'tenant-a')
  const restoredCreator = await call(restoredOrigin, '/user/info', {
    actor: 'creator',
  })
  assert.equal(restoredCreator.id, user.id)
  assert.equal(restoredCreator.tenantId, 'tenant-a')
  const copiedRule = await call(
    restoredOrigin,
    `/reporting/schedules/${schedule.id}`,
    { actor: 'creator' }
  )
  assert.deepEqual(copiedRule.schema, schedule.schema)
  assert.equal(copiedRule.activeVersionId, schedule.activeVersionId)
  assert.equal(copiedRule.nextRunAt, fixtures.slotAt)
  const copiedPeriod = (
    await restored.query(
      "SELECT * FROM report_schedule_periods WHERE tenant_id='tenant-a' AND id=$1",
      [pendingPeriod.id]
    )
  ).rows[0]
  assert.equal(copiedPeriod.rule_version_id, pendingPeriod.rule_version_id)
  assert.equal(copiedPeriod.cursor_at.getTime(), proposedSlot.getTime())
  assert.equal(
    copiedPeriod.started_at.getTime(),
    pendingPeriod.started_at.getTime()
  )
  assert.equal(
    (
      await call(
        restoredOrigin,
        `/reporting/schedules/runs?scheduleId=${schedule.id}`,
        { actor: 'creator' }
      )
    ).total,
    0
  )
  await assertSourceUnexecuted()
  // No target HTTP writes can race the global export renderer. Close and drain the restored API first,
  // then prove the copied database has no foreign worker work before executing only owned schedule scope.
  await server.close()
  server = undefined
  const scheduleScope = { tenantId: 'tenant-a', scheduleIds: [schedule.id] }
  await assertWorkerOwnsOnlyFixtures(restored, [schedule.id], [])
  await advance('actual-calendar-slot-and-restored-continuation')
  await waitUntilSlot(restored, proposedSlot)
  let completedRun = await completeRestoredContinuation(
    restored,
    restoreRoot,
    schedule,
    scheduleScope
  )
  await assertWorkerOwnsOnlyFixtures(
    restored,
    [schedule.id],
    await ownJobIds(restored)
  )
  await processReportSchedules(
    restored,
    { storageRoot: restoreRoot },
    undefined,
    10,
    scheduleScope
  )
  const replayJobIds = await ownJobIds(restored)
  await assertWorkerOwnsOnlyFixtures(restored, [schedule.id], replayJobIds)
  if (replayJobIds.length)
    await processReportExports(
      restored,
      { storageRoot: restoreRoot },
      undefined,
      10,
      { tenantId: 'tenant-a', jobIds: replayJobIds }
    )
  await processReportSchedules(
    restored,
    { storageRoot: restoreRoot },
    undefined,
    10,
    scheduleScope
  )
  const replayedContinuation = await continuationState(restored, schedule.id)
  await appendContinuationDiagnostic({
    type: 'completed-worker-replay',
    message:
      'Completed worker replay retained the same terminal facts; dynamic payloads omitted.',
    ...replayedContinuation,
  })
  assert.deepEqual(
    replayedContinuation.runs.map(({ id, status }) => ({ id, status })),
    [{ id: completedRun.id, status: 'completed' }]
  )
  assert.equal(replayedContinuation.recipients.length, 1)
  assert.equal(replayedContinuation.recipients[0].status, 'completed')
  assert.equal(replayedContinuation.exports.length, 1)
  assert.equal(replayedContinuation.exports[0].status, 'completed')
  await assertWorkerOwnsOnlyFixtures(
    restored,
    [schedule.id],
    await ownJobIds(restored)
  )
  server = createServer(restored, undefined, { storageRoot: restoreRoot })
  restoredOrigin = await server.listen({ host: '127.0.0.1', port: 0 })
  completedRun = await call(
    restoredOrigin,
    `/reporting/schedules/runs/${completedRun.id}`,
    { actor: 'creator' }
  )
  assert.equal(
    completedRun.status,
    'completed',
    `${completedRun.errorCode || 'RUN_NOT_COMPLETED'}: ${
      completedRun.errorMessage || 'Actual schedule continuation must complete'
    }`
  )
  assert.equal(completedRun.periodId, pendingPeriod.id)
  assert.equal(completedRun.ruleVersionId, schedule.activeVersionId)
  assert.equal(completedRun.slotAt, fixtures.slotAt)
  assert.equal(completedRun.recipientTotal, 1)
  assert.equal(completedRun.completedRecipients, 1)
  assert.equal(completedRun.recipients.length, 1)
  const recipient = completedRun.recipients[0]
  assert.equal(recipient.userId, user.id)
  assert.equal(recipient.status, 'completed')
  assert.ok(recipient.notifiedAt)
  assert.ok(recipient.exportJobId)
  const job = await readyJob(restoredOrigin, recipient.exportJobId)
  assert.equal(job.createdBy, user.id)
  assert.equal(job.definitionVersionId, definition.activeVersionId)
  const bytes = await readBytes(restoredOrigin, job)
  const continuationFile = path.join(runRoot, 'restored-continuation.csv')
  await writeFile(continuationFile, bytes, { mode: 0o600 })
  assert.ok(bytes.toString('utf8').includes('12.34'))
  assert.ok(bytes.toString('utf8').includes(`定时恢复合成设备-${suffix}`))
  const actualFacts = (
    await restored.query(
      "SELECT (SELECT count(*) FROM report_schedule_runs WHERE tenant_id='tenant-a' AND period_id=$1 AND slot_at=$2)::int AS runs,(SELECT count(*) FROM report_schedule_run_recipients WHERE tenant_id='tenant-a' AND run_id=$3)::int AS recipients,(SELECT count(*) FROM report_export_recipient_grants WHERE tenant_id='tenant-a' AND run_id=$3 AND job_id=$4 AND recipient_user_id=$5)::int AS grants,(SELECT count(*) FROM report_schedule_events WHERE tenant_id='tenant-a' AND run_id=$3 AND action='run.completed')::int AS \"completedRuns\",(SELECT count(*) FROM report_schedule_events WHERE tenant_id='tenant-a' AND run_id=$3 AND action='recipient.completed')::int AS \"completedRecipients\"",
      [pendingPeriod.id, proposedSlot, completedRun.id, job.id, user.id]
    )
  ).rows[0]
  assert.deepEqual(actualFacts, {
    runs: 1,
    recipients: 1,
    grants: 1,
    completedRuns: 1,
    completedRecipients: 1,
  })
  assert.deepEqual(await exportFacts(restored, job.id), {
    artifacts: 1,
    events: 1,
    audits: 1,
  })
  const delivery = (
    await restored.query(
      "SELECT recipient.notification_id,recipient.notification_outbox_id,n.event_id,n.recipient_id,n.title,n.content,o.status,o.attempts,o.payload FROM report_schedule_run_recipients recipient JOIN notifications n ON n.tenant_id=recipient.tenant_id AND n.id=recipient.notification_id JOIN outbox o ON o.tenant_id=n.tenant_id AND o.id=n.event_id WHERE recipient.tenant_id='tenant-a' AND recipient.id=$1",
      [recipient.id]
    )
  ).rows
  assert.equal(delivery.length, 1)
  const notification = delivery[0]
  assert.equal(notification.event_id, notification.notification_outbox_id)
  assert.equal(notification.recipient_id, user.id)
  assert.equal(notification.status, 'sent')
  assert.equal(notification.payload.source, 'report-schedule')
  assert.equal(notification.payload.reportExportJobId, job.id)
  assert.equal(notification.payload.scheduleRunId, completedRun.id)
  assert.ok(!('requestId' in notification.payload))
  assert.ok(!('access' in notification.payload))
  assert.ok(!('signedURL' in notification.payload))
  assert.equal(
    (
      await restored.query(
        "SELECT count(*)::int AS total FROM notifications WHERE tenant_id='tenant-a' AND event_id=$1 AND recipient_id=$2",
        [notification.event_id, user.id]
      )
    ).rows[0].total,
    1
  )
  const inbox = await call(
    restoredOrigin,
    '/messages/notifications?pageSize=100',
    { actor: 'creator' }
  )
  assert.ok(
    inbox.list.some((value) => value.id === notification.notification_id)
  )
  const fixed = (
    await restored.query(
      "SELECT v.field_bindings,v.source_release_id,v.source_release_version,j.field_bindings AS job_bindings,j.snapshot,a.object_key FROM report_definition_versions v JOIN report_export_jobs j ON j.tenant_id=v.tenant_id AND j.definition_version_id=v.id JOIN report_export_artifacts a ON a.tenant_id=j.tenant_id AND a.job_id=j.id WHERE v.tenant_id='tenant-a' AND v.id=$1 AND j.id=$2",
      [definition.activeVersionId, job.id]
    )
  ).rows[0]
  assert.equal(fixed.source_release_id, release.id)
  assert.equal(fixed.source_release_version, release.releaseVersion)
  assert.deepEqual(fixed.field_bindings, fixed.job_bindings)
  assert.deepEqual(fixed.field_bindings[price.id], {
    rawUid: 'unitPrice',
    valueType: 'decimal',
  })
  assert.equal(fixed.snapshot.rows.length, 1)
  assert.equal(fixed.snapshot.rows[0].id, record.id)
  assert.equal(fixed.snapshot.rows[0].values[`field:${price.id}`], '12.34')
  assert.equal(fixed.snapshot.rows[0].values[`field:${quantity.id}`], 1)
  assert.deepEqual(await restoredStore.get(fixed.object_key), bytes)
  assert.deepEqual(await exportFacts(restored, job.id), {
    artifacts: 1,
    events: 1,
    audits: 1,
  })
  assert.deepEqual(await readBytes(restoredOrigin, job), bytes)
  assert.equal(
    (
      await call(
        restoredOrigin,
        `/reporting/schedules/runs?scheduleId=${schedule.id}`,
        { actor: 'creator' }
      )
    ).total,
    1
  )
  await assertSourceUnexecuted()
  assert.equal(
    (
      await source.query(
        "SELECT id FROM report_schedule_runs WHERE tenant_id='tenant-a' AND id=$1",
        [completedRun.id]
      )
    ).rowCount,
    0
  )
  assert.equal(
    (
      await source.query(
        "SELECT id FROM report_export_artifacts WHERE tenant_id='tenant-a' AND id=$1",
        [job.artifact.id]
      )
    ).rowCount,
    0
  )
  await assert.rejects(
    originalStore.get(fixed.object_key),
    (error) => error.businessCode === 'STORAGE_UNAVAILABLE'
  )
  await advance('independent-rule-and-report-edit')
  const changedRuleName = `${scheduleSchema.name}-仅恢复库`
  const editedRule = await call(
    restoredOrigin,
    `/reporting/schedules/${schedule.id}`,
    {
      actor: 'creator',
      method: 'PUT',
      body: {
        schema: { ...scheduleSchema, name: changedRuleName },
        expectedRevision: copiedRule.revision,
      },
    }
  )
  assert.equal(editedRule.version, 2)
  assert.notEqual(editedRule.activeVersionId, schedule.activeVersionId)
  const copiedDefinition = await call(
    restoredOrigin,
    `/reporting/definitions/${definition.id}`
  )
  const changedReportName = `${originalReportName}-仅恢复库`
  await call(restoredOrigin, `/reporting/definitions/${definition.id}`, {
    method: 'PUT',
    body: {
      schema: { ...schema, name: changedReportName },
      expectedRevision: copiedDefinition.revision,
    },
  })
  const untouchedRule = await call(
    apiOrigin,
    `/reporting/schedules/${schedule.id}`,
    { actor: 'creator' }
  )
  const untouchedReport = await call(
    apiOrigin,
    `/reporting/definitions/${definition.id}`
  )
  assert.equal(untouchedRule.schema.name, scheduleSchema.name)
  assert.equal(untouchedRule.activeVersionId, schedule.activeVersionId)
  assert.equal(untouchedRule.nextRunAt, fixtures.slotAt)
  assert.equal(untouchedReport.schema.name, originalReportName)
  assert.equal(untouchedReport.activeVersionId, definition.activeVersionId)
  assert.equal(
    (
      await source.query(
        "SELECT id FROM report_schedule_versions WHERE tenant_id='tenant-a' AND id=$1",
        [editedRule.activeVersionId]
      )
    ).rowCount,
    0
  )
  await assertSourceUnexecuted()
  await advance('validated-awaiting-source-and-target-cleanup')
  reportData = {
    status: 'verified',
    verifiedAt: new Date().toISOString(),
    scope,
    caveat,
    runId,
    method:
      'actual pg_dump / pg_restore exported snapshot plus actual referenced object-byte backup and restore; natural server-clock schedule continuation in restored database only',
    tableCount: tables.length,
    tableCounts: sourceCounts,
    restoredTableCounts: restoredCounts,
    migrationCount: 26,
    targetCreated,
    migrationChecksums,
    migrationChecksumsMatch: true,
    dumpBytes: dumpInfo.size,
    dumpFormat: 'PGDMP custom archive',
    snapshotStartedAt: snapshotStartedAt.toISOString(),
    restoreCompletedAt: restoreCompletedAt.toISOString(),
    restoredBeforeFirstSlot: true,
    preservedOriginalAdminAndCreatorSessions: true,
    fixtures,
    sourceRuleName: untouchedRule.schema.name,
    restoredRuleName: changedRuleName,
    sourceReportName: untouchedReport.schema.name,
    restoredReportName: changedReportName,
    sourceHadNoRunExportArtifactUntilCleanup: true,
    copiedObjectCount: copiedObjects.length,
    copiedObjectBytes: copiedObjects.reduce(
      (total, object) => total + object.size,
      0
    ),
    nonexpiredReportArtifactReferences: references.filter(
      (reference) => reference.kind === 'report-artifact'
    ).length,
    storedFileReferences: references.filter(
      (reference) => reference.kind === 'stored-file'
    ).length,
    missingExistingFiles,
    allPreexistingStoredFileBytesRecovered: missingExistingFiles.length === 0,
    filePartReferences: references.filter(
      (reference) => reference.kind === 'file-part'
    ).length,
    allReferencedFilePartsRecovered: true,
    restoredContinuation: {
      runId: completedRun.id,
      periodId: completedRun.periodId,
      slotAt: completedRun.slotAt,
      recipientId: recipient.id,
      exportJobId: job.id,
      artifactId: job.artifact.id,
      notificationId: notification.notification_id,
      outboxId: notification.event_id,
      size: job.artifact.size,
      sha256: job.artifact.sha256,
      scanEngine: job.artifact.scanEngine,
      actualUnitPrice: '12.34',
      privateArtifactEvidence: continuationFile,
      privatePollEvidence: continuationPollFile,
      canonicalFacts: actualFacts,
      exportFacts: { artifacts: 1, events: 1, audits: 1 },
      websocketAckClaimed: false,
      emailDeliveryClaimed: false,
    },
    privateEvidenceDirectory: runRoot,
    objectManifest: path.join(runRoot, 'object-manifest.json'),
    sourceByteRootUnmodified: true,
  }
} catch (error) {
  validationFailure = error
} finally {
  const cleanup = async (run) => {
    try {
      await run()
    } catch (error) {
      cleanupFailures.push(error)
    }
  }
  const stopped = await Promise.allSettled(Array.from(children).map(stopChild))
  stopped
    .filter((value) => value.status === 'rejected')
    .forEach((value) => cleanupFailures.push(value.reason))
  const settleReceipts = async () => {
    if (!source || !mutationIntents.length) return
    const client = await source.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL statement_timeout='60000ms'")
      // Exact server gates wait for any in-flight owned mutation; no arbitrary job or actor is locked.
      const captured = [...mutationIntents]
      await sequence(captured, async (intent) => {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [
            JSON.stringify([
              'tenant-a',
              intent.actorId,
              intent.operation,
              intent.key,
            ]),
          ]
        )
      })
      const receipts = (
        await client.query(
          "SELECT actor_id,operation,key,response FROM idempotency_records WHERE tenant_id='tenant-a' AND key=ANY($1::text[])",
          [captured.map((intent) => intent.key)]
        )
      ).rows
      receipts.forEach((receipt) => {
        const intent = captured.find(
          (value) =>
            value.key === receipt.key &&
            value.actorId === receipt.actor_id &&
            value.operation === receipt.operation
        )
        if (!intent) return
        const id = receipt.response?.id
        if (typeof id !== 'string') return
        intent.recoveredResponseId = id
        if (intent.operation === 'user:create') fixtures.creatorId ||= id
        if (intent.operation === 'role:create') fixtures.recipientRoleId ||= id
        if (intent.operation === 'application:create')
          fixtures.applicationId ||= id
        if (intent.operation === 'business:create') fixtures.recordId ||= id
        if (intent.operation === 'reporting.create') fixtures.reportId ||= id
        if (intent.operation === 'report-schedule.create')
          sourceOwnedSchedules.add(id)
      })
      if (fixtures.reportId) {
        const [definition] = (
          await client.query(
            "SELECT active_version_id FROM report_definitions WHERE tenant_id='tenant-a' AND id=$1 AND created_by='a-admin'",
            [fixtures.reportId]
          )
        ).rows
        fixtures.definitionVersionId ||= definition?.active_version_id
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  await cleanup(settleReceipts)
  if (fixtures.reportId && sessionTokens.has('admin') && apiOrigin) {
    await cleanup(async () => {
      let closureError
      await sequence([1, 2, 3], async () => {
        if (sourceReportClosed) return
        try {
          const current = await call(
            apiOrigin,
            `/reporting/definitions/${fixtures.reportId}`
          )
          if (current.enabled)
            await call(
              apiOrigin,
              `/reporting/definitions/${fixtures.reportId}/enabled`,
              {
                method: 'POST',
                operation: `reporting.enabled:${fixtures.reportId}`,
                body: { enabled: false, expectedRevision: current.revision },
              }
            )
          assert.equal(
            (
              await call(
                apiOrigin,
                `/reporting/definitions/${fixtures.reportId}`
              )
            ).enabled,
            false
          )
          sourceReportClosed = true
        } catch (error) {
          closureError = error
        }
      })
      if (!sourceReportClosed)
        throw (
          closureError ||
          new Error(
            'Owned report disable barrier could not be established; retain intent keys for manual recovery'
          )
        )
    })
  }
  // The report disable command holds the tenant-exclusive gate. A late schedule create must either precede it
  // and become discoverable, or subsequently reject the disabled report. Receipt absence alone is not closure.
  if (sourceReportClosed)
    await cleanup(async () => {
      await settleReceipts()
      if (fixtures.creatorId && fixtures.definitionVersionId) {
        const found = (
          await source.query(
            "SELECT schedule.id FROM report_schedules schedule WHERE schedule.tenant_id='tenant-a' AND schedule.created_by=$1 AND EXISTS(SELECT 1 FROM report_schedule_versions version WHERE version.tenant_id=schedule.tenant_id AND version.schedule_id=schedule.id AND version.definition_version_id=$2)",
            [fixtures.creatorId, fixtures.definitionVersionId]
          )
        ).rows
        found.forEach((row) => sourceOwnedSchedules.add(row.id))
      }
    })
  if (sourceOwnedSchedules.size && sessionTokens.has('creator') && apiOrigin) {
    await sequence(Array.from(sourceOwnedSchedules), async (id) =>
      cleanup(async () => {
        let closed = false
        let lastError
        await sequence([1, 2, 3], async () => {
          if (closed) return
          try {
            const current = await call(
              apiOrigin,
              `/reporting/schedules/${id}`,
              { actor: 'creator' }
            )
            if (current.enabled)
              await call(apiOrigin, `/reporting/schedules/${id}/enabled`, {
                actor: 'creator',
                method: 'POST',
                operation: `report-schedule.toggle:${id}`,
                body: { enabled: false, expectedRevision: current.revision },
              })
            assert.equal(
              (
                await call(apiOrigin, `/reporting/schedules/${id}`, {
                  actor: 'creator',
                })
              ).enabled,
              false
            )
            closed = true
          } catch (error) {
            lastError = error
          }
        })
        if (!closed)
          throw (
            lastError || new Error('Owned activation interval did not close')
          )
      })
    )
  }
  if (
    source &&
    sourceOwnedSchedules.size &&
    sourceReportClosed &&
    sessionTokens.has('creator')
  ) {
    await cleanup(async () => {
      const owned = Array.from(sourceOwnedSchedules)
      const allClosed =
        (
          await source.query(
            "SELECT count(*)::int AS total FROM report_schedules WHERE tenant_id='tenant-a' AND id=ANY($1::text[]) AND enabled",
            [owned]
          )
        ).rows[0].total === 0
      assert.equal(
        allClosed,
        true,
        'Do not drain until every discovered owned rule is actually disabled'
      )
      // Closing an activation preserves its past-due slots. Real workers materialize those slots under the now-disabled
      // owned report, retaining blocked facts; no cursor rewinding/deletion or fake completed state is permitted.
      await sequence(Array.from({ length: 20 }), async () => {
        const due = (
          await source.query(
            "SELECT count(*)::int AS total FROM report_schedule_periods WHERE tenant_id='tenant-a' AND schedule_id=ANY($1::text[]) AND cursor_at<=clock_timestamp() AND (closed_at IS NULL OR cursor_at<=closed_at)",
            [owned]
          )
        ).rows[0].total
        if (!due) return
        const jobs = await ownJobIds(source)
        jobs.forEach((id) => sourceOwnedJobs.add(id))
        await processReportSchedules(
          source,
          { storageRoot: sourceFileRoot },
          undefined,
          100,
          { tenantId: 'tenant-a', scheduleIds: owned }
        )
      })
      assert.equal(
        (
          await source.query(
            "SELECT count(*)::int AS total FROM report_schedule_periods WHERE tenant_id='tenant-a' AND schedule_id=ANY($1::text[]) AND cursor_at<=clock_timestamp() AND (closed_at IS NULL OR cursor_at<=closed_at)",
            [owned]
          )
        ).rows[0].total,
        0,
        'Every armed due owned slot must have a durable fact before source worker resume'
      )
      const ownRuns = (
        await source.query(
          "SELECT id,status FROM report_schedule_runs WHERE tenant_id='tenant-a' AND schedule_id=ANY($1::text[]) ORDER BY created_at,id",
          [owned]
        )
      ).rows
      await sequence(ownRuns, async (row) => {
        const current = await call(
          apiOrigin,
          `/reporting/schedules/runs/${row.id}`,
          { actor: 'creator' }
        )
        if (!['completed', 'cancelled'].includes(current.status)) {
          await call(apiOrigin, `/reporting/schedules/runs/${row.id}/cancel`, {
            actor: 'creator',
            method: 'POST',
            operation: `report-schedule.run.cancel:${row.id}`,
            body: { expectedRevision: current.revision },
          })
          const cancelled = await call(
            apiOrigin,
            `/reporting/schedules/runs/${row.id}`,
            { actor: 'creator' }
          )
          assert.equal(cancelled.status, 'cancelled')
          sourceRunCleanup.push({
            id: row.id,
            previousStatus: current.status,
            finalStatus: 'cancelled',
          })
        } else
          sourceRunCleanup.push({
            id: row.id,
            previousStatus: current.status,
            finalStatus: current.status,
          })
      })
      const jobs = await ownJobIds(source)
      jobs.forEach((id) => sourceOwnedJobs.add(id))
      await sequence(jobs, async (id) => {
        const current = await call(apiOrigin, `/reporting/exports/${id}`, {
          actor: 'creator',
        })
        if (
          ['queued', 'processing', 'failed', 'blocked'].includes(current.status)
        )
          await call(apiOrigin, `/reporting/exports/${id}/cancel`, {
            actor: 'creator',
            method: 'POST',
            operation: `report-export.cancel:${id}`,
            body: { expectedRevision: current.revision },
          })
        const final = await call(apiOrigin, `/reporting/exports/${id}`, {
          actor: 'creator',
        })
        assert.ok(['completed', 'infected', 'cancelled'].includes(final.status))
        sourceJobCleanup.push({
          id,
          previousStatus: current.status,
          finalStatus: final.status,
        })
      })
      const pending = (
        await source.query(
          "SELECT (SELECT count(*) FROM report_schedules WHERE tenant_id='tenant-a' AND id=ANY($1::text[]) AND enabled)::int AS active,(SELECT count(*) FROM report_schedule_runs WHERE tenant_id='tenant-a' AND schedule_id=ANY($1::text[]) AND status IN('queued','processing','waiting-exports'))::int AS runs,(SELECT count(*) FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=ANY($2::text[]) AND status IN('queued','processing','failed','blocked'))::int AS jobs",
          [owned, jobs]
        )
      ).rows[0]
      assert.deepEqual(pending, { active: 0, runs: 0, jobs: 0 })
      sourcePendingSettled = true
    })
  }
  if (server) await cleanup(() => server.close())
  if (restored) await cleanup(() => restored.end())
  if (targetCreationAttempted && source)
    await cleanup(async () => {
      const exists = (
        await source.query(
          'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1) AS found',
          [targetName]
        )
      ).rows[0].found
      if (exists) await source.query(`DROP DATABASE ${targetName}`)
      targetRemoved = true
    })
  if (restoreRoot)
    await cleanup(async () => {
      await rm(restoreRoot, { recursive: true, force: true })
      restoreStoreRemoved = true
    })
  if (source) await cleanup(() => source.end())
}
if (validationFailure || cleanupFailures.length) {
  const failed = {
    status: 'failed',
    failedAt: new Date().toISOString(),
    stage,
    error: safeError(validationFailure || cleanupFailures[0]),
    cleanupFailures: cleanupFailures.map(safeError),
    failedByteReferences,
    scope,
    caveat,
    runId,
    targetCreationAttempted,
    targetCreated,
    restoredDatabaseRemoved: targetRemoved,
    restoredStoreRemoved: restoreStoreRemoved,
    sourcePendingSettled,
    sourceReportClosed,
    sourceRunCleanup,
    sourceJobCleanup,
    fixtures,
    ownedScheduleIds: Array.from(sourceOwnedSchedules),
    ownedExportJobIds: Array.from(sourceOwnedJobs),
    mutationIntents,
    privateEvidenceDirectory: runRoot,
    privatePollEvidence: continuationPollStarted
      ? continuationPollFile
      : undefined,
  }
  await writeReport(failed)
  await writeFile(
    path.join(runRoot, 'failure.json'),
    JSON.stringify(failed, null, 2),
    { mode: 0o600 }
  )
  throw new Error(
    `Report schedule recovery failed at ${stage}; see the private recovery report. Source worker must remain paused if source pending cleanup failed.`
  )
}
assert.ok(reportData)
assert.equal(targetRemoved, true)
assert.equal(restoreStoreRemoved, true)
assert.equal(sourceReportClosed, true)
assert.equal(sourcePendingSettled, true)
Object.assign(reportData, {
  restoredDatabaseRemoved: targetRemoved,
  restoredStoreRemoved: restoreStoreRemoved,
  sourceReportClosed,
  sourcePendingSettled,
  sourceRunCleanup,
  sourceJobCleanup,
  ownedScheduleIds: Array.from(sourceOwnedSchedules),
})
await writeReport(reportData)
process.stdout.write(
  `Report schedule recovery verified ${reportData.tableCount} public table counts and 26 migration checksums, copied ${reportData.copiedObjectCount} actual referenced byte objects, preserved original admin/creator sessions, and completed one natural schedule slot with a real clean artifact and canonical in-app notification only in the restored independent DB/store. Missing preexisting stored-file references: ${reportData.missingExistingFiles.length}. Source owned activation closed and due work settled; target DB/store removed.\n`
)
