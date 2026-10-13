import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
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
import { processReportSchedules } from '@af-admin/reference-api/dist/report-schedules-worker.js'
import { nextReportScheduleOccurrence } from '@af-admin/reference-api/dist/report-schedule-calendar.js'

const pool = createPool()
const tokens = new Map()
const passwords = new Map()
const members = []
const roles = []
const children = new Set()
const S = contracts.REPORT_SCHEDULE_PERMISSIONS
const E = contracts.REPORT_EXPORT_PERMISSIONS
const P = contracts.REPORTING_PERMISSIONS
const sequence = (values, run) =>
  values.reduce(async (previous, value) => {
    await previous
    await run(value)
  }, Promise.resolve())
let server
let base
let storageRoot
let originals
let isolated = false
let failure = ''
const trackedSchedules = []
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
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin','a-employee','a-manager-1','a-manager-2')"
    )
  ).rows
  const codes = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((value) => value.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin','a-employee','a-manager-1','a-manager-2')",
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
  if (isolated)
    await sequence(trackedSchedules, async (item) => {
      await pool.query(
        "UPDATE report_schedule_periods SET closed_at=COALESCE(closed_at,clock_timestamp()) WHERE tenant_id='tenant-a' AND schedule_id=$1",
        [item]
      )
    })
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
    'business:submit',
    contracts.FILE_PERMISSIONS.list,
    contracts.FILE_PERMISSIONS.download,
  ],
  scope = 'self'
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
    'UPDATE role_member_scopes SET data_scope=$3,field_permissions=$2::jsonb WHERE role_id=$1',
    [role.id, JSON.stringify(contracts.MEMBER_SCOPE_FIELDS), scope]
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
const makeSource = async (user = 'a-admin') => {
  const asUser = (url, options = {}) => call(url, { ...options, user })
  const app = ok(
    await asUser('/application-center', {
      method: 'POST',
      body: {
        name: `真实导出来源-${randomUUID()}`,
        code: `export-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
    })
  )
  const form = ok(await asUser(`/form-schemas/${app.formDraftId}`))
  const workflow = ok(await asUser(`/workflows/${app.workflowDraftId}`))
  const release = ok(
    await asUser(`/applications/${app.id}/releases`, {
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
    await asUser(
      `/reporting/sources?applicationId=${encodeURIComponent(app.id)}`
    )
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
    await asUser('/reporting/definitions', { method: 'POST', body: { schema } })
  )
  const report = ok(
    await asUser(`/reporting/definitions/${draft.id}/publish`, {
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

const schedules = (fault) =>
  processReportSchedules(pool, { storageRoot }, fault, 20)
const scheduleBody = (source, recipients, extra = {}) => ({
  schema: {
    version: 1,
    name: `实际调度-${randomUUID()}`,
    definitionVersionId: source.report.activeVersionId,
    timing: { frequency: 'daily', timeZone: 'Asia/Shanghai', time: '00:00' },
    dataWindow: 'current-period',
    recipients,
    format: 'csv',
    ...extra,
  },
  enabled: false,
})
const createSchedule = async (
  source,
  recipients,
  { user = 'a-manager-1', extra = {}, key = randomUUID() } = {}
) => {
  const value = ok(
    await call('/reporting/schedules', {
      user,
      method: 'POST',
      body: scheduleBody(source, recipients, extra),
      key,
    })
  )
  trackedSchedules.push(value.id)
  return value
}
const roleGroup = async (users) => {
  const role = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: `固定收件组-${randomUUID().slice(0, 8)}`,
        roleKey: `schedule-group-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions: [],
      },
    })
  )
  roles.push(role.id)
  await sequence(users, async (user) => {
    const current = ok(await call(`/system/users/${user.id}`))
    ok(
      await call(`/system/users/${user.id}/authorization`, {
        method: 'POST',
        body: {
          roleIds: [user.roleId, role.id],
          directPermissions: [],
          expectedRevision: current.revision,
        },
      })
    )
    tokens.delete(user.username)
  })
  return role
}
const lastSlot = async (timing) => {
  const now = (await pool.query('SELECT clock_timestamp() AS time')).rows[0]
    .time
  let slot = nextReportScheduleOccurrence(
    timing,
    new Date(now.getTime() - 2 * 86400000)
  )
  for (let i = 0; i < 4; i++) {
    const next = nextReportScheduleOccurrence(timing, slot)
    if (next > now) break
    slot = next
  }
  assert.ok(slot <= now)
  return slot
}
const activateHistorical = async (
  schedule,
  { startedAt, slot, closed = true, tenant = 'tenant-a' } = {}
) => {
  const occurrence = slot || (await lastSlot(schedule.schema.timing))
  const started = startedAt || new Date(occurrence.getTime() - 60000)
  const id = randomUUID()
  // Only historical activation data is seeded. Actual run/export/scan/notification effects are produced by real workers.
  await pool.query(
    'INSERT INTO report_schedule_periods(tenant_id,id,schedule_id,rule_version_id,origin_id,started_at,cursor_at,closed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      tenant,
      id,
      schedule.id,
      schedule.activeVersionId,
      schedule.createdBy,
      started,
      occurrence,
      closed ? occurrence : null,
    ]
  )
  if (!closed)
    await pool.query(
      "UPDATE report_schedules SET enabled=true,active_period_id=$2,revision=revision+1 WHERE tenant_id='tenant-a' AND id=$1",
      [schedule.id, id]
    )
  return { id, slot: occurrence }
}
const runs = async (schedule, user = 'a-manager-1') =>
  ok(
    await call(
      `/reporting/schedules/runs?scheduleId=${schedule.id}&pageSize=100`,
      { user }
    )
  ).list
const runDetail = async (id, user = 'a-manager-1') =>
  ok(await call(`/reporting/schedules/runs/${id}`, { user }))
const drive = async (schedule, user = 'a-manager-1') => {
  let result
  await sequence(Array.from({ length: 8 }), async () => {
    await schedules()
    await processJobs({}, undefined, 100)
    await schedules()
    const [latest] = await runs(schedule, user)
    result = latest
  })
  assert.ok(result)
  return runDetail(result.id, user)
}
const submittedRecord = async (source, user, item) => {
  const record = await makeRecord(source, user, item)
  return ok(
    await call(`/business/records/${record.id}/submit`, {
      user: user.username,
      method: 'POST',
      body: { expectedRevision: record.revision },
    })
  )
}
const notifyFacts = async (runId) =>
  (
    await pool.query(
      "SELECT r.user_id,r.status,r.export_job_id,r.notification_id,n.event_id,n.title,n.content,o.payload,o.status AS outbox_status FROM report_schedule_run_recipients r LEFT JOIN notifications n ON n.tenant_id=r.tenant_id AND n.id=r.notification_id LEFT JOIN outbox o ON o.tenant_id=n.tenant_id AND o.id=n.event_id WHERE r.tenant_id='tenant-a' AND r.run_id=$1 ORDER BY r.user_id",
      [runId]
    )
  ).rows

test('actual reviewer and owner row/column intersection creates separate scanned files, current grants and one real notification each', async () => {
  const a = await makeUser()
  const b = await makeUser()
  const group = await roleGroup([a, b])
  const source = await makeSource()
  await submittedRecord(source, a, '只属于甲的设备')
  await submittedRecord(source, b, '只属于乙的设备')
  const schedule = await createSchedule(source, {
    kind: 'role',
    roleId: group.id,
  })
  await activateHistorical(schedule)
  await Promise.all([schedules(), schedules()])
  const completed = await drive(schedule)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.recipientTotal, 2)
  assert.equal(completed.completedRecipients, 2)
  const deliveries = await notifyFacts(completed.id)
  await sequence(deliveries, async (receipt) => {
    const owner = receipt.user_id === a.id ? a : b
    const other = owner === a ? b : a
    assert.equal(receipt.status, 'completed')
    assert.ok(receipt.notification_id)
    assert.equal(receipt.outbox_status, 'sent')
    assert.equal(receipt.payload.source, 'report-schedule')
    assert.ok(!('requestId' in receipt.payload))
    assert.ok(!('access' in receipt.payload))
    assert.ok(!('signedURL' in receipt.payload))
    const job = await detail({ id: receipt.export_job_id }, owner)
    assert.equal(job.createdBy, 'a-manager-1')
    assert.equal(job.totalRows, 1)
    assert.match(job.artifact.scanEngine, /^ClamAV /)
    const downloaded = await content(job, owner)
    assert.equal(downloaded.status, 200)
    const text = downloaded.bytes.toString('utf8')
    assert.ok(text.includes(owner === a ? '只属于甲的设备' : '只属于乙的设备'))
    assert.ok(!text.includes(owner === a ? '只属于乙的设备' : '只属于甲的设备'))
    assert.equal((await content(job, other)).status, 404)
    assert.equal(
      (
        await call(`/files/resources/${job.artifact.id}/content`, {
          binary: true,
        })
      ).status,
      404
    )
    assert.deepEqual(await facts(job), { artifacts: 1, events: 1, audits: 1 })
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS total FROM notifications WHERE tenant_id='tenant-a' AND event_id=$1 AND recipient_id=$2",
          [receipt.event_id, owner.id]
        )
      ).rows[0].total,
      1
    )
    const center = ok(
      await call('/messages/notifications?pageSize=100', {
        user: owner.username,
      })
    )
    assert.ok(center.list.some((n) => n.id === receipt.notification_id))
  })
  await schedules()
  await processJobs({}, undefined, 100)
  await schedules()
  assert.equal((await notifyFacts(completed.id)).length, 2)
  const alpha = deliveries.find((receipt) => receipt.user_id === a.id)
  const permissions = [
    ...Object.values(E),
    P.query,
    P.fieldApplicant,
    'business:read:self',
    'business:create',
    'business:update:self',
    'business:submit',
    contracts.FILE_PERMISSIONS.list,
    contracts.FILE_PERMISSIONS.download,
  ]
  await rolePermissions(a, permissions)
  assert.equal((await content({ id: alpha.export_job_id }, a)).status, 404)
  assert.equal(
    (
      await call(`/reporting/exports/${alpha.export_job_id}`, {
        user: a.username,
      })
    ).status,
    404
  )
  assert.ok(
    !ok(
      await call('/reporting/exports?pageSize=100', { user: a.username })
    ).list.some((j) => j.id === alpha.export_job_id)
  )
  assert.ok(
    !ok(
      await call('/messages/notifications?pageSize=100', { user: a.username })
    ).list.some((n) => n.id === alpha.notification_id)
  )
})

test('closed activation backlog uses its old immutable rule, slot uniqueness and current execution cutoff; enabled gap is never backfilled', async () => {
  const user = await makeUser()
  const group = await roleGroup([user])
  const source = await makeSource()
  await submittedRecord(source, user, '旧周期补跑数据')
  const original = await createSchedule(source, {
    kind: 'role',
    roleId: group.id,
  })
  const slot = await lastSlot(original.schema.timing)
  const start = new Date(slot.getTime() - 2 * 86400000 - 60000)
  const period = await activateHistorical(original, {
    startedAt: start,
    slot: nextReportScheduleOccurrence(original.schema.timing, start),
    closed: false,
  })
  let current = ok(
    await call(`/reporting/schedules/${original.id}`, { user: 'a-manager-1' })
  )
  current = ok(
    await call(`/reporting/schedules/${original.id}`, {
      user: 'a-manager-1',
      method: 'PUT',
      body: {
        schema: {
          ...original.schema,
          name: '仅新规则名称',
          dataWindow: 'previous-period',
        },
        expectedRevision: current.revision,
      },
    })
  )
  assert.equal(current.version, 2)
  assert.notEqual(current.activeVersionId, original.activeVersionId)
  await sequence([1, 2, 3, 4, 5], async () => {
    await Promise.all([schedules(), schedules()])
  })
  const historical = (await runs(original)).filter(
    (run) => run.periodId === period.id
  )
  assert.equal(historical.length, 3)
  assert.ok(
    historical.every((run) => run.ruleVersionId === original.activeVersionId)
  )
  assert.equal(new Set(historical.map((run) => run.slotAt)).size, 3)
  const queryFacts = (
    await pool.query(
      "SELECT r.slot_at,j.snapshot FROM report_schedule_runs r JOIN report_schedule_run_recipients recipient ON recipient.tenant_id=r.tenant_id AND recipient.run_id=r.id JOIN report_export_jobs j ON j.tenant_id=recipient.tenant_id AND j.id=recipient.export_job_id WHERE r.tenant_id='tenant-a' AND r.period_id=$1",
      [period.id]
    )
  ).rows
  assert.ok(
    queryFacts.every(
      (f) => Date.parse(f.snapshot.dataCutoffAt) > f.slot_at.getTime()
    )
  )
  current = ok(
    await call(`/reporting/schedules/${original.id}/enabled`, {
      user: 'a-manager-1',
      method: 'POST',
      body: { enabled: false, expectedRevision: current.revision },
    })
  )
  const previousRunCount = (await runs(original)).length
  current = ok(
    await call(`/reporting/schedules/${original.id}/enabled`, {
      user: 'a-manager-1',
      method: 'POST',
      body: { enabled: true, expectedRevision: current.revision },
    })
  )
  assert.ok(Date.parse(current.nextRunAt) > Date.now())
  await schedules()
  assert.equal((await runs(original)).length, previousRunCount)
  await drive(original)
})

test('original rights unavailable yields durable unresolved blocked slot; one later fixed set cannot expand on retry', async () => {
  const a = await makeUser()
  const b = await makeUser()
  const group = await roleGroup([a])
  const source = await makeSource()
  await submittedRecord(source, a, '恢复原主体资格记录')
  const schedule = await createSchedule(source, {
    kind: 'role',
    roleId: group.id,
  })
  await activateHistorical(schedule)
  const original = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-manager-1'"
    )
  ).rows[0].permissions
  await pool.query(
    "UPDATE memberships SET permissions=permissions-'report:schedule:create' WHERE tenant_id='tenant-a' AND user_id='a-manager-1'"
  )
  try {
    await schedules()
    const blocked = (await runs(schedule))[0]
    assert.equal(blocked.status, 'blocked')
    assert.equal(blocked.recipientTotal, 0)
    assert.equal(
      (
        await pool.query(
          "SELECT recipients_resolved_at FROM report_schedule_runs WHERE tenant_id='tenant-a' AND id=$1",
          [blocked.id]
        )
      ).rows[0].recipients_resolved_at,
      null
    )
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
      [JSON.stringify(original)]
    )
    ok(
      await call(`/reporting/schedules/runs/${blocked.id}/retry`, {
        user: 'a-manager-1',
        method: 'POST',
        body: { expectedRevision: blocked.revision },
      })
    )
    await schedules()
    const fixed = await runDetail(blocked.id)
    assert.equal(fixed.recipientTotal, 1)
    const bNow = ok(await call(`/system/users/${b.id}`))
    ok(
      await call(`/system/users/${b.id}/authorization`, {
        method: 'POST',
        body: {
          roleIds: [b.roleId, group.id],
          directPermissions: [],
          expectedRevision: bNow.revision,
        },
      })
    )
    tokens.delete(b.username)
    const completed = await drive(schedule)
    assert.equal(completed.recipientTotal, 1)
    assert.equal(completed.recipients[0].userId, a.id)
    assert.equal(completed.status, 'completed')
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
      [JSON.stringify(original)]
    )
  }
})

const originCodes = [
  ...Object.values(S),
  ...Object.values(E),
  P.query,
  P.fieldApplicant,
  P.fieldBusiness,
  'business:read:self',
]
const withoutSource = (permissions) =>
  permissions.filter(
    (code) =>
      ![
        'business:read:self',
        'workflow:todo',
        'workflow:approve',
        'workflow:reject',
      ].includes(code)
  )
test('zero-row grants and notification visibility revoke current source directory rights on either principal', async () => {
  const receiver = await makeUser()
  const origin = await makeUser(originCodes, 'tenant')
  const group = await roleGroup([receiver])
  const source = await makeSource()
  const schedule = await createSchedule(
    source,
    { kind: 'role', roleId: group.id },
    { user: origin.username }
  )
  await activateHistorical(schedule)
  const completed = await drive(schedule, origin.username)
  const receipt = (await notifyFacts(completed.id))[0]
  const job = await detail({ id: receipt.export_job_id }, receiver)
  assert.equal(job.totalRows, 0)
  assert.equal((await content(job, receiver)).status, 200)
  const originalPermissions = ok(
    await call(`/system/roles/${receiver.roleId}`)
  ).permissions
  await rolePermissions(receiver, withoutSource(originalPermissions))
  assert.equal((await content(job, receiver)).status, 404)
  assert.equal(
    (await call(`/reporting/exports/${job.id}`, { user: receiver.username }))
      .status,
    404
  )
  assert.ok(
    !ok(
      await call('/reporting/exports?pageSize=100', { user: receiver.username })
    ).list.some((value) => value.id === job.id)
  )
  assert.equal(
    (
      await pool.query(
        "SELECT af_report_schedule_grant_visible('tenant-a',$1,$2) AS allowed",
        [receiver.id, job.id]
      )
    ).rows[0].allowed,
    false
  )
  assert.ok(
    !ok(
      await call('/messages/notifications?pageSize=100', {
        user: receiver.username,
      })
    ).list.some((n) => n.id === receipt.notification_id)
  )
  await rolePermissions(receiver, originalPermissions)
  assert.equal((await content(job, receiver)).status, 200)
  await rolePermissions(origin, withoutSource(originCodes))
  assert.equal((await content(job, receiver)).status, 404)
  assert.equal(
    (
      await pool.query(
        "SELECT af_report_schedule_grant_visible('tenant-a',$1,$2) AS allowed",
        [receiver.id, job.id]
      )
    ).rows[0].allowed,
    false
  )
  assert.ok(
    !ok(
      await call('/messages/notifications?pageSize=100', {
        user: receiver.username,
      })
    ).list.some((n) => n.id === receipt.notification_id)
  )
  await rolePermissions(origin, originCodes)
  assert.equal((await content(job, receiver)).status, 200)
})

const startChild = async (script, extra = {}) => {
  const child = spawn(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      env: {
        ...process.env,
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
const crashSchedule = async (point) => {
  const { child, error } = await startChild(
    "import db from './services/reference-api/dist/database.js';import jobs from './services/reference-api/dist/report-schedules-worker.js';const pool=db.createPool();try{await jobs.processReportSchedules(pool,{storageRoot:process.env.FILE_STORAGE_DIR},point=>{if(point===process.env.CRASH_POINT)process.kill(process.pid,'SIGKILL')},100)}finally{await pool.end()}",
    { CRASH_POINT: point }
  )
  const [code, signal] = await once(child, 'exit', {
    signal: AbortSignal.timeout(15000),
  })
  children.delete(child)
  assert.equal(code, null, error())
  assert.equal(signal, 'SIGKILL', error())
}

test('concurrent command keys and slot materialization rollback preserve revision, cursor and one fixed collection', async () => {
  const receiver = await makeUser()
  const group = await roleGroup([receiver])
  const source = await makeSource()
  const body = scheduleBody(source, { kind: 'role', roleId: group.id })
  const key = randomUUID()
  const responses = await Promise.all([
    call('/reporting/schedules', {
      user: 'a-manager-1',
      method: 'POST',
      body,
      key,
    }),
    call('/reporting/schedules', {
      user: 'a-manager-1',
      method: 'POST',
      body,
      key,
    }),
  ])
  const [schedule, replay] = responses.map(ok)
  trackedSchedules.push(schedule.id)
  assert.equal(schedule.id, replay.id)
  assert.equal(
    (
      await call('/reporting/schedules', {
        user: 'a-manager-1',
        method: 'POST',
        body: { ...body, schema: { ...body.schema, name: '同键不同规则' } },
        key,
      })
    ).businessCode,
    'IDEMPOTENCY_CONFLICT'
  )
  failure = 'report-schedule.create.before-commit'
  const rollbackKey = randomUUID()
  assert.equal(
    (
      await call('/reporting/schedules', {
        user: 'a-manager-1',
        method: 'POST',
        body,
        key: rollbackKey,
      })
    ).status,
    500
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS total FROM idempotency_records WHERE operation='report-schedule.create' AND key=$1",
        [rollbackKey]
      )
    ).rows[0].total,
    0
  )
  assert.equal(
    (
      await call(`/reporting/schedules/${schedule.id}/enabled`, {
        user: 'a-manager-1',
        method: 'POST',
        body: { expectedRevision: 999, enabled: true },
      })
    ).businessCode,
    'REVISION_CONFLICT'
  )
  const period = await activateHistorical(schedule)
  await assert.rejects(
    schedules((point) => {
      if (point === 'report-schedule.materialize.before-advance')
        throw new Error('Atomic cursor rollback')
    }),
    /Atomic cursor rollback/
  )
  assert.equal((await runs(schedule)).length, 0)
  assert.equal(
    (
      await pool.query(
        "SELECT cursor_at FROM report_schedule_periods WHERE tenant_id='tenant-a' AND id=$1",
        [period.id]
      )
    ).rows[0].cursor_at.getTime(),
    period.slot.getTime()
  )
  await Promise.all([schedules(), schedules(), schedules()])
  assert.equal((await runs(schedule)).length, 1)
  const completed = await drive(schedule)
  assert.equal(completed.recipientTotal, 1)
  assert.equal(completed.status, 'completed')
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS total FROM report_schedule_events WHERE tenant_id='tenant-a' AND run_id=$1 AND action='recipients.fixed'",
        [completed.id]
      )
    ).rows[0].total,
    1
  )
})

test('real SIGKILL after claim, uncommitted plan and committed notification recovers one export, scan and durable notification', async () => {
  await sequence(
    [
      'report-schedule.recipient.after-claim',
      'report-schedule.recipient.after-plan',
      'report-schedule.recipient.after-commit',
    ],
    async (point) => {
      const receiver = await makeUser()
      const group = await roleGroup([receiver])
      const source = await makeSource()
      await submittedRecord(source, receiver, `进程恢复-${point}`)
      const schedule = await createSchedule(source, {
        kind: 'role',
        roleId: group.id,
      })
      await activateHistorical(schedule)
      if (point === 'report-schedule.recipient.after-commit') {
        await schedules()
        await processJobs({}, undefined, 100)
      }
      await crashSchedule(point)
      const run = (await runs(schedule))[0]
      if (
        point === 'report-schedule.recipient.after-claim' ||
        point === 'report-schedule.recipient.after-plan'
      ) {
        const fact = (
          await pool.query(
            "SELECT * FROM report_schedule_run_recipients WHERE tenant_id='tenant-a' AND run_id=$1",
            [run.id]
          )
        ).rows[0]
        assert.equal(fact.status, 'processing')
        assert.equal(fact.export_job_id, null)
        await pool.query(
          "UPDATE report_schedule_run_recipients SET lease_until=now()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1",
          [fact.id]
        )
      }
      await Promise.all([schedules(), schedules()])
      const completed = await drive(schedule)
      assert.equal(completed.status, 'completed')
      const [fact] = await notifyFacts(completed.id)
      assert.ok(fact.notification_id)
      const job = await detail({ id: fact.export_job_id }, receiver)
      assert.equal(job.status, 'completed')
      assert.match(job.artifact.scanEngine, /^ClamAV /)
      assert.deepEqual(await facts(job), { artifacts: 1, events: 1, audits: 1 })
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS total FROM notifications WHERE tenant_id='tenant-a' AND event_id=$1",
            [fact.event_id]
          )
        ).rows[0].total,
        1
      )
    }
  )
})

test('parent retry preserves permanently ineligible recipient while recovering another and records actual child retry/cancel audits', async () => {
  const a = await makeUser()
  const b = await makeUser()
  const group = await roleGroup([a, b])
  const source = await makeSource()
  await submittedRecord(source, a, '不可恢复甲')
  await submittedRecord(source, b, '可以恢复乙')
  const schedule = await createSchedule(source, {
    kind: 'role',
    roleId: group.id,
  })
  await activateHistorical(schedule)
  await schedules()
  const initial = (await runs(schedule))[0]
  const initialFacts = await notifyFacts(initial.id)
  assert.equal(initialFacts.length, 2)
  assert.ok(initialFacts.every((f) => f.export_job_id))
  const originalPermissions = ok(
    await call(`/system/roles/${b.roleId}`)
  ).permissions
  await rolePermissions(
    a,
    originalPermissions.filter((code) => code !== P.fieldBusiness)
  )
  await rolePermissions(
    b,
    originalPermissions.filter((code) => code !== P.fieldBusiness)
  )
  await processJobs({}, undefined, 100)
  await schedules()
  const blocked = await runDetail(initial.id)
  assert.equal(blocked.status, 'blocked')
  assert.ok(
    (await notifyFacts(initial.id)).every(
      (f) => f.status === 'blocked' && !f.notification_id
    )
  )
  const aNow = ok(await call(`/system/users/${a.id}`))
  ok(
    await call(`/system/users/${a.id}/authorization`, {
      method: 'POST',
      body: {
        roleIds: [a.roleId],
        directPermissions: [],
        expectedRevision: aNow.revision,
      },
    })
  )
  tokens.delete(a.username)
  await rolePermissions(b, originalPermissions)
  const retryKey = randomUUID()
  const retried = ok(
    await call(`/reporting/schedules/runs/${blocked.id}/retry`, {
      user: 'a-manager-1',
      method: 'POST',
      body: { expectedRevision: blocked.revision },
      key: retryKey,
    })
  )
  assert.equal(retried.status, 'waiting-exports')
  ok(
    await call(`/reporting/schedules/runs/${blocked.id}/retry`, {
      user: 'a-manager-1',
      method: 'POST',
      body: { expectedRevision: blocked.revision },
      key: retryKey,
    })
  )
  const finished = await drive(schedule)
  assert.equal(finished.status, 'partial-failed')
  assert.equal(finished.completedRecipients, 1)
  assert.equal(finished.blockedRecipients, 1)
  const finalFacts = await notifyFacts(initial.id)
  const alpha = finalFacts.find((f) => f.user_id === a.id)
  const beta = finalFacts.find((f) => f.user_id === b.id)
  assert.equal(alpha.status, 'blocked')
  assert.equal(alpha.notification_id, null)
  assert.equal(beta.status, 'completed')
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS total FROM report_export_events WHERE tenant_id='tenant-a' AND job_id=$1 AND action='retry'",
        [beta.export_job_id]
      )
    ).rows[0].total,
    1
  )
  const retryAudit = (
    await pool.query(
      "SELECT detail FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='report-export.retry'",
      [beta.export_job_id]
    )
  ).rows
  assert.equal(retryAudit.length, 1)
  assert.equal(retryAudit[0].detail.scheduleRunId, initial.id)
  const pending = await createSchedule(source, {
    kind: 'role',
    roleId: group.id,
  })
  await activateHistorical(pending)
  await schedules()
  const pendingRun = (await runs(pending))[0]
  const pendingFacts = await notifyFacts(pendingRun.id)
  assert.equal(pendingFacts.length, 1)
  const cancelKey = randomUUID()
  const cancelled = ok(
    await call(`/reporting/schedules/runs/${pendingRun.id}/cancel`, {
      user: 'a-manager-1',
      method: 'POST',
      body: { expectedRevision: pendingRun.revision },
      key: cancelKey,
    })
  )
  assert.equal(cancelled.status, 'cancelled')
  ok(
    await call(`/reporting/schedules/runs/${pendingRun.id}/cancel`, {
      user: 'a-manager-1',
      method: 'POST',
      body: { expectedRevision: pendingRun.revision },
      key: cancelKey,
    })
  )
  await processJobs({}, undefined, 100)
  await schedules()
  const child = await detail(
    { id: pendingFacts[0].export_job_id },
    'a-manager-1'
  )
  assert.equal(child.status, 'cancelled')
  assert.equal(child.artifact, null)
  assert.equal(child.events.filter((e) => e.action === 'cancel').length, 1)
  const cancelAudit = (
    await pool.query(
      "SELECT detail FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='report-export.cancel'",
      [child.id]
    )
  ).rows
  assert.equal(cancelAudit.length, 1)
  assert.equal(cancelAudit[0].detail.scheduleRunId, pendingRun.id)
  assert.equal((await notifyFacts(pendingRun.id))[0].notification_id, null)
})

test('failure alert batch remains fair when older original subjects can no longer receive alerts', async () => {
  const origin = await makeUser(
    originCodes.filter((code) => code !== S.runRead),
    'tenant'
  )
  const emptyGroup = await roleGroup([])
  const source = await makeSource()
  const old = await createSchedule(
    source,
    { kind: 'role', roleId: emptyGroup.id },
    { user: origin.username }
  )
  await activateHistorical(old)
  await schedules()
  const oldRun = (
    await pool.query(
      "SELECT * FROM report_schedule_runs WHERE tenant_id='tenant-a' AND schedule_id=$1",
      [old.id]
    )
  ).rows[0]
  assert.equal(oldRun.status, 'failed')
  assert.equal(oldRun.alert_notified_at, null)
  const newer = await createSchedule(source, {
    kind: 'role',
    roleId: emptyGroup.id,
  })
  await activateHistorical(newer)
  await sequence([1, 2, 3, 4, 5], async () => {
    await processReportSchedules(pool, { storageRoot }, undefined, 1)
  })
  const newerRun = (
    await pool.query(
      "SELECT * FROM report_schedule_runs WHERE tenant_id='tenant-a' AND schedule_id=$1",
      [newer.id]
    )
  ).rows[0]
  assert.equal(newerRun.status, 'failed')
  assert.ok(newerRun.alert_notified_at)
  const notification = (
    await pool.query(
      "SELECT n.*,o.payload,o.status AS outbox_status FROM notifications n JOIN outbox o ON o.tenant_id=n.tenant_id AND o.id=n.event_id WHERE n.tenant_id='tenant-a' AND n.event_id=$1",
      [newerRun.alert_outbox_id]
    )
  ).rows
  assert.equal(notification.length, 1)
  assert.equal(notification[0].recipient_id, 'a-manager-1')
  assert.equal(notification[0].outbox_status, 'sent')
  assert.equal(notification[0].payload.source, 'report-schedule-alert')
  assert.equal(
    (
      await pool.query(
        "SELECT alert_notified_at FROM report_schedule_runs WHERE tenant_id='tenant-a' AND id=$1",
        [oldRun.id]
      )
    ).rows[0].alert_notified_at,
    null
  )
})
const agedScheduledPlan = async () => {
  const receiver = await makeUser()
  const group = await roleGroup([receiver])
  const source = await makeSource()
  await submittedRecord(source, receiver, '真实过期竞争文件')
  const schedule = await createSchedule(source, {
    kind: 'role',
    roleId: group.id,
  })
  await activateHistorical(schedule)
  await assert.rejects(
    schedules((point) => {
      if (point === 'report-schedule.materialize.after-commit')
        throw new Error('Stop after real fixed collection')
    }),
    /Stop after real fixed collection/
  )
  const run = (await runs(schedule))[0]
  const [recipient] = (
    await pool.query(
      "SELECT * FROM report_schedule_run_recipients WHERE tenant_id='tenant-a' AND run_id=$1",
      [run.id]
    )
  ).rows
  assert.equal(recipient.export_job_id, null)
  const template = ok(
    await begin(source, 'a-manager-1', 'csv', {
      body: {
        definitionVersionId: source.report.activeVersionId,
        query: run.query,
        format: 'csv',
      },
    })
  )
  const id = randomUUID()
  const objectKey = randomBytes(32).toString('hex')
  // Only an aged queued plan is derived from the real capture, under the same fixed query and single receiver's rows.
  // Actual completion, artifact bytes, ClamAV and notifications are never seeded.
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    await db.query(
      "INSERT INTO report_export_jobs(tenant_id,id,definition_id,definition_version_id,source_application_id,source_release_id,source_release_version,created_by,report_name,format,query,snapshot,snapshot_hash,field_bindings,authorization_manifest,object_key,total_rows,created_at,archived_at,retention_until) SELECT tenant_id,$2,definition_id,definition_version_id,source_application_id,source_release_id,source_release_version,created_by,report_name,format,query,snapshot,snapshot_hash,field_bindings,authorization_manifest,$3,total_rows,now()-interval '8 days',now(),now()-interval '8 days'+interval '365 days' FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=$1",
      [template.id, id, objectKey]
    )
    await db.query(
      "UPDATE report_schedule_run_recipients SET status='waiting-export',export_job_id=$2 WHERE tenant_id='tenant-a' AND id=$1",
      [recipient.id, id]
    )
    await db.query(
      "INSERT INTO report_export_recipient_grants(tenant_id,job_id,run_id,recipient_fact_id,recipient_user_id) VALUES('tenant-a',$1,$2,$3,$4)",
      [id, run.id, recipient.id, receiver.id]
    )
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    db.release()
  }
  ok(
    await call(`/reporting/exports/${template.id}/cancel`, {
      user: 'a-manager-1',
      method: 'POST',
      body: { expectedRevision: template.revision },
    })
  )
  const completed = await settle({ id }, 'a-manager-1')
  assert.match(completed.artifact.scanEngine, /^ClamAV /)
  assert.equal(
    (await new LocalObjectStore(storageRoot).get(objectKey)).length,
    completed.artifact.size
  )
  return { receiver, schedule, run, recipient, job: completed, objectKey }
}

test('notification observation locks the child export against retention changes and never announces an expired artifact', async () => {
  const fixture = await agedScheduledPlan()
  const db = await pool.connect()
  let worker
  let settled = false
  try {
    await db.query('BEGIN')
    await db.query(
      "SELECT id FROM report_export_jobs WHERE tenant_id='tenant-a' AND id=$1 FOR UPDATE",
      [fixture.job.id]
    )
    await db.query(
      "UPDATE report_export_jobs SET archived_at=NULL,retention_until=created_at+interval '7 days',revision=revision+1 WHERE tenant_id='tenant-a' AND id=$1",
      [fixture.job.id]
    )
    worker = schedules().then((value) => {
      settled = true
      return value
    })
    let waiting = false
    await sequence(Array.from({ length: 30 }), async () => {
      if (waiting) return
      waiting = (
        await pool.query(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%report_export_jobs%FOR UPDATE%' AND state='active') AS waiting"
        )
      ).rows[0].waiting
      if (!waiting)
        await new Promise((resolve) => {
          setTimeout(resolve, 20)
        })
    })
    assert.equal(
      waiting,
      true,
      'The notification transaction must wait for the canonical child job lock'
    )
    assert.equal(settled, false)
    const [beforeRelease] = await notifyFacts(fixture.run.id)
    assert.equal(beforeRelease.status, 'waiting-export')
    assert.equal(beforeRelease.notification_id, null)
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    db.release()
  }
  await worker
  await expireReportExports(pool, { storageRoot })
  const [receipt] = await notifyFacts(fixture.run.id)
  assert.equal(receipt.status, 'failed')
  assert.equal(receipt.notification_id, null)
  const run = await runDetail(fixture.run.id)
  assert.equal(run.status, 'failed')
  assert.equal(run.completedRecipients, 0)
  const job = await detail(fixture.job, 'a-manager-1')
  assert.equal(job.status, 'completed')
  assert.equal(job.artifact.status, 'expired')
  assert.equal(job.artifact.sha256, fixture.job.artifact.sha256)
  await assert.rejects(stat(path.join(storageRoot, fixture.objectKey)), {
    code: 'ENOENT',
  })
  assert.deepEqual(await facts(job), { artifacts: 1, events: 1, audits: 1 })
})

test('five real failed recipient effects including a dead fifth lease terminate with one failure fact and no delivery', async () => {
  const receiver = await makeUser()
  const group = await roleGroup([receiver])
  const source = await makeSource()
  const schedule = await createSchedule(source, {
    kind: 'role',
    roleId: group.id,
  })
  await activateHistorical(schedule)
  await assert.rejects(
    schedules((point) => {
      if (point === 'report-schedule.materialize.after-commit')
        throw new Error('Stop after materialization')
    }),
    /Stop after materialization/
  )
  const run = (await runs(schedule))[0]
  await sequence([1, 2, 3, 4], async (attempt) => {
    await pool.query(
      "UPDATE report_schedule_run_recipients SET next_attempt_at=now() WHERE tenant_id='tenant-a' AND run_id=$1",
      [run.id]
    )
    await schedules((point) => {
      if (point === 'report-schedule.recipient.before-commit')
        throw new Error('Controlled plan-effect failure')
    })
    const [fact] = (
      await pool.query(
        "SELECT * FROM report_schedule_run_recipients WHERE tenant_id='tenant-a' AND run_id=$1",
        [run.id]
      )
    ).rows
    assert.equal(fact.attempts, attempt)
    assert.equal(fact.export_job_id, null)
    assert.equal(fact.notification_id, null)
  })
  await pool.query(
    "UPDATE report_schedule_run_recipients SET next_attempt_at=now() WHERE tenant_id='tenant-a' AND run_id=$1",
    [run.id]
  )
  await crashSchedule('report-schedule.recipient.after-claim')
  const [dead] = (
    await pool.query(
      "SELECT * FROM report_schedule_run_recipients WHERE tenant_id='tenant-a' AND run_id=$1",
      [run.id]
    )
  ).rows
  assert.equal(dead.attempts, 5)
  assert.equal(dead.status, 'processing')
  await pool.query(
    "UPDATE report_schedule_run_recipients SET lease_until=now()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1",
    [dead.id]
  )
  await schedules()
  await schedules()
  const final = await runDetail(run.id)
  assert.equal(final.status, 'failed')
  assert.equal(final.failedRecipients, 1)
  assert.equal(final.completedRecipients, 0)
  const [fact] = await notifyFacts(run.id)
  assert.equal(fact.notification_id, null)
  assert.equal(fact.export_job_id, null)
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS total FROM report_schedule_events WHERE tenant_id='tenant-a' AND run_id=$1 AND action='recipient.attempts-exhausted'",
        [run.id]
      )
    ).rows[0].total,
    1
  )
  assert.equal(
    (
      await call(`/reporting/schedules/runs/${run.id}/retry`, {
        user: 'a-manager-1',
        method: 'POST',
        body: { expectedRevision: final.revision },
      })
    ).businessCode,
    'REPORT_SCHEDULE_RETRY_EXHAUSTED'
  )
})
const scheduleMaintenance = (
  ids,
  tenant = 'tenant-a',
  fault = () => undefined
) =>
  processReportSchedules(pool, { storageRoot }, fault, 100, {
    tenantId: tenant,
    scheduleIds: ids,
  })
const materializeOnly = (schedule, tenant = 'tenant-a') =>
  assert.rejects(
    scheduleMaintenance([schedule.id], tenant, (point) => {
      if (point === 'report-schedule.materialize.after-commit')
        throw new Error('Pause after committed run only')
    }),
    /Pause after committed run only/
  )
const scheduleState = async (tenant, id) => {
  const values = await Promise.all([
    pool.query(
      'SELECT * FROM report_schedule_periods WHERE tenant_id=$1 AND schedule_id=$2 ORDER BY id',
      [tenant, id]
    ),
    pool.query(
      'SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND schedule_id=$2 ORDER BY id',
      [tenant, id]
    ),
    pool.query(
      'SELECT recipient.* FROM report_schedule_run_recipients recipient JOIN report_schedule_runs run ON run.tenant_id=recipient.tenant_id AND run.id=recipient.run_id WHERE run.tenant_id=$1 AND run.schedule_id=$2 ORDER BY recipient.id',
      [tenant, id]
    ),
    pool.query(
      'SELECT * FROM report_schedule_events WHERE tenant_id=$1 AND schedule_id=$2 ORDER BY id',
      [tenant, id]
    ),
    pool.query(
      "SELECT n.*,o.payload,o.status AS outbox_status FROM notifications n JOIN outbox o ON o.tenant_id=n.tenant_id AND o.id=n.event_id WHERE n.tenant_id=$1 AND o.payload->>'scheduleRunId' IN(SELECT id FROM report_schedule_runs WHERE tenant_id=$1 AND schedule_id=$2) ORDER BY n.id",
      [tenant, id]
    ),
    pool.query(
      'SELECT artifact.* FROM report_export_artifacts artifact JOIN report_schedule_run_recipients recipient ON recipient.tenant_id=artifact.tenant_id AND recipient.export_job_id=artifact.job_id JOIN report_schedule_runs run ON run.tenant_id=recipient.tenant_id AND run.id=recipient.run_id WHERE run.tenant_id=$1 AND run.schedule_id=$2 ORDER BY artifact.id',
      [tenant, id]
    ),
  ])
  return values.map((value) => value.rows)
}

test('internal maintenance bound rejects empty/foreign scope and concurrently advances only owned schedules after foreign work queues', async () => {
  const receiver = await makeUser()
  const group = await roleGroup([receiver])
  const emptyGroup = await roleGroup([])
  const source = await makeSource()
  await submittedRecord(source, receiver, '严格维护范围真实记录')
  const own = await createSchedule(source, { kind: 'role', roleId: group.id })
  await activateHistorical(own)
  const supplied = { tenantId: 'tenant-a', scheduleIds: [own.id] }
  await sequence(
    [
      { tenantId: 'tenant-a', scheduleIds: [] },
      { tenantId: 'tenant-a', scheduleIds: [own.id, own.id] },
      { tenantId: 'tenant-a', scheduleIds: [own.id], future: true },
      { tenantId: '../tenant-a', scheduleIds: [own.id] },
      { tenantId: 'tenant-a', scheduleIds: [''] },
      { tenantId: 'tenant-a', scheduleIds: [randomUUID()] },
    ],
    async (value) =>
      assert.rejects(
        processReportSchedules(pool, { storageRoot }, undefined, 10, value),
        /maintenance scope|Maintenance scope/
      )
  )
  assert.equal(
    (await runs(own)).length,
    0,
    'Invalid maintenance bounds may never fall back to the global dispatcher'
  )
  // The earlier inspection is true, then real foreign HTTP commands and historical due-period fixtures queue afterwards.
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS total FROM report_schedule_periods WHERE tenant_id='tenant-a' AND schedule_id<>$1 AND cursor_at<=clock_timestamp() AND (closed_at IS NULL OR cursor_at<=closed_at)",
        [own.id]
      )
    ).rows[0].total,
    0
  )
  const due = await createSchedule(source, { kind: 'role', roleId: group.id })
  await activateHistorical(due)
  const unresolved = await createSchedule(source, {
    kind: 'role',
    roleId: group.id,
  })
  await activateHistorical(unresolved)
  const original = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-manager-1'"
    )
  ).rows[0].permissions
  await pool.query(
    "UPDATE memberships SET permissions=permissions-'report:schedule:create' WHERE tenant_id='tenant-a' AND user_id='a-manager-1'"
  )
  try {
    await materializeOnly(unresolved)
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
      [JSON.stringify(original)]
    )
  }
  const blocked = (await runs(unresolved))[0]
  assert.equal(blocked.status, 'blocked')
  ok(
    await call(`/reporting/schedules/runs/${blocked.id}/retry`, {
      user: 'a-manager-1',
      method: 'POST',
      body: { expectedRevision: blocked.revision },
    })
  )
  const pending = await createSchedule(source, {
    kind: 'role',
    roleId: group.id,
  })
  await activateHistorical(pending)
  await materializeOnly(pending)
  const pendingRun = (await runs(pending))[0]
  assert.equal((await notifyFacts(pendingRun.id))[0].export_job_id, null)
  const alert = await createSchedule(source, {
    kind: 'role',
    roleId: emptyGroup.id,
  })
  await activateHistorical(alert)
  await materializeOnly(alert)
  const [alertRun] = (
    await pool.query(
      "SELECT * FROM report_schedule_runs WHERE tenant_id='tenant-a' AND schedule_id=$1",
      [alert.id]
    )
  ).rows
  assert.equal(alertRun.status, 'failed')
  assert.equal(alertRun.alert_notified_at, null)
  const foreignSource = await makeSource('b-admin')
  const otherTenant = await createSchedule(
    foreignSource,
    { kind: 'tenant' },
    { user: 'b-admin' }
  )
  await activateHistorical(otherTenant, { tenant: 'tenant-b' })
  await assert.rejects(
    scheduleMaintenance([otherTenant.id]),
    /Maintenance scope/
  )
  const foreign = [
    ['tenant-a', due],
    ['tenant-a', unresolved],
    ['tenant-a', pending],
    ['tenant-a', alert],
    ['tenant-b', otherTenant],
  ]
  const prior = await Promise.all(
    foreign.map(([tenant, schedule]) => scheduleState(tenant, schedule.id))
  )
  const firstWorker = processReportSchedules(
    pool,
    { storageRoot },
    undefined,
    100,
    supplied
  )
  supplied.scheduleIds.push(due.id)
  const [, , foreignManual] = await Promise.all([
    firstWorker,
    scheduleMaintenance([own.id]),
    begin(source, receiver),
  ])
  const foreignJob = ok(foreignManual)
  const stateAfter = await Promise.all(
    foreign.map(([tenant, schedule]) => scheduleState(tenant, schedule.id))
  )
  assert.deepEqual(
    stateAfter,
    prior,
    'Foreign period cursor, unresolved run, recipient, alert, artifact and notification facts must remain unchanged'
  )
  const [ownedRun] = await runs(own)
  const [ownedRecipient] = await notifyFacts(ownedRun.id)
  assert.equal(ownedRun.status, 'waiting-exports')
  assert.ok(ownedRecipient.export_job_id)
  const ownedJob = await detail(
    { id: ownedRecipient.export_job_id },
    'a-manager-1'
  )
  assert.equal(ownedJob.status, 'queued')
  assert.equal(ownedJob.totalRows, 1)
  const untouchedForeignJob = await detail(foreignJob, receiver)
  assert.equal(untouchedForeignJob.status, 'queued')
  assert.equal(untouchedForeignJob.attempts, 0)
  assert.equal(untouchedForeignJob.artifact, null)
  assert.deepEqual(await facts(foreignJob), {
    artifacts: 0,
    events: 0,
    audits: 0,
  })
  // Test-owned foreign work is settled explicitly after the assertions; no global maintenance invocation is used.
  await sequence(
    [...foreign, ['tenant-a', own]],
    async ([tenant, schedule]) => {
      const actor = tenant === 'tenant-b' ? 'b-admin' : 'a-manager-1'
      const reportSource = tenant === 'tenant-b' ? foreignSource : source
      const definition = ok(
        await call(`/reporting/definitions/${reportSource.report.id}`, {
          user: tenant === 'tenant-b' ? 'b-admin' : 'a-admin',
        })
      )
      if (definition.enabled)
        ok(
          await call(`/reporting/definitions/${definition.id}/enabled`, {
            user: tenant === 'tenant-b' ? 'b-admin' : 'a-admin',
            method: 'POST',
            body: { enabled: false, expectedRevision: definition.revision },
          })
        )
      await scheduleMaintenance([schedule.id], tenant)
      const page = ok(
        await call(
          `/reporting/schedules/runs?scheduleId=${schedule.id}&pageSize=100`,
          { user: actor }
        )
      )
      await sequence(page.list, async (run) => {
        if (!['completed', 'cancelled'].includes(run.status))
          ok(
            await call(`/reporting/schedules/runs/${run.id}/cancel`, {
              user: actor,
              method: 'POST',
              body: { expectedRevision: run.revision },
            })
          )
      })
    }
  )
  const currentForeign = await detail(foreignJob, receiver)
  ok(
    await call(`/reporting/exports/${foreignJob.id}/cancel`, {
      user: receiver.username,
      method: 'POST',
      body: { expectedRevision: currentForeign.revision },
    })
  )
})
