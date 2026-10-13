import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { createPool } from '@af-admin/reference-api/dist/database.js'
import { migrate } from '@af-admin/reference-api/dist/migrate.js'
import { seedDemo } from '@af-admin/reference-api/dist/seed.js'
import { createServer } from '@af-admin/reference-api/dist/index.js'
import {
  REPORT_EXPORT_MAINTENANCE_SCOPE_VERSION,
  expireReportExports,
  processReportExports,
} from '@af-admin/reference-api/dist/report-export-jobs.js'
import { clamavScanner } from '@af-admin/reference-api/dist/file-scanner.js'
import { LocalObjectStore } from '@af-admin/reference-api/dist/file-storage.js'

const pool = createPool()
const tokens = new Map()
let server
let base
let storageRoot
let originals
let isolated = false
const sequence = (values, run) =>
  values.reduce(async (previous, value) => {
    await previous
    await run(value)
  }, Promise.resolve())

const login = async (user) => {
  if (tokens.has(user)) return tokens.get(user)
  const response = await fetch(`${base}/api/user/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user, password: user }),
  })
  assert.equal(response.status, 200)
  const { token } = (await response.json()).data
  tokens.set(user, token)
  return token
}

const call = async (
  url,
  { user = 'a-admin', method = 'GET', body, key = randomUUID() } = {}
) => {
  const response = await fetch(`${base}/api${url}`, {
    method,
    headers: {
      'x-access-token': await login(user),
      'x-tenant-id': user.startsWith('b-') ? 'tenant-b' : 'tenant-a',
      'idempotency-key': key,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, ...(await response.json()) }
}

const ok = (value) => {
  assert.equal(value.status, 200, `${value.businessCode}: ${value.message}`)
  return value.data
}
const metadata = (id) => ({ kind: 'metadata', id })
const query = () => ({
  version: 1,
  timeZone: 'Asia/Shanghai',
  dateRange: { from: '2026-01-01', to: '2026-12-31' },
  statuses: [],
  keyword: '',
  searchFields: [],
  sort: { field: metadata('createdAt'), direction: 'asc' },
  current: 1,
  pageSize: 1,
})

const makeSource = async (user) => {
  const app = ok(
    await call('/application-center', {
      user,
      method: 'POST',
      body: {
        name: `维护范围来源-${randomUUID()}`,
        code: `scope-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
    })
  )
  const form = ok(await call(`/form-schemas/${app.formDraftId}`, { user }))
  const workflow = ok(await call(`/workflows/${app.workflowDraftId}`, { user }))
  const release = ok(
    await call(`/applications/${app.id}/releases`, {
      user,
      method: 'POST',
      body: {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: workflow.revision,
        expectedRevision: app.revision,
      },
    })
  )
  const catalogue = ok(
    await call(
      `/reporting/sources?applicationId=${encodeURIComponent(app.id)}`,
      { user }
    )
  ).list[0]
  assert.equal(catalogue.sourceReleaseId, release.id)
  const draft = ok(
    await call('/reporting/definitions', {
      user,
      method: 'POST',
      body: {
        schema: {
          version: 1,
          name: `维护范围报表-${randomUUID()}`,
          source: { kind: 'application-records', applicationId: app.id },
          kind: 'detail',
          metric: 'count',
          factTime: 'createdAt',
          timeZone: 'Asia/Shanghai',
          fields: [
            metadata('id'),
            metadata('status'),
            metadata('createdAt'),
            metadata('applicantName'),
            ...catalogue.visibleFields
              .filter((field) => field.reference.kind === 'field')
              .map((field) => field.reference),
          ],
        },
      },
    })
  )
  const report = ok(
    await call(`/reporting/definitions/${draft.id}/publish`, {
      user,
      method: 'POST',
      body: { expectedRevision: draft.revision },
    })
  )
  return { report }
}

const begin = async (source, user) =>
  ok(
    await call('/reporting/exports', {
      user,
      method: 'POST',
      body: {
        definitionVersionId: source.report.activeVersionId,
        query: query(),
        format: 'csv',
      },
    })
  )

const cancel = async (job, user) =>
  ok(
    await call(`/reporting/exports/${job.id}/cancel`, {
      user,
      method: 'POST',
      body: { expectedRevision: job.revision },
    })
  )

const historicalCompletedArtifact = async (source, user, tenantId) => {
  const template = await begin(source, user)
  const id = randomUUID()
  const objectKey = randomBytes(32).toString('hex')
  await pool.query(
    "INSERT INTO report_export_jobs(tenant_id,id,definition_id,definition_version_id,source_application_id,source_release_id,source_release_version,created_by,report_name,format,query,snapshot,snapshot_hash,field_bindings,authorization_manifest,object_key,total_rows,created_at,archived_at,retention_until) SELECT tenant_id,$2,definition_id,definition_version_id,source_application_id,source_release_id,source_release_version,created_by,report_name,format,query,snapshot,snapshot_hash,field_bindings,authorization_manifest,$3,total_rows,now()-interval '8 days',now(),now()-interval '8 days'+interval '365 days' FROM report_export_jobs WHERE tenant_id=$1 AND id=$4",
    [tenantId, id, objectKey, template.id]
  )
  await cancel(template, user)
  assert.equal(
    await processReportExports(
      pool,
      { storageRoot },
      undefined,
      1,
      Object.freeze({ tenantId, jobIds: Object.freeze([id]) })
    ),
    1
  )
  const completed = (
    await pool.query(
      'SELECT j.status,a.id AS artifact_id,a.scan_engine FROM report_export_jobs j JOIN report_export_artifacts a ON a.tenant_id=j.tenant_id AND a.job_id=j.id WHERE j.tenant_id=$1 AND j.id=$2',
      [tenantId, id]
    )
  ).rows[0]
  assert.equal(completed.status, 'completed')
  assert.match(completed.scan_engine, /^ClamAV /)
  await pool.query(
    "UPDATE report_export_jobs SET archived_at=NULL,retention_until=created_at+interval '7 days',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
    [tenantId, id]
  )
  await pool.query(
    "UPDATE report_export_artifacts SET status='expired',expired_at=now() WHERE tenant_id=$1 AND job_id=$2",
    [tenantId, id]
  )
  const bytes = await new LocalObjectStore(storageRoot).get(objectKey)
  return { tenantId, id, objectKey, artifactId: completed.artifact_id, bytes }
}

const facts = async (jobs) => {
  const result = await pool.query(
    "SELECT j.tenant_id,j.id,j.status,j.stage,j.revision,j.attempts,j.next_attempt_at,j.claimed_by,j.lease_until,j.error_code,j.error_message,j.retention_until,a.status AS artifact_status,a.expired_at,a.purged_at,a.sha256,a.size,(SELECT count(*)::int FROM report_export_events e WHERE e.tenant_id=j.tenant_id AND e.job_id=j.id) AS events,(SELECT count(*)::int FROM audit_events audit WHERE audit.tenant_id=j.tenant_id AND audit.target_id=j.id AND audit.target_type='report-export') AS audits FROM report_export_jobs j LEFT JOIN report_export_artifacts a ON a.tenant_id=j.tenant_id AND a.job_id=j.id JOIN unnest($1::text[],$2::text[]) scope(tenant_id,id) ON scope.tenant_id=j.tenant_id AND scope.id=j.id ORDER BY j.tenant_id,j.id",
    [jobs.map((job) => job.tenantId), jobs.map((job) => job.id)]
  )
  return result.rows
}

before(async () => {
  assert.equal(REPORT_EXPORT_MAINTENANCE_SCOPE_VERSION, 1)
  assert.equal(process.env.APP_MODE, 'demo')
  assert.match(
    (await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^af_admin_tests_[a-z0-9]+_demo$/,
    'Maintenance scope tests only write to the safe runner generated DB'
  )
  isolated = true
  await migrate(pool)
  await seedDemo(pool)
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin')"
    )
  ).rows
  const permissions = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((value) => value.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin')",
    [JSON.stringify(permissions)]
  )
  storageRoot = await mkdtemp(path.join(tmpdir(), 'af-export-scope-'))
  server = createServer(pool, undefined, { storageRoot })
  base = await server.listen({ host: '127.0.0.1', port: 0 })
  const actual = await clamavScanner(
    process.env.CLAMAV_HOST || '127.0.0.1',
    Number(process.env.CLAMAV_PORT || 3310)
  )(Buffer.from('Real maintenance scope scan prerequisite\n'))
  assert.equal(actual.clean, true)
  assert.match(actual.engine, /^ClamAV /)
})

after(async () => {
  if (server) await server.close()
  if (isolated)
    await sequence(originals || [], (row) =>
      pool.query(
        'UPDATE memberships SET permissions=$3::jsonb WHERE tenant_id=$1 AND user_id=$2',
        [row.tenant_id, row.user_id, JSON.stringify(row.permissions)]
      )
    )
  await pool.end()
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true })
})

test('trusted maintenance scope completes only owned jobs and leaves same-tenant and cross-tenant expiry, purge, events, audits, and bytes unchanged', async () => {
  const sourceA = await makeSource('a-admin')
  const sourceB = await makeSource('b-admin')
  const sameTenantExpired = await historicalCompletedArtifact(
    sourceA,
    'a-admin',
    'tenant-a'
  )
  const crossTenantExpired = await historicalCompletedArtifact(
    sourceB,
    'b-admin',
    'tenant-b'
  )
  const sameTenantQueued = {
    tenantId: 'tenant-a',
    ...(await begin(sourceA, 'a-admin')),
  }
  const crossTenantQueued = {
    tenantId: 'tenant-b',
    ...(await begin(sourceB, 'b-admin')),
  }
  const owned = {
    tenantId: 'tenant-a',
    ...(await begin(sourceA, 'a-admin')),
  }
  const foreign = [
    sameTenantExpired,
    crossTenantExpired,
    sameTenantQueued,
    crossTenantQueued,
  ]
  const beforeFacts = await facts(foreign)

  const invalid = [
    null,
    {},
    { tenantId: 'tenant-a', jobIds: [] },
    { tenantId: 'tenant-a', jobIds: [owned.id, owned.id] },
    { tenantId: 'tenant-a', jobIds: [owned.id], extra: true },
    Object.assign(Object.create({}), {
      tenantId: 'tenant-a',
      jobIds: [owned.id],
    }),
    Object.defineProperties(
      {},
      {
        tenantId: { get: () => 'tenant-a', enumerable: true },
        jobIds: { value: [owned.id], enumerable: true },
      }
    ),
    {
      tenantId: 'tenant-a',
      jobIds: Array.from({ length: 201 }, () => randomUUID()),
    },
  ]
  await sequence(invalid, (scope) =>
    assert.rejects(
      processReportExports(pool, { storageRoot }, undefined, 10, scope),
      /Invalid report export maintenance scope/
    )
  )
  await sequence(
    [
      { tenantId: 'tenant-a', jobIds: [randomUUID()] },
      { tenantId: 'tenant-a', jobIds: [crossTenantQueued.id] },
    ],
    (scope) =>
      assert.rejects(
        processReportExports(pool, { storageRoot }, undefined, 10, scope),
        /must reference existing report export jobs/
      )
  )

  const requestedIds = [owned.id]
  const processing = processReportExports(
    pool,
    { storageRoot },
    undefined,
    10,
    { tenantId: 'tenant-a', jobIds: requestedIds }
  )
  requestedIds[0] = sameTenantQueued.id
  assert.equal(await processing, 1)

  const ownedResult = (
    await pool.query(
      'SELECT j.status,j.stage,j.attempts,a.status AS artifact_status,a.scan_engine,a.purged_at FROM report_export_jobs j LEFT JOIN report_export_artifacts a ON a.tenant_id=j.tenant_id AND a.job_id=j.id WHERE j.tenant_id=$1 AND j.id=$2',
      [owned.tenantId, owned.id]
    )
  ).rows[0]
  assert.deepEqual(
    {
      status: ownedResult.status,
      stage: ownedResult.stage,
      attempts: ownedResult.attempts,
      artifactStatus: ownedResult.artifact_status,
      purgedAt: ownedResult.purged_at,
    },
    {
      status: 'completed',
      stage: 'completed',
      attempts: 1,
      artifactStatus: 'ready',
      purgedAt: null,
    }
  )
  assert.match(ownedResult.scan_engine, /^ClamAV /)
  const [ownedFacts] = await facts([owned])
  assert.equal(ownedFacts.events, 4)
  assert.equal(ownedFacts.audits, 3)
  assert.deepEqual(await facts(foreign), beforeFacts)
  assert.deepEqual(
    await new LocalObjectStore(storageRoot).get(sameTenantExpired.objectKey),
    sameTenantExpired.bytes
  )
  assert.deepEqual(
    await new LocalObjectStore(storageRoot).get(crossTenantExpired.objectKey),
    crossTenantExpired.bytes
  )

  await expireReportExports(
    pool,
    { storageRoot },
    {
      tenantId: 'tenant-a',
      jobIds: [sameTenantExpired.id],
    }
  )
  await expireReportExports(
    pool,
    { storageRoot },
    {
      tenantId: 'tenant-b',
      jobIds: [crossTenantExpired.id],
    }
  )
  await processReportExports(pool, { storageRoot }, undefined, 10, {
    tenantId: 'tenant-a',
    jobIds: [sameTenantQueued.id],
  })
  await processReportExports(pool, { storageRoot }, undefined, 10, {
    tenantId: 'tenant-b',
    jobIds: [crossTenantQueued.id],
  })
})
