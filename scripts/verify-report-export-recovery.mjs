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
import { pipeline } from 'node:stream/promises'
import { Pool } from 'pg'
import { createServer } from '@af-admin/reference-api/dist/index.js'
import { verifyMigrationReadiness } from '@af-admin/reference-api/dist/migrate.js'
import { processReportExports } from '@af-admin/reference-api/dist/report-export-jobs.js'
import { digest } from '@af-admin/reference-api/dist/security.js'
import {
  LocalObjectStore,
  fileDigest,
} from '@af-admin/reference-api/dist/file-storage.js'

const evidenceRoot = path.resolve(
  'test-results/full-product/report-exports-20261013/database-and-file-copy'
)
const runId = randomUUID().replaceAll('-', '')
const runRoot = path.join(evidenceRoot, runId)
const targetName = `af_report_export_recovery_${runId}_demo`
const expectedSourceName =
  process.env.REPORT_EXPORT_RECOVERY_SOURCE_DATABASE ||
  'af_admin_full_c1b35e6ead774464986c87ea453d847e_demo'
const container =
  process.env.REPORT_EXPORT_RECOVERY_POSTGRES_CONTAINER ||
  'af-admin-r1-postgres'
const scope =
  'random independent database inside existing local PostgreSQL, with an independent restored local object store'
const caveat =
  'not a new physical PostgreSQL server, fresh-machine deployment, or verification of every historical attachment; missing preexisting file bytes are explicitly reported'
const children = new Set()
const cleanupFailures = []
const sourceOwnedJobs = new Set()
const sourceExportIntents = []
const sourceJobCleanup = []
const fixtures = {}
let sourceUrl
let sourceName
let apiOrigin
let source
let restored
let server
let token
let restoreRoot
let stage = 'guards'
let targetCreated = false
let targetRemoved = false
let restoreStoreRemoved = false
let sourcePendingJob
let sourcePendingCancelled = false
let sourceReportClosedAfterFailure = false
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
    token,
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
const call = async (
  origin,
  endpoint,
  {
    body,
    method = 'GET',
    binary = false,
    expectedStatus = 200,
    key = randomUUID(),
  } = {}
) => {
  assert.ok(
    token,
    'Restored API continuation must use the original source session'
  )
  const response = await fetch(`${origin}/api${endpoint}`, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      'x-access-token': token,
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
  const data = await response.json()
  assert.equal(
    response.status,
    expectedStatus,
    `${data.businessCode || 'HTTP_ERROR'}: ${data.message || endpoint}`
  )
  if (expectedStatus !== 200) return data
  assert.equal(data.code, 20000)
  return data.data
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
const assertWorkerOwnsOnlyFixtures = async (db, ids = []) => {
  const foreign = (
    await db.query(
      "SELECT count(*)::int AS total FROM report_export_jobs j WHERE NOT(j.id=ANY($1::text[])) AND (j.status IN('queued','processing') OR (j.retention_until<=now() AND EXISTS(SELECT 1 FROM report_export_artifacts a WHERE a.tenant_id=j.tenant_id AND a.job_id=j.id AND a.status<>'expired'))) ",
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
  const job = await call(origin, `/reporting/exports/${id}`)
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
  })
  assert.equal(download.bytes.length, job.artifact.size)
  assert.equal(fileDigest(download.bytes), job.artifact.sha256)
  assert.equal(download.mimeType, job.artifact.mimeType)
  return download.bytes
}
const createSourceExport = async (body) => {
  const key = randomUUID()
  sourceExportIntents.push({
    key,
    definitionVersionId: body.definitionVersionId,
  })
  const job = await call(apiOrigin, '/reporting/exports', {
    method: 'POST',
    body,
    key,
  })
  sourceOwnedJobs.add(job.id)
  return job
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
      'Report export recovery requires the exact explicitly expected local demo database and credential-free http://127.0.0.1:10890 origin; af_admin_r1 is forbidden'
    )
  assert.match(
    container,
    /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
    'The PostgreSQL container name must be explicit and valid'
  )
  assert.match(targetName, /^af_report_export_recovery_[a-f0-9]{32}_demo$/)
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
    await mkdtemp(path.join(tmpdir(), 'af-report-export-restore-'))
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
    25
  )
  await assertWorkerOwnsOnlyFixtures(source)
  const ready = await fetch(`${apiOrigin}/ready`, {
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(ready.status, 200)
  const context = await fetch(`${apiOrigin}/api/runtime-context`, {
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(context.status, 200)
  assert.equal((await context.json()).data.mode, 'demo')
  const bindingStartedAt = (
    await source.query('SELECT clock_timestamp() AS time')
  ).rows[0].time
  const login = await fetch(`${apiOrigin}/api/user/login`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'a-admin', password: 'a-admin' }),
  })
  assert.equal(login.status, 200)
  token = (await login.json()).data.token
  assert.equal(typeof token, 'string')
  stage = 'source-session-binding'
  const bound = (
    await source.query(
      "SELECT s.user_id,s.default_tenant_id FROM sessions s JOIN session_scopes scope ON scope.token_hash=s.token_hash AND scope.user_id=s.user_id AND scope.tenant_id='tenant-a' JOIN memberships m ON m.tenant_id=scope.tenant_id AND m.user_id=scope.user_id JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE s.token_hash=$1 AND s.user_id='a-admin' AND s.default_tenant_id='tenant-a' AND s.revoked_at IS NULL AND s.expires_at>now() AND s.created_at>=$2::timestamptz-interval '1 minute' AND scope.epoch=m.session_epoch AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled'",
      [digest(token), bindingStartedAt]
    )
  ).rows
  assert.equal(
    bound.length,
    1,
    'The fresh HTTP session must exist in the exact guarded source database before any business write'
  )
  assert.equal(bound[0].user_id, 'a-admin')
  assert.equal(bound[0].default_tenant_id, 'tenant-a')
  const originalUser = await call(apiOrigin, '/user/info')
  assert.equal(originalUser.id, 'a-admin')
  assert.equal(originalUser.tenantId, 'tenant-a')
  stage = 'source-fixture'
  const suffix = runId.slice(0, 8)
  const app = await call(apiOrigin, '/application-center', {
    method: 'POST',
    body: {
      name: `导出恢复合成业务-${suffix}`,
      code: `export-recovery-${suffix}`,
      template: 'equipment',
    },
  })
  fixtures.applicationId = app.id
  const form = await call(apiOrigin, `/form-schemas/${app.formDraftId}`)
  const workflow = await call(apiOrigin, `/workflows/${app.workflowDraftId}`)
  const release = await call(apiOrigin, `/applications/${app.id}/releases`, {
    method: 'POST',
    body: {
      formDraftId: form.id,
      workflowDraftId: workflow.id,
      formRevision: form.revision,
      workflowRevision: workflow.revision,
      expectedRevision: app.revision,
    },
  })
  const record = await call(apiOrigin, '/business/records', {
    method: 'POST',
    body: {
      applicationReleaseId: release.id,
      fields: {
        itemName: '导出恢复合成设备',
        quantity: 1,
        unitPrice: '12.34',
        reason: '独立数据库及文件字节恢复验证',
      },
    },
  })
  const actualRecord = await call(apiOrigin, `/business/records/${record.id}`)
  fixtures.sourceReleaseId = release.id
  fixtures.recordId = record.id
  assert.equal(actualRecord.status, 'draft')
  assert.equal(actualRecord.fields.unitPrice, '12.34')
  const catalogues = await call(
    apiOrigin,
    `/reporting/sources?applicationId=${encodeURIComponent(app.id)}`
  )
  assert.equal(catalogues.total, 1)
  assert.equal(catalogues.list.length, 1)
  const catalogue = catalogues.list[0]
  assert.equal(catalogue.sourceReleaseId, release.id)
  const item = field(catalogue, '设备名称')
  const quantity = field(catalogue, '领用数量')
  const price = field(catalogue, '参考单价（元）')
  const originalName = `导出恢复已发布报表-${suffix}`
  const schema = {
    version: 1,
    name: originalName,
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
    body: { schema },
  })
  const definition = await call(
    apiOrigin,
    `/reporting/definitions/${draft.id}/publish`,
    { method: 'POST', body: { expectedRevision: draft.revision } }
  )
  assert.equal(definition.versions.length, 1)
  fixtures.reportId = definition.id
  fixtures.definitionVersionId = definition.activeVersionId
  const sameDatabase = (
    await source.query(
      "SELECT d.id,d.active_version_id,r.fields,r.applicant_id FROM report_definitions d JOIN business_records r ON r.tenant_id=d.tenant_id AND r.id=$2 WHERE d.tenant_id='tenant-a' AND d.id=$1",
      [definition.id, record.id]
    )
  ).rows[0]
  assert.ok(
    sameDatabase,
    'The guarded database and dedicated API must contain the same synthetic fixture'
  )
  assert.equal(sameDatabase.active_version_id, definition.activeVersionId)
  assert.equal(sameDatabase.applicant_id, 'a-admin')
  assert.equal(sameDatabase.fields.unitPrice, '12.34')
  const queryDate = civilDate(actualRecord.createdAt, schema.timeZone)
  const query = {
    version: 1,
    timeZone: schema.timeZone,
    dateRange: { from: queryDate, to: queryDate },
    statuses: ['draft'],
    keyword: '',
    searchFields: [],
    sort: { field: metadata('createdAt'), direction: 'asc' },
    current: 1,
    pageSize: 1,
  }
  const completed = []
  await sequence(['csv', 'xlsx'], async (format) => {
    const job = await createSourceExport({
      definitionVersionId: definition.activeVersionId,
      query,
      format,
    })
    assert.equal(job.status, 'queued')
    await assertWorkerOwnsOnlyFixtures(source, [job.id])
    assert.equal(
      await processReportExports(
        source,
        { storageRoot: sourceFileRoot },
        undefined,
        1
      ),
      1
    )
    const current = await readyJob(apiOrigin, job.id)
    const bytes = await readBytes(apiOrigin, current)
    assert.deepEqual(await exportFacts(source, job.id), {
      artifacts: 1,
      events: 1,
      audits: 1,
    })
    if (format === 'csv') {
      assert.ok(bytes.toString('utf8').includes('12.34'))
      assert.ok(bytes.toString('utf8').includes('导出恢复合成设备'))
    } else assert.equal(bytes.subarray(0, 2).toString(), 'PK')
    const artifact = (
      await source.query(
        "SELECT object_key,size,sha256 FROM report_export_artifacts WHERE tenant_id='tenant-a' AND id=$1",
        [current.artifact.id]
      )
    ).rows[0]
    assert.deepEqual(
      await originalStore.get(artifact.object_key),
      bytes,
      'API and source FILE_STORAGE_DIR must serve the same physical bytes'
    )
    completed.push({
      job: current,
      objectKey: artifact.object_key,
      size: artifact.size,
      sha256: artifact.sha256,
    })
  })
  sourcePendingJob = await createSourceExport({
    definitionVersionId: definition.activeVersionId,
    query,
    format: 'csv',
  })
  fixtures.pendingJobId = sourcePendingJob.id
  assert.equal(sourcePendingJob.status, 'queued')
  assert.equal(sourcePendingJob.artifact, null)
  await assertWorkerOwnsOnlyFixtures(source, [sourcePendingJob.id])
  stage = 'source-snapshot-and-byte-backup'
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
    assert.equal(migrationChecksums.length, 25)
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
    references = [...artifacts, ...files]
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
        throw error
      }
      const expected = owners[0]
      assert.equal(bytes.length, expected.size)
      assert.equal(fileDigest(bytes), expected.sha256)
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
    completed.forEach((fixture) =>
      assert.ok(
        copiedObjects.some(
          (object) =>
            object.objectKey === fixture.objectKey &&
            object.sha256 === fixture.sha256
        ),
        'Every created completed artifact must have actual backed-up and restored bytes'
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
  stage = 'database-restore'
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
  assert.equal(restoredCounts.schema_migrations, 25)
  assert.deepEqual(
    (
      await restored.query(
        'SELECT name,checksum FROM schema_migrations ORDER BY name'
      )
    ).rows,
    migrationChecksums
  )
  stage = 'restored-session-and-file-download'
  server = createServer(restored, undefined, { storageRoot: restoreRoot })
  const restoredOrigin = await server.listen({ host: '127.0.0.1', port: 0 })
  const restoredUser = await call(restoredOrigin, '/user/info')
  assert.equal(restoredUser.id, originalUser.id)
  assert.equal(restoredUser.tenantId, originalUser.tenantId)
  const copiedArtifacts = []
  await sequence(completed, async (fixture) => {
    const current = await readyJob(restoredOrigin, fixture.job.id)
    const bytes = await readBytes(restoredOrigin, current)
    assert.equal(current.artifact.id, fixture.job.artifact.id)
    assert.equal(current.artifact.sha256, fixture.sha256)
    assert.deepEqual(bytes, await backupStore.get(fixture.objectKey))
    assert.deepEqual(await exportFacts(restored, current.id), {
      artifacts: 1,
      events: 1,
      audits: 1,
    })
    copiedArtifacts.push({
      jobId: current.id,
      artifactId: current.artifact.id,
      format: current.format,
      size: bytes.length,
      sha256: fileDigest(bytes),
      realScanEngine: current.artifact.scanEngine,
    })
  })
  stage = 'restored-durable-export-continuation'
  const pending = await call(
    restoredOrigin,
    `/reporting/exports/${sourcePendingJob.id}`
  )
  assert.equal(pending.status, 'queued')
  assert.equal(pending.artifact, null)
  await assertWorkerOwnsOnlyFixtures(restored, [pending.id])
  assert.equal(
    await processReportExports(
      restored,
      { storageRoot: restoreRoot },
      undefined,
      1
    ),
    1
  )
  const resumed = await readyJob(restoredOrigin, pending.id)
  const resumedBytes = await readBytes(restoredOrigin, resumed)
  assert.ok(resumedBytes.toString('utf8').includes('12.34'))
  assert.ok(resumedBytes.toString('utf8').includes('导出恢复合成设备'))
  await processReportExports(
    restored,
    { storageRoot: restoreRoot },
    undefined,
    1
  )
  assert.deepEqual(await exportFacts(restored, pending.id), {
    artifacts: 1,
    events: 1,
    audits: 1,
  })
  const originalPending = await call(
    apiOrigin,
    `/reporting/exports/${pending.id}`
  )
  assert.equal(originalPending.status, 'queued')
  assert.equal(originalPending.artifact, null)
  assert.deepEqual(await exportFacts(source, pending.id), {
    artifacts: 0,
    events: 0,
    audits: 0,
  })
  stage = 'independent-report-edit'
  const copiedDefinition = await call(
    restoredOrigin,
    `/reporting/definitions/${definition.id}`
  )
  assert.equal(copiedDefinition.schema.name, originalName)
  const changedName = `${originalName}-仅恢复库改名`
  const edited = await call(
    restoredOrigin,
    `/reporting/definitions/${definition.id}`,
    {
      method: 'PUT',
      body: {
        schema: { ...schema, name: changedName },
        expectedRevision: copiedDefinition.revision,
      },
    }
  )
  const republished = await call(
    restoredOrigin,
    `/reporting/definitions/${definition.id}/publish`,
    { method: 'POST', body: { expectedRevision: edited.revision } }
  )
  assert.equal(republished.versions.length, 2)
  assert.notEqual(republished.activeVersionId, definition.activeVersionId)
  const result = await call(
    restoredOrigin,
    `/reporting/versions/${republished.activeVersionId}/query`,
    { method: 'POST', body: { query } }
  )
  assert.equal(result.total, 1)
  assert.equal(result.rows[0].id, record.id)
  assert.equal(result.rows[0].values[`field:${quantity.id}`], 1)
  assert.equal(result.rows[0].values[`field:${price.id}`], '12.34')
  assert.equal(result.sourceReleaseId, release.id)
  assert.equal(result.releaseScope, 'fixed-published-source')
  const fixed = (
    await restored.query(
      "SELECT v.field_bindings,v.source_release_id,v.source_release_version,j.field_bindings AS job_bindings,j.snapshot FROM report_definition_versions v JOIN report_export_jobs j ON j.tenant_id=v.tenant_id AND j.definition_version_id=v.id WHERE v.tenant_id='tenant-a' AND v.id=$1 AND j.id=$2",
      [definition.activeVersionId, pending.id]
    )
  ).rows[0]
  assert.equal(fixed.source_release_id, release.id)
  assert.equal(fixed.source_release_version, release.releaseVersion)
  assert.deepEqual(fixed.field_bindings, fixed.job_bindings)
  assert.deepEqual(fixed.field_bindings[price.id], {
    rawUid: 'unitPrice',
    valueType: 'decimal',
  })
  assert.equal(fixed.snapshot.sourceReleaseId, release.id)
  assert.equal(fixed.snapshot.rows[0].values[`field:${price.id}`], '12.34')
  const untouched = await call(
    apiOrigin,
    `/reporting/definitions/${definition.id}`
  )
  assert.equal(untouched.schema.name, originalName)
  assert.equal(untouched.activeVersionId, definition.activeVersionId)
  assert.equal(untouched.versions.length, 1)
  assert.equal(
    (
      await source.query(
        "SELECT id FROM report_definition_versions WHERE tenant_id='tenant-a' AND id=$1",
        [republished.activeVersionId]
      )
    ).rowCount,
    0
  )
  assert.equal(
    (
      await source.query(
        "SELECT id FROM report_export_artifacts WHERE tenant_id='tenant-a' AND id=$1",
        [resumed.artifact.id]
      )
    ).rowCount,
    0
  )
  const finalSourceRecord = await call(
    apiOrigin,
    `/business/records/${record.id}`
  )
  assert.equal(finalSourceRecord.status, 'draft')
  assert.equal(finalSourceRecord.fields.unitPrice, '12.34')
  await sequence(completed, async (fixture) => {
    const current = await readyJob(apiOrigin, fixture.job.id)
    assert.equal(current.artifact.sha256, fixture.sha256)
    assert.deepEqual(
      await originalStore.get(fixture.objectKey),
      await backupStore.get(fixture.objectKey)
    )
  })
  stage = 'verified-awaiting-cleanup'
  reportData = {
    status: 'verified',
    verifiedAt: new Date().toISOString(),
    scope,
    caveat,
    runId,
    method:
      'actual pg_dump / pg_restore exported snapshot plus actual referenced object-byte backup and restore',
    tableCount: tables.length,
    tableCounts: sourceCounts,
    restoredTableCounts: restoredCounts,
    migrationCount: 25,
    dumpBytes: dumpInfo.size,
    dumpFormat: 'PGDMP custom archive',
    migrationChecksumsMatch: true,
    preservedOriginalSession: true,
    applicationId: app.id,
    sourceReleaseId: release.id,
    sourceReleaseVersion: release.releaseVersion,
    recordId: record.id,
    restoredRecordCount: result.total,
    restoredUnitPrice: '12.34',
    reportId: definition.id,
    sourceReportName: untouched.schema.name,
    restoredReportName: changedName,
    restoredOnlyReportVersionId: republished.activeVersionId,
    sourceHasRestoredVersion: false,
    fixedFieldBindings: true,
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
    createdArtifactsRestored: copiedArtifacts,
    pendingJobId: pending.id,
    sourcePendingStayedQueuedUntilCleanup: true,
    sourcePendingHasTargetArtifact: false,
    restoredContinuation: {
      artifactId: resumed.artifact.id,
      size: resumed.artifact.size,
      sha256: resumed.artifact.sha256,
      scanEngine: resumed.artifact.scanEngine,
      canonicalEffects: { artifacts: 1, events: 1, audits: 1 },
    },
    privateEvidenceDirectory: runRoot,
    objectManifest: path.join(runRoot, 'object-manifest.json'),
    sourceFileRootChangedOnlyForSyntheticArtifacts: true,
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
  if (validationFailure && fixtures.reportId && token && apiOrigin)
    await cleanup(async () => {
      // Actual disable takes the tenant-exclusive command gate: earlier creates finish first, and later creates see disabled.
      let closureError
      await sequence([1, 2, 3], async () => {
        if (sourceReportClosedAfterFailure) return
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
          sourceReportClosedAfterFailure = true
        } catch (error) {
          closureError = error
        }
      })
      if (!sourceReportClosedAfterFailure)
        throw (
          closureError ||
          new Error(
            'The run-owned source report creation barrier could not be established'
          )
        )
    })
  if (source && sourceExportIntents.length)
    await cleanup(async () => {
      const client = await source.connect()
      try {
        await client.query('BEGIN')
        await client.query("SET LOCAL statement_timeout='60000ms'")
        // These are exactly the server idempotency locks, so an already-started create must settle before discovery.
        await sequence(sourceExportIntents, async (intent) => {
          await client.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [
              JSON.stringify([
                'tenant-a',
                'a-admin',
                'report-export.create',
                intent.key,
              ]),
            ]
          )
        })
        const recovered = (
          await client.query(
            "SELECT j.id FROM report_export_jobs j WHERE j.tenant_id='tenant-a' AND j.created_by='a-admin' AND j.definition_version_id=$2 AND (EXISTS(SELECT 1 FROM idempotency_records receipt WHERE receipt.tenant_id=j.tenant_id AND receipt.actor_id=j.created_by AND receipt.operation='report-export.create' AND receipt.key=ANY($1::text[]) AND receipt.response->>'id'=j.id) OR $3::boolean)",
            [
              sourceExportIntents.map((intent) => intent.key),
              fixtures.definitionVersionId,
              sourceReportClosedAfterFailure,
            ]
          )
        ).rows
        recovered.forEach((job) => sourceOwnedJobs.add(job.id))
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    })
  if (token && apiOrigin)
    await sequence(Array.from(sourceOwnedJobs), async (id) => {
      await cleanup(async () => {
        const current = await call(apiOrigin, `/reporting/exports/${id}`)
        if (
          ['queued', 'processing', 'failed', 'blocked'].includes(current.status)
        ) {
          await call(apiOrigin, `/reporting/exports/${id}/cancel`, {
            method: 'POST',
            body: { expectedRevision: current.revision },
          })
          const cancelled = await call(apiOrigin, `/reporting/exports/${id}`)
          assert.equal(cancelled.status, 'cancelled')
          sourceJobCleanup.push({
            id,
            previousStatus: current.status,
            finalStatus: 'cancelled',
          })
          if (id === sourcePendingJob?.id) sourcePendingCancelled = true
        } else {
          sourceJobCleanup.push({
            id,
            previousStatus: current.status,
            finalStatus: current.status,
          })
          if (id === sourcePendingJob?.id) {
            assert.equal(
              current.status,
              'cancelled',
              'The source worker must remain paused; a terminal source artifact cannot be undone'
            )
            sourcePendingCancelled = true
          }
        }
      })
    })
  if (server) await cleanup(() => server.close())
  if (restored) await cleanup(() => restored.end())
  if (targetCreated && source)
    await cleanup(async () => {
      await source.query(`DROP DATABASE ${targetName}`)
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
  const error = validationFailure || cleanupFailures[0]
  const failed = {
    status: 'failed',
    failedAt: new Date().toISOString(),
    stage,
    error: safeError(error),
    cleanupFailures: cleanupFailures.map(safeError),
    scope,
    caveat,
    runId,
    restoredDatabaseRemoved: targetRemoved,
    restoredStoreRemoved: restoreStoreRemoved,
    sourcePendingCancelled,
    privateEvidenceDirectory: runRoot,
    fixtures,
    sourceJobCleanup,
    sourceExportIntents,
    sourceReportClosedAfterFailure,
  }
  await writeReport(failed)
  await writeFile(
    path.join(runRoot, 'failure.json'),
    JSON.stringify(failed, null, 2),
    { mode: 0o600 }
  )
  throw new Error(
    `Report export recovery failed at ${stage}; see the private recovery report`
  )
}
reportData.restoredDatabaseRemoved = targetRemoved
reportData.restoredStoreRemoved = restoreStoreRemoved
reportData.sourcePendingCancelled = sourcePendingCancelled
reportData.sourceJobCleanup = sourceJobCleanup
assert.equal(targetRemoved, true)
assert.equal(restoreStoreRemoved, true)
assert.equal(sourcePendingCancelled, true)
await writeReport(reportData)
process.stdout.write(
  `Report export recovery verified ${reportData.tableCount} table counts and 25 migration checksums, restored ${reportData.copiedObjectCount} actual referenced byte objects, reused the original session, and resumed one durable export only in an independent restored database/store. Missing preexisting stored-file objects: ${reportData.missingExistingFiles.length}. Source pending fixture cancelled; restored database/store removed.\n`
)
