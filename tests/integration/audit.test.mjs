import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { before, after, test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migration from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import schedules from '../../services/reference-api/dist/report-schedules-access.js'

const pool = db.createPool(),
  tokens = new Map(),
  passwords = new Map(),
  members = [],
  roles = []
const auditApiChildren = new Set()
let server,
  originals = [],
  isolated = false,
  fault = ''
before(async () => {
  assert.equal(process.env.APP_MODE, 'demo')
  assert.match(
    (await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^af_admin_tests_[a-z0-9]+_demo$/,
    'Audit integration requires a generated disposable database'
  )
  isolated = true
  await migration.migrate(pool)
  await seed.seedDemo(pool)
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin','a-employee')"
    )
  ).rows
  const all = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((row) => row.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin','a-employee')",
    [JSON.stringify(all)]
  )
  server = api.createServer(pool, (point) => {
    if (fault === point) {
      fault = ''
      throw new Error('Controlled telemetry transaction rollback')
    }
  })
  await server.ready()
})
after(async () => {
  const stopped = await Promise.allSettled(
    Array.from(auditApiChildren).map((child) => stopAuditApiChild(child))
  )
  if (server) await server.close()
  if (isolated) {
    for (const row of originals)
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
  }
  await pool.end()
  const stopFailure = stopped.find((result) => result.status === 'rejected')
  if (stopFailure) throw stopFailure.reason
})
const login = async (user) => {
  if (tokens.has(user)) return tokens.get(user)
  const response = await server.inject({
    method: 'POST',
    url: '/api/user/login',
    payload: { username: user, password: passwords.get(user) || user },
  })
  assert.equal(response.statusCode, 200)
  const token = response.json().data.token
  tokens.set(user, token)
  return token
}
const call = async (
  path,
  { user = 'a-admin', method = 'GET', body, token, tenant } = {}
) => {
  const response = await server.inject({
    method,
    url: `/api${path}`,
    headers: {
      'x-access-token': token || (await login(user)),
      'x-tenant-id':
        tenant || (user.startsWith('b-') ? 'tenant-b' : 'tenant-a'),
      'idempotency-key': randomUUID(),
    },
    ...(body === undefined ? {} : { payload: body }),
  })
  return { status: response.statusCode, ...response.json() }
}
const ok = (response) => {
  assert.equal(
    response.status,
    200,
    `${response.businessCode}: ${response.message}`
  )
  return response.data
}
const query = (params = {}, options = {}) =>
  call(`/audit/events?${new URLSearchParams(params)}`, options)
const makeUser = async ({
  name = `Reader_${randomUUID().slice(0, 8)}%`,
  scope = 'self',
  fields = ['username', 'name'],
  permissions = [
    'audit:read',
    'leave:create',
    'leave:read:self',
    'leave:update:self',
  ],
} = {}) => {
  const username = `audit-${randomUUID().slice(0, 8)}`,
    password = 'Audit-integration-private-2026'
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
  members.push(user.id)
  passwords.set(username, password)
  const role = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: `Audit scope ${randomUUID()}`,
        roleKey: `audit-${randomUUID().slice(0, 8)}`,
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
    [role.id, scope, JSON.stringify(fields)]
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
const leaveFields = (
  reason = 'Private business reason, never audit output'
) => ({
  leaveType: 'personal',
  startDate: '2026-10-01',
  startSlot: 'am',
  endDate: '2026-10-02',
  endSlot: 'pm',
  reason,
})
const createLeave = async (user = 'a-employee') => {
  const app = ok(await call('/applications/leave', { user }))
  const response = await call('/leave-requests', {
    user,
    method: 'POST',
    body: { applicationReleaseId: app.activeReleaseId, fields: leaveFields() },
  })
  return { record: ok(response), traceId: response.traceId }
}

// Explicit historical/adversarial rows test projection boundaries only. Ordinary
// success facts below are generated through real transactional API commands.
const historical = async ({
  module = 'future-module',
  action = 'old.failure',
  targetId = randomUUID(),
  targetType = 'legacy-resource',
  actorId = 'a-admin',
  actorName = 'Historical operator',
  detail = {},
  time = '2026-03-08T07:00:00Z',
  tenant = 'tenant-a',
  result = 'failure',
} = {}) => {
  const id = randomUUID(),
    traceId = randomUUID()
  await pool.query(
    'INSERT INTO audit_events(tenant_id,id,actor_id,actor_name,module,action,result,target_type,target_id,trace_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [
      tenant,
      id,
      actorId,
      actorName,
      module,
      action,
      result,
      targetType,
      targetId,
      traceId,
      JSON.stringify(detail),
      time,
    ]
  )
  return { id, traceId, targetId }
}

test('real server transactions expose immutable fact identity and never accept browser-authored success facts', async () => {
  const created = await createLeave()
  const facts = ok(await query({ traceId: created.traceId }))
  assert.equal(facts.source, 'server')
  assert.equal(facts.projectionVersion, 1)
  assert.equal(facts.total, 1)
  const fact = facts.list[0]
  assert.equal(fact.target.id, created.record.id)
  assert.equal(fact.operator.id, 'a-employee')
  assert.equal(fact.result, 'success')
  assert.equal(fact.traceId, created.traceId)
  assert.equal(fact.source, 'server')
  assert.deepEqual(fact.detail, {})
  assert.equal(JSON.stringify(facts).includes('Private business reason'), false)
  const forged = await call('/audit/events', {
    user: 'a-employee',
    method: 'POST',
    body: {
      source: 'server',
      result: 'success',
      actorId: 'b-admin',
      module: 'auth',
      traceId: created.traceId,
      target: { id: created.record.id },
      detail: { password: 'must-not-persist' },
    },
  })
  const telemetry = ok(forged)
  assert.equal(telemetry.source, 'browser')
  assert.equal(ok(await query({ traceId: forged.traceId })).total, 0)
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM client_telemetry WHERE tenant_id='tenant-a' AND id=$1 AND actor_id='a-employee'",
          [telemetry.id]
        )
      ).rows[0].n
    ),
    1
  )
  await assert.rejects(
    pool.query(
      "UPDATE audit_events SET result='failure' WHERE tenant_id='tenant-a' AND id=$1",
      [fact.id]
    ),
    /append-only/
  )
  await assert.rejects(
    pool.query(
      "DELETE FROM audit_events WHERE tenant_id='tenant-a' AND id=$1",
      [fact.id]
    ),
    /append-only/
  )
  assert.equal(
    ok(await query({ traceId: created.traceId })).list[0].id,
    fact.id
  )
})

test('500+ actual writes retain deterministic finite paging and count/list agreement without private business values', async () => {
  const { record: initial } = await createLeave()
  let record = initial
  for (let index = 0; index < 501; index += 1)
    record = ok(
      await call(`/leave-requests/${record.id}`, {
        user: 'a-employee',
        method: 'PATCH',
        body: {
          expectedRevision: record.revision,
          fields: leaveFields(`Never expose saved reason ${index}`),
        },
      })
    )
  const ids = [],
    timestamps = []
  for (let current = 1; current <= 6; current += 1) {
    const page = ok(
      await query({ targetId: record.id, current, pageSize: 100 })
    )
    assert.equal(page.total, 502)
    assert.equal(page.current, current)
    assert.equal(page.pageSize, 100)
    assert.equal(page.list.length, current === 6 ? 2 : 100)
    ids.push(...page.list.map((fact) => fact.id))
    timestamps.push(...page.list.map((fact) => fact.occurredAt))
    assert.equal(
      JSON.stringify(page).includes('Never expose saved reason'),
      false
    )
  }
  assert.equal(new Set(ids).size, 502)
  assert.deepEqual(timestamps, [...timestamps].sort().reverse())
  const empty = ok(
    await query({ targetId: record.id, current: 7, pageSize: 100 })
  )
  assert.equal(empty.total, 502)
  assert.deepEqual(empty.list, [])
  assert.equal(
    ok(await query({ targetId: record.id }, { user: 'b-admin' })).total,
    0
  )
})

test('current role self/department/tenant scope and actor field masks govern names, IDs and literal filters', async () => {
  const owner = await makeUser({
    name: `Precise_%_${randomUUID().slice(0, 6)}`,
  })
  const viewer = await makeUser({ scope: 'self', fields: [] })
  const own = await createLeave(viewer.username),
    other = await createLeave(owner.username)
  assert.equal(
    ok(await query({ targetId: other.record.id }, { user: viewer.username }))
      .total,
    0
  )
  const ownFact = ok(
    await query({ traceId: own.traceId }, { user: viewer.username })
  ).list[0]
  assert.equal(ownFact.operator.id, null)
  assert.equal(ownFact.operator.name, null)
  assert.deepEqual(ownFact.hiddenFields, ['operator.id', 'operator.name'])
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='tenant',field_permissions='[\"username\"]'::jsonb WHERE role_id=$1",
    [viewer.roleId]
  )
  const masked = ok(
    await query({ traceId: other.traceId }, { user: viewer.username })
  )
  assert.equal(masked.total, 1)
  assert.equal(masked.list[0].operator.id, owner.id)
  assert.equal(masked.list[0].operator.name, null)
  assert.equal(
    ok(await query({ operatorName: owner.name }, { user: viewer.username }))
      .total,
    0
  )
  await pool.query(
    'UPDATE role_member_scopes SET field_permissions=\'["username","name"]\'::jsonb WHERE role_id=$1',
    [viewer.roleId]
  )
  assert.equal(
    ok(
      await query(
        { operatorName: owner.name, traceId: other.traceId },
        { user: viewer.username }
      )
    ).total,
    1
  )
  assert.equal(
    ok(
      await query(
        { operatorName: owner.name.replace('%', 'X'), traceId: other.traceId },
        { user: viewer.username }
      )
    ).total,
    0
  )
  const dept = randomUUID(),
    elsewhere = randomUUID()
  await pool.query(
    "INSERT INTO departments(tenant_id,id,department_name) VALUES('tenant-a',$1,$1),('tenant-a',$2,$2)",
    [dept, elsewhere]
  )
  await pool.query(
    "UPDATE memberships SET department_id=$2 WHERE tenant_id='tenant-a' AND user_id=$1",
    [owner.id, dept]
  )
  await pool.query(
    "UPDATE memberships SET department_id=$2 WHERE tenant_id='tenant-a' AND user_id=$1",
    [viewer.id, elsewhere]
  )
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='department' WHERE role_id=$1",
    [viewer.roleId]
  )
  assert.equal(
    ok(await query({ traceId: other.traceId }, { user: viewer.username }))
      .total,
    0
  )
  await pool.query(
    "INSERT INTO role_scope_departments(tenant_id,role_id,department_id) VALUES('tenant-a',$1,$2)",
    [viewer.roleId, dept]
  )
  assert.equal(
    ok(await query({ traceId: other.traceId }, { user: viewer.username }))
      .total,
    1
  )
  await pool.query(
    "DELETE FROM role_scope_departments WHERE tenant_id='tenant-a' AND role_id=$1",
    [viewer.roleId]
  )
  assert.equal(
    ok(await query({ traceId: other.traceId }, { user: viewer.username }))
      .total,
    0
  )
  await pool.query(
    "UPDATE roles SET status='disabled' WHERE tenant_id='tenant-a' AND id=$1",
    [viewer.roleId]
  )
  assert.equal((await query({}, { user: viewer.username })).status, 403)
})

test('person-target aliases cannot bypass hidden operator IDs and anonymous failures are not tenant facts', async () => {
  const viewer = await makeUser({ scope: 'tenant', fields: [] })
  const auth = ok(await query({ module: 'auth' }, { user: viewer.username }))
  assert.ok(auth.total > 0)
  assert.ok(
    auth.list.every(
      (fact) =>
        fact.operator.id === null &&
        fact.operator.name === null &&
        fact.target.id === null
    )
  )
  const failed = await server.inject({
    method: 'POST',
    url: '/api/user/login',
    payload: {
      username: 'missing-audit-identity',
      password: 'not-a-real-secret',
    },
  })
  assert.equal(failed.statusCode, 401)
  const trace = failed.json().traceId
  assert.equal(ok(await query({ traceId: trace })).total, 0)
  assert.equal(
    ok(await query({ traceId: trace }, { user: 'b-admin' })).total,
    0
  )
  assert.equal(
    Number(
      (
        await pool.query(
          'SELECT count(*) AS n FROM auth_failures WHERE trace_id=$1',
          [trace]
        )
      ).rows[0].n
    ),
    1
  )
})

test('strict shared query and positional legacy date bridge reject ambiguous or client-fact filters', async () => {
  for (const params of [
    { version: 3 },
    { version: 1, archiveState: 'hot' },
    { version: 2, archiveState: 'future' },
    { pageSize: 101 },
    { current: '1e4' },
    { to: '2026-02-29' },
    { from: '2026-01-02', to: '2026-01-01' },
    { timeZone: '+08:00' },
    { source: 'server' },
    { detail: '{}' },
    { operatorName: '<script>x</script>' },
  ])
    assert.equal((await query(params)).status, 422)
  for (const tail of [
    'current=1&current=2',
    'dateRange=2026-01-01&dateRange=2026-01-02&dateRange=2026-01-03',
    'dateRange=&dateRange=2026-01-02&to=2026-01-03',
    'dateRange=&dateRange=2026-01-02&dateRange%5B%5D=2026-01-01&dateRange%5B%5D=2026-01-02',
    'version=2&dateRange=&dateRange=2026-01-02',
  ])
    assert.equal((await call(`/audit/events?${tail}`)).status, 422)
  const endOnly = ok(
    await call('/audit/events?dateRange%5B%5D=&dateRange%5B%5D=2026-03-08')
  )
  assert.equal(endOnly.query.from, '')
  assert.equal(endOnly.query.to, '2026-03-08')
  const fromOnly = ok(
    await call('/audit/events?dateRange=2026-03-08&dateRange=')
  )
  assert.equal(fromOnly.query.from, '2026-03-08')
  assert.equal(fromOnly.query.to, '')
  const v1 = ok(await query({ version: 1 }))
  const v2 = ok(await query({ version: 2 }))
  assert.equal(v1.version, 1)
  assert.equal(v2.version, 2)
  assert.equal(Object.hasOwn(v1.query, 'archiveState'), false)
  assert.equal(Object.hasOwn(v2.query, 'archiveState'), false)
  assert.deepEqual({ ...v2.query, version: 1 }, v1.query)
  assert.equal(v2.total, v1.total)
})

test('inclusive natural dates use the selected IANA timezone across DST and keep single bounds on the correct side', async () => {
  const target = randomUUID()
  const before = await historical({
    targetId: target,
    time: '2026-03-08T04:59:59Z',
  })
  const start = await historical({
    targetId: target,
    time: '2026-03-08T05:00:00Z',
  })
  const end = await historical({
    targetId: target,
    time: '2026-03-09T03:59:59Z',
  })
  const after = await historical({
    targetId: target,
    time: '2026-03-09T04:00:00Z',
  })
  const range = {
    targetId: target,
    timeZone: 'America/New_York',
    from: '2026-03-08',
    to: '2026-03-08',
  }
  assert.deepEqual(
    ok(await query(range)).list.map((fact) => fact.id),
    [end.id, start.id]
  )
  assert.deepEqual(
    ok(await query({ ...range, from: '' })).list.map((fact) => fact.id),
    [end.id, start.id, before.id]
  )
  assert.deepEqual(
    ok(await query({ ...range, to: '' })).list.map((fact) => fact.id),
    [after.id, end.id, start.id]
  )
  assert.equal(ok(await query({ ...range, timeZone: 'UTC' })).total, 2)
})

test('all modules project only registered scalar detail and literal target/trace do not search arbitrary old JSON', async () => {
  const marker = `private-${randomUUID()}`,
    target = randomUUID()
  const unknown = await historical({
    detail: {
      requestId: target,
      instanceId: target,
      reason: marker,
      password: marker,
      nested: { business: marker },
    },
  })
  const old = await historical({
    module: 'messaging',
    action: 'template.approve',
    targetType: 'message-template-review',
    detail: {
      templateId: 'safe-template',
      versionId: 'safe-version',
      reason: marker,
      variables: { value: marker },
      recipients: [marker],
      password: marker,
    },
  })
  const exported = await historical({
    module: 'report-export',
    action: 'report-export.created',
    targetType: 'report-export',
    detail: {
      format: 'csv',
      definitionVersionId: 'report-v1',
      total: 300,
      snapshotHash: marker,
      sha256: marker,
      capturedRows: [marker],
      code: { nested: marker },
    },
  })
  assert.deepEqual(
    ok(await query({ traceId: unknown.traceId })).list[0].detail,
    {}
  )
  assert.equal(ok(await query({ targetId: target })).total, 0)
  assert.deepEqual(ok(await query({ traceId: old.traceId })).list[0].detail, {
    templateId: 'safe-template',
    versionId: 'safe-version',
  })
  const projection = ok(await query({ traceId: exported.traceId })).list[0]
  assert.equal(projection.eventType, 'export')
  assert.deepEqual(projection.detail, {
    format: 'csv',
    definitionVersionId: 'report-v1',
  })
  assert.equal(JSON.stringify(projection).includes(marker), false)
  assert.equal(ok(await query({ traceId: old.traceId.slice(0, -1) })).total, 0)
  assert.equal(ok(await query({ module: 'unknown-future.module' })).total, 0)
})

test('registered permission/auth/export classifications and catalogue do not enumerate private actors or payloads', async () => {
  const user = await makeUser()
  const roleFacts = ok(
    await query({ targetId: user.roleId, eventType: 'permission' })
  )
  assert.ok(roleFacts.list.some((fact) => fact.action === 'role.create'))
  assert.ok(roleFacts.list.every((fact) => fact.eventType === 'permission'))
  const catalogue = ok(await call('/audit/catalogue'))
  assert.equal(catalogue.version, 1)
  assert.equal(catalogue.source, 'server')
  assert.deepEqual(catalogue.eventTypes, [
    'operation',
    'security',
    'permission',
    'export',
  ])
  assert.deepEqual(catalogue.results, ['success', 'failure'])
  assert.ok(
    catalogue.modules.every(
      (module) =>
        typeof module.code === 'string' && typeof module.label === 'string'
    )
  )
  assert.equal(JSON.stringify(catalogue).includes(user.name), false)
  assert.equal(JSON.stringify(catalogue).includes(user.id), false)
})

test('telemetry transaction failures roll back and current session/tenant revocation limits the next access', async () => {
  const user = await makeUser()
  const token = await login(user.username)
  const count = async () =>
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM client_telemetry WHERE tenant_id='tenant-a' AND actor_id=$1",
          [user.id]
        )
      ).rows[0].n
    )
  const before = await count()
  fault = 'audit:telemetry-stored'
  assert.equal(
    (
      await call('/audit/events', {
        user: user.username,
        method: 'POST',
        body: { result: 'success' },
      })
    ).status,
    500
  )
  assert.equal(await count(), before)
  ok(await call('/user/logout', { user: user.username, method: 'POST' }))
  assert.equal((await query({}, { user: user.username, token })).status, 401)
  assert.equal(
    (
      await call('/audit/events', {
        user: user.username,
        token,
        method: 'POST',
        body: {},
      })
    ).status,
    401
  )
  tokens.delete(user.username)
  await login(user.username)
  try {
    await pool.query("UPDATE tenants SET status='disabled' WHERE id='tenant-a'")
    assert.equal((await query({}, { user: user.username })).status, 404)
  } finally {
    await pool.query("UPDATE tenants SET status='enabled' WHERE id='tenant-a'")
  }
})

const scheduleSource = async (owner) => {
  const app = ok(
    await call('/application-center', {
      method: 'POST',
      body: {
        name: `Audit schedule source ${randomUUID()}`,
        code: `audit-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
    })
  )
  const form = ok(await call(`/form-schemas/${app.formDraftId}`)),
    workflow = ok(await call(`/workflows/${app.workflowDraftId}`))
  ok(
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
  const definition = ok(
    await call('/reporting/definitions', {
      method: 'POST',
      body: {
        schema: {
          version: 1,
          name: 'Audit-owned report',
          source: { kind: 'application-records', applicationId: app.id },
          kind: 'detail',
          metric: 'count',
          factTime: 'createdAt',
          timeZone: 'Asia/Shanghai',
          fields: [
            { kind: 'metadata', id: 'id' },
            { kind: 'metadata', id: 'createdAt' },
          ],
        },
      },
    })
  )
  const report = ok(
    await call(`/reporting/definitions/${definition.id}/publish`, {
      method: 'POST',
      body: { expectedRevision: definition.revision },
    })
  )
  const schedule = ok(
    await call('/reporting/schedules', {
      user: owner.username,
      method: 'POST',
      body: {
        schema: {
          version: 1,
          name: `Owned schedule ${randomUUID()}`,
          definitionVersionId: report.activeVersionId,
          timing: {
            frequency: 'daily',
            timeZone: 'Asia/Shanghai',
            time: '00:00',
          },
          dataWindow: 'current-period',
          recipients: { kind: 'role', roleId: owner.roleId },
          format: 'csv',
        },
        enabled: false,
      },
    })
  )
  return { schedule, report }
}

test('registered background facts use their same-tenant resource owner scope without fabricating actor identity or borrowing source permissions', async () => {
  const permissions = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((row) => row.code)
  const owner = await makeUser({ permissions }),
    viewer = await makeUser({ scope: 'self' })
  const { schedule, report } = await scheduleSource(owner)
  const failureTrace = randomUUID(),
    retryTrace = randomUUID()
  await db.transaction(pool, async (client) => {
    await schedules.scheduleEvent(
      client,
      schedules.scheduleFactActor('tenant-a', failureTrace),
      schedule.id,
      'run.failed'
    )
    await schedules.scheduleEvent(
      client,
      schedules.scheduleFactActor('tenant-a', retryTrace),
      schedule.id,
      'run.retry'
    )
  })
  assert.equal(
    (
      await pool.query(
        "SELECT result FROM audit_events WHERE tenant_id='tenant-a' AND trace_id=$1",
        [failureTrace]
      )
    ).rows[0].result,
    'failure'
  )
  assert.equal(
    (
      await pool.query(
        "SELECT result FROM audit_events WHERE tenant_id='tenant-a' AND trace_id=$1",
        [retryTrace]
      )
    ).rows[0].result,
    'success'
  )
  assert.equal(
    ok(await query({ traceId: failureTrace }, { user: owner.username })).list[0]
      .result,
    'failure'
  )
  assert.equal(
    ok(await query({ traceId: retryTrace }, { user: owner.username })).list[0]
      .result,
    'success'
  )
  // This preserves the exact old stored-success convention for failure actions.
  // It tests backwards projection, not a claim that the worker ran successfully.
  const legacy = await historical({
    actorId: null,
    actorName: '报表调度后台服务',
    module: 'report-schedule',
    action: 'report-schedule.run.resolve-failed',
    targetType: 'report-schedule',
    targetId: schedule.id,
    result: 'success',
    detail: {
      code: 'REPORT_DISABLED',
      reason: 'do-not-project-background-private-reason',
      total: 999,
      unavailable: 888,
    },
  })
  const self = ok(
    await query(
      { traceId: legacy.traceId, result: 'failure' },
      { user: owner.username }
    )
  )
  assert.equal(self.total, 1)
  assert.equal(self.list[0].result, 'failure')
  assert.equal(self.list[0].operator.id, null)
  assert.equal(self.list[0].operator.name, null)
  assert.deepEqual(self.list[0].hiddenFields, ['operator.id', 'operator.name'])
  assert.deepEqual(self.list[0].detail, { code: 'REPORT_DISABLED' })
  assert.equal(
    (
      await pool.query(
        "SELECT result FROM audit_events WHERE tenant_id='tenant-a' AND id=$1",
        [legacy.id]
      )
    ).rows[0].result,
    'success'
  )
  assert.equal(
    ok(
      await query(
        { traceId: legacy.traceId, result: 'success' },
        { user: owner.username }
      )
    ).total,
    0
  )
  assert.equal(
    ok(await query({ traceId: legacy.traceId }, { user: viewer.username }))
      .total,
    0
  )
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='tenant' WHERE role_id=$1",
    [viewer.roleId]
  )
  assert.equal(
    ok(await query({ traceId: legacy.traceId }, { user: viewer.username }))
      .total,
    1
  )
  const dept = randomUUID(),
    elsewhere = randomUUID()
  await pool.query(
    "INSERT INTO departments(tenant_id,id,department_name) VALUES('tenant-a',$1,$1),('tenant-a',$2,$2)",
    [dept, elsewhere]
  )
  await pool.query(
    "UPDATE memberships SET department_id=$2 WHERE tenant_id='tenant-a' AND user_id=$1",
    [owner.id, dept]
  )
  await pool.query(
    "UPDATE memberships SET department_id=$2 WHERE tenant_id='tenant-a' AND user_id=$1",
    [viewer.id, elsewhere]
  )
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='department' WHERE role_id=$1",
    [viewer.roleId]
  )
  assert.equal(
    ok(await query({ traceId: legacy.traceId }, { user: viewer.username }))
      .total,
    0
  )
  await pool.query(
    "INSERT INTO role_scope_departments(tenant_id,role_id,department_id) VALUES('tenant-a',$1,$2)",
    [viewer.roleId, dept]
  )
  assert.equal(
    ok(await query({ traceId: legacy.traceId }, { user: viewer.username }))
      .total,
    1
  )
  assert.equal(
    (
      await call(`/reporting/versions/${report.activeVersionId}/query`, {
        user: viewer.username,
        method: 'POST',
        body: {
          query: {
            version: 1,
            timeZone: 'Asia/Shanghai',
            dateRange: { from: '2026-10-01', to: '2026-10-01' },
            statuses: [],
            keyword: '',
            searchFields: [],
            sort: { field: { kind: 'metadata', id: 'id' }, direction: 'asc' },
            current: 1,
            pageSize: 20,
          },
        },
      })
    ).status,
    403
  )
  const foreign = await historical({
    tenant: 'tenant-b',
    actorId: null,
    module: 'report-schedule',
    action: 'report-schedule.run.failed',
    targetType: 'report-schedule',
    targetId: schedule.id,
    detail: { actorId: owner.id },
  })
  assert.equal(
    ok(await query({ traceId: foreign.traceId }, { user: 'b-admin' })).total,
    0
  )
  const unknown = await historical({
    actorId: null,
    module: 'report-schedule',
    action: 'report-schedule.future.failed',
    targetType: 'report-schedule',
    targetId: schedule.id,
    detail: { createdBy: owner.id },
  })
  assert.equal(ok(await query({ traceId: unknown.traceId })).total, 0)
  const wrongType = await historical({
    actorId: null,
    module: 'report-schedule',
    action: 'report-schedule.run.failed',
    targetType: 'report-export',
    targetId: schedule.id,
  })
  assert.equal(ok(await query({ traceId: wrongType.traceId })).total, 0)
})

test('workflow request/instance filters follow actual recorded task references without admitting arbitrary detail aliases', async () => {
  const { record } = await createLeave()
  ok(
    await call(`/leave-requests/${record.id}/submit`, {
      user: 'a-employee',
      method: 'POST',
      body: { expectedRevision: record.revision },
    })
  )
  const detail = ok(
    await call(`/leave-requests/${record.id}`, { user: 'a-manager-1' })
  )
  const task = detail.tasks.find(
    (value) => value.assigneeId === 'a-manager-1' && value.status === 'pending'
  )
  assert.ok(task)
  const approval = await call(`/workflow-tasks/${task.id}/approve`, {
    user: 'a-manager-1',
    method: 'POST',
    body: {
      expectedRevision: task.revision,
      comment: 'never show private approval rationale',
    },
  })
  ok(approval)
  const byRequest = ok(await query({ targetId: record.id, module: 'workflow' }))
  assert.ok(
    byRequest.list.some(
      (fact) => fact.traceId === approval.traceId && fact.action === 'approve'
    )
  )
  const byInstance = ok(
    await query({ targetId: detail.instanceId, module: 'workflow' })
  )
  assert.deepEqual(
    byInstance.list.map((fact) => fact.id),
    byRequest.list.map((fact) => fact.id)
  )
  assert.equal(
    JSON.stringify(byRequest).includes('never show private approval rationale'),
    false
  )
  const forged = await historical({
    module: 'workflow',
    action: 'approve',
    targetType: 'workflow-task',
    targetId: randomUUID(),
    detail: { requestId: record.id, instanceId: detail.instanceId },
  })
  assert.equal(
    ok(await query({ traceId: forged.traceId, targetId: record.id })).total,
    0
  )
  assert.deepEqual(
    ok(await query({ traceId: forged.traceId })).list[0].detail,
    {}
  )
})

const allCodes = async () =>
  (await pool.query('SELECT code FROM permission_definitions')).rows.map(
    (row) => row.code
  )
const assertBackgroundProjection = async ({
  owner,
  module,
  action,
  targetType,
  targetId,
  detail,
  expectedDetail,
  eventType = 'operation',
}) => {
  const viewer = await makeUser({ scope: 'self', fields: [] })
  const secret = `do-not-expose-${randomUUID()}`
  const fact = await historical({
    actorId: null,
    actorName: 'Background service never treated as a person',
    module,
    action,
    targetType,
    targetId,
    detail: {
      ...detail,
      reason: secret,
      token: secret,
      password: secret,
      email: secret,
      recipients: [secret],
      fields: { private: secret },
      total: 999,
      sha256: secret,
      snapshotHash: secret,
    },
  })
  const own = ok(
    await query({ traceId: fact.traceId }, { user: owner.username })
  )
  assert.equal(own.total, 1)
  assert.equal(own.list[0].eventType, eventType)
  assert.deepEqual(own.list[0].operator, { id: null, name: null })
  assert.deepEqual(own.list[0].visibleFields, [])
  assert.deepEqual(own.list[0].hiddenFields, ['operator.id', 'operator.name'])
  assert.deepEqual(own.list[0].detail, expectedDetail)
  assert.equal(JSON.stringify(own).includes(secret), false)
  assert.equal(
    ok(
      await query(
        { traceId: fact.traceId, operatorName: 'Background service' },
        { user: owner.username }
      )
    ).total,
    0
  )
  assert.equal(
    ok(await query({ traceId: fact.traceId }, { user: viewer.username })).total,
    0
  )
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='tenant' WHERE role_id=$1",
    [viewer.roleId]
  )
  assert.equal(
    ok(await query({ traceId: fact.traceId }, { user: viewer.username })).total,
    1
  )
  const foreign = await historical({
    tenant: 'tenant-b',
    actorId: null,
    module,
    action,
    targetType,
    targetId,
    detail: { ...detail, actorId: owner.id, createdBy: owner.id },
  })
  assert.equal(
    ok(await query({ traceId: foreign.traceId }, { user: 'b-admin' })).total,
    0
  )
  const unknown = await historical({
    actorId: null,
    module,
    action: `${action}.future`,
    targetType,
    targetId,
    detail: { createdBy: owner.id },
  })
  assert.equal(ok(await query({ traceId: unknown.traceId })).total, 0)
  const wrongType = await historical({
    actorId: null,
    module,
    action,
    targetType: 'unregistered-resource',
    targetId,
  })
  assert.equal(ok(await query({ traceId: wrongType.traceId })).total, 0)
  await pool.query(
    "DELETE FROM role_permissions WHERE tenant_id='tenant-a' AND role_id=$1 AND permission_code='audit:read'",
    [viewer.roleId]
  )
  assert.equal(
    (await query({ traceId: fact.traceId }, { user: viewer.username })).status,
    403
  )
  return { fact, viewer }
}

test('export background ownership follows the real fixed report export plan and denies foreign or invented bindings', async () => {
  const owner = await makeUser({ permissions: await allCodes() })
  const { report } = await scheduleSource(owner)
  // The actual API checks configured storage and real ClamAV readiness; no mocked
  // clean result or manually inserted export job substitutes for that boundary.
  const exportJob = ok(
    await call('/reporting/exports', {
      user: owner.username,
      method: 'POST',
      body: {
        definitionVersionId: report.activeVersionId,
        format: 'csv',
        query: {
          version: 1,
          timeZone: 'Asia/Shanghai',
          dateRange: { from: '2026-10-01', to: '2026-10-01' },
          statuses: [],
          keyword: '',
          searchFields: [],
          sort: { field: { kind: 'metadata', id: 'id' }, direction: 'asc' },
          current: 1,
          pageSize: 20,
        },
      },
    })
  )
  try {
    const { viewer } = await assertBackgroundProjection({
      owner,
      module: 'report-export',
      action: 'report-export.failed',
      targetType: 'report-export',
      targetId: exportJob.id,
      detail: {
        code: 'REPORT_EXPORT_RENDER_FAILED',
        attempt: 2,
        stage: 'rendering',
      },
      expectedDetail: {
        code: 'REPORT_EXPORT_RENDER_FAILED',
        stage: 'rendering',
        attempt: 2,
      },
      eventType: 'export',
    })
    // Re-grant only audit viewing; metadata audit must not grant the source artifact.
    await pool.query(
      "INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES('tenant-a',$1,'audit:read')",
      [viewer.roleId]
    )
    assert.ok(
      [403, 404].includes(
        (
          await call(`/reporting/exports/${exportJob.id}`, {
            user: viewer.username,
          })
        ).status
      )
    )
    assert.ok(
      [403, 404].includes(
        (
          await call(`/reporting/exports/${exportJob.id}/download`, {
            user: viewer.username,
          })
        ).status
      )
    )
  } finally {
    const current = ok(
      await call(`/reporting/exports/${exportJob.id}`, { user: owner.username })
    )
    ok(
      await call(`/reporting/exports/${exportJob.id}/cancel`, {
        user: owner.username,
        method: 'POST',
        body: { expectedRevision: current.revision },
      })
    )
  }
})

const messageRecipientSource = async (owner) => {
  // A self-scoped author cannot select another person as reviewer. Grant only
  // reviewer-selection capabilities through a separate tenant-scoped role;
  // the original audit:read role deliberately remains self-scoped.
  const selectionRole = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: `Audit message reviewer selection ${randomUUID()}`,
        roleKey: `audit-review-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions: ['message:template:create', 'message:template:submit'],
      },
    })
  )
  roles.push(selectionRole.id)
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='tenant' WHERE role_id=$1",
    [selectionRole.id]
  )
  const authorization = ok(
    await call(`/system/users/${owner.id}/authorization`)
  )
  const roleIds =
    authorization.roleIds || authorization.roles.map((role) => role.id)
  ok(
    await call(`/system/users/${owner.id}/authorization`, {
      method: 'POST',
      body: {
        roleIds: [...roleIds, selectionRole.id],
        directPermissions: authorization.directPermissions,
        expectedRevision: authorization.revision,
      },
    })
  )
  const schema = {
    name: `Audit background message ${randomUUID()}`,
    channel: 'message',
    title: 'Private title {{name}}',
    content: 'Private content {{name}}',
    variables: [{ key: 'name', label: '显示文字', required: true }],
    reviewerId: 'a-admin',
    deliveryModes: ['in-app'],
  }
  const draft = ok(
    await call('/messaging/templates', {
      user: owner.username,
      method: 'POST',
      body: { schema },
    })
  )
  const submitted = ok(
    await call(`/messaging/templates/${draft.id}/submit`, {
      user: owner.username,
      method: 'POST',
      body: { expectedRevision: draft.revision },
    })
  )
  const review = submitted.reviews.find((item) => item.status === 'pending')
  assert.ok(review)
  ok(
    await call(`/messaging/reviews/${review.id}/decision`, {
      method: 'POST',
      body: {
        expectedRevision: review.revision,
        decision: 'approve',
        reason: 'private approval reason',
      },
    })
  )
  const template = ok(
    await call(`/messaging/templates/${draft.id}`, { user: owner.username })
  )
  const job = ok(
    await call('/messaging/send-jobs', {
      user: owner.username,
      method: 'POST',
      body: {
        templateVersionId: template.activeVersionId,
        variables: { name: 'private recipient content' },
        audience: { scope: 'self' },
        deliveryModes: ['in-app'],
        scheduledAt: null,
      },
    })
  )
  const recipient = (
    await pool.query(
      "SELECT id FROM message_recipients WHERE tenant_id='tenant-a' AND job_id=$1 AND user_id=$2",
      [job.id, owner.id]
    )
  ).rows[0]
  assert.ok(recipient)
  return { job, recipient }
}

test('message background ownership follows recipient-to-job identity, not recipient or claimed detail actor', async () => {
  const owner = await makeUser({ permissions: await allCodes() })
  const { job, recipient } = await messageRecipientSource(owner)
  try {
    await assertBackgroundProjection({
      owner,
      module: 'messaging',
      action: 'delivery.failure',
      targetType: 'message-recipient',
      targetId: recipient.id,
      detail: { jobId: job.id, businessCode: 'DELIVERY_REJECTED', attempt: 1 },
      expectedDetail: {
        jobId: job.id,
        attempt: 1,
        businessCode: 'DELIVERY_REJECTED',
      },
    })
    const fakeTarget = await historical({
      actorId: null,
      module: 'messaging',
      action: 'delivery.failure',
      targetType: 'message-recipient',
      targetId: job.id,
      detail: { jobId: job.id, createdBy: owner.id },
    })
    assert.equal(
      ok(await query({ traceId: fakeTarget.traceId }, { user: owner.username }))
        .total,
      0
    )
  } finally {
    const current = ok(
      await call(`/messaging/send-jobs/${job.id}`, { user: owner.username })
    )
    ok(
      await call(`/messaging/send-jobs/${job.id}/cancel`, {
        user: owner.username,
        method: 'POST',
        body: { expectedRevision: current.revision },
      })
    )
  }
})

const timerSource = async (owner) => {
  const app = ok(
    await call('/application-center', {
      method: 'POST',
      body: {
        name: `Audit timer ${randomUUID()}`,
        code: `audit-timer-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
    })
  )
  const form = ok(await call(`/form-schemas/${app.formDraftId}`)),
    workflow = ok(await call(`/workflows/${app.workflowDraftId}`))
  const schema = {
    version: 4,
    nodes: [
      { id: 'start', type: 'start', name: 'start', config: {} },
      {
        id: 'wait',
        type: 'wait',
        name: 'wait',
        config: { delaySeconds: 3600 },
      },
      {
        id: 'approve',
        type: 'approval',
        name: 'approve',
        config: { approvers: ['a-manager-1'] },
      },
      { id: 'end', type: 'end', name: 'end', config: {} },
    ],
    edges: [
      ['start', 'wait'],
      ['wait', 'approve'],
      ['approve', 'end'],
    ].map(([source, target]) => ({
      id: `${source}-${target}`,
      source,
      target,
      label: '',
    })),
  }
  const saved = ok(
    await call(`/workflows/${workflow.id}`, {
      method: 'PUT',
      body: { schema, expectedRevision: workflow.revision },
    })
  )
  const release = ok(
    await call(`/applications/${app.id}/releases`, {
      method: 'POST',
      body: {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: saved.revision,
        expectedRevision: app.revision,
      },
    })
  )
  const draft = ok(
    await call('/business/records', {
      user: owner.username,
      method: 'POST',
      body: {
        applicationReleaseId: release.id,
        fields: {
          itemName: 'Private timer record',
          quantity: 1,
          unitPrice: '1.00',
          reason: 'Private timer reason',
        },
      },
    })
  )
  const record = ok(
    await call(`/business/records/${draft.id}/submit`, {
      user: owner.username,
      method: 'POST',
      body: { expectedRevision: draft.revision },
    })
  )
  const detail = ok(
    await call(`/business/records/${record.id}`, { user: owner.username })
  )
  const timer = detail.timers.find((item) => item.kind === 'resume')
  assert.ok(timer)
  return { record: detail, timer }
}

test('timer background ownership follows timer-instance-applicant and department descendants change current audit visibility', async () => {
  const owner = await makeUser({ permissions: await allCodes() })
  const { record, timer } = await timerSource(owner)
  try {
    const { fact, viewer } = await assertBackgroundProjection({
      owner,
      module: 'workflow',
      action: 'timer.failure',
      targetType: 'workflow-timer',
      targetId: timer.id,
      detail: {
        instanceId: record.instanceId,
        attempt: 1,
        businessCode: 'TIMER_TARGET_UNAVAILABLE',
      },
      expectedDetail: {
        instanceId: record.instanceId,
        attempt: 1,
        businessCode: 'TIMER_TARGET_UNAVAILABLE',
      },
    })
    await pool.query(
      "INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES('tenant-a',$1,'audit:read')",
      [viewer.roleId]
    )
    const root = randomUUID(),
      child = randomUUID(),
      grandchild = randomUUID(),
      unrelated = randomUUID()
    await pool.query(
      "INSERT INTO departments(tenant_id,id,department_name) VALUES('tenant-a',$1,$1),('tenant-a',$2,$2)",
      [root, unrelated]
    )
    await pool.query(
      "INSERT INTO departments(tenant_id,id,department_name,parent_id) VALUES('tenant-a',$1,$1,$2)",
      [child, root]
    )
    await pool.query(
      "INSERT INTO departments(tenant_id,id,department_name,parent_id) VALUES('tenant-a',$1,$1,$2)",
      [grandchild, child]
    )
    await pool.query(
      "UPDATE memberships SET department_id=$2 WHERE tenant_id='tenant-a' AND user_id=$1",
      [owner.id, grandchild]
    )
    await pool.query(
      "UPDATE memberships SET department_id=$2 WHERE tenant_id='tenant-a' AND user_id=$1",
      [viewer.id, unrelated]
    )
    await pool.query(
      "UPDATE role_member_scopes SET data_scope='department',field_permissions='[]'::jsonb WHERE role_id=$1",
      [viewer.roleId]
    )
    await pool.query(
      "INSERT INTO role_scope_departments(tenant_id,role_id,department_id) VALUES('tenant-a',$1,$2)",
      [viewer.roleId, root]
    )
    assert.equal(
      ok(await query({ traceId: fact.traceId }, { user: viewer.username }))
        .total,
      0
    )
    await pool.query(
      "UPDATE role_member_scopes SET data_scope='department-and-children' WHERE role_id=$1",
      [viewer.roleId]
    )
    const descendant = ok(
      await query({ traceId: fact.traceId }, { user: viewer.username })
    )
    assert.equal(descendant.total, 1)
    assert.deepEqual(descendant.list[0].operator, { id: null, name: null })
    await pool.query(
      "UPDATE departments SET parent_id=$2 WHERE tenant_id='tenant-a' AND id=$1",
      [child, unrelated]
    )
    assert.equal(
      ok(await query({ traceId: fact.traceId }, { user: viewer.username }))
        .total,
      0
    )
    await pool.query(
      "UPDATE departments SET parent_id=$2 WHERE tenant_id='tenant-a' AND id=$1",
      [child, root]
    )
    assert.equal(
      ok(await query({ traceId: fact.traceId }, { user: viewer.username }))
        .total,
      1
    )
    await pool.query(
      "DELETE FROM role_scope_departments WHERE tenant_id='tenant-a' AND role_id=$1",
      [viewer.roleId]
    )
    assert.equal(
      ok(await query({ traceId: fact.traceId }, { user: viewer.username }))
        .total,
      0
    )
    const fakeInstance = await historical({
      actorId: null,
      module: 'workflow',
      action: 'timer.failure',
      targetType: 'workflow-timer',
      targetId: record.instanceId,
      detail: { instanceId: record.instanceId, createdBy: owner.id },
    })
    assert.equal(
      ok(
        await query({ traceId: fakeInstance.traceId }, { user: owner.username })
      ).total,
      0
    )
  } finally {
    const current = ok(
      await call(`/business/records/${record.id}`, { user: owner.username })
    )
    ok(
      await call(`/business/records/${record.id}/withdraw`, {
        user: owner.username,
        method: 'POST',
        body: { expectedRevision: current.revision },
      })
    )
  }
})
const stopAuditApiChild = async (child, signal = 'SIGTERM') => {
  if (!auditApiChildren.has(child)) return [child.exitCode, child.signalCode]
  if (!child.pid) {
    auditApiChildren.delete(child)
    return [child.exitCode, child.signalCode]
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    auditApiChildren.delete(child)
    return [child.exitCode, child.signalCode]
  }
  const exited = once(child, 'exit')
  const force = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
  }, 5000)
  let deadline
  try {
    child.kill(signal)
    const outcome = await Promise.race([
      exited,
      new Promise((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error('Tracked isolated API process did not exit')),
          10000
        )
      }),
    ])
    auditApiChildren.delete(child)
    return outcome
  } finally {
    clearTimeout(force)
    clearTimeout(deadline)
  }
}
const launchAuditApiChild = async () => {
  assert.equal(isolated, true)
  assert.equal(process.env.APP_MODE, 'demo')
  assert.match(
    new URL(process.env.DATABASE_URL).pathname.slice(1),
    /^af_admin_tests_[a-z0-9]+_demo$/
  )
  // The static program creates its own pool. Response logs are routed to stderr;
  // stdout contains only the readiness address and never any environment/token.
  const script = `const {createServer}=require('./services/reference-api/dist/index.js');
    const ready=process.stdout.write.bind(process.stdout);
    process.stdout.write=process.stderr.write.bind(process.stderr);
    const app=createServer();
    process.once('SIGTERM',()=>{app.close().catch(()=>{process.exitCode=1})});
    app.listen({host:'127.0.0.1',port:0}).then(address=>ready(JSON.stringify({ready:true,address,pid:process.pid})+'\\n')).catch(()=>{process.stderr.write('Isolated audit API startup failed\\n');process.exitCode=1;app.close()});`
  const child = spawn(process.execPath, ['-e', script], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  auditApiChildren.add(child)
  child.stderr.resume()
  let buffer = '',
    timer
  try {
    const address = await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Isolated audit API readiness timed out')),
        10000
      )
      child.once('error', () =>
        reject(new Error('Isolated audit API failed to spawn'))
      )
      child.once('exit', () =>
        reject(new Error('Isolated audit API exited before readiness'))
      )
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        if (buffer.length > 4096) {
          reject(new Error('Unexpected isolated API readiness output'))
          return
        }
        const newline = buffer.indexOf('\n')
        if (newline < 0) return
        try {
          const message = JSON.parse(buffer.slice(0, newline))
          if (
            message.ready !== true ||
            message.pid !== child.pid ||
            !/^http:\/\/127\.0\.0\.1:\d+$/.test(message.address)
          )
            throw new Error('Invalid readiness')
          resolve(message.address)
        } catch {
          reject(new Error('Invalid isolated API readiness output'))
        }
      })
    })
    return { child, address }
  } catch (error) {
    await stopAuditApiChild(child)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

test('immutable authorized audit facts and current access survive actual API OS process replacement', async () => {
  const owner = await makeUser({
    name: `OS-process-audit-%_${randomUUID().slice(0, 8)}`,
  })
  const created = await createLeave(owner.username)
  const token = await login(owner.username),
    otherToken = await login('b-admin')
  const path = `/api/audit/events?${new URLSearchParams({
    version: '1',
    traceId: created.traceId,
    operatorName: owner.name,
    current: '1',
    pageSize: '20',
  })}`
  const http = async (address, identity = token, tenant = 'tenant-a') => {
    const response = await fetch(`${address}${path}`, {
      headers: { 'x-access-token': identity, 'x-tenant-id': tenant },
      signal: AbortSignal.timeout(10000),
    })
    return { status: response.status, ...(await response.json()) }
  }
  const projection = ({ queriedAt, ...facts }) => facts
  const children = []
  let revoked = false
  try {
    const first = await launchAuditApiChild()
    children.push(first.child)
    const original = ok(await http(first.address))
    assert.equal(original.total, 1)
    assert.equal(original.source, 'server')
    assert.equal(original.projectionVersion, 1)
    assert.equal(original.list[0].traceId, created.traceId)
    assert.equal(original.list[0].target.id, created.record.id)
    assert.equal(original.list[0].operator.id, owner.id)
    assert.equal(original.list[0].operator.name, owner.name)
    assert.deepEqual(original.list[0].visibleFields, [
      'operator.id',
      'operator.name',
    ])
    const stored = (
      await pool.query(
        "SELECT id,trace_id,created_at FROM audit_events WHERE tenant_id='tenant-a' AND trace_id=$1",
        [created.traceId]
      )
    ).rows[0]
    assert.equal(original.list[0].id, stored.id)
    assert.equal(original.list[0].occurredAt, stored.created_at.toISOString())
    assert.equal(
      JSON.stringify(original).includes('Private business reason'),
      false
    )
    const [, killedBy] = await stopAuditApiChild(first.child, 'SIGKILL')
    assert.equal(killedBy, 'SIGKILL')
    assert.equal(first.child.signalCode, 'SIGKILL')
    const second = await launchAuditApiChild()
    children.push(second.child)
    assert.notEqual(second.child.pid, first.child.pid)
    const reopened = ok(await http(second.address))
    assert.deepEqual(projection(reopened), projection(original))
    assert.ok(Date.parse(reopened.queriedAt) >= Date.parse(original.queriedAt))
    const foreign = ok(await http(second.address, otherToken, 'tenant-b'))
    assert.equal(foreign.total, 0)
    assert.deepEqual(foreign.list, [])
    const forgedContext = await http(second.address, token, 'tenant-b')
    assert.equal(forgedContext.status, 404)
    assert.equal(forgedContext.data, null)
    await pool.query(
      "DELETE FROM role_permissions WHERE tenant_id='tenant-a' AND role_id=$1 AND permission_code='audit:read'",
      [owner.roleId]
    )
    revoked = true
    const denied = await http(second.address)
    assert.equal(denied.status, 403)
    assert.equal(denied.data, null)
    const retained = (
      await pool.query(
        "SELECT id,trace_id,created_at FROM audit_events WHERE tenant_id='tenant-a' AND id=$1",
        [stored.id]
      )
    ).rows[0]
    assert.deepEqual(retained, stored)
  } finally {
    if (revoked)
      await pool.query(
        "INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES('tenant-a',$1,'audit:read') ON CONFLICT DO NOTHING",
        [owner.roleId]
      )
    const outcomes = await Promise.allSettled(
      children.map((child) => stopAuditApiChild(child))
    )
    const failed = outcomes.find((outcome) => outcome.status === 'rejected')
    if (failed) throw failed.reason
  }
})
