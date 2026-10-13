import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createServer as createSocketServer } from 'node:net'
import { before, after, test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migration from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import contracts from '@af-admin/contracts'

const pool = db.createPool(),
  tokens = new Map(),
  passwords = new Map(),
  members = [],
  roles = [],
  children = new Set()
let server,
  base,
  originals,
  failure = '',
  isolated = false
before(async () => {
  assert.equal(process.env.APP_MODE, 'demo')
  assert.match(
    (await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^af_admin_tests_[a-z0-9]+_demo$/,
    'Reporting tests require a generated isolated DB, never the running demo database'
  )
  isolated = true
  await migration.migrate(pool)
  await seed.seedDemo(pool)
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin','a-employee','a-manager-1','a-manager-2')"
    )
  ).rows
  const all = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((value) => value.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin','a-employee')",
    [JSON.stringify(all)]
  )
  await pool.query(
    "UPDATE memberships SET permissions=permissions||$1::jsonb WHERE user_id='a-manager-1'",
    [
      JSON.stringify([
        contracts.REPORTING_PERMISSIONS.query,
        'workflow:transfer',
      ]),
    ]
  )
  server = api.createServer(pool, (point) => {
    if (point === failure) {
      failure = ''
      throw new Error('Controlled reporting rollback')
    }
  })
  base = await server.listen({ host: '127.0.0.1', port: 0 })
})
after(async () => {
  const stopped = await Promise.allSettled(Array.from(children).map(stop))
  if (server) await server.close()
  if (!isolated) {
    await pool.end()
    return
  }
  for (const row of originals || [])
    await pool.query(
      'UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',
      [row.tenant_id, row.user_id, JSON.stringify(row.permissions)]
    )
  await pool.query(
    "UPDATE memberships SET status='disabled',deleted_at=now() WHERE user_id=ANY($1::text[])",
    [members]
  )
  await pool.query(
    "UPDATE roles SET status='disabled',deleted_at=now() WHERE id=ANY($1::text[])",
    [roles]
  )
  await pool.end()
  const failed = stopped.find((value) => value.status === 'rejected')
  if (failed) throw failed.reason
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
  const token = (await response.json()).data.token
  tokens.set(user, token)
  return token
}
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
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      'x-access-token': await login(user),
      'x-tenant-id': tenant,
      'idempotency-key': key,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
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
const createApp = async ({ rawUid, type = 'text', name } = {}) => {
  const application = ok(
    await call('/application-center', {
      method: 'POST',
      body: {
        name: name || `真实报表来源-${randomUUID()}`,
        code: `report-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
    })
  )
  let form = ok(await call(`/form-schemas/${application.formDraftId}`))
  const workflow = ok(await call(`/workflows/${application.workflowDraftId}`))
  if (rawUid) {
    const schema = structuredClone(form.schema),
      widget = schema.widgetsConfig.find((value) => value.uid === 'itemName')
    widget.uid = rawUid
    widget.config.id = rawUid
    widget.config.valueType = type
    form = ok(
      await call(`/form-schemas/${form.id}`, {
        method: 'PUT',
        body: { schema, expectedRevision: form.revision },
      })
    )
  }
  const release = ok(
    await call(`/applications/${application.id}/releases`, {
      method: 'POST',
      body: {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: workflow.revision,
        expectedRevision: application.revision,
      },
    })
  )
  return { ...application, release, rawUid: rawUid || 'itemName' }
}
const createRecord = async (
  application,
  {
    user = 'a-employee',
    item = '合成设备',
    price = '1.00',
    quantity = 1,
    reason = '真实报表记录',
  } = {}
) =>
  ok(
    await call('/business/records', {
      user,
      method: 'POST',
      body: {
        applicationReleaseId: application.release.id,
        fields: {
          [application.rawUid]: item,
          quantity,
          unitPrice: price,
          reason,
        },
      },
    })
  )
const source = async (application, user = 'a-admin') =>
  ok(
    await call(
      `/reporting/sources?applicationId=${encodeURIComponent(application.id)}`,
      { user }
    )
  ).list.find((value) => value.source.applicationId === application.id)
const fieldByLabel = (catalogue, label) => {
  const field = catalogue.visibleFields.find((value) => value.label === label)
  assert.ok(field, `Missing source field ${label}`)
  return field.reference
}
const schemaFor = (application, catalogue, extra = {}) => ({
  version: 1,
  name: `授权申请报表-${randomUUID()}`,
  source: { kind: 'application-records', applicationId: application.id },
  kind: 'detail',
  metric: 'count',
  factTime: 'createdAt',
  timeZone: 'Asia/Shanghai',
  fields: [
    metadata('id'),
    metadata('status'),
    metadata('createdAt'),
    metadata('applicantId'),
    metadata('applicantName'),
    metadata('departmentSnapshot'),
    ...catalogue.visibleFields
      .filter((value) => value.reference.kind === 'field')
      .map((value) => value.reference),
  ],
  ...extra,
})
const createDefinition = async (schema, options = {}) =>
  ok(
    await call('/reporting/definitions', {
      ...options,
      method: 'POST',
      body: { schema },
    })
  )
const publish = async (definition) =>
  ok(
    await call(`/reporting/definitions/${definition.id}/publish`, {
      method: 'POST',
      body: { expectedRevision: definition.revision },
    })
  )
const reportFor = async (application, extra = {}) => {
  const catalogue = await source(application),
    schema = schemaFor(application, catalogue, extra)
  return { catalogue, report: await publish(await createDefinition(schema)) }
}
const query = (extra = {}) => ({
  version: 1,
  timeZone: 'Asia/Shanghai',
  dateRange: { from: '2026-01-01', to: '2026-12-31' },
  statuses: [],
  keyword: '',
  searchFields: [],
  sort: { field: metadata('createdAt'), direction: 'desc' },
  current: 1,
  pageSize: 100,
  ...extra,
})
const run = async (report, input = query(), options = {}) =>
  call(`/reporting/versions/${report.activeVersionId}/query`, {
    user: 'a-employee',
    ...options,
    method: 'POST',
    body: { query: input },
  })
const userWithRole = async (
  permissions,
  scope = 'self',
  fieldPermissions = contracts.MEMBER_SCOPE_FIELDS
) => {
  const username = `report-reader-${randomUUID().slice(0, 8)}`,
    password = 'Reporting-private-test-2026'
  const user = ok(
    await call('/system/users', {
      method: 'POST',
      body: {
        username,
        name: '合成报表用户',
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
        roleName: '报表测试角色',
        roleKey: `report-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions,
      },
    })
  )
  roles.push(role.id)
  await pool.query(
    'UPDATE role_member_scopes SET data_scope=$2,field_permissions=$3::jsonb WHERE role_id=$1',
    [role.id, scope, JSON.stringify(fieldPermissions)]
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

test('source pagination, literal keyword and exact application IDs retain every authorized choice with consistent totals', async () => {
  const keyword = `分页%_-${randomUUID()}`,
    first = await createApp({ name: `${keyword}-甲` }),
    second = await createApp({ name: `${keyword}-乙` })
  const filter = encodeURIComponent(keyword)
  const one = ok(
      await call(`/reporting/sources?current=1&pageSize=1&keyword=${filter}`)
    ),
    two = ok(
      await call(`/reporting/sources?current=2&pageSize=1&keyword=${filter}`)
    ),
    all = ok(
      await call(`/reporting/sources?current=1&pageSize=100&keyword=${filter}`)
    )
  assert.equal(one.total, 2)
  assert.equal(two.total, 2)
  assert.equal(one.current, 1)
  assert.equal(two.current, 2)
  assert.equal(one.pageSize, 1)
  assert.equal(one.list.length, 1)
  assert.equal(two.list.length, 1)
  assert.deepEqual(
    new Set(
      [...one.list, ...two.list].map((value) => value.source.applicationId)
    ),
    new Set([first.id, second.id])
  )
  assert.equal(all.list.length, 2)
  assert.equal(all.total, 2)
  const exact = ok(await call(`/reporting/sources?applicationId=${second.id}`))
  assert.equal(exact.total, 1)
  assert.equal(exact.pageSize, 20)
  assert.equal(exact.list[0].source.applicationId, second.id)
  const foreign = ok(
    await call(`/reporting/sources?applicationId=${second.id}`, {
      user: 'b-admin',
    })
  )
  assert.equal(foreign.total, 0)
  assert.deepEqual(foreign.list, [])
  const unavailable = ok(
    await call(
      `/reporting/sources?applicationId=${
        second.id
      }&keyword=${encodeURIComponent('不存在的名称')}`
    )
  )
  assert.equal(unavailable.total, 0)
  assert.deepEqual(unavailable.list, [])
  assert.equal((await call('/reporting/sources?pageSize=101')).status, 422)
  assert.equal((await call('/reporting/sources?tenantId=tenant-b')).status, 422)
})

test('real authorized CTE returns one consistent count, trend, distribution and sorted detail set without widening record rights', async () => {
  const application = await createApp(),
    one = await createRecord(application, { item: '设备甲', price: '12.34' }),
    two = await createRecord(application, { item: '设备乙', price: '2.00' })
  const foreignOwner = await createRecord(application, {
    user: 'a-admin',
    item: '管理员本人设备',
  })
  await pool.query(
    "UPDATE business_records SET created_at=CASE id WHEN $1 THEN '2026-10-12T15:59:59Z'::timestamptz ELSE '2026-10-12T16:00:00Z'::timestamptz END WHERE id=ANY($2::text[])",
    [one.id, [one.id, two.id]]
  )
  const { report, catalogue } = await reportFor(application),
    price = fieldByLabel(catalogue, '参考单价（元）')
  assert.equal(
    catalogue.visibleFields.find((value) => value.reference.id === price.id)
      .valueType,
    'decimal'
  )
  const data = ok(
    await run(report, query({ sort: { field: price, direction: 'asc' } }))
  )
  assert.equal(data.total, 2)
  assert.deepEqual(
    data.rows.map((value) => value.id),
    [two.id, one.id]
  )
  assert.equal(data.rows[0].values[`field:${price.id}`], '2.00')
  assert.equal(
    data.rows[1].values[`field:${price.id}`],
    '12.34',
    'The actual decimal source value must survive projection while numeric sort puts 2 before 12.34'
  )
  assert.deepEqual(data.trend, [
    { date: '2026-10-12', count: 1 },
    { date: '2026-10-13', count: 1 },
  ])
  assert.deepEqual(data.distribution, [{ status: 'draft', count: 2 }])
  assert.equal(
    data.trend.reduce((sum, value) => sum + value.count, 0),
    data.total
  )
  assert.equal(
    data.distribution.reduce((sum, value) => sum + value.count, 0),
    data.total
  )
  assert.equal(data.sourceReleaseId, application.release.id)
  assert.equal(data.releaseScope, 'fixed-published-source')
  assert.equal(data.factTime, 'createdAt')
  assert.ok(Number.isFinite(Date.parse(data.queriedAt)))
  assert.equal(data.queriedAt, data.dataCutoffAt)
  const page = ok(
    await run(
      report,
      query({
        pageSize: 1,
        current: 2,
        sort: { field: price, direction: 'asc' },
      })
    )
  )
  assert.equal(page.total, 2)
  assert.equal(page.rows[0].id, one.id)
  assert.equal(page.trend.length, 2)
  const boundary = ok(
    await run(
      report,
      query({ dateRange: { from: '2026-10-13', to: '2026-10-13' } })
    )
  )
  assert.deepEqual(
    boundary.rows.map((value) => value.id),
    [two.id]
  )
  const admin = ok(await run(report, query(), { user: 'a-admin' }))
  assert.deepEqual(
    admin.rows.map((value) => value.id),
    [foreignOwner.id],
    'Report/query and all role scope cannot reveal another owner records'
  )
  assert.equal((await run(report, query(), { user: 'b-admin' })).status, 404)
  assert.equal(
    (await call(`/reporting/definitions/${report.id}`, { user: 'b-admin' }))
      .status,
    404
  )
})

test('query-only shared versions do not grant private creator metadata, source rights or current field capabilities', async () => {
  const application = await createApp(),
    { report } = await reportFor(application)
  const reader = await userWithRole([
    contracts.REPORTING_PERMISSIONS.list,
    contracts.REPORTING_PERMISSIONS.query,
    'business:read:self',
    'business:create',
  ])
  const record = await createRecord(application, {
    user: reader.username,
    item: '私有字段不会输出',
  })
  assert.equal(
    (
      await call(`/reporting/definitions/${report.id}`, {
        user: reader.username,
      })
    ).status,
    404
  )
  assert.ok(
    !ok(
      await call('/reporting/definitions?pageSize=100', {
        user: reader.username,
      })
    ).list.some((value) => value.id === report.id)
  )
  assert.ok(
    ok(
      await call('/reporting/definitions/published?pageSize=100', {
        user: reader.username,
      })
    ).list.some((value) => value.id === report.activeVersionId)
  )
  const catalogue = ok(
    await call(`/reporting/versions/${report.activeVersionId}/catalogue`, {
      user: reader.username,
    })
  )
  assert.equal(
    catalogue.visibleFields.some((value) => value.reference.kind === 'field'),
    false
  )
  const data = ok(await run(report, query(), { user: reader.username }))
  assert.equal(data.total, 1)
  assert.equal(data.rows[0].id, record.id)
  assert.equal(
    Object.keys(data.rows[0].values).some((key) => key.startsWith('field:')),
    false
  )
  assert.equal('metadata:applicantName' in data.rows[0].values, false)
  assert.ok(
    data.hiddenFields.some((value) => value.reason === 'permission-denied')
  )
  const noSource = await userWithRole([contracts.REPORTING_PERMISSIONS.query])
  assert.deepEqual(
    ok(await call('/reporting/sources', { user: noSource.username })).list,
    []
  )
  assert.equal(
    (await run(report, query(), { user: noSource.username })).businessCode,
    'REPORT_SOURCE_FORBIDDEN'
  )
  assert.equal(
    (
      await call(`/reporting/definitions/${report.id}`, {
        user: noSource.username,
      })
    ).status,
    403
  )
  await pool.query(
    'DELETE FROM role_permissions WHERE role_id=$1 AND permission_code=$2',
    [reader.roleId, contracts.REPORTING_PERMISSIONS.query]
  )
  assert.equal(
    (await run(report, query(), { user: reader.username })).status,
    403
  )
})

test('literal search uses only authorized projected fields and raw field UID aliases never execute paths or expressions', async () => {
  const application = await createApp({ rawUid: 'item.name[]/raw' }),
    literal = await createRecord(application, { item: 'A%_\\B' }),
    ordinary = await createRecord(application, { item: 'AXYZB' })
  const { report, catalogue } = await reportFor(application),
    item = fieldByLabel(catalogue, '设备名称')
  assert.match(item.id, /^f_[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(catalogue).includes(application.rawUid), false)
  const binding = (
    await pool.query(
      'SELECT field_bindings FROM report_definition_versions WHERE id=$1',
      [report.activeVersionId]
    )
  ).rows[0].field_bindings[item.id]
  assert.equal(binding.rawUid, application.rawUid)
  const data = ok(
    await run(report, query({ keyword: '%_\\', searchFields: [item] }))
  )
  assert.equal(data.total, 1)
  assert.equal(data.rows[0].id, literal.id)
  assert.notEqual(data.rows[0].id, ordinary.id)
  assert.equal(
    (
      await run(
        report,
        query({
          searchFields: [{ kind: 'field', id: 'fields.itemName' }],
          keyword: 'A',
        })
      )
    ).status,
    422
  )
  assert.equal(
    (
      await run(
        report,
        query({ keyword: 'A', searchFields: [metadata('createdAt')] })
      )
    ).businessCode,
    'REPORT_FIELD_CAPABILITY_INVALID'
  )
  const reader = await userWithRole([
    contracts.REPORTING_PERMISSIONS.query,
    'business:read:self',
    'business:create',
  ])
  await createRecord(application, { user: reader.username, item: '隐藏文本' })
  assert.equal(
    (
      await run(report, query({ keyword: '隐藏文本', searchFields: [item] }), {
        user: reader.username,
      })
    ).businessCode,
    'REPORT_FIELD_FORBIDDEN'
  )
  assert.equal(
    (
      await run(report, query({ sort: { field: item, direction: 'asc' } }), {
        user: reader.username,
      })
    ).businessCode,
    'REPORT_FIELD_FORBIDDEN'
  )
})

test('review history grants only real participated records; current field member scopes mask values before search, sort and aggregation', async () => {
  const application = await createApp(),
    visible = await createRecord(application, { item: '审批可读但字段私有' }),
    unrelated = await createRecord(application, { item: '没有参与的隐藏记录' })
  ok(
    await call(`/business/records/${visible.id}/submit`, {
      user: 'a-employee',
      method: 'POST',
      body: { expectedRevision: visible.revision },
    })
  )
  const { report, catalogue } = await reportFor(application),
    item = fieldByLabel(catalogue, '设备名称')
  const role = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: '审批字段限定本人',
        roleKey: `report-review-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions: [
          contracts.REPORTING_PERMISSIONS.fieldApplicant,
          contracts.REPORTING_PERMISSIONS.fieldBusiness,
        ],
      },
    })
  )
  roles.push(role.id)
  await pool.query(
    "INSERT INTO member_roles(tenant_id,user_id,role_id) VALUES('tenant-a','a-manager-1',$1)",
    [role.id]
  )
  const permitted = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-manager-1'"
    )
  ).rows[0].permissions
  try {
    const sources = ok(
      await call(`/reporting/sources?applicationId=${application.id}`, {
        user: 'a-manager-1',
      })
    ).list
    assert.ok(
      sources.some((value) => value.source.applicationId === application.id)
    )
    const otherApp = await createApp()
    assert.ok(
      !ok(
        await call(`/reporting/sources?applicationId=${otherApp.id}`, {
          user: 'a-manager-1',
        })
      ).list.some((value) => value.source.applicationId === otherApp.id)
    )
    const data = ok(await run(report, query(), { user: 'a-manager-1' }))
    assert.equal(data.total, 1)
    assert.deepEqual(
      data.rows.map((value) => value.id),
      [visible.id]
    )
    assert.notEqual(data.rows[0].id, unrelated.id)
    assert.equal(data.rows[0].values[`field:${item.id}`], null)
    assert.equal(data.rows[0].values['metadata:applicantName'], null)
    assert.ok(data.rows[0].hiddenFieldKeys.includes(`field:${item.id}`))
    assert.ok(
      data.hiddenFields.some((value) => value.reason === 'scope-denied')
    )
    assert.equal(
      ok(
        await run(
          report,
          query({ keyword: '审批可读', searchFields: [item] }),
          { user: 'a-manager-1' }
        )
      ).total,
      0
    )
    const tasks = ok(
        await call('/workflow-todos', { user: 'a-manager-1' })
      ).list,
      task = tasks.find((value) => value.requestId === visible.id)
    ok(
      await call(`/workflow-tasks/${task.id}/transfer`, {
        user: 'a-manager-1',
        method: 'POST',
        body: {
          expectedRevision: task.revision,
          targetUserId: 'a-admin',
          reason: '报表历史范围真实转交',
        },
      })
    )
    assert.equal(
      ok(await run(report, query(), { user: 'a-manager-1' })).total,
      1,
      'Prior actual assignee keeps permitted history'
    )
    await pool.query(
      'DELETE FROM role_permissions WHERE role_id=$1 AND permission_code=$2',
      [role.id, contracts.REPORTING_PERMISSIONS.fieldBusiness]
    )
    assert.equal(
      (
        await run(
          report,
          query({ keyword: '审批可读', searchFields: [item] }),
          { user: 'a-manager-1' }
        )
      ).status,
      403
    )
    await pool.query(
      "UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
      [
        JSON.stringify(
          permitted.filter((permission) => !permission.startsWith('workflow:'))
        ),
      ]
    )
    assert.equal(
      (await run(report, query(), { user: 'a-manager-1' })).status,
      403
    )
    await pool.query(
      "UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
      [JSON.stringify(permitted)]
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
      [JSON.stringify(permitted)]
    )
    await pool.query(
      "DELETE FROM member_roles WHERE tenant_id='tenant-a' AND user_id='a-manager-1' AND role_id=$1",
      [role.id]
    )
  }
})

test('saved definitions and immutable published mappings survive new source releases without reinterpreting old records', async () => {
  const application = await createApp(),
    oldRecord = await createRecord(application, { item: '固定旧版文字' }),
    { report, catalogue } = await reportFor(application)
  const firstVersion = report.versions[0],
    oldItem = fieldByLabel(catalogue, '设备名称')
  await assert.rejects(
    pool.query(
      "UPDATE report_definition_versions SET schema_snapshot='{}'::jsonb WHERE id=$1",
      [firstVersion.id]
    ),
    (error) => error.code === '23514'
  )
  const form = ok(await call(`/form-schemas/${application.formDraftId}`)),
    workflow = ok(await call(`/workflows/${application.workflowDraftId}`)),
    currentApp = ok(await call(`/applications/${application.id}`))
  const nextSchema = structuredClone(form.schema),
    item = nextSchema.widgetsConfig.find(
      (value) => value.uid === application.rawUid
    )
  item.config.valueType = 'integer'
  const saved = ok(
    await call(`/form-schemas/${form.id}`, {
      method: 'PUT',
      body: { schema: nextSchema, expectedRevision: form.revision },
    })
  )
  const nextRelease = ok(
    await call(`/applications/${application.id}/releases`, {
      method: 'POST',
      body: {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: saved.revision,
        workflowRevision: workflow.revision,
        expectedRevision: currentApp.revision,
      },
    })
  )
  const newer = await createRecord(
    { ...application, release: nextRelease },
    { item: 7 }
  )
  const oldData = ok(await run(report))
  assert.deepEqual(
    oldData.rows.map((value) => value.id),
    [oldRecord.id]
  )
  assert.equal(oldData.rows[0].values[`field:${oldItem.id}`], '固定旧版文字')
  assert.notEqual(oldData.rows[0].id, newer.id)
  const oldCatalogue = ok(
    await call(`/reporting/versions/${firstVersion.id}/catalogue`, {
      user: 'a-employee',
    })
  )
  assert.equal(oldCatalogue.sourceReleaseId, application.release.id)
  assert.equal(
    oldCatalogue.visibleFields.find(
      (value) => value.reference.id === oldItem.id
    ).valueType,
    'text'
  )
  const latestCatalogue = await source(application),
    latestItem = fieldByLabel(latestCatalogue, '设备名称')
  assert.notEqual(latestItem.id, oldItem.id)
  assert.equal(
    latestCatalogue.visibleFields.find(
      (value) => value.reference.id === latestItem.id
    ).valueType,
    'integer'
  )
  assert.equal(
    (
      await call(`/reporting/definitions/${report.id}`, {
        method: 'PUT',
        body: { schema: report.schema, expectedRevision: report.revision },
      })
    ).businessCode,
    'REPORT_FIELD_UNREGISTERED'
  )
  const edited = ok(
    await call(`/reporting/definitions/${report.id}`, {
      method: 'PUT',
      body: {
        schema: schemaFor(application, latestCatalogue),
        expectedRevision: report.revision,
      },
    })
  )
  assert.equal(edited.activeVersionId, firstVersion.id)
  assert.equal(edited.draftChanged, true)
  const next = await publish(edited)
  assert.notEqual(next.activeVersionId, firstVersion.id)
  assert.equal(next.versions.length, 2)
  assert.deepEqual(
    ok(await run(next)).rows.map((value) => value.id),
    [newer.id]
  )
  assert.deepEqual(
    ok(await run(report)).rows.map((value) => value.id),
    [oldRecord.id]
  )
})

test('review-only source metadata authority stays fixed to an actually readable release until new real participation', async () => {
  const permissions = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-manager-1'"
    )
  ).rows[0].permissions
  await pool.query(
    "UPDATE memberships SET permissions=permissions||$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
    [
      JSON.stringify([
        contracts.REPORTING_PERMISSIONS.fieldApplicant,
        contracts.REPORTING_PERMISSIONS.fieldBusiness,
      ]),
    ]
  )
  try {
    assert.equal(permissions.includes('business:read:self'), false)
    const application = await createApp(),
      oldRecord = await createRecord(application),
      { report: oldReport } = await reportFor(application)
    ok(
      await call(`/business/records/${oldRecord.id}/submit`, {
        user: 'a-employee',
        method: 'POST',
        body: { expectedRevision: oldRecord.revision },
      })
    )
    const form = ok(await call(`/form-schemas/${application.formDraftId}`)),
      workflow = ok(await call(`/workflows/${application.workflowDraftId}`)),
      app = ok(await call(`/applications/${application.id}`))
    const schema = structuredClone(form.schema),
      added = structuredClone(
        schema.widgetsConfig.find((value) => value.uid === 'itemName')
      )
    added.uid = 'new-release-private-field'
    added.name = '新版独有字段'
    added.config.id = added.uid
    added.config.label = '新版独有未参与字段'
    added.config.required = false
    schema.widgetsConfig.push(added)
    const saved = ok(
      await call(`/form-schemas/${form.id}`, {
        method: 'PUT',
        body: { schema, expectedRevision: form.revision },
      })
    )
    const newerRelease = ok(
      await call(`/applications/${application.id}/releases`, {
        method: 'POST',
        body: {
          formDraftId: form.id,
          workflowDraftId: workflow.id,
          formRevision: saved.revision,
          workflowRevision: workflow.revision,
          expectedRevision: app.revision,
        },
      })
    )
    const nextApplication = { ...application, release: newerRelease },
      { report: newReport } = await reportFor(nextApplication)
    const oldCatalogue = ok(
      await call(`/reporting/versions/${oldReport.activeVersionId}/catalogue`, {
        user: 'a-manager-1',
      })
    )
    assert.equal(oldCatalogue.sourceReleaseId, application.release.id)
    assert.equal(
      oldCatalogue.visibleFields.some(
        (value) => value.label === '新版独有未参与字段'
      ),
      false
    )
    assert.equal(
      ok(await run(oldReport, query(), { user: 'a-manager-1' })).total,
      1
    )
    assert.equal(
      ok(
        await call(`/reporting/sources?applicationId=${application.id}`, {
          user: 'a-manager-1',
        })
      ).list.some((value) => value.source.applicationId === application.id),
      false
    )
    assert.equal(
      (
        await call(
          `/reporting/versions/${newReport.activeVersionId}/catalogue`,
          { user: 'a-manager-1' }
        )
      ).status,
      404
    )
    assert.equal(
      (await run(newReport, query(), { user: 'a-manager-1' })).status,
      404
    )
    const newRecord = await createRecord(nextApplication)
    assert.equal(
      (
        await call(
          `/reporting/versions/${newReport.activeVersionId}/catalogue`,
          { user: 'a-manager-1' }
        )
      ).status,
      404,
      'A new record alone does not authorize a prior-release reviewer'
    )
    ok(
      await call(`/business/records/${newRecord.id}/submit`, {
        user: 'a-employee',
        method: 'POST',
        body: { expectedRevision: newRecord.revision },
      })
    )
    const authorizedCatalogue = ok(
      await call(`/reporting/versions/${newReport.activeVersionId}/catalogue`, {
        user: 'a-manager-1',
      })
    )
    assert.equal(authorizedCatalogue.sourceReleaseId, newerRelease.id)
    assert.ok(
      authorizedCatalogue.visibleFields.some(
        (value) => value.label === '新版独有未参与字段'
      )
    )
    assert.equal(
      ok(await run(newReport, query(), { user: 'a-manager-1' })).total,
      1
    )
    assert.ok(
      ok(
        await call(`/reporting/sources?applicationId=${application.id}`, {
          user: 'a-manager-1',
        })
      ).list.some((value) => value.source.applicationId === application.id)
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
      [JSON.stringify(permissions)]
    )
  }
})

test('command rollback, concurrent same keys and stale revisions retain one definition/version and current scope on replay', async () => {
  const application = await createApp(),
    schema = schemaFor(application, await source(application)),
    key = randomUUID()
  const beforeCount = Number(
    (await pool.query('SELECT count(*) AS total FROM report_definitions'))
      .rows[0].total
  )
  failure = 'reporting:created'
  assert.equal(
    (
      await call('/reporting/definitions', {
        method: 'POST',
        body: { schema },
        key,
      })
    ).status,
    500
  )
  assert.equal(
    Number(
      (await pool.query('SELECT count(*) AS total FROM report_definitions'))
        .rows[0].total
    ),
    beforeCount
  )
  const created = await Promise.all(
    [0, 1].map(() =>
      call('/reporting/definitions', { method: 'POST', body: { schema }, key })
    )
  )
  assert.equal(ok(created[0]).id, ok(created[1]).id)
  const report = created[0].data
  assert.equal(
    (
      await call('/reporting/definitions', {
        method: 'POST',
        body: { schema: { ...schema, name: '不同内容' } },
        key,
      })
    ).businessCode,
    'IDEMPOTENCY_CONFLICT'
  )
  const publishKey = randomUUID()
  failure = 'reporting:published'
  assert.equal(
    (
      await call(`/reporting/definitions/${report.id}/publish`, {
        method: 'POST',
        body: { expectedRevision: report.revision },
        key: publishKey,
      })
    ).status,
    500
  )
  assert.equal(
    Number(
      (
        await pool.query(
          'SELECT count(*) AS total FROM report_definition_versions WHERE definition_id=$1',
          [report.id]
        )
      ).rows[0].total
    ),
    0
  )
  const published = await Promise.all(
    [0, 1].map(() =>
      call(`/reporting/definitions/${report.id}/publish`, {
        method: 'POST',
        body: { expectedRevision: report.revision },
        key: publishKey,
      })
    )
  )
  assert.equal(
    ok(published[0]).activeVersionId,
    ok(published[1]).activeVersionId
  )
  const current = published[0].data
  const updates = await Promise.all(
    ['甲', '乙'].map((name) =>
      call(`/reporting/definitions/${report.id}`, {
        method: 'PUT',
        body: {
          expectedRevision: current.revision,
          schema: { ...schema, name },
        },
      })
    )
  )
  assert.deepEqual(updates.map((value) => value.status).sort(), [200, 409])
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM audit_events WHERE target_id=$1 AND action='definition.publish' AND result='success'",
          [report.id]
        )
      ).rows[0].n
    ),
    1
  )
})

test('disabled report or unavailable source rejects current requests; wrong fields and forged results never become query facts', async () => {
  const application = await createApp(),
    { report } = await reportFor(application)
  const queryOnly = await userWithRole([
    contracts.REPORTING_PERMISSIONS.query,
    'business:read:self',
  ])
  assert.equal(
    (
      await call(`/reporting/versions/${report.activeVersionId}/catalogue`, {
        user: queryOnly.username,
      })
    ).status,
    200
  )
  const disabled = ok(
    await call(`/reporting/definitions/${report.id}/enabled`, {
      method: 'POST',
      body: { enabled: false, expectedRevision: report.revision },
    })
  )
  assert.equal((await run(report)).businessCode, 'REPORT_DISABLED')
  const stoppedCatalogue = await call(
    `/reporting/versions/${report.activeVersionId}/catalogue`,
    { user: queryOnly.username }
  )
  assert.equal(stoppedCatalogue.status, 409)
  assert.equal(stoppedCatalogue.businessCode, 'REPORT_DISABLED')
  assert.ok(
    !ok(await call('/reporting/definitions/published?pageSize=100')).list.some(
      (value) => value.id === report.activeVersionId
    )
  )
  ok(
    await call(`/reporting/definitions/${report.id}/enabled`, {
      method: 'POST',
      body: { enabled: true, expectedRevision: disabled.revision },
    })
  )
  for (const changed of [
    { rows: [] },
    { success: true },
    { count: 999 },
    { source: { kind: 'sql' } },
    { dateRange: { from: '2026-02-30', to: '2026-03-01' } },
    { timeZone: '+08:00' },
  ])
    assert.equal((await run(report, query(changed))).status, 422)
  await pool.query(
    "UPDATE applications SET status='archived' WHERE tenant_id='tenant-a' AND id=$1",
    [application.id]
  )
  assert.equal((await run(report)).businessCode, 'REPORT_SOURCE_UNAVAILABLE')
  await pool.query(
    "UPDATE applications SET status='enabled' WHERE tenant_id='tenant-a' AND id=$1",
    [application.id]
  )
})

const launch = async () => {
  const socket = createSocketServer()
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../../services/reference-api/dist/index.js', import.meta.url)
      ),
    ],
    {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
      stdio: 'pipe',
    }
  )
  children.add(child)
  const origin = `http://127.0.0.1:${port}`
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${origin}/ready`)).status === 200)
        return { child, origin }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Isolated reporting API did not become ready')
}
const stop = async (child) => {
  try {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 1000)
    let deadline
    const timeout = new Promise((_, reject) => {
      deadline = setTimeout(
        () => reject(new Error('Isolated API termination timed out')),
        3000
      )
    })
    child.kill('SIGTERM')
    try {
      await Promise.race([exited, timeout])
    } finally {
      clearTimeout(killTimer)
      clearTimeout(deadline)
    }
  } finally {
    children.delete(child)
  }
}
test('saved configuration, fixed published source and actual rows survive replacement of a real API process', async () => {
  const application = await createApp(),
    record = await createRecord(application),
    { report } = await reportFor(application)
  const first = await launch()
  assert.equal(
    ok(
      await call(`/reporting/definitions/${report.id}`, {
        origin: first.origin,
      })
    ).activeVersionId,
    report.activeVersionId
  )
  assert.deepEqual(
    ok(await run(report, query(), { origin: first.origin })).rows.map(
      (value) => value.id
    ),
    [record.id]
  )
  await stop(first.child)
  const second = await launch()
  try {
    const reopened = ok(
      await call(`/reporting/definitions/${report.id}`, {
        origin: second.origin,
      })
    )
    assert.equal(
      reopened.versions[0].contentHash,
      report.versions[0].contentHash
    )
    assert.deepEqual(
      ok(await run(report, query(), { origin: second.origin })).rows.map(
        (value) => value.id
      ),
      [record.id]
    )
  } finally {
    await stop(second.child)
  }
})
