import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, after, test } from 'node:test'
import * as contracts from '@af-admin/contracts'
import { createPool } from '@af-admin/reference-api/dist/database.js'
import { migrate } from '@af-admin/reference-api/dist/migrate.js'
import { seedDemo } from '@af-admin/reference-api/dist/seed.js'
import { createServer } from '@af-admin/reference-api/dist/index.js'
import {
  processReportExports,
  expireReportExports,
} from '@af-admin/reference-api/dist/report-export-jobs.js'
import { clamavScanner } from '@af-admin/reference-api/dist/file-scanner.js'
import { LocalObjectStore } from '@af-admin/reference-api/dist/file-storage.js'
import { contentHash } from '@af-admin/reference-api/dist/support.js'
import { generateReportExport } from '@af-admin/reference-api/dist/report-export-generators.js'

const pool = createPool()
const tokens = new Map()
const passwords = new Map()
const members = []
const roles = []
const children = new Set()
const E = contracts.REPORT_EXPORT_PERMISSIONS
const P = contracts.REPORTING_PERMISSIONS
const sequence = (values, run) =>
  values.reduce(async (previous, value) => {
    await previous
    await run(value)
  }, Promise.resolve())
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
let server
let base
let storageRoot
let originals
let isolated = false
let failure = ''
const realScanner = clamavScanner(
  process.env.CLAMAV_HOST || '127.0.0.1',
  Number(process.env.CLAMAV_PORT || 3310)
)
before(async () => {
  assert.equal(process.env.APP_MODE, 'demo')
  assert.match(
    (await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^af_admin_tests_[a-z0-9]+_demo$/,
    'Export tests only write to the safe runner generated DB'
  )
  isolated = true
  await migrate(pool)
  await seedDemo(pool)
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin','a-employee')"
    )
  ).rows
  const codes = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((value) => value.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin','a-employee')",
    [JSON.stringify(codes)]
  )
  storageRoot = await mkdtemp(path.join(tmpdir(), 'af-report-exports-'))
  server = createServer(
    pool,
    (point) => {
      if (point === failure) {
        failure = ''
        throw new Error('Controlled export command rollback')
      }
    },
    { storageRoot }
  )
  base = await server.listen({ host: '127.0.0.1', port: 0 })
  const actual = await realScanner(
    Buffer.from('Real export integration scan prerequisite\n')
  )
  assert.equal(actual.clean, true)
  assert.match(
    actual.engine,
    /^ClamAV /,
    'No fake clean scanner is accepted as delivery evidence'
  )
})
const stop = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    children.delete(child)
    return
  }
  const exited = once(child, 'exit', { signal: AbortSignal.timeout(5000) })
  child.kill('SIGTERM')
  try {
    await exited
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
    children.delete(child)
  }
}
after(async () => {
  const stopped = await Promise.allSettled(Array.from(children).map(stop))
  if (server) await server.close()
  if (isolated) {
    await sequence(originals || [], async (row) => {
      await pool.query(
        'UPDATE memberships SET permissions=$3::jsonb WHERE tenant_id=$1 AND user_id=$2',
        [row.tenant_id, row.user_id, JSON.stringify(row.permissions)]
      )
    })
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
  const rejected = stopped.find((value) => value.status === 'rejected')
  if (rejected) throw rejected.reason
})
const login = async (user) => {
  if (tokens.has(user)) return tokens.get(user)
  const response = await fetch(`${base}/api/user/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: user,
      password: passwords.get(user) || user,
    }),
  })
  assert.equal(response.status, 200)
  const { token } = (await response.json()).data
  tokens.set(user, token)
  return token
}
const call = async (
  url,
  {
    user = 'a-admin',
    tenant = user.startsWith('b-') ? 'tenant-b' : 'tenant-a',
    method = 'GET',
    body,
    key = randomUUID(),
    binary = false,
    origin = base,
  } = {}
) => {
  const response = await fetch(`${origin}/api${url}`, {
    method,
    headers: {
      'x-access-token': await login(user),
      'x-tenant-id': tenant,
      'idempotency-key': key,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (binary && response.status === 200)
    return {
      status: 200,
      bytes: Buffer.from(await response.arrayBuffer()),
      headers: response.headers,
    }
  return { status: response.status, ...(await response.json()) }
}
const ok = (value) => {
  assert.equal(value.status, 200, `${value.businessCode}: ${value.message}`)
  return value.data
}
const meta = (id) => ({ kind: 'metadata', id })
const query = (extra) => ({
  version: 1,
  timeZone: 'Asia/Shanghai',
  dateRange: { from: '2026-01-01', to: '2026-12-31' },
  statuses: [],
  keyword: '',
  searchFields: [],
  sort: { field: meta('createdAt'), direction: 'asc' },
  current: 1,
  pageSize: 1,
  ...extra,
})
const makeUser = async (
  permissions = [
    ...Object.values(E),
    P.query,
    P.fieldApplicant,
    P.fieldBusiness,
    'business:read:self',
    'business:create',
    'business:update:self',
    contracts.FILE_PERMISSIONS.list,
    contracts.FILE_PERMISSIONS.download,
  ]
) => {
  const username = `export-${randomUUID().slice(0, 8)}`
  const password = 'Export-private-test-2026'
  const user = ok(
    await call('/system/users', {
      method: 'POST',
      body: {
        username,
        name: '合成导出用户',
        phone: '',
        email: '',
        initialPassword: password,
        status: 'enabled',
      },
    })
  )
  members.push(user.id)
  passwords.set(username, password)
  const role = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: '合成导出角色',
        roleKey: `export-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions,
      },
    })
  )
  roles.push(role.id)
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='tenant',field_permissions=$2::jsonb WHERE role_id=$1",
    [role.id, JSON.stringify(contracts.MEMBER_SCOPE_FIELDS)]
  )
  ok(
    await call(`/system/users/${user.id}/authorization`, {
      method: 'POST',
      body: {
        roleIds: [role.id],
        directPermissions: [],
        expectedRevision: user.revision,
      },
    })
  )
  return { ...user, username, roleId: role.id }
}
const rolePermissions = async (user, permissions) => {
  const role = ok(await call(`/system/roles/${user.roleId}`))
  const { roleName, roleKey, roleSort, status, remark } = role
  ok(
    await call(`/system/roles/${user.roleId}`, {
      method: 'PUT',
      body: {
        roleName,
        roleKey,
        roleSort,
        status,
        remark,
        permissions,
        expectedRevision: role.revision,
      },
    })
  )
  tokens.delete(user.username)
}
const makeSource = async () => {
  const app = ok(
    await call('/application-center', {
      method: 'POST',
      body: {
        name: `真实导出来源-${randomUUID()}`,
        code: `export-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
    })
  )
  const form = ok(await call(`/form-schemas/${app.formDraftId}`))
  const workflow = ok(await call(`/workflows/${app.workflowDraftId}`))
  const release = ok(
    await call(`/applications/${app.id}/releases`, {
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
    await call(`/reporting/sources?applicationId=${encodeURIComponent(app.id)}`)
  ).list[0]
  assert.equal(catalogue.sourceReleaseId, release.id)
  const schema = {
    version: 1,
    name: `真实导出报表-${randomUUID()}`,
    source: { kind: 'application-records', applicationId: app.id },
    kind: 'detail',
    metric: 'count',
    factTime: 'createdAt',
    timeZone: 'Asia/Shanghai',
    fields: [
      meta('id'),
      meta('status'),
      meta('createdAt'),
      meta('applicantName'),
      ...catalogue.visibleFields
        .filter((field) => field.reference.kind === 'field')
        .map((field) => field.reference),
    ],
  }
  const draft = ok(
    await call('/reporting/definitions', { method: 'POST', body: { schema } })
  )
  const report = ok(
    await call(`/reporting/definitions/${draft.id}/publish`, {
      method: 'POST',
      body: { expectedRevision: draft.revision },
    })
  )
  return { app, release, catalogue, report, schema, form, workflow }
}
const makeRecord = async (
  source,
  user,
  item = '真实设备',
  reason = '导出事实',
  price = '12.34'
) =>
  ok(
    await call('/business/records', {
      user: user.username || user,
      method: 'POST',
      body: {
        applicationReleaseId: source.release.id,
        fields: { itemName: item, quantity: 1, unitPrice: price, reason },
      },
    })
  )
const begin = async (source, user, format = 'csv', extra = {}) =>
  call('/reporting/exports', {
    user: user.username || user,
    method: 'POST',
    body: {
      definitionVersionId: source.report.activeVersionId,
      query: query(),
      format,
    },
    ...extra,
  })
const detail = async (job, user) =>
  ok(
    await call(`/reporting/exports/${job.id}`, { user: user.username || user })
  )
const processJobs = (runtime = {}, fault = () => undefined, batchSize = 10) =>
  processReportExports(pool, { storageRoot, ...runtime }, fault, batchSize)
const settle = async (job, user) => {
  await processJobs()
  const current = await detail(job, user)
  assert.equal(
    current.status,
    'completed',
    `${current.errorCode}: ${current.errorMessage}`
  )
  return current
}
const content = (job, user) =>
  call(`/reporting/exports/${job.id}/content`, {
    user: user.username || user,
    binary: true,
  })
const facts = async (job) =>
  (
    await pool.query(
      "SELECT (SELECT count(*) FROM report_export_artifacts WHERE tenant_id='tenant-a' AND job_id=$1)::int AS artifacts,(SELECT count(*) FROM report_export_events WHERE tenant_id='tenant-a' AND job_id=$1 AND action='completed')::int AS events,(SELECT count(*) FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='report-export.completed')::int AS audits",
      [job.id]
    )
  ).rows[0]

test('all filtered authorized rows are captured once; CSV/XLSX/PDF bytes pass real ClamAV and dedicated downloads', async () => {
  const user = await makeUser()
  const source = await makeSource()
  await makeRecord(source, user, '中文设备,换行\n"引号"')
  await makeRecord(source, user, '第二设备', '第二条真实记录', '2.00')
  const capabilities = ok(
    await call('/reporting/exports/capabilities', { user: user.username })
  )
  assert.deepEqual(
    capabilities.formats.map((value) => value.format),
    ['csv', 'xlsx', 'pdf']
  )
  assert.ok(capabilities.formats.every((value) => value.available))
  await sequence(['csv', 'xlsx', 'pdf'], async (format) => {
    const job = ok(
      await begin(source, user, format, {
        body: {
          definitionVersionId: source.report.activeVersionId,
          query: query({ current: 999, pageSize: 1 }),
          format,
        },
      })
    )
    assert.equal(job.totalRows, 2)
    assert.equal(job.status, 'queued')
    assert.equal(
      (await content(job, user)).businessCode,
      'REPORT_EXPORT_NOT_READY'
    )
    const completed = await settle(job, user)
    assert.equal(completed.processedRows, 2)
    assert.match(completed.artifact.scanEngine, /^ClamAV /)
    const downloaded = await content(job, user)
    assert.equal(downloaded.status, 200)
    assert.equal(downloaded.bytes.length, completed.artifact.size)
    assert.equal(digest(downloaded.bytes), completed.artifact.sha256)
    assert.equal(
      downloaded.headers.get('content-type'),
      completed.artifact.mimeType
    )
    assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff')
    if (format === 'csv') {
      assert.ok(downloaded.bytes.toString('utf8').includes('12.34'))
      assert.ok(downloaded.bytes.toString('utf8').includes('第二设备'))
    }
    if (format === 'xlsx')
      assert.equal(downloaded.bytes.subarray(0, 2).toString(), 'PK')
    if (format === 'pdf')
      assert.equal(downloaded.bytes.subarray(0, 5).toString(), '%PDF-')
    assert.deepEqual(await facts(job), { artifacts: 1, events: 1, audits: 1 })
    assert.equal(
      (
        await call(`/files/resources/${completed.artifact.id}/content`, {
          user: user.username,
          binary: true,
        })
      ).status,
      404
    )
    assert.equal((await content(job, 'b-admin')).status, 404)
    assert.equal(
      (
        await call(`/files/resources/${completed.artifact.id}/content`, {
          user: 'a-admin',
          binary: true,
        })
      ).status,
      404
    )
    assert.equal(
      (
        await pool.query(
          "SELECT id FROM stored_files WHERE tenant_id='tenant-a' AND id=$1",
          [completed.artifact.id]
        )
      ).rowCount,
      0
    )
  })
})

test('concurrent idempotence and revision faults roll back jobs/events/audit; replays project current ACL', async () => {
  const user = await makeUser()
  const source = await makeSource()
  await makeRecord(source, user)
  const key = randomUUID()
  const responses = await Promise.all([
    begin(source, user, 'csv', { key }),
    begin(source, user, 'csv', { key }),
  ])
  const jobs = responses.map(ok)
  assert.equal(jobs[0].id, jobs[1].id)
  const conflict = await begin(source, user, 'xlsx', { key })
  assert.equal(conflict.businessCode, 'IDEMPOTENCY_CONFLICT')
  failure = 'report-export.create.before-commit'
  const rollbackKey = randomUUID()
  assert.equal(
    (await begin(source, user, 'csv', { key: rollbackKey })).status,
    500
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM idempotency_records WHERE operation='report-export.create' AND key=$1",
        [rollbackKey]
      )
    ).rows[0].count,
    0
  )
  const retried = ok(await begin(source, user, 'csv', { key: rollbackKey }))
  assert.notEqual(retried.id, jobs[0].id)
  const cancelled = ok(
    await call(`/reporting/exports/${retried.id}/cancel`, {
      user: user.username,
      method: 'POST',
      body: { expectedRevision: retried.revision },
    })
  )
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(
    (
      await call(`/reporting/exports/${jobs[0].id}/cancel`, {
        user: user.username,
        method: 'POST',
        body: { expectedRevision: 999 },
      })
    ).businessCode,
    'REVISION_CONFLICT'
  )
  const permissions = [
    ...Object.values(E),
    P.query,
    P.fieldApplicant,
    'business:read:self',
    'business:create',
    'business:update:self',
  ]
  await rolePermissions(user, permissions)
  const replay = ok(await begin(source, user, 'csv', { key }))
  assert.equal(replay.id, jobs[0].id)
  assert.equal(replay.restricted, true)
  assert.equal(replay.query, null)
  assert.equal(replay.totalRows, null)
  assert.ok(replay.events.every((event) => !('total' in event.detail)))
  await rolePermissions(user, [...permissions, P.fieldBusiness])
  await settle(jobs[0], user)
})

test('creator metadata scope never grants source rows; current field withdrawal blocks old bytes and original worker rights', async () => {
  const creator = await makeUser()
  const viewer = await makeUser()
  const source = await makeSource()
  await makeRecord(source, creator)
  const job = await settle(ok(await begin(source, creator)), creator)
  const visible = await detail(job, viewer)
  assert.equal(visible.restricted, true)
  assert.equal(visible.query, null)
  assert.equal(visible.totalRows, null)
  assert.equal(visible.artifact.size, null)
  assert.equal(visible.artifact.sha256, null)
  assert.ok(!visible.allowedActions.includes('download'))
  assert.equal(
    (await content(job, viewer)).businessCode,
    'REPORT_EXPORT_RECORD_FORBIDDEN'
  )
  await rolePermissions(creator, [
    ...Object.values(E),
    P.query,
    P.fieldApplicant,
    'business:read:self',
    'business:create',
  ])
  assert.equal(
    (await content(job, creator)).businessCode,
    'REPORT_EXPORT_FIELD_FORBIDDEN'
  )
  const hidden = await detail(job, creator)
  assert.equal(hidden.restricted, true)
  await rolePermissions(creator, [
    ...Object.values(E),
    P.query,
    P.fieldApplicant,
    P.fieldBusiness,
    'business:read:self',
    'business:create',
  ])
  assert.equal((await content(job, creator)).status, 200)
  const pending = ok(await begin(source, creator))
  await rolePermissions(creator, [
    E.list,
    E.cancel,
    E.retry,
    E.archive,
    E.download,
    P.query,
    P.fieldApplicant,
    P.fieldBusiness,
    'business:read:self',
    'business:create',
  ])
  await processJobs()
  const blocked = await detail(pending, creator)
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.artifact, null)
  assert.equal(
    (
      await call(`/reporting/exports/${pending.id}/retry`, {
        method: 'POST',
        body: { expectedRevision: blocked.revision },
      })
    ).status,
    403,
    'An admin retry cannot lend its export-create right to the origin'
  )
  await rolePermissions(creator, [
    ...Object.values(E),
    P.query,
    P.fieldApplicant,
    P.fieldBusiness,
    'business:read:self',
    'business:create',
  ])
  const queued = ok(
    await call(`/reporting/exports/${pending.id}/retry`, {
      method: 'POST',
      body: { expectedRevision: blocked.revision },
    })
  )
  assert.equal(queued.createdBy, creator.id)
  await settle(queued, creator)
})

test('fixed source and captured values survive legitimate draft edits and new source publication without being reinterpreted', async () => {
  const user = await makeUser()
  const source = await makeSource()
  const record = await makeRecord(source, user, '旧快照设备', '旧原因', '12.34')
  const job = ok(await begin(source, user))
  ok(
    await call(`/business/records/${record.id}`, {
      user: user.username,
      method: 'PATCH',
      body: {
        applicationReleaseId: source.release.id,
        fields: {
          itemName: '后来修改设备',
          quantity: 2,
          unitPrice: '99.99',
          reason: '后来原因',
        },
        expectedRevision: record.revision,
      },
    })
  )
  const app = ok(await call(`/application-center/${source.app.id}`))
  const form = ok(await call(`/form-schemas/${source.form.id}`))
  const workflow = ok(await call(`/workflows/${source.workflow.id}`))
  const schema = structuredClone(form.schema)
  const widget = schema.widgetsConfig.find((value) => value.uid === 'itemName')
  widget.uid = 'itemName-v2'
  widget.config.id = 'itemName-v2'
  const updated = ok(
    await call(`/form-schemas/${form.id}`, {
      method: 'PUT',
      body: { schema, expectedRevision: form.revision },
    })
  )
  const next = ok(
    await call(`/applications/${app.id}/releases`, {
      method: 'POST',
      body: {
        formDraftId: updated.id,
        workflowDraftId: workflow.id,
        formRevision: updated.revision,
        workflowRevision: workflow.revision,
        expectedRevision: app.revision,
      },
    })
  )
  assert.notEqual(next.id, source.release.id)
  const completed = await settle(job, user)
  const downloaded = await content(job, user)
  const text = downloaded.bytes.toString('utf8')
  assert.equal(completed.sourceReleaseId, source.release.id)
  assert.ok(text.includes('旧快照设备'))
  assert.ok(text.includes('12.34'))
  assert.ok(!text.includes('后来修改设备'))
  assert.ok(!text.includes('99.99'))
  const lineage = (
    await pool.query(
      "SELECT field_bindings,snapshot FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
      [job.id]
    )
  ).rows[0]
  assert.equal(lineage.snapshot.sourceReleaseId, source.release.id)
  assert.ok(
    Object.values(lineage.field_bindings).some(
      (field) => field.rawUid === 'itemName'
    )
  )
})

test('scan outage and cancellation fence completion; real bare-EICAR verdict exercises the controlled quarantine boundary', async () => {
  const user = await makeUser()
  const source = await makeSource()
  await makeRecord(source, user)
  const outage = ok(await begin(source, user))
  await processJobs(
    {
      scanner: async () => {
        throw new Error('Controlled scanner outage')
      },
    },
    undefined,
    1
  )
  const queued = await detail(outage, user)
  assert.equal(queued.status, 'queued')
  assert.equal(queued.artifact, null)
  assert.equal(
    (await content(outage, user)).businessCode,
    'REPORT_EXPORT_NOT_READY'
  )
  await pool.query(
    "UPDATE report_export_jobs SET next_attempt_at=now() WHERE tenant_id='tenant-a' AND id=$1",
    [outage.id]
  )
  await settle(outage, user)
  const cancellation = ok(await begin(source, user))
  const ready = Promise.withResolvers()
  const release = Promise.withResolvers()
  const processing = processJobs(
    {
      scanner: async (bytes) => {
        ready.resolve()
        await release.promise
        return realScanner(bytes)
      },
    },
    undefined,
    1
  )
  await ready.promise
  try {
    const current = await detail(cancellation, user)
    assert.equal(current.stage, 'scanning')
    ok(
      await call(`/reporting/exports/${cancellation.id}/cancel`, {
        user: user.username,
        method: 'POST',
        body: { expectedRevision: current.revision },
      })
    )
  } finally {
    release.resolve()
    await processing
  }
  const cancelled = await detail(cancellation, user)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.artifact, null)
  assert.deepEqual(await facts(cancellation), {
    artifacts: 0,
    events: 0,
    audits: 0,
  })
  const eicar = Buffer.from(
    `X5O!P%@AP[4${String.fromCharCode(
      92
    )}PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`
  )
  assert.equal(eicar.length, 68)
  const actualBareVerdict = await realScanner(eicar)
  assert.equal(actualBareVerdict.clean, false)
  assert.match(actualBareVerdict.engine, /^ClamAV /)
  assert.ok(actualBareVerdict.threat)
  const infected = ok(await begin(source, user))
  // Controlled negative scanner boundary uses a real bare-EICAR verdict. This does not claim the generated CSV itself is infected.
  await processJobs({ scanner: async () => actualBareVerdict }, undefined, 1)
  const quarantined = await detail(infected, user)
  assert.equal(quarantined.status, 'infected')
  assert.equal(quarantined.artifact.status, 'quarantined')
  assert.match(quarantined.artifact.scanEngine, /^ClamAV /)
  assert.equal(
    (await content(infected, user)).businessCode,
    'REPORT_EXPORT_NOT_READY'
  )
})

test('real claim expiry and competing workers deliver one effect; five failed attempts are a finite durable failure', async () => {
  const user = await makeUser()
  const source = await makeSource()
  await makeRecord(source, user)
  const job = ok(await begin(source, user))
  await Promise.all([
    processJobs({}, undefined, 1),
    processJobs({}, undefined, 1),
  ])
  assert.equal((await detail(job, user)).status, 'completed')
  assert.deepEqual(await facts(job), { artifacts: 1, events: 1, audits: 1 })
  const exhausted = ok(await begin(source, user))
  await sequence([1, 2, 3, 4, 5], async (attempt) => {
    await pool.query(
      "UPDATE report_export_jobs SET next_attempt_at=now() WHERE tenant_id='tenant-a' AND id=$1",
      [exhausted.id]
    )
    await processJobs(
      {
        scanner: async () => {
          throw new Error('Controlled persistent scanner outage')
        },
      },
      undefined,
      1
    )
    assert.equal((await detail(exhausted, user)).attempts, attempt)
  })
  const failed = await detail(exhausted, user)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.artifact, null)
  assert.equal(
    (
      await call(`/reporting/exports/${failed.id}/retry`, {
        user: user.username,
        method: 'POST',
        body: { expectedRevision: failed.revision },
      })
    ).businessCode,
    'REPORT_EXPORT_RETRY_CLOSED'
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM report_export_events WHERE tenant_id='tenant-a' AND job_id=$1 AND action='failed'",
        [failed.id]
      )
    ).rows[0].count,
    1
  )
})

test('archive expiry deletes actual bytes while immutable completed and scan facts remain; expiration cannot be revived', async () => {
  const user = await makeUser()
  const source = await makeSource()
  await makeRecord(source, user)
  const template = ok(await begin(source, user))
  const id = randomUUID()
  const objectKey = randomBytes(32).toString('hex')
  // A past queued plan fixture, derived from an actual API capture. Completion is exclusively through the real worker.
  await pool.query(
    "INSERT INTO report_export_jobs(tenant_id,id,definition_id,definition_version_id,source_application_id,source_release_id,source_release_version,created_by,report_name,format,query,snapshot,snapshot_hash,field_bindings,authorization_manifest,object_key,total_rows,created_at,archived_at,retention_until) SELECT tenant_id,$2,definition_id,definition_version_id,source_application_id,source_release_id,source_release_version,created_by,report_name,format,query,snapshot,snapshot_hash,field_bindings,authorization_manifest,$3,total_rows,now()-interval '8 days',now(),now()-interval '8 days'+interval '365 days' FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
    [template.id, id, objectKey]
  )
  ok(
    await call(`/reporting/exports/${template.id}/cancel`, {
      user: user.username,
      method: 'POST',
      body: { expectedRevision: template.revision },
    })
  )
  const completed = await settle({ id }, user)
  assert.equal((await content(completed, user)).status, 200)
  assert.equal(
    (await new LocalObjectStore(storageRoot).get(objectKey)).length,
    completed.artifact.size
  )
  const unarchived = ok(
    await call(`/reporting/exports/${id}/archive`, {
      user: user.username,
      method: 'POST',
      body: { archived: false, expectedRevision: completed.revision },
    })
  )
  assert.equal(unarchived.archivedAt, null)
  assert.equal(
    (await content(completed, user)).businessCode,
    'REPORT_EXPORT_EXPIRED'
  )
  await expireReportExports(pool, { storageRoot })
  const expired = await detail(completed, user)
  assert.equal(expired.status, 'completed')
  assert.equal(expired.artifact.status, 'expired')
  assert.equal(expired.artifact.sha256, completed.artifact.sha256)
  await assert.rejects(stat(path.join(storageRoot, objectKey)), {
    code: 'ENOENT',
  })
  assert.equal(
    (
      await call(`/reporting/exports/${id}/archive`, {
        user: user.username,
        method: 'POST',
        body: { archived: true, expectedRevision: expired.revision },
      })
    ).businessCode,
    'REPORT_EXPORT_EXPIRED'
  )
  assert.deepEqual(await facts(completed), {
    artifacts: 1,
    events: 1,
    audits: 1,
  })
})

const startChild = async (script, extra = {}) => {
  const child = spawn(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
        APP_MODE: 'demo',
        FILE_STORAGE_DIR: storageRoot,
        ...extra,
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    }
  )
  children.add(child)
  let errors = ''
  child.stderr.on('data', (bytes) => {
    errors = (errors + bytes.toString()).slice(-3000)
  })
  return { child, error: () => errors }
}
test('bounded export capture rejects 2001 actual matching records and oversized PostgreSQL JSON with explicit 422 facts', async () => {
  const user = await makeUser()
  const source = await makeSource()
  const record = await makeRecord(source, user)
  const clone = async (count, origin) =>
    pool.query(
      "INSERT INTO business_records(tenant_id,id,application_release_id,applicant_id,applicant_name,department_snapshot,fields,half_day_units,status,revision,record_kind,created_at,updated_at) SELECT tenant_id,gen_random_uuid()::text,application_release_id,applicant_id,applicant_name,department_snapshot,fields,NULL,'draft',1,'generic',created_at,updated_at FROM business_records CROSS JOIN generate_series(1,$2::integer) WHERE tenant_id='tenant-a' AND id=$1",
      [origin.id, count]
    )
  // Controlled bulk fixtures copy a real business API record; query/capture/count are the actual authorized SQL.
  await clone(2000, record)
  const tooMany = await begin(source, user)
  assert.equal(tooMany.status, 422)
  assert.equal(tooMany.businessCode, 'REPORT_EXPORT_TOO_MANY_ROWS')
  const largeSource = await makeSource()
  const large = await makeRecord(
    largeSource,
    user,
    '有界文本',
    '界'.repeat(500)
  )
  const baseline = ok(await begin(largeSource, user))
  const plan = (
    await pool.query(
      "SELECT snapshot,authorization_manifest FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
      [baseline.id]
    )
  ).rows[0]
  ok(
    await call(`/reporting/exports/${baseline.id}/cancel`, {
      user: user.username,
      method: 'POST',
      body: { expectedRevision: baseline.revision },
    })
  )
  const empty = { ...plan.snapshot, total: 0, rows: [] }
  const overhead = Buffer.byteLength(
    JSON.stringify({ snapshot: empty, manifest: [] })
  )
  const rowBytes = Buffer.byteLength(JSON.stringify(plan.snapshot.rows[0]))
  const identityBytes = Buffer.byteLength(
    JSON.stringify(plan.authorization_manifest[0])
  )
  const count = Math.min(
    2000,
    Math.floor(
      (contracts.REPORT_EXPORT_MAX_SNAPSHOT_BYTES - overhead - 128) /
        (rowBytes + identityBytes + 2)
    )
  )
  assert.ok(count > 1)
  const expected = {
    ...plan.snapshot,
    total: count,
    rows: Array.from({ length: count }, () => plan.snapshot.rows[0]),
  }
  const identities = Array.from(
    { length: count },
    () => plan.authorization_manifest[0]
  )
  assert.ok(
    Buffer.byteLength(
      JSON.stringify({ snapshot: expected, manifest: identities })
    ) <= contracts.REPORT_EXPORT_MAX_SNAPSHOT_BYTES,
    'Old compact JSON check would accept this exact near-boundary shape'
  )
  const encoded = (
    await pool.query(
      'SELECT octet_length($1::jsonb::text)+octet_length($2::jsonb::text) AS bytes',
      [JSON.stringify(expected), JSON.stringify(identities)]
    )
  ).rows[0].bytes
  assert.ok(
    encoded > contracts.REPORT_EXPORT_MAX_SNAPSHOT_BYTES,
    'PostgreSQL representation is genuinely over the same budget'
  )
  await clone(count - 1, large)
  const tooLarge = await begin(largeSource, user)
  assert.equal(tooLarge.status, 422)
  assert.equal(tooLarge.businessCode, 'REPORT_EXPORT_SNAPSHOT_TOO_LARGE')
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS total FROM report_export_jobs WHERE tenant_id='tenant-a' AND definition_id=ANY($1::text[])",
        [[source.report.id, largeSource.report.id]]
      )
    ).rows[0].total,
    1
  )
})

test('expired fifth lease failure, terminal event and audit roll back together and recover once', async () => {
  const user = await makeUser()
  const source = await makeSource()
  await makeRecord(source, user)
  const job = ok(await begin(source, user))
  await sequence([1, 2, 3, 4], async () => {
    await pool.query(
      "UPDATE report_export_jobs SET next_attempt_at=now() WHERE tenant_id='tenant-a' AND id=$1",
      [job.id]
    )
    await processJobs(
      {
        scanner: async () => {
          throw new Error('Controlled lease retry prerequisite')
        },
      },
      undefined,
      1
    )
  })
  await pool.query(
    "UPDATE report_export_jobs SET next_attempt_at=now() WHERE tenant_id='tenant-a' AND id=$1",
    [job.id]
  )
  const { child, error } = await startChild(
    "import db from './services/reference-api/dist/database.js';import jobs from './services/reference-api/dist/report-export-jobs.js';const pool=db.createPool();try{await jobs.processReportExports(pool,{storageRoot:process.env.FILE_STORAGE_DIR},point=>{if(point==='report-export.after-claim')process.kill(process.pid,'SIGKILL')},1)}finally{await pool.end()}"
  )
  const [code, signal] = await once(child, 'exit', {
    signal: AbortSignal.timeout(30000),
  })
  children.delete(child)
  assert.equal(code, null, error())
  assert.equal(signal, 'SIGKILL', error())
  await pool.query(
    "UPDATE report_export_jobs SET lease_until=now()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1",
    [job.id]
  )
  await assert.rejects(
    processJobs(
      {},
      (point) => {
        if (point === 'report-export.attempts-exhausted.before-commit')
          throw new Error('Controlled atomic exhaustion rollback')
      },
      1
    ),
    /Controlled atomic exhaustion rollback/
  )
  assert.equal((await detail(job, user)).status, 'processing')
  const count = async () =>
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM report_export_events WHERE tenant_id='tenant-a' AND job_id=$1 AND action='attempts-exhausted')::int AS events,(SELECT count(*) FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='report-export.attempts-exhausted')::int AS audits",
        [job.id]
      )
    ).rows[0]
  assert.deepEqual(await count(), { events: 0, audits: 0 })
  await processJobs({}, undefined, 1)
  const failed = await detail(job, user)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.attempts, 5)
  assert.equal(failed.errorCode, 'REPORT_EXPORT_ATTEMPTS_EXHAUSTED')
  assert.equal(failed.artifact, null)
  await processJobs()
  assert.deepEqual(await count(), { events: 1, audits: 1 })
})

test('truly all-masked columns retain redaction after value-field withdrawal while source ACL and private sort remain enforced', async () => {
  const source = await makeSource()
  const record = await makeRecord(source, 'a-employee', '从未捕获的敏感设备')
  ok(
    await call(`/business/records/${record.id}/submit`, {
      user: 'a-employee',
      method: 'POST',
      body: { expectedRevision: record.revision },
    })
  )
  const original = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-manager-1'"
    )
  ).rows[0].permissions
  const role = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: '仅本人字段导出测试',
        roleKey: `export-mask-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions: [P.fieldApplicant, P.fieldBusiness],
      },
    })
  )
  roles.push(role.id)
  await pool.query(
    "INSERT INTO member_roles(tenant_id,user_id,role_id) VALUES('tenant-a','a-manager-1',$1)",
    [role.id]
  )
  await pool.query(
    "UPDATE memberships SET permissions=permissions||$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
    [JSON.stringify([...Object.values(E), P.query])]
  )
  tokens.delete('a-manager-1')
  try {
    const job = ok(await begin(source, 'a-manager-1'))
    const captured = (
      await pool.query(
        "SELECT snapshot,authorization_manifest FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
        [job.id]
      )
    ).rows[0]
    assert.equal(captured.snapshot.rows.length, 1)
    assert.equal(
      captured.snapshot.rows[0].values['metadata:applicantName'],
      null
    )
    assert.ok(
      captured.authorization_manifest[0].allowedFieldKeys.every(
        (key) => key.startsWith('metadata:') && key !== 'metadata:applicantName'
      )
    )
    await pool.query(
      'DELETE FROM role_permissions WHERE role_id=$1 AND permission_code=ANY($2::text[])',
      [role.id, [P.fieldApplicant, P.fieldBusiness]]
    )
    const completed = await settle(job, 'a-manager-1')
    const downloaded = await content(completed, 'a-manager-1')
    assert.equal(downloaded.status, 200)
    assert.ok(!downloaded.bytes.toString('utf8').includes('从未捕获的敏感设备'))
    assert.ok(downloaded.bytes.toString('utf8').includes('受限'))
    const direct = (
      await pool.query(
        "SELECT af_effective_permissions('tenant-a','a-manager-1') AS permissions"
      )
    ).rows[0].permissions
    assert.ok(!direct.includes(P.fieldBusiness))
    const item = source.catalogue.visibleFields.find(
      (field) => field.label === '设备名称'
    ).reference
    assert.equal(
      (
        await begin(source, 'a-manager-1', 'csv', {
          body: {
            definitionVersionId: source.report.activeVersionId,
            query: query({ sort: { field: item, direction: 'asc' } }),
            format: 'csv',
          },
        })
      ).businessCode,
      'REPORT_FIELD_FORBIDDEN'
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
      [JSON.stringify(original)]
    )
    await pool.query(
      "DELETE FROM member_roles WHERE tenant_id='tenant-a' AND user_id='a-manager-1' AND role_id=$1",
      [role.id]
    )
    tokens.delete('a-manager-1')
  }
})
test('actual worker death after physical write and after commit survives API replacement with one canonical effect', async () => {
  const user = await makeUser()
  const source = await makeSource()
  await makeRecord(source, user)
  await sequence(
    ['report-export.after-write', 'report-export.after-commit'],
    async (crashPoint) => {
      const job = ok(await begin(source, user))
      const { child, error } = await startChild(
        "import db from './services/reference-api/dist/database.js';import jobs from './services/reference-api/dist/report-export-jobs.js';const pool=db.createPool();try{await jobs.processReportExports(pool,{storageRoot:process.env.FILE_STORAGE_DIR},point=>{if(point===process.env.CRASH_POINT)process.kill(process.pid,'SIGKILL')},1)}finally{await pool.end()}",
        { CRASH_POINT: crashPoint }
      )
      const [code, signal] = await once(child, 'exit', {
        signal: AbortSignal.timeout(30000),
      })
      children.delete(child)
      assert.equal(code, null, error())
      assert.equal(signal, 'SIGKILL', error())
      if (crashPoint === 'report-export.after-write') {
        const claimed = (
          await pool.query(
            "SELECT status,lease_until,claimed_by FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
            [job.id]
          )
        ).rows[0]
        assert.equal(claimed.status, 'processing')
        assert.ok(claimed.claimed_by)
        assert.ok(claimed.lease_until > new Date())
        await pool.query(
          "UPDATE report_export_jobs SET lease_until=now()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1",
          [job.id]
        )
      }
      await Promise.all([
        processJobs({}, undefined, 1),
        processJobs({}, undefined, 1),
      ])
      const replacement = await startChild(
        "import { createServer } from './services/reference-api/dist/index.js';const server=createServer(undefined,undefined,{storageRoot:process.env.FILE_STORAGE_DIR});const base=await server.listen({host:'127.0.0.1',port:0});process.send({base});process.once('SIGTERM',async()=>{await server.close();process.exit(0)})"
      )
      try {
        const [ready] = await once(replacement.child, 'message', {
          signal: AbortSignal.timeout(10000),
        })
        const restored = ok(
          await call(`/reporting/exports/${job.id}`, {
            user: user.username,
            origin: ready.base,
          })
        )
        assert.equal(restored.status, 'completed')
        assert.deepEqual(await facts(job), {
          artifacts: 1,
          events: 1,
          audits: 1,
        })
        const downloaded = await call(`/reporting/exports/${job.id}/content`, {
          user: user.username,
          binary: true,
          origin: ready.base,
        })
        assert.equal(downloaded.status, 200)
        assert.equal(digest(downloaded.bytes), restored.artifact.sha256)
      } finally {
        await stop(replacement.child)
      }
    }
  )
})

test('published report disable and source disable immediately deny already completed downloads and pending work', async () => {
  const user = await makeUser()
  const source = await makeSource()
  await makeRecord(source, user)
  const completed = await settle(ok(await begin(source, user)), user)
  const pending = ok(await begin(source, user))
  const report = ok(
    await call(`/reporting/definitions/${source.report.id}/enabled`, {
      method: 'POST',
      body: { enabled: false, expectedRevision: source.report.revision },
    })
  )
  assert.equal((await content(completed, user)).businessCode, 'REPORT_DISABLED')
  await processJobs()
  assert.equal((await detail(pending, user)).status, 'blocked')
  ok(
    await call(`/reporting/definitions/${source.report.id}/enabled`, {
      method: 'POST',
      body: { enabled: true, expectedRevision: report.revision },
    })
  )
  assert.equal((await content(completed, user)).status, 200)
  const app = ok(await call(`/application-center/${source.app.id}`))
  ok(
    await call(`/application-center/${app.id}/state`, {
      method: 'PUT',
      body: { status: 'archived', expectedRevision: app.revision },
    })
  )
  assert.equal(
    (await content(completed, user)).businessCode,
    'REPORT_SOURCE_UNAVAILABLE'
  )
  const metadata = await detail(completed, user)
  assert.equal(metadata.restricted, true)
  assert.equal(metadata.totalRows, null)
})

test('server export audit facts are classified and redacted; client telemetry cannot forge completion or download', async () => {
  const user = await makeUser()
  const auditor = await makeUser(['audit:read'])
  const source = await makeSource()
  await makeRecord(source, user, '审计无权获知的设备')
  const completed = await settle(ok(await begin(source, user)), user)
  assert.equal((await content(completed, user)).status, 200)
  const read = () =>
    call(
      `/audit/events?eventType=export&module=report-export&targetId=${completed.id}&pageSize=100`,
      { user: auditor.username }
    )
  const initial = ok(await read())
  assert.ok(
    initial.list.some((event) => event.action === 'report-export.completed')
  )
  assert.ok(
    initial.list.some((event) => event.action === 'report-export.download')
  )
  assert.ok(
    initial.list.every(
      (event) => event.eventType === 'export' && event.source === 'server'
    )
  )
  assert.ok(
    initial.list.every(
      (event) =>
        !['total', 'size', 'sha256', 'snapshotHash'].some(
          (key) => key in event.detail
        )
    )
  )
  assert.ok(!JSON.stringify(initial).includes('审计无权获知的设备'))
  ok(
    await call('/audit/events', {
      user: auditor.username,
      method: 'POST',
      body: {
        module: 'report-export',
        action: 'report-export.completed',
        targetId: completed.id,
        eventType: 'export',
        detail: {
          total: 999,
          size: 999,
          sha256: 'forged',
          snapshotHash: 'forged',
        },
      },
    })
  )
  const refreshed = ok(await read())
  assert.equal(refreshed.total, initial.total)
  assert.deepEqual(refreshed.list, initial.list)
  assert.deepEqual(await facts(completed), {
    artifacts: 1,
    events: 1,
    audits: 1,
  })
})

test('producer v2 is captured; missing and explicit v1 queued plans keep exact legacy bytes after real worker death; future producers are blocked', async () => {
  const user = await makeUser()
  const source = await makeSource()
  await makeRecord(
    source,
    user,
    '生产器版本恢复设备',
    '真实旧计划兼容验证',
    '12.34'
  )
  const current = ok(await begin(source, user, 'xlsx'))
  const plan = (
    await pool.query(
      "SELECT snapshot FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
      [current.id]
    )
  ).rows[0]
  assert.equal(contracts.REPORT_EXPORT_PRODUCER_VERSION, 2)
  assert.equal(plan.snapshot.producerVersion, 2)
  await settle(current, user)
  const clonePlan = async (producerVersion) => {
    const snapshot = structuredClone(plan.snapshot)
    if (producerVersion === undefined) delete snapshot.producerVersion
    else snapshot.producerVersion = producerVersion
    const id = randomUUID()
    const objectKey = randomBytes(32).toString('hex')
    // Copies one actual server capture into a queued historical-format fixture. No completion or scan facts are seeded.
    await pool.query(
      "INSERT INTO report_export_jobs(tenant_id,id,definition_id,definition_version_id,source_application_id,source_release_id,source_release_version,created_by,report_name,format,query,snapshot,snapshot_hash,field_bindings,authorization_manifest,object_key,total_rows) SELECT tenant_id,$2,definition_id,definition_version_id,source_application_id,source_release_id,source_release_version,created_by,report_name,format,query,$3::jsonb,$4,field_bindings,authorization_manifest,$5,total_rows FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
      [
        current.id,
        id,
        JSON.stringify(snapshot),
        contentHash(snapshot),
        objectKey,
      ]
    )
    return { id, objectKey, snapshot }
  }
  const missingVersionSnapshot = structuredClone(plan.snapshot)
  delete missingVersionSnapshot.producerVersion
  const recipe1Bytes = (
    await generateReportExport('xlsx', missingVersionSnapshot)
  ).bytes
  await sequence([undefined, 1], async (producerVersion) => {
    const legacy = await clonePlan(producerVersion)
    const expected = await generateReportExport('xlsx', legacy.snapshot)
    assert.deepEqual(
      expected.bytes,
      recipe1Bytes,
      'Missing and explicit v1 plans select the same immutable legacy recipe'
    )
    const { child, error } = await startChild(
      "import db from './services/reference-api/dist/database.js';import jobs from './services/reference-api/dist/report-export-jobs.js';const pool=db.createPool();try{await jobs.processReportExports(pool,{storageRoot:process.env.FILE_STORAGE_DIR},point=>{if(point==='report-export.after-write')process.kill(process.pid,'SIGKILL')},1)}finally{await pool.end()}"
    )
    const [code, signal] = await once(child, 'exit', {
      signal: AbortSignal.timeout(30000),
    })
    children.delete(child)
    assert.equal(code, null, error())
    assert.equal(signal, 'SIGKILL', error())
    assert.deepEqual(
      await new LocalObjectStore(storageRoot).get(legacy.objectKey),
      expected.bytes
    )
    assert.deepEqual(await facts(legacy), {
      artifacts: 0,
      events: 0,
      audits: 0,
    })
    await pool.query(
      "UPDATE report_export_jobs SET lease_until=now()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1",
      [legacy.id]
    )
    const completedLegacy = await settle(legacy, user)
    const downloaded = await content(completedLegacy, user)
    assert.equal(downloaded.status, 200)
    assert.deepEqual(downloaded.bytes, expected.bytes)
    assert.equal(completedLegacy.artifact.sha256, digest(expected.bytes))
    assert.deepEqual(await facts(legacy), {
      artifacts: 1,
      events: 1,
      audits: 1,
    })
  })
  const future = await clonePlan(3)
  const refused = await content(future, user)
  assert.equal(refused.status, 409)
  assert.equal(refused.businessCode, 'REPORT_EXPORT_SNAPSHOT_INVALID')
  await processJobs({}, undefined, 1)
  const blocked = await detail(future, user)
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.errorCode, 'REPORT_EXPORT_SNAPSHOT_INVALID')
  assert.equal(blocked.artifact, null)
  assert.equal(blocked.restricted, true)
  assert.equal(
    (await content(future, user)).businessCode,
    'REPORT_EXPORT_SNAPSHOT_INVALID'
  )
  assert.deepEqual(await facts(future), { artifacts: 0, events: 0, audits: 0 })
  await assert.rejects(stat(path.join(storageRoot, future.objectKey)), {
    code: 'ENOENT',
  })
})
