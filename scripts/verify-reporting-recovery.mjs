import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Pool } from 'pg'
import { createServer } from '@af-admin/reference-api/dist/index.js'
import { verifyMigrationReadiness } from '@af-admin/reference-api/dist/migrate.js'

const sourceUrl = new URL(process.env.DATABASE_URL || '')
const sourceName = decodeURIComponent(sourceUrl.pathname.slice(1))
const apiUrl = new URL(process.env.R1_API_URL || 'http://127.0.0.1:10890')
const { origin } = apiUrl
const expectedSourceName =
  process.env.REPORTING_RECOVERY_SOURCE_DATABASE ||
  'af_admin_full_c1b35e6ead774464986c87ea453d847e_demo'
const dedicatedName =
  /^[A-Za-z][A-Za-z0-9_]*_demo$/.test(expectedSourceName) &&
  expectedSourceName !== 'af_admin_r1' &&
  sourceName === expectedSourceName &&
  sourceName !== 'af_admin_r1'
if (
  process.env.APP_MODE !== 'demo' ||
  !dedicatedName ||
  sourceUrl.hostname !== '127.0.0.1' ||
  !['postgres:', 'postgresql:'].includes(sourceUrl.protocol) ||
  !sourceUrl.username ||
  sourceUrl.search ||
  sourceUrl.hash ||
  origin !== 'http://127.0.0.1:10890' ||
  apiUrl.pathname !== '/' ||
  apiUrl.search ||
  apiUrl.hash ||
  apiUrl.username ||
  apiUrl.password
)
  throw new Error(
    'Reporting recovery requires the explicitly expected local demo database and the dedicated demo API at http://127.0.0.1:10890; the private af_admin_r1 database is forbidden'
  )

const container =
  process.env.REPORTING_RECOVERY_POSTGRES_CONTAINER || 'af-admin-r1-postgres'
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(container))
  throw new Error('PostgreSQL container name is invalid')
const root = 'test-results/full-product/reporting-20261013/database-copy'
const targetName = `af_reporting_recovery_${randomUUID().replaceAll(
  '-',
  ''
)}_demo`
assert.match(targetName, /^af_reporting_recovery_[a-f0-9]{32}_demo$/)
assert.notEqual(targetName, sourceName)
const targetUrl = new URL(sourceUrl)
targetUrl.pathname = `/${targetName}`
const source = new Pool({
  connectionString: sourceUrl.toString(),
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
})
const children = new Set()
let created = false
let restored
let server
let token
let stage = 'guarded'
let reportData
let validationFailure
let removed = false
const cleanupFailures = []
const tables = [
  'schema_migrations',
  'tenants',
  'users',
  'memberships',
  'sessions',
  'session_scopes',
  'permission_definitions',
  'roles',
  'role_permissions',
  'member_roles',
  'role_member_scopes',
  'role_scope_departments',
  'departments',
  'positions',
  'applications',
  'application_releases',
  'form_drafts',
  'workflow_drafts',
  'business_records',
  'workflow_instances',
  'workflow_tasks',
  'workflow_history',
  'workflow_assignment_overrides',
  'workflow_assignment_events',
  'workflow_activities',
  'workflow_timers',
  'workflow_timer_events',
  'idempotency_records',
  'audit_events',
  'outbox',
  'notifications',
  'report_definitions',
  'report_definition_versions',
  'menu_resources',
  'menu_route_catalogue',
  'stored_files',
  'file_uploads',
]
assert.ok(tables.length >= 24)
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
const runDocker = async (argumentsList, stdio, inputPath) => {
  const child = spawn('docker', ['exec', ...argumentsList], { stdio })
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
      'Actual PostgreSQL dump/restore must complete successfully'
    )
  } finally {
    await stopChild(child)
  }
}
const call = async (
  base,
  endpoint,
  data,
  method = 'GET',
  expectedStatus = 200
) => {
  assert.ok(token, 'Every continuation uses the original source session token')
  const response = await fetch(`${base}/api${endpoint}`, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      'x-access-token': token,
      'x-tenant-id': 'tenant-a',
      'idempotency-key': randomUUID(),
      ...(data === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const body = await response.json()
  assert.equal(
    response.status,
    expectedStatus,
    `${body.businessCode || 'HTTP_ERROR'}: ${body.message || endpoint}`
  )
  if (expectedStatus !== 200) return body
  assert.equal(body.code, 20000)
  return body.data
}
const counts = async (database) => {
  const result = {}
  await tables.reduce(async (previous, table) => {
    await previous
    result[table] = (
      await database.query(`SELECT count(*)::int AS total FROM ${table}`)
    ).rows[0].total
  }, Promise.resolve())
  return result
}
const metadata = (id) => ({ kind: 'metadata', id })
const findField = (catalogue, label) => {
  const field = catalogue.visibleFields.find(
    (value) => value.reference.kind === 'field' && value.label === label
  )
  assert.ok(field, `The current authorized source must register ${label}`)
  return field.reference
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

try {
  await mkdir(root, { recursive: true, mode: 0o700 })
  await writeFile(
    path.join(root, 'report.json'),
    JSON.stringify(
      {
        status: 'running',
        startedAt: new Date().toISOString(),
        scope: 'existing local PostgreSQL independent database',
        caveat:
          'not fresh-machine deployment or whole-product file-byte restore',
      },
      null,
      2
    ),
    { mode: 0o600 }
  )
  await verifyMigrationReadiness(source)
  assert.equal(
    (await source.query('SELECT count(*)::int AS total FROM schema_migrations'))
      .rows[0].total,
    24
  )
  const ready = await fetch(`${origin}/ready`, {
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(ready.status, 200)
  const context = await fetch(`${origin}/api/runtime-context`, {
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(context.status, 200)
  assert.equal((await context.json()).data.mode, 'demo')
  const login = await fetch(`${origin}/api/user/login`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'a-admin', password: 'a-admin' }),
  })
  assert.equal(login.status, 200)
  token = (await login.json()).data.token
  assert.equal(typeof token, 'string')
  const user = await call(origin, '/user/info')
  assert.equal(user.id, 'a-admin')
  assert.equal(user.tenantId, 'tenant-a')
  stage = 'source-fixture'
  const suffix = randomUUID().slice(0, 8)
  const application = await call(
    origin,
    '/application-center',
    {
      name: `独立恢复合成业务-${suffix}`,
      code: `report-recovery-${suffix}`,
      template: 'equipment',
    },
    'POST'
  )
  const form = await call(origin, `/form-schemas/${application.formDraftId}`)
  const workflow = await call(
    origin,
    `/workflows/${application.workflowDraftId}`
  )
  const release = await call(
    origin,
    `/applications/${application.id}/releases`,
    {
      formDraftId: form.id,
      workflowDraftId: workflow.id,
      formRevision: form.revision,
      workflowRevision: workflow.revision,
      expectedRevision: application.revision,
    },
    'POST'
  )
  const record = await call(
    origin,
    '/business/records',
    {
      applicationReleaseId: release.id,
      fields: {
        itemName: '恢复验证合成设备',
        quantity: 1,
        unitPrice: '12.34',
        reason: '独立数据库恢复的合成草稿记录',
      },
    },
    'POST'
  )
  const actualRecord = await call(origin, `/business/records/${record.id}`)
  assert.equal(actualRecord.status, 'draft')
  assert.equal(actualRecord.fields.quantity, 1)
  assert.equal(actualRecord.fields.unitPrice, '12.34')
  const catalogues = await call(
    origin,
    `/reporting/sources?applicationId=${encodeURIComponent(application.id)}`
  )
  assert.equal(catalogues.total, 1)
  assert.equal(catalogues.list.length, 1)
  const catalogue = catalogues.list[0]
  assert.equal(catalogue.sourceReleaseId, release.id)
  const item = findField(catalogue, '设备名称')
  const quantity = findField(catalogue, '领用数量')
  const price = findField(catalogue, '参考单价（元）')
  const originalName = `独立恢复未发布报表-${suffix}`
  const schema = {
    version: 1,
    name: originalName,
    source: { kind: 'application-records', applicationId: application.id },
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
  const definition = await call(
    origin,
    '/reporting/definitions',
    { schema },
    'POST'
  )
  assert.equal(definition.activeVersionId, null)
  assert.equal(definition.versions.length, 0)
  const databaseFixture = (
    await source.query(
      "SELECT d.id,d.active_version_id,r.applicant_id,r.fields,r.application_release_id FROM report_definitions d JOIN business_records r ON r.tenant_id=d.tenant_id AND r.id=$3 WHERE d.tenant_id='tenant-a' AND d.id=$1 AND r.application_release_id=$2",
      [definition.id, release.id, record.id]
    )
  ).rows[0]
  assert.ok(
    databaseFixture,
    'The dedicated API and guarded PostgreSQL connection must contain the same synthetic fixture'
  )
  assert.equal(databaseFixture.applicant_id, 'a-admin')
  assert.equal(databaseFixture.fields.unitPrice, '12.34')
  assert.equal(databaseFixture.active_version_id, null)
  stage = 'dump'
  const dumpPath = path.join(root, 'snapshot.dump')
  const dump = await open(dumpPath, 'w', 0o600)
  const log = await open(path.join(root, 'restore.log'), 'w', 0o600)
  const snapshot = await source.connect()
  let sourceCounts
  let migrationChecksums
  try {
    await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const snapshotId = (
      await snapshot.query('SELECT pg_export_snapshot() AS id')
    ).rows[0].id
    sourceCounts = await counts(snapshot)
    migrationChecksums = (
      await snapshot.query(
        'SELECT name,checksum FROM schema_migrations ORDER BY name'
      )
    ).rows
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
      ['ignore', dump.fd, log.fd]
    )
    await snapshot.query('COMMIT')
  } catch (error) {
    await snapshot.query('ROLLBACK')
    throw error
  } finally {
    snapshot.release()
    await dump.close()
    await log.close()
  }
  stage = 'restore'
  await source.query(`CREATE DATABASE ${targetName}`)
  created = true
  const restoreLog = await open(path.join(root, 'restore.log'), 'a', 0o600)
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
  restored = new Pool({
    connectionString: targetUrl.toString(),
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  })
  await verifyMigrationReadiness(restored)
  const restoredCounts = await counts(restored)
  assert.deepEqual(restoredCounts, sourceCounts)
  const restoredMigrations = (
    await restored.query(
      'SELECT name,checksum FROM schema_migrations ORDER BY name'
    )
  ).rows
  assert.deepEqual(restoredMigrations, migrationChecksums)
  assert.equal(restoredCounts.schema_migrations, 24)
  stage = 'restored-continuation'
  server = createServer(restored)
  const restoredOrigin = await server.listen({ host: '127.0.0.1', port: 0 })
  const restoredUser = await call(restoredOrigin, '/user/info')
  assert.equal(restoredUser.id, user.id)
  assert.equal(restoredUser.tenantId, user.tenantId)
  const copied = await call(
    restoredOrigin,
    `/reporting/definitions/${definition.id}`
  )
  assert.equal(copied.schema.name, originalName)
  assert.equal(copied.activeVersionId, null)
  assert.equal(copied.versions.length, 0)
  const copiedCatalogue = await call(
    restoredOrigin,
    `/reporting/sources?applicationId=${encodeURIComponent(application.id)}`
  )
  assert.equal(copiedCatalogue.total, 1)
  assert.deepEqual(
    [
      findField(copiedCatalogue.list[0], '设备名称'),
      findField(copiedCatalogue.list[0], '领用数量'),
      findField(copiedCatalogue.list[0], '参考单价（元）'),
    ],
    [item, quantity, price]
  )
  const changedName = `${originalName}-恢复库续存`
  const edited = await call(
    restoredOrigin,
    `/reporting/definitions/${definition.id}`,
    {
      schema: { ...schema, name: changedName },
      expectedRevision: copied.revision,
    },
    'PUT'
  )
  const published = await call(
    restoredOrigin,
    `/reporting/definitions/${definition.id}/publish`,
    { expectedRevision: edited.revision },
    'POST'
  )
  assert.ok(published.activeVersionId)
  assert.equal(published.versions.length, 1)
  const queryDate = civilDate(actualRecord.createdAt, schema.timeZone)
  const query = {
    version: 1,
    timeZone: schema.timeZone,
    dateRange: { from: queryDate, to: queryDate },
    statuses: ['draft'],
    keyword: '',
    searchFields: [],
    sort: { field: metadata('createdAt'), direction: 'desc' },
    current: 1,
    pageSize: 20,
  }
  const result = await call(
    restoredOrigin,
    `/reporting/versions/${published.activeVersionId}/query`,
    { query },
    'POST'
  )
  assert.equal(result.total, 1)
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].id, record.id)
  assert.equal(result.rows[0].values[`field:${item.id}`], '恢复验证合成设备')
  assert.equal(result.rows[0].values[`field:${quantity.id}`], 1)
  assert.equal(result.rows[0].values[`field:${price.id}`], '12.34')
  assert.equal(result.sourceReleaseId, release.id)
  assert.equal(result.sourceReleaseVersion, release.releaseVersion)
  assert.equal(result.releaseScope, 'fixed-published-source')
  assert.equal(result.factTime, 'createdAt')
  assert.equal(
    result.trend.reduce((sum, point) => sum + point.count, 0),
    1
  )
  assert.equal(
    result.distribution.reduce((sum, point) => sum + point.count, 0),
    1
  )
  const version = (
    await restored.query(
      "SELECT field_bindings,source_application_id,source_release_id,source_release_version,content_hash FROM report_definition_versions WHERE tenant_id='tenant-a' AND id=$1",
      [published.activeVersionId]
    )
  ).rows[0]
  assert.equal(version.source_application_id, application.id)
  assert.equal(version.source_release_id, release.id)
  assert.deepEqual(version.field_bindings[item.id], {
    rawUid: 'itemName',
    valueType: 'text',
  })
  assert.deepEqual(version.field_bindings[quantity.id], {
    rawUid: 'quantity',
    valueType: 'integer',
  })
  assert.deepEqual(version.field_bindings[price.id], {
    rawUid: 'unitPrice',
    valueType: 'decimal',
  })
  const disabled = await call(
    restoredOrigin,
    `/reporting/definitions/${definition.id}/enabled`,
    { enabled: false, expectedRevision: published.revision },
    'POST'
  )
  assert.equal(disabled.enabled, false)
  const stopped = await call(
    restoredOrigin,
    `/reporting/versions/${published.activeVersionId}/query`,
    { query },
    'POST',
    409
  )
  assert.equal(stopped.businessCode, 'REPORT_DISABLED')
  const enabled = await call(
    restoredOrigin,
    `/reporting/definitions/${definition.id}/enabled`,
    { enabled: true, expectedRevision: disabled.revision },
    'POST'
  )
  assert.equal(enabled.enabled, true)
  const fixed = (
    await restored.query(
      "SELECT field_bindings,source_release_id,content_hash FROM report_definition_versions WHERE tenant_id='tenant-a' AND id=$1",
      [published.activeVersionId]
    )
  ).rows[0]
  assert.deepEqual(fixed.field_bindings, version.field_bindings)
  assert.equal(fixed.source_release_id, version.source_release_id)
  assert.equal(fixed.content_hash, version.content_hash)
  const untouched = await call(
    origin,
    `/reporting/definitions/${definition.id}`
  )
  assert.equal(untouched.schema.name, originalName)
  assert.equal(untouched.activeVersionId, null)
  assert.equal(untouched.versions.length, 0)
  assert.equal(untouched.enabled, true)
  assert.equal(
    (
      await source.query(
        "SELECT id FROM report_definition_versions WHERE tenant_id='tenant-a' AND (definition_id=$1 OR id=$2)",
        [definition.id, published.activeVersionId]
      )
    ).rowCount,
    0
  )
  const missingVersion = await call(
    origin,
    `/reporting/versions/${published.activeVersionId}/catalogue`,
    undefined,
    'GET',
    404
  )
  assert.equal(missingVersion.businessCode, 'NOT_FOUND')
  const originalRecord = await call(origin, `/business/records/${record.id}`)
  assert.equal(originalRecord.status, 'draft')
  assert.equal(originalRecord.fields.unitPrice, '12.34')
  stage = 'verified'
  reportData = {
    status: 'verified',
    verifiedAt: new Date().toISOString(),
    method: 'actual pg_dump / pg_restore with exported source snapshot',
    scope: 'independent database inside existing local PostgreSQL',
    caveat: 'not fresh-machine deployment, not whole-product file-byte restore',
    tableCount: tables.length,
    tableCounts: sourceCounts,
    restoredTableCounts: restoredCounts,
    migrationCount: restoredCounts.schema_migrations,
    migrationChecksumsMatch: true,
    preservedOriginalSession: true,
    applicationId: application.id,
    sourceReleaseId: release.id,
    sourceReleaseVersion: release.releaseVersion,
    recordId: record.id,
    restoredRecordCount: result.total,
    restoredQuantity: result.rows[0].values[`field:${quantity.id}`],
    restoredUnitPrice: result.rows[0].values[`field:${price.id}`],
    reportId: definition.id,
    originalReportName: untouched.schema.name,
    originalReportUnpublished: true,
    restoredReportName: enabled.schema.name,
    restoredVersionId: published.activeVersionId,
    sourceHasRestoredVersion: false,
    fixedFieldBindings: true,
    immutableVersionContentHash: version.content_hash,
    restoredDisableAndEnableVerified: true,
  }
} catch (error) {
  validationFailure = error
} finally {
  const stopped = await Promise.allSettled(Array.from(children).map(stopChild))
  stopped
    .filter((value) => value.status === 'rejected')
    .forEach((value) => cleanupFailures.push(value.reason))
  const cleanup = async (run) => {
    try {
      await run()
    } catch (error) {
      cleanupFailures.push(error)
    }
  }
  if (server) await cleanup(() => server.close())
  if (restored) await cleanup(() => restored.end())
  if (created)
    await cleanup(async () => {
      await source.query(`DROP DATABASE ${targetName}`)
      removed = true
    })
  await cleanup(() => source.end())
}
if (validationFailure || cleanupFailures.length) {
  const error = validationFailure || cleanupFailures[0]
  const failure = JSON.stringify(
    {
      status: 'failed',
      stage,
      error: error.message,
      cleanupFailures: cleanupFailures.map((item) => item.message),
      restoredDatabaseRemoved: removed,
      scope:
        'existing local PostgreSQL independent database; no fresh-machine or file-byte recovery claim',
    },
    null,
    2
  )
  await writeFile(path.join(root, 'failure.json'), failure, { mode: 0o600 })
  await writeFile(path.join(root, 'report.json'), failure, { mode: 0o600 })
  throw error
}
reportData.restoredDatabaseRemoved = removed
await writeFile(
  path.join(root, 'report.json'),
  JSON.stringify(reportData, null, 2),
  { mode: 0o600 }
)
process.stdout.write(
  `Reporting recovery verified ${tables.length} table counts and 24 migration checksums, resumed the original session, published and queried one actual draft record with price 12.34 only in the independent restored database; original report stayed unpublished\n`
)
