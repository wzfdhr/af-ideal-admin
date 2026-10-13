import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import * as contracts from '@af-admin/contracts'

const pool = db.createPool()
const tokens = new Map()
const passwords = new Map()
const members = []
const roles = []
const departments = []
const schedules = []
let server
let base
let originals
let isolated = false
let application
let report
let scheduleSchema
let governor

const S = contracts.REPORT_SCHEDULE_PERMISSIONS
const P = contracts.REPORTING_PERMISSIONS
const E = contracts.REPORT_EXPORT_PERMISSIONS

const call = async (
  path,
  {
    user = 'a-admin',
    tenant = user.startsWith('b-') ? 'tenant-b' : 'tenant-a',
    method = 'GET',
    body,
    key = randomUUID(),
    origin = base,
  } = {}
) => {
  if (!tokens.has(user)) {
    const login = await fetch(`${base}/api/user/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: user,
        password: passwords.get(user) || user,
      }),
    })
    assert.equal(login.status, 200)
    tokens.set(user, (await login.json()).data.token)
  }
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      'x-access-token': tokens.get(user),
      'x-tenant-id': tenant,
      'idempotency-key': key,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let payload = {}
  if (text) payload = JSON.parse(text)
  return { status: response.status, ...payload }
}

const ok = (response) => {
  assert.equal(response.status, 200, `${response.businessCode}: ${response.message}`)
  return response.data
}

const metadata = (id) => ({ kind: 'metadata', id })

const roleFor = async (
  permissions,
  { user = 'a-admin', name = '定时安全角色', scope = 'all' } = {}
) => {
  const role = ok(
    await call('/system/roles', {
      user,
      method: 'POST',
      body: {
        roleName: `${name}-${randomUUID().slice(0, 8)}`,
        roleKey: `schedule-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions,
      },
    })
  )
  roles.push({ id: role.id, tenant: user.startsWith('b-') ? 'tenant-b' : 'tenant-a' })
  const rules = ok(await call('/permissions/data-scopes?pageSize=100', { user }))
  const rule = rules.list.find((value) => value.roleId === role.id)
  assert.ok(rule, `missing scope rule for ${role.id}`)
  ok(
    await call(`/permissions/data-scopes/${role.id}`, {
      user,
      method: 'PUT',
      body: {
        dataScope: scope,
        departmentIds: [],
        fieldPermissions: contracts.MEMBER_SCOPE_FIELDS,
        expectedRevision: rule.revision,
      },
    })
  )
  return role
}

const userFor = async (
  permissions,
  {
    name = '定时安全成员',
    scope = 'all',
    roleName = '定时安全成员角色',
  } = {}
) => {
  const username = `schedule-${randomUUID().slice(0, 8)}`
  const password = `Schedule-private-${randomUUID()}`
  const user = ok(
    await call('/system/users', {
      method: 'POST',
      body: {
        username,
        name,
        phone: '',
        email: '',
        initialPassword: password,
        status: 'enabled',
      },
    })
  )
  members.push({ id: user.id, tenant: 'tenant-a' })
  passwords.set(username, password)
  const role = await roleFor(permissions, { name: roleName, scope })
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
  return { ...user, username, password, roleId: role.id }
}

const createApplication = async () => {
  const created = ok(
    await call('/application-center', {
      method: 'POST',
      body: {
        name: `定时安全真实来源-${randomUUID()}`,
        code: `schedule-security-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
    })
  )
  const form = ok(await call(`/form-schemas/${created.formDraftId}`))
  const workflow = ok(await call(`/workflows/${created.workflowDraftId}`))
  const release = ok(
    await call(`/applications/${created.id}/releases`, {
      method: 'POST',
      body: {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: workflow.revision,
        expectedRevision: created.revision,
      },
    })
  )
  return { ...created, release, rawUid: 'itemName' }
}

const createRecord = async (user) =>
  ok(
    await call('/business/records', {
      user,
      method: 'POST',
      body: {
        applicationReleaseId: application.release.id,
        fields: {
          itemName: `排序字段安全记录-${randomUUID()}`,
          quantity: 1,
          unitPrice: '1.00',
          reason: '调度排序资格安全测试',
        },
      },
    })
  )

const publishReport = async (fields) => {
  const definition = ok(
    await call('/reporting/definitions', {
      method: 'POST',
      body: {
        schema: {
          version: 1,
          name: `调度安全固定报表-${randomUUID()}`,
          source: { kind: 'application-records', applicationId: application.id },
          kind: 'detail',
          metric: 'count',
          factTime: 'createdAt',
          timeZone: 'Asia/Shanghai',
          fields,
        },
      },
    })
  )
  return ok(
    await call(`/reporting/definitions/${definition.id}/publish`, {
      method: 'POST',
      body: { expectedRevision: definition.revision },
    })
  )
}

const scheduleBody = (overrides = {}) => ({
  schema: {
    version: 1,
    name: `安全调度-${randomUUID()}`,
    definitionVersionId: report.activeVersionId,
    timing: {
      frequency: 'daily',
      timeZone: 'Asia/Shanghai',
      time: '23:59',
    },
    dataWindow: 'previous-period',
    recipients: { kind: 'tenant' },
    format: 'csv',
    ...overrides.schema,
  },
  enabled: false,
  ...overrides,
})

const validQuery = () => ({
  version: 1,
  timeZone: 'Asia/Shanghai',
  dateRange: { from: '2026-01-01', to: '2026-01-01' },
  statuses: [],
  keyword: '',
  searchFields: [],
  sort: { field: metadata('id'), direction: 'desc' },
  current: 1,
  pageSize: 100,
})

const createSchedule = async ({ user = 'a-admin', body = scheduleBody() } = {}) => {
  const value = ok(
    await call('/reporting/schedules', { user, method: 'POST', body })
  )
  schedules.push({ id: value.id, tenant: user.startsWith('b-') ? 'tenant-b' : 'tenant-a' })
  return value
}

before(async () => {
  assert.equal(process.env.APP_MODE, 'demo')
  const database = (await pool.query('SELECT current_database() AS name')).rows[0].name
  assert.match(
    database,
    /^af_admin_tests_[a-z0-9]+_demo$/,
    'Schedule security tests require a generated isolated DB, never the running demo database'
  )
  isolated = true
  await migrations.migrate(pool)
  await seeds.seedDemo(pool)
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
  server = api.createServer(pool)
  base = await server.listen({ host: '127.0.0.1', port: 0 })
  application = await createApplication()
  report = await publishReport([metadata('id'), metadata('status')])
  scheduleSchema = scheduleBody().schema
})

after(async () => {
  if (server) await server.close()
  if (isolated) {
    for (const value of schedules) {
      await pool.query(
        "UPDATE report_schedule_periods SET closed_at=COALESCE(closed_at,clock_timestamp()),cursor_at=NULL WHERE tenant_id=$1 AND schedule_id=$2",
        [value.tenant, value.id]
      )
      await pool.query(
        'UPDATE report_schedules SET enabled=false,active_period_id=NULL WHERE tenant_id=$1 AND id=$2',
        [value.tenant, value.id]
      )
    }
    for (const value of members)
      await pool.query(
        "UPDATE memberships SET status='disabled',deleted_at=clock_timestamp() WHERE tenant_id=$2 AND user_id=$1",
        [value.id, value.tenant]
      )
    for (const value of roles)
      await pool.query(
        "UPDATE roles SET status='disabled',deleted_at=clock_timestamp() WHERE tenant_id=$2 AND id=$1",
        [value.id, value.tenant]
      )
    for (const value of departments)
      await pool.query(
        "UPDATE departments SET status='disabled',deleted_at=clock_timestamp() WHERE tenant_id=$2 AND id=$1",
        [value.id, value.tenant]
      )
    for (const row of originals || [])
      await pool.query(
        'UPDATE memberships SET permissions=$3::jsonb WHERE tenant_id=$1 AND user_id=$2',
        [row.tenant_id, row.user_id, JSON.stringify(row.permissions)]
      )
  }
  await pool.end()
})

test('closed v1 schedule input rejects private state, unknown claims and cross-tenant role or definition IDs', async () => {
  const foreignRole = ok(
    await call('/system/roles', {
      user: 'b-admin',
      method: 'POST',
      body: {
        roleName: `外租户调度角色-${randomUUID()}`,
        roleKey: `foreign-schedule-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions: [],
      },
    })
  )
  roles.push({ id: foreignRole.id, tenant: 'tenant-b' })
  const foreignDepartment = ok(
    await call('/system/departments', {
      user: 'b-admin',
      method: 'POST',
      body: {
        departmentName: `外租户调度部门-${randomUUID()}`,
        parentId: null,
        leader: '测试负责人',
        sort: 0,
        status: 'enabled',
      },
    })
  )
  departments.push({ id: foreignDepartment.id, tenant: 'tenant-b' })
  const invalidBodies = [
    { body: { schema: { ...scheduleSchema, version: 2 } }, status: 422 },
    {
      body: { schema: { ...scheduleSchema, privateKeyword: '不应进入固定规则' } },
      status: 422,
    },
    {
      body: {
        schema: {
          ...scheduleSchema,
          timing: { ...scheduleSchema.timing, nextRunAt: '2026-10-13T00:00:00Z' },
        },
      },
      status: 422,
    },
    { body: { ...scheduleBody(), claimedBy: 'client-claim' }, status: 422 },
    { body: { ...scheduleBody(), status: 'completed' }, status: 422 },
    {
      body: {
        schema: {
          ...scheduleSchema,
          recipients: { kind: 'role', roleId: foreignRole.id },
        },
      },
      status: 404,
    },
    {
      body: {
        schema: {
          ...scheduleSchema,
          recipients: { kind: 'department', departmentId: foreignDepartment.id },
        },
      },
      status: 404,
    },
    {
      body: {
        schema: {
          ...scheduleSchema,
          definitionVersionId: randomUUID(),
        },
      },
      status: 404,
    },
  ]
  const before = await pool.query(
    "SELECT count(*)::int AS total FROM report_schedules WHERE tenant_id='tenant-a'"
  )
  for (const { body, status } of invalidBodies) {
    const response = await call('/reporting/schedules', {
      method: 'POST',
      body: body.schema ? { schema: body.schema, enabled: body.enabled ?? false, ...body } : body,
    })
    assert.equal(response.status, status, `${response.businessCode || ''}: ${response.message || ''}`)
  }
  const after = await pool.query(
    "SELECT count(*)::int AS total FROM report_schedules WHERE tenant_id='tenant-a'"
  )
  assert.equal(after.rows[0].total, before.rows[0].total)
})

test('tenant isolation and governor DTOs expose rule metadata without source query or business data', async () => {
  const schedule = await createSchedule()
  const list = ok(await call('/reporting/schedules?pageSize=100'))
  assert.ok(list.list.some((value) => value.id === schedule.id))
  const detail = ok(await call(`/reporting/schedules/${schedule.id}`))
  assert.equal(detail.schema.definitionVersionId, report.activeVersionId)
  assert.ok(detail.versions?.length)
  for (const key of ['query', 'rows', 'data', 'sourceData', 'businessRecords'])
    assert.equal(key in detail, false, `governor DTO leaked ${key}`)

  governor = await userFor([S.list, S.update, S.toggle, S.runRead], {
    roleName: '仅治理调度角色',
  })
  const govList = ok(
    await call('/reporting/schedules?pageSize=100', { user: governor.username })
  )
  assert.ok(govList.list.some((value) => value.id === schedule.id))
  const govDetail = ok(
    await call(`/reporting/schedules/${schedule.id}`, { user: governor.username })
  )
  assert.equal(govDetail.schema.definitionVersionId, report.activeVersionId)
  assert.equal('query' in govDetail, false)
  const govPreview = ok(
    await call(`/reporting/schedules/${schedule.id}/preview`, {
      user: governor.username,
      method: 'POST',
      body: {},
    })
  )
  assert.equal(govPreview.timeZone, 'Asia/Shanghai')
  for (const key of ['query', 'rows', 'data', 'sourceData', 'businessRecords'])
    assert.equal(key in govPreview, false, `governor preview leaked ${key}`)
  assert.equal(
    (await call('/reporting/schedules/preview', {
      user: governor.username,
      method: 'POST',
      body: { schema: schedule.schema },
    })).status,
    403
  )
  assert.equal(
    (await call('/reporting/sources', { user: governor.username })).status,
    403
  )
  assert.equal(
    (await call(`/reporting/versions/${report.activeVersionId}/query`, {
      user: governor.username,
      method: 'POST',
      body: { query: validQuery() },
    })).status,
    403
  )
  const govUpdated = ok(
    await call(`/reporting/schedules/${schedule.id}`, {
      user: governor.username,
      method: 'PUT',
      body: { schema: schedule.schema, expectedRevision: schedule.revision },
    })
  )
  assert.equal(govUpdated.revision, schedule.revision + 1)
  const govEnabled = ok(
    await call(`/reporting/schedules/${schedule.id}/enabled`, {
      user: governor.username,
      method: 'POST',
      body: { enabled: true, expectedRevision: govUpdated.revision },
    })
  )
  assert.equal(govEnabled.enabled, true)
  const govDisabled = ok(
    await call(`/reporting/schedules/${schedule.id}/enabled`, {
      user: governor.username,
      method: 'POST',
      body: { enabled: false, expectedRevision: govEnabled.revision },
    })
  )
  assert.equal(govDisabled.enabled, false)
  const foreign = await call(`/reporting/schedules/${schedule.id}`, { user: 'b-admin' })
  assert.equal(foreign.status, 404)
  const foreignList = ok(await call('/reporting/schedules?pageSize=100', { user: 'b-admin' }))
  assert.equal(foreignList.list.some((value) => value.id === schedule.id), false)
  assert.equal(
    (await call(`/reporting/schedules/${schedule.id}`, {
      user: 'b-admin',
      method: 'PUT',
      body: { schema: schedule.schema, expectedRevision: schedule.revision },
    })).status,
    404
  )
})

test('governor update and toggle use revisioned metadata and fallback sorting stays inside selected fields', async () => {
  const schedule = await createSchedule()
  const updated = ok(
    await call(`/reporting/schedules/${schedule.id}`, {
      method: 'PUT',
      body: {
        schema: {
          ...schedule.schema,
          name: `${schedule.schema.name}-更新`,
        },
        expectedRevision: schedule.revision,
      },
    })
  )
  assert.equal(updated.revision, schedule.revision + 1)
  assert.equal(updated.schema.name, `${schedule.schema.name}-更新`)
  const enabled = ok(
    await call(`/reporting/schedules/${schedule.id}/enabled`, {
      method: 'POST',
      body: { enabled: true, expectedRevision: updated.revision },
    })
  )
  assert.equal(enabled.enabled, true)
  const disabled = ok(
    await call(`/reporting/schedules/${schedule.id}/enabled`, {
      method: 'POST',
      body: { enabled: false, expectedRevision: enabled.revision },
    })
  )
  assert.equal(disabled.enabled, false)
  const versions = ok(await call(`/reporting/schedules/${schedule.id}`))
  assert.equal(versions.versions.length, 2)

  const denied = await userFor(
    [S.create, E.create, P.query, 'business:create', 'business:read:self'],
    { roleName: '无申请人字段权限调度角色' }
  )
  await createRecord(denied.username)
  const applicantOnly = await publishReport([metadata('applicantName')])
  const deniedResponse = await call('/reporting/schedules', {
    user: denied.username,
    method: 'POST',
    body: {
      ...scheduleBody(),
      schema: {
        ...scheduleBody().schema,
        definitionVersionId: applicantOnly.activeVersionId,
      },
    },
  })
  assert.equal(deniedResponse.status, 403)
  assert.equal(deniedResponse.businessCode, 'REPORT_FIELD_FORBIDDEN')
})

test('run-read-only and recipient export principals cannot read schedule configuration, directories or previews', async () => {
  const emptyRole = await roleFor([], { name: '没有收件人的调度角色' })
  const scheduled = await createSchedule({
    body: scheduleBody({
      enabled: true,
      schema: {
        ...scheduleSchema,
        recipients: { kind: 'role', roleId: emptyRole.id },
      },
    }),
  })
  const localParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .filter(({ type }) => ['year', 'month', 'day'].includes(type))
      .map(({ type, value }) => [type, value])
  )
  const midnight = Date.parse(
    `${localParts.year}-${localParts.month}-${localParts.day}T00:00:00+08:00`
  )
  const slotAt = new Date(midnight - 60_000)
  const startedAt = new Date(slotAt.getTime() - 86_400_000)
  const closedAt = new Date(slotAt.getTime() + 86_400_000)
  const periodId = randomUUID()
  // This is a dedicated historical activation fixture for worker/API isolation;
  // natural next-minute scheduling is covered by the real browser acceptance.
  await pool.query(
    'INSERT INTO report_schedule_periods(tenant_id,id,schedule_id,rule_version_id,origin_id,started_at,closed_at,cursor_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      'tenant-a',
      periodId,
      scheduled.id,
      scheduled.activeVersionId,
      'a-admin',
      startedAt,
      closedAt,
      slotAt,
    ]
  )
  await pool.query(
    'UPDATE report_schedules SET enabled=true,active_period_id=$3,revision=revision+1 WHERE tenant_id=$1 AND id=$2',
    ['tenant-a', scheduled.id, periodId]
  )
  const { processReportSchedules } = await import(
    '../../services/reference-api/dist/report-schedules-worker.js'
  )
  await processReportSchedules(pool, {}, undefined, 1)
  const run = (
    await pool.query(
      'SELECT id,status,query FROM report_schedule_runs WHERE tenant_id=$1 AND schedule_id=$2 ORDER BY created_at,id LIMIT 1',
      ['tenant-a', scheduled.id]
    )
  ).rows[0]
  assert.ok(run, 'worker must materialize a real run from the fixed report/source')
  assert.equal(run.status, 'failed')
  const fixed = (
    await pool.query(
      'SELECT schema_snapshot FROM report_definition_versions WHERE tenant_id=$1 AND id=$2',
      ['tenant-a', report.activeVersionId]
    )
  ).rows[0]
  assert.deepEqual(fixed.schema_snapshot.fields, [metadata('id'), metadata('status')])
  assert.equal(
    fixed.schema_snapshot.fields.some(
      (field) => field.kind === 'metadata' && field.id === 'createdAt'
    ),
    false
  )
  assert.deepEqual(run.query.sort.field, metadata('id'))
  assert.equal(run.query.sort.direction, 'desc')
  assert.deepEqual(run.query.searchFields, [])

  const runReader = await userFor([S.runRead], { roleName: '仅运行读取角色' })
  const runMenus = ok(await call('/user/menu', { user: runReader.username }))
  const visualization = runMenus.find((node) => node.name === 'visualization')
  assert.deepEqual(
    visualization?.children?.map((node) => node.name),
    ['reportSchedules'],
    'The server menu must admit the same current run-only permission as the route'
  )
  assert.equal(ok(await call('/navigation/access/reportSchedules', { user: runReader.username })).allowed, true)
  assert.equal(ok(await call('/navigation/access/reportCenter', { user: runReader.username })).allowed, false)
  const runs = ok(await call('/reporting/schedules/runs?pageSize=100', { user: runReader.username }))
  const listed = runs.list.find((value) => value.id === run.id)
  assert.ok(listed)
  assert.equal(listed.query, null)
  const detail = ok(await call(`/reporting/schedules/runs/${run.id}`, { user: runReader.username }))
  assert.equal(detail.query, null)
  assert.equal(detail.scheduleId, scheduled.id)
  const govRuns = ok(
    await call('/reporting/schedules/runs?pageSize=100', {
      user: governor.username,
    })
  )
  assert.equal(govRuns.list.find((value) => value.id === run.id)?.query, null)
  const govRunDetail = ok(
    await call(`/reporting/schedules/runs/${run.id}`, {
      user: governor.username,
    })
  )
  assert.equal(govRunDetail.query, null)
  for (const [path, options] of [
    ['/reporting/schedules', { user: runReader.username }],
    [`/reporting/schedules/${scheduled.id}`, { user: runReader.username }],
    ['/reporting/schedules/recipient-options?purpose=create', { user: runReader.username }],
    ['/reporting/schedules/preview', { user: runReader.username, method: 'POST', body: { schema: scheduleSchema } }],
    [`/reporting/schedules/${scheduled.id}/preview`, { user: runReader.username, method: 'POST', body: {} }],
  ])
    assert.equal((await call(path, options)).status, 403)

  const receiver = await userFor(
    [P.query, E.list, E.download, 'business:read:self'],
    { roleName: '仅导出接收资格角色' }
  )
  const exportReader = await userFor([E.list], {
    roleName: '仅导出元信息读取角色',
  })
  const exportMenus = ok(await call('/user/menu', { user: exportReader.username }))
  assert.deepEqual(
    exportMenus.find((node) => node.name === 'visualization')?.children?.map((node) => node.name),
    ['reportCenter'],
    'An export metadata reader must receive its authorized page without report query powers'
  )
  assert.equal(ok(await call('/navigation/access/reportCenter', { user: exportReader.username })).allowed, true)
  assert.equal(ok(await call('/navigation/access/reportSchedules', { user: exportReader.username })).allowed, false)
  assert.equal((await call('/reporting/schedules', { user: receiver.username })).status, 403)
  assert.equal((await call('/reporting/schedules/runs', { user: receiver.username })).status, 403)
  assert.equal(
    (await call(`/reporting/schedules/runs/${run.id}`, { user: receiver.username })).status,
    403
  )
  assert.equal(
    (await call('/reporting/schedules/recipient-options?purpose=create', { user: receiver.username })).status,
    403
  )
})
