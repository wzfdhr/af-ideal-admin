import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
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
import { createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Pool } from 'pg'
import { createServer } from '@af-admin/reference-api/dist/index.js'
import { verifyMigrationReadiness } from '@af-admin/reference-api/dist/migrate.js'
import { digest } from '@af-admin/reference-api/dist/security.js'
import {
  contentCanonical,
  contentHash,
  noFault,
} from '@af-admin/reference-api/dist/support.js'

const SOURCE_DATABASE = 'af_admin_full_c1b35e6ead774464986c87ea453d847e_demo'
const SOURCE_ORIGIN = 'http://127.0.0.1:10890'
const POSTGRES_CONTAINER = 'af-admin-r1-postgres'
const MIGRATION_027_SHA256 =
  '28f8ba3eaa7c9c1887963af9ca61f00dab5ecfe091c4fa6d41897c056042a63e'
const FIXTURE_ROOT = path.resolve(
  'test-results/full-product/data-screens-20261013/demo-fixtures'
)
const EVIDENCE_ROOT = path.resolve(
  'test-results/full-product/data-screens-20261013/database-copy'
)
const runId = randomUUID().replaceAll('-', '')
const runRoot = path.join(EVIDENCE_ROOT, runId)
const targetName = `af_data_screen_recovery_${runId}_demo`
const dumpPath = path.join(runRoot, 'database.dump')
const scope =
  'actual pg_dump and pg_restore into a random independent database in the existing local PostgreSQL instance'
const caveat =
  'database recovery only; no file bytes are copied because data-screen reads use database-backed reports and do not read stored files; this is not a new physical server, customer dataset, or compatibility rollback claim'
const knownHistoricalFileGap =
  '41 previously missing historical file objects remain outside this database-only exercise and are not repaired or claimed as recovered'
const children = new Set()
const cleanupFailures = []
const targetMutations = []
const ownedScreenIds = new Set()
let sourceUrl
let source
let restored
let targetServer
let targetStore
let token
let stage = 'guards'
let targetCreationAttempted = false
let targetCreated = false
let targetRemoved = false
let targetStoreRemoved = false
let validationFailure
let reportData
let targetMutableScreenId

const sequence = (values, run) =>
  values.reduce(async (previous, value) => {
    await previous
    await run(value)
  }, Promise.resolve())

const safeError = (error) => {
  let message =
    error instanceof Error ? error.message : 'Data-screen recovery failed'
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
  return message.slice(0, 1000)
}

const writeReport = async (report) => {
  const text = JSON.stringify(report, null, 2)
  await writeFile(path.join(runRoot, 'report.json'), text, { mode: 0o600 })
  await writeFile(path.join(EVIDENCE_ROOT, 'report.json'), text, {
    mode: 0o600,
  })
  await writeFile(
    path.join(EVIDENCE_ROOT, 'latest.json'),
    JSON.stringify(
      {
        runId,
        status: report.status,
        reportPath: path.relative(
          process.cwd(),
          path.join(runRoot, 'report.json')
        ),
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    { mode: 0o600 }
  )
}

const progress = async () =>
  writeReport({
    version: 1,
    status: 'running',
    stage,
    runId,
    scope,
    caveat,
    knownHistoricalFileGap,
    targetDatabase: targetName,
    ownedScreenIds: [...ownedScreenIds],
    targetMutations,
  })

const advance = async (value) => {
  stage = value
  await progress()
  process.stdout.write(`Data-screen recovery phase: ${stage}\n`)
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
  assert.equal(args[0], POSTGRES_CONTAINER)
  assert.ok(
    ['pg_dump', 'pg_restore'].includes(args[1]),
    'Recovery may invoke only the exact PostgreSQL dump or restore executable'
  )
  const child = spawn(
    'docker',
    ['exec', ...(inputPath ? ['-i'] : []), ...args],
    {
      stdio,
    }
  )
  children.add(child)
  const exited = once(child, 'exit', { signal: AbortSignal.timeout(120000) })
  try {
    const transfer = inputPath
      ? pipeline(createReadStream(inputPath), child.stdin)
      : Promise.resolve()
    const [result] = await Promise.all([exited, transfer])
    assert.equal(result[0], 0, 'Actual pg_dump or pg_restore must succeed')
  } finally {
    await stopChild(child)
  }
}

const parseJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

const guardedFixtureReport = async () => {
  const latestPath = path.join(FIXTURE_ROOT, 'latest.json')
  const latest = await parseJson(latestPath)
  assert.match(
    latest.runId,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
  )
  assert.equal(latest.status, 'verified')
  const expected = path.join(FIXTURE_ROOT, latest.runId, 'report.json')
  assert.equal(path.resolve(latest.reportPath), expected)
  const actual = await realpath(expected)
  const relative = path.relative(await realpath(FIXTURE_ROOT), actual)
  assert.ok(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    'Fixture report must stay inside the guarded data-screen fixture directory'
  )
  const report = await parseJson(actual)
  assert.equal(report.runId, latest.runId)
  assert.equal(report.status, 'verified')
  assert.deepEqual(report.scope, {
    apiOrigin: SOURCE_ORIGIN,
    database: SOURCE_DATABASE,
    tenantId: 'tenant-a',
    actorId: 'a-admin',
  })
  assert.deepEqual(Object.keys(report.fixtures).sort(), [
    'equipment',
    'operations',
    'sales',
  ])
  assert.equal(
    Object.values(report.fixtures).reduce(
      (total, fixture) => total + fixture.expectedCount,
      0
    ),
    15
  )
  assert.equal(
    Object.values(report.fixtures).reduce(
      (total, fixture) => total + Object.keys(fixture.reports).length,
      0
    ),
    9
  )
  return { latest, report, path: actual }
}

const apiCall = async (
  origin,
  endpoint,
  { body, method = 'GET', expectedStatus = 200, sourceReadPost = false } = {}
) => {
  assert.ok(token, 'Every API read must use the freshly bound admin session')
  if (origin === SOURCE_ORIGIN && method !== 'GET')
    assert.ok(
      sourceReadPost &&
        method === 'POST' &&
        /^\/data-screens\/definitions\/[A-Za-z0-9_-]+\/run$/.test(endpoint),
      'The source API is read-only except for the registered data-screen run query'
    )
  const targetReadPost =
    origin !== SOURCE_ORIGIN &&
    method === 'POST' &&
    /^\/data-screens\/definitions\/[A-Za-z0-9_-]+\/run$/.test(endpoint)
  if (origin !== SOURCE_ORIGIN && method !== 'GET' && !targetReadPost) {
    assert.match(
      endpoint,
      /^\/data-screens\/definitions\/[A-Za-z0-9_-]+(?:\/(?:publish|rollback))?$/,
      'Only one owned target data-screen may be synchronized'
    )
    const id = endpoint.split('/')[3]
    assert.equal(
      id,
      targetMutableScreenId,
      'Only the exact verified sales screen may be changed in the target database'
    )
    let action = 'update'
    if (endpoint.endsWith('/publish')) action = 'publish'
    else if (endpoint.endsWith('/rollback')) action = 'rollback'
    targetMutations.push({
      screenId: id,
      action,
    })
    await progress()
  }
  const response = await fetch(`${origin}/api${endpoint}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      'x-access-token': token,
      'x-tenant-id': 'tenant-a',
      'idempotency-key': randomUUID(),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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

const bindSourceSession = async () => {
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
  token = (await response.json()).data.token
  assert.equal(typeof token, 'string')
  const bound = (
    await source.query(
      "SELECT s.user_id,s.default_tenant_id,scope.epoch,m.session_epoch FROM sessions s JOIN session_scopes scope ON scope.token_hash=s.token_hash AND scope.user_id=s.user_id AND scope.tenant_id='tenant-a' JOIN memberships m ON m.tenant_id=scope.tenant_id AND m.user_id=scope.user_id JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE s.token_hash=$1 AND s.user_id='a-admin' AND s.default_tenant_id='tenant-a' AND s.revoked_at IS NULL AND s.expires_at>now() AND s.created_at>=$2::timestamptz-interval '1 minute' AND scope.epoch=m.session_epoch AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled'",
      [digest(token), startedAt]
    )
  ).rows
  assert.equal(
    bound.length,
    1,
    'The fresh HTTP session hash, epoch, scope, and actor must exist in the exact source database'
  )
  assert.equal(bound[0].epoch, bound[0].session_epoch)
  const current = await apiCall(SOURCE_ORIGIN, '/user/info')
  assert.equal(current.id, 'a-admin')
  assert.equal(current.tenantId, 'tenant-a')
}

const registeredTables = async (db) => {
  const names = (
    await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
    )
  ).rows.map((row) => row.table_name)
  assert.ok(names.length >= 45)
  names.forEach((name) => assert.match(name, /^[a-z][a-z0-9_]*$/))
  ;[
    'schema_migrations',
    'applications',
    'application_releases',
    // Migration 010 consolidated the R1 leave rows into business_records.
    'business_records',
    'report_definitions',
    'report_definition_versions',
    'data_screen_definitions',
    'data_screen_releases',
    'data_screen_events',
    'sessions',
    'session_scopes',
    'stored_files',
    'file_parts',
  ].forEach((name) => assert.ok(names.includes(name), `Missing table ${name}`))
  return names
}

const tableCounts = async (db, tables) => {
  const output = {}
  await sequence(tables, async (table) => {
    output[table] = (
      await db.query(`SELECT count(*)::int AS total FROM ${table}`)
    ).rows[0].total
  })
  return output
}

const migrationFacts = async (db) => {
  const { rows } = await db.query(
    'SELECT name,checksum FROM schema_migrations ORDER BY name'
  )
  assert.equal(rows.length, 27)
  assert.equal(rows.at(-1).name, '027_data_screens.sql')
  assert.equal(rows.at(-1).checksum, MIGRATION_027_SHA256)
  return rows
}

const screenDatabaseFacts = async (db, ids) => {
  const definitions = (
    await db.query(
      "SELECT id,revision,draft_revision,enabled,archived,active_release_id,created_by,draft_schema FROM data_screen_definitions WHERE tenant_id='tenant-a' AND id=ANY($1::text[]) ORDER BY id",
      [ids]
    )
  ).rows
  const releases = (
    await db.query(
      "SELECT id,definition_id,version,draft_revision,schema_snapshot,source_bindings,content_canonical,content_hash,published_by FROM data_screen_releases WHERE tenant_id='tenant-a' AND definition_id=ANY($1::text[]) ORDER BY definition_id,version",
      [ids]
    )
  ).rows
  return { definitions, releases }
}

const stableRun = (run) => ({
  version: run.version,
  dataScreenId: run.dataScreenId,
  releaseId: run.releaseId,
  releaseVersion: run.releaseVersion,
  sources: run.sources.map((sourceResult) => {
    let result = null
    if (sourceResult.result) {
      result = { ...sourceResult.result }
      delete result.queriedAt
      delete result.dataCutoffAt
    }
    return {
      sourceKey: sourceResult.sourceKey,
      reportDefinitionVersionId: sourceResult.reportDefinitionVersionId,
      actualQuery: sourceResult.actualQuery,
      status: sourceResult.status,
      errorCode: sourceResult.errorCode,
      result,
    }
  }),
})

const signedSalesCoordinates = [
  ['-73.985656', '40.748433'],
  ['-0.127758', '51.507351'],
  ['151.2093', '-33.868812'],
  ['-46.633309', '-23.55052'],
  ['18.424055', '-33.924869'],
  ['139.691706', '35.689487'],
]

const assertFixtureRun = (fixture, run) => {
  assert.equal(run.dataScreenId, fixture.screen.definitionId)
  assert.equal(run.releaseId, fixture.screen.releaseId)
  assert.equal(run.sources.length, 3)
  run.sources.forEach((sourceResult) => {
    const expectedReport = fixture.reports[sourceResult.sourceKey]
    assert.ok(expectedReport)
    assert.equal(
      sourceResult.reportDefinitionVersionId,
      expectedReport.versionId
    )
    assert.equal(sourceResult.status, 'ready')
    assert.equal(sourceResult.errorCode, null)
    assert.equal(sourceResult.result.total, fixture.expectedCount)
    assert.equal(sourceResult.result.sourceReleaseId, fixture.sourceReleaseId)
    assert.deepEqual(
      sourceResult.result.rows.map((row) => row.id).sort(),
      [...fixture.recordIds].sort()
    )
    assert.equal(
      sourceResult.result.trend.reduce(
        (total, point) => total + point.count,
        0
      ),
      fixture.expectedCount
    )
    assert.equal(
      sourceResult.result.distribution.reduce(
        (total, point) => total + point.count,
        0
      ),
      fixture.expectedCount
    )
  })
  if (fixture.kind === 'sales') {
    const longitude = fixture.fields.find(
      (field) => field.coordinateAxis === 'longitude'
    )
    const latitude = fixture.fields.find(
      (field) => field.coordinateAxis === 'latitude'
    )
    assert.ok(longitude && latitude)
    const detail = run.sources.find((value) => value.sourceKey === 'detail')
    const actual = detail.result.rows
      .map((row) => [row.values[longitude.key], row.values[latitude.key]])
      .sort((left, right) => left.join(',').localeCompare(right.join(',')))
    const expected = [...signedSalesCoordinates].sort((left, right) =>
      left.join(',').localeCompare(right.join(','))
    )
    assert.deepEqual(actual, expected)
    actual.flat().forEach((value) => {
      assert.equal(typeof value, 'string')
      assert.match(value, /^-?(?:0|[1-9][0-9]{0,2})(?:\.[0-9]+)?$/)
    })
  }
}

const readScreenRun = async (origin, fixture) => {
  const details = await apiCall(
    origin,
    `/data-screens/definitions/${fixture.screen.definitionId}`
  )
  assert.equal(details.revision, fixture.screen.revision)
  assert.equal(details.activeReleaseId, fixture.screen.releaseId)
  const fixed = details.versions.find(
    (version) => version.id === fixture.screen.releaseId
  )
  assert.ok(fixed)
  assert.equal(fixed.contentHash, fixture.screen.contentHash)
  assert.equal(contentHash(details.draft), contentHash(fixed.snapshot))
  const run = await apiCall(
    origin,
    `/data-screens/definitions/${fixture.screen.definitionId}/run`,
    {
      method: 'POST',
      body: { releaseId: fixture.screen.releaseId },
      sourceReadPost: origin === SOURCE_ORIGIN,
    }
  )
  assertFixtureRun(fixture, run)
  return { details, run }
}

const validateFixtureOwnership = async (db, fixture) => {
  const application = (
    await db.query(
      "SELECT id,code,active_release_id FROM applications WHERE tenant_id='tenant-a' AND id=$1",
      [fixture.applicationId]
    )
  ).rows[0]
  assert.ok(application)
  assert.equal(application.code, fixture.ownershipCode)
  assert.equal(application.active_release_id, fixture.sourceReleaseId)
  const sourceRelease = (
    await db.query(
      "SELECT id,application_id,release_version FROM application_releases WHERE tenant_id='tenant-a' AND id=$1",
      [fixture.sourceReleaseId]
    )
  ).rows[0]
  assert.equal(sourceRelease.application_id, fixture.applicationId)
  assert.equal(sourceRelease.release_version, fixture.sourceReleaseVersion)
  await sequence(Object.values(fixture.reports), async (report) => {
    const row = (
      await db.query(
        "SELECT d.id,d.revision,d.active_version_id,d.enabled,v.id AS version_id,v.definition_id,v.source_application_id,v.source_release_id,v.source_release_version FROM report_definitions d JOIN report_definition_versions v ON v.tenant_id=d.tenant_id AND v.id=$2 WHERE d.tenant_id='tenant-a' AND d.id=$1",
        [report.definitionId, report.versionId]
      )
    ).rows[0]
    assert.ok(row)
    assert.equal(row.revision, report.revision)
    assert.equal(row.active_version_id, report.versionId)
    assert.equal(row.version_id, report.versionId)
    assert.equal(row.definition_id, report.definitionId)
    assert.equal(row.source_application_id, fixture.applicationId)
    assert.equal(row.source_release_id, fixture.sourceReleaseId)
    assert.equal(row.source_release_version, fixture.sourceReleaseVersion)
    assert.equal(row.enabled, true)
  })
  const definition = (
    await db.query(
      "SELECT id,revision,active_release_id,enabled,archived FROM data_screen_definitions WHERE tenant_id='tenant-a' AND id=$1",
      [fixture.screen.definitionId]
    )
  ).rows[0]
  assert.ok(definition)
  assert.equal(definition.revision, fixture.screen.revision)
  assert.equal(definition.active_release_id, fixture.screen.releaseId)
  assert.equal(definition.enabled, true)
  assert.equal(definition.archived, false)
  const fixed = (
    await db.query(
      "SELECT id,definition_id,version,schema_snapshot,source_bindings,content_canonical,content_hash FROM data_screen_releases WHERE tenant_id='tenant-a' AND id=$1 AND definition_id=$2",
      [fixture.screen.releaseId, fixture.screen.definitionId]
    )
  ).rows[0]
  assert.ok(fixed)
  assert.equal(fixed.version, 1)
  assert.equal(fixed.content_hash, fixture.screen.contentHash)
  const payload = {
    snapshot: fixed.schema_snapshot,
    sourceBindings: fixed.source_bindings,
  }
  assert.equal(fixed.content_canonical, contentCanonical(payload))
  assert.equal(fixed.content_hash, contentHash(payload))
  assert.deepEqual(
    fixed.source_bindings
      .map((binding) => binding.reportDefinitionVersionId)
      .sort(),
    Object.values(fixture.reports)
      .map((report) => report.versionId)
      .sort()
  )
  const records = (
    await db.query(
      "SELECT id FROM business_records WHERE tenant_id='tenant-a' AND application_release_id=$1 AND id=ANY($2::text[]) ORDER BY id",
      [fixture.sourceReleaseId, fixture.recordIds]
    )
  ).rows.map((row) => row.id)
  assert.deepEqual(records, [...fixture.recordIds].sort())
}

const modifiedSalesDraft = (draft, suffix) => {
  const next = structuredClone(draft)
  next.title = `${draft.title}·恢复副本-${suffix}`
  next.theme = { preset: 'ocean', brandColor: '#135E96' }
  const first = next.widgets[0]
  const delta = first.layout.x + first.layout.width < 1920 ? 1 : -1
  first.layout = { ...first.layout, x: first.layout.x + delta }
  return next
}

try {
  await mkdir(runRoot, { recursive: true, mode: 0o700 })
  await progress()
  assert.equal(process.env.APP_MODE, 'demo')
  assert.equal(
    process.env.R1_API_URL,
    SOURCE_ORIGIN,
    'R1_API_URL must be the exact dedicated API origin without fallback or override'
  )
  sourceUrl = new URL(process.env.DATABASE_URL || '')
  const sourceName = decodeURIComponent(sourceUrl.pathname.slice(1))
  assert.equal(sourceName, SOURCE_DATABASE)
  assert.notEqual(sourceName, 'af_admin_r1')
  assert.equal(sourceUrl.hostname, '127.0.0.1')
  assert.equal(sourceUrl.port, '15438')
  assert.ok(['postgres:', 'postgresql:'].includes(sourceUrl.protocol))
  assert.ok(sourceUrl.username)
  assert.equal(sourceUrl.search, '')
  assert.equal(sourceUrl.hash, '')
  assert.equal(POSTGRES_CONTAINER, 'af-admin-r1-postgres')
  assert.match(targetName, /^af_data_screen_recovery_[a-f0-9]{32}_demo$/)
  assert.notEqual(targetName, SOURCE_DATABASE)
  assert.equal(path.dirname(dumpPath), runRoot)
  assert.equal(path.basename(dumpPath), 'database.dump')
  assert.equal(path.dirname(runRoot), EVIDENCE_ROOT)
  assert.equal(path.basename(runRoot), runId)
  const guarded = await guardedFixtureReport()
  Object.values(guarded.report.fixtures).forEach((fixture) =>
    ownedScreenIds.add(fixture.screen.definitionId)
  )
  targetMutableScreenId = guarded.report.fixtures.sales.screen.definitionId
  assert.ok(ownedScreenIds.has(targetMutableScreenId))
  source = new Pool({
    connectionString: sourceUrl.toString(),
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  })
  source.on('error', (error) => {
    validationFailure ||= error
  })
  assert.equal(
    (await source.query('SELECT current_database() AS name')).rows[0].name,
    SOURCE_DATABASE
  )
  await verifyMigrationReadiness(source)
  await migrationFacts(source)
  const ready = await fetch(`${SOURCE_ORIGIN}/ready`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(ready.status, 200)
  const context = await fetch(`${SOURCE_ORIGIN}/api/runtime-context`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(context.status, 200)
  assert.equal((await context.json()).data.mode, 'demo')
  await advance('source-session-binding')
  await bindSourceSession()
  const leaveBaseline = await apiCall(SOURCE_ORIGIN, '/applications/leave')
  const leaveBaselineHash = contentHash(leaveBaseline)
  await advance('verified-source-fixtures')
  const sourceRuns = {}
  await sequence(
    Object.entries(guarded.report.fixtures),
    async ([kind, fixture]) => {
      assert.equal(kind, fixture.kind)
      await validateFixtureOwnership(source, fixture)
      sourceRuns[kind] = await readScreenRun(SOURCE_ORIGIN, fixture)
    }
  )
  const screenIds = [...ownedScreenIds].sort()
  const sourceScreenFacts = await screenDatabaseFacts(source, screenIds)
  const sourceScreenHash = contentHash(sourceScreenFacts)
  const sourceScreens = Object.fromEntries(
    Object.entries(sourceRuns).map(([kind, value]) => {
      const active = value.details.versions.find(
        (version) => version.id === value.details.activeReleaseId
      )
      assert.ok(active)
      return [
        kind,
        {
          definitionId: value.details.id,
          revision: value.details.revision,
          activeReleaseId: value.details.activeReleaseId,
          title: value.details.draft.title,
          contentHash: active.contentHash,
        },
      ]
    })
  )
  await advance('consistent-database-snapshot')
  const tables = await registeredTables(source)
  const snapshot = await source.connect()
  const dump = await open(dumpPath, 'wx', 0o600)
  const dumpLog = await open(path.join(runRoot, 'dump.log'), 'wx', 0o600)
  let sourceCounts
  let migrationChecksums
  let snapshotStartedAt
  try {
    await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    snapshotStartedAt = (
      await snapshot.query('SELECT clock_timestamp() AS time')
    ).rows[0].time
    sourceCounts = await tableCounts(snapshot, tables)
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
        SOURCE_DATABASE,
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
  const dumpHeader = await open(dumpPath, 'r')
  try {
    const magic = Buffer.alloc(5)
    assert.equal((await dumpHeader.read(magic, 0, 5, 0)).bytesRead, 5)
    assert.equal(magic.toString(), 'PGDMP')
    assert.ok(dumpInfo.size > 5)
  } finally {
    await dumpHeader.close()
  }
  await advance('independent-database-restore')
  assert.equal(
    (
      await source.query(
        'SELECT count(*)::int AS total FROM pg_database WHERE datname=$1',
        [targetName]
      )
    ).rows[0].total,
    0,
    'The random target database must not preexist'
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
    statement_timeout: 30000,
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
  const restoredCounts = await tableCounts(restored, tables)
  assert.deepEqual(restoredCounts, sourceCounts)
  assert.deepEqual(await migrationFacts(restored), migrationChecksums)
  assert.equal(
    contentHash(await screenDatabaseFacts(restored, screenIds)),
    sourceScreenHash
  )
  targetStore = await realpath(
    await mkdtemp(path.join(tmpdir(), 'af-data-screen-recovery-'))
  )
  assert.equal(path.dirname(targetStore), await realpath(tmpdir()))
  assert.match(
    path.basename(targetStore),
    /^af-data-screen-recovery-[A-Za-z0-9]+$/
  )
  await advance('restored-api-and-runtime')
  targetServer = createServer(restored, noFault, { storageRoot: targetStore })
  let targetOrigin = await targetServer.listen({ host: '127.0.0.1', port: 0 })
  const restoredUser = await apiCall(targetOrigin, '/user/info')
  assert.equal(restoredUser.id, 'a-admin')
  assert.equal(restoredUser.tenantId, 'tenant-a')
  const restoredRuns = {}
  await sequence(
    Object.entries(guarded.report.fixtures),
    async ([kind, fixture]) => {
      await validateFixtureOwnership(restored, fixture)
      restoredRuns[kind] = await readScreenRun(targetOrigin, fixture)
      assert.equal(
        contentHash(stableRun(restoredRuns[kind].run)),
        contentHash(stableRun(sourceRuns[kind].run))
      )
      assert.equal(
        contentHash(restoredRuns[kind].details.draft),
        contentHash(sourceRuns[kind].details.draft)
      )
    }
  )
  await advance('target-sales-v2-and-rollback')
  const salesFixture = guarded.report.fixtures.sales
  const originalSales = restoredRuns.sales.details
  const changedTitle = `${originalSales.draft.title}·恢复副本-${runId.slice(
    0,
    8
  )}`
  const changedDraft = modifiedSalesDraft(
    originalSales.draft,
    runId.slice(0, 8)
  )
  assert.equal(changedDraft.title, changedTitle)
  const updated = await apiCall(
    targetOrigin,
    `/data-screens/definitions/${salesFixture.screen.definitionId}`,
    {
      method: 'PUT',
      body: { draft: changedDraft, expectedRevision: originalSales.revision },
    }
  )
  assert.equal(updated.draft.title, changedTitle)
  assert.equal(updated.activeReleaseId, salesFixture.screen.releaseId)
  const published = await apiCall(
    targetOrigin,
    `/data-screens/definitions/${salesFixture.screen.definitionId}/publish`,
    {
      method: 'POST',
      body: { expectedRevision: updated.revision },
    }
  )
  const second = published.versions.find(
    (version) => version.id === published.activeReleaseId
  )
  assert.ok(second)
  assert.equal(second.version, 2)
  assert.equal(second.snapshot.title, changedTitle)
  assert.notEqual(second.contentHash, salesFixture.screen.contentHash)
  const rolledBack = await apiCall(
    targetOrigin,
    `/data-screens/definitions/${salesFixture.screen.definitionId}/rollback`,
    {
      method: 'POST',
      body: {
        expectedRevision: published.revision,
        releaseId: salesFixture.screen.releaseId,
      },
    }
  )
  assert.equal(rolledBack.activeReleaseId, salesFixture.screen.releaseId)
  assert.equal(rolledBack.draft.title, changedTitle)
  assert.equal(rolledBack.versions.length, 2)
  const rolledBackRun = await apiCall(
    targetOrigin,
    `/data-screens/definitions/${salesFixture.screen.definitionId}/run`,
    {
      method: 'POST',
      body: { releaseId: salesFixture.screen.releaseId },
    }
  )
  assertFixtureRun(salesFixture, rolledBackRun)
  assert.equal(
    contentHash(stableRun(rolledBackRun)),
    contentHash(stableRun(sourceRuns.sales.run))
  )
  await advance('restored-api-recreation')
  await targetServer.close()
  targetServer = undefined
  targetServer = createServer(restored, noFault, { storageRoot: targetStore })
  targetOrigin = await targetServer.listen({ host: '127.0.0.1', port: 0 })
  const reopenedSales = await apiCall(
    targetOrigin,
    `/data-screens/definitions/${salesFixture.screen.definitionId}`
  )
  assert.equal(reopenedSales.activeReleaseId, salesFixture.screen.releaseId)
  assert.equal(reopenedSales.draft.title, changedTitle)
  assert.equal(reopenedSales.versions.length, 2)
  const recreatedRun = await apiCall(
    targetOrigin,
    `/data-screens/definitions/${salesFixture.screen.definitionId}/run`,
    {
      method: 'POST',
      body: { releaseId: salesFixture.screen.releaseId },
    }
  )
  assertFixtureRun(salesFixture, recreatedRun)
  assert.equal(
    contentHash(stableRun(recreatedRun)),
    contentHash(stableRun(sourceRuns.sales.run))
  )
  await advance('source-immutability')
  assert.equal(
    contentHash(await screenDatabaseFacts(source, screenIds)),
    sourceScreenHash
  )
  const finalSourceRuns = {}
  await sequence(
    Object.entries(guarded.report.fixtures),
    async ([kind, fixture]) => {
      await validateFixtureOwnership(source, fixture)
      finalSourceRuns[kind] = await readScreenRun(SOURCE_ORIGIN, fixture)
      assert.equal(
        contentHash(stableRun(finalSourceRuns[kind].run)),
        contentHash(stableRun(sourceRuns[kind].run))
      )
    }
  )
  const sourceSales = finalSourceRuns.sales
  assert.equal(sourceSales.details.revision, salesFixture.screen.revision)
  assert.equal(
    sourceSales.details.activeReleaseId,
    salesFixture.screen.releaseId
  )
  assert.equal(sourceSales.details.draft.title, originalSales.draft.title)
  assert.equal(sourceSales.details.versions.length, 1)
  assert.equal(
    sourceSales.details.versions[0].contentHash,
    salesFixture.screen.contentHash
  )
  assert.equal(
    contentHash(stableRun(sourceSales.run)),
    contentHash(stableRun(sourceRuns.sales.run))
  )
  assert.equal(
    (
      await source.query(
        "SELECT count(*)::int AS total FROM data_screen_releases WHERE tenant_id='tenant-a' AND definition_id=$1 AND version=2",
        [salesFixture.screen.definitionId]
      )
    ).rows[0].total,
    0
  )
  assert.equal(
    contentHash(await apiCall(SOURCE_ORIGIN, '/applications/leave')),
    leaveBaselineHash
  )
  const finalSourceCounts = await tableCounts(source, tables)
  const sourceTableCountDifferences = Object.fromEntries(
    tables
      .filter((table) => finalSourceCounts[table] !== sourceCounts[table])
      .map((table) => [
        table,
        { snapshot: sourceCounts[table], final: finalSourceCounts[table] },
      ])
  )
  reportData = {
    version: 1,
    status: 'validated-awaiting-cleanup',
    validatedAt: new Date().toISOString(),
    runId,
    scope,
    caveat,
    knownHistoricalFileGap,
    fixtureReport: path.relative(process.cwd(), guarded.path),
    fixtureRunId: guarded.report.runId,
    tableCount: tables.length,
    sourceTableCounts: sourceCounts,
    finalSourceTableCounts: finalSourceCounts,
    sourceTableCountDifferences,
    restoredTableCounts: restoredCounts,
    migrationCount: migrationChecksums.length,
    migrationChecksums,
    migrationChecksumsMatch: true,
    migration027Sha256: MIGRATION_027_SHA256,
    dumpBytes: dumpInfo.size,
    dumpFormat: 'PGDMP custom archive',
    snapshotStartedAt: snapshotStartedAt.toISOString(),
    targetCreated,
    preservedOriginalAdminSession: true,
    restoredFixtureCounts: { operations: 5, sales: 6, equipment: 4 },
    restoredReportDefinitions: 9,
    restoredDataScreens: 3,
    restoredSignedSalesCoordinates: signedSalesCoordinates,
    restoredRuntimeHashes: Object.fromEntries(
      Object.entries(restoredRuns).map(([kind, value]) => [
        kind,
        contentHash(stableRun(value.run)),
      ])
    ),
    targetSalesMutation: {
      definitionId: salesFixture.screen.definitionId,
      originalReleaseId: salesFixture.screen.releaseId,
      publishedVersion: 2,
      publishedReleaseId: second.id,
      restoredActiveReleaseId: reopenedSales.activeReleaseId,
      draftTitle: changedTitle,
      apiRecreated: true,
    },
    sourceUnchanged: {
      screenFactsHash: sourceScreenHash,
      screens: sourceScreens,
      salesRevision: sourceSales.details.revision,
      salesActiveReleaseId: sourceSales.details.activeReleaseId,
      salesTitle: sourceSales.details.draft.title,
      salesContentHash: sourceSales.details.versions[0].contentHash,
      leaveBaselineHash,
      fixtureBusinessFactsMatch: true,
      allSourceTableCountsClaimedStatic: false,
    },
    copiedFileObjects: 0,
    fileByteRecoveryClaimed: false,
    workersStarted: false,
    globalJobDrainAttempted: false,
    ownedScreenIds: [...ownedScreenIds],
    targetMutations,
    privateEvidenceDirectory: runRoot,
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
    .filter((result) => result.status === 'rejected')
    .forEach((result) => cleanupFailures.push(result.reason))
  if (targetServer) await cleanup(() => targetServer.close())
  if (restored) await cleanup(() => restored.end())
  if (targetCreated && source)
    await cleanup(async () => {
      assert.match(targetName, /^af_data_screen_recovery_[a-f0-9]{32}_demo$/)
      assert.ok(targetName.endsWith(`${runId}_demo`))
      assert.notEqual(targetName, SOURCE_DATABASE)
      const exists = (
        await source.query(
          'SELECT count(*)::int AS total FROM pg_database WHERE datname=$1',
          [targetName]
        )
      ).rows[0].total
      if (exists === 1) await source.query(`DROP DATABASE ${targetName}`)
      else assert.equal(exists, 0)
      targetRemoved = true
    })
  if (targetStore)
    await cleanup(async () => {
      assert.equal(path.dirname(targetStore), await realpath(tmpdir()))
      assert.match(
        path.basename(targetStore),
        /^af-data-screen-recovery-[A-Za-z0-9]+$/
      )
      await rm(targetStore, { recursive: true, force: false })
      targetStoreRemoved = true
    })
  if (source) await cleanup(() => source.end())
}

if (validationFailure || cleanupFailures.length) {
  const failed = {
    version: 1,
    status: 'failed',
    failedAt: new Date().toISOString(),
    stage,
    error: safeError(validationFailure || cleanupFailures[0]),
    cleanupFailures: cleanupFailures.map(safeError),
    runId,
    scope,
    caveat,
    knownHistoricalFileGap,
    targetCreationAttempted,
    targetCreated,
    restoredDatabaseRemoved: targetRemoved,
    restoredStoreRemoved: targetStoreRemoved,
    ownedScreenIds: [...ownedScreenIds],
    targetMutations,
    copiedFileObjects: 0,
    fileByteRecoveryClaimed: false,
    workersStarted: false,
    globalJobDrainAttempted: false,
    privateEvidenceDirectory: runRoot,
  }
  await writeReport(failed)
  throw new Error(
    `Data-screen recovery failed safely at ${stage}; inspect the private report`
  )
}

assert.ok(reportData)
assert.equal(targetRemoved, true)
assert.equal(targetStoreRemoved, true)
Object.assign(reportData, {
  status: 'verified',
  verifiedAt: new Date().toISOString(),
  restoredDatabaseRemoved: targetRemoved,
  restoredStoreRemoved: targetStoreRemoved,
})
await writeReport(reportData)
process.stdout.write(
  `Data-screen recovery verified ${reportData.tableCount} public table counts, 27 migration checksums, 15 existing records, 9 fixed reports, 3 published screens, and 6 signed coordinate pairs in a restored independent database. Target-only sales v2 publish, v1 rollback, and API recreation passed; source screens and leave baseline stayed unchanged. No file-byte recovery is claimed. Target database and store were removed.\n`
)
