import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { before, after, test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migration from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import screens from '../../services/reference-api/dist/data-screens.js'
import support from '../../services/reference-api/dist/support.js'
import contracts from '@af-admin/contracts'

const pool = db.createPool()
const tokens = new Map()
const passwords = new Map()
const scopedUsers = []
const scopedRoles = []
const apiChildren = new Set()
let server,
  failure = '',
  originals = [],
  isolated = false
before(async () => {
  assert.equal(process.env.APP_MODE, 'demo')
  assert.match(
    (await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^af_admin_tests_[a-z0-9]+_demo$/,
    'Data-screen tests require an isolated generated database'
  )
  isolated = true
  await migration.migrate(pool)
  await seed.seedDemo(pool)
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin','a-employee')"
    )
  ).rows
  const codes = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((row) => row.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin','a-employee')",
    [JSON.stringify(codes)]
  )
  server = api.createServer(pool, (point) => {
    if (point === failure) {
      failure = ''
      throw new Error('Controlled screen transaction rollback')
    }
  })
  await server.ready()
})
after(async () => {
  const stoppedChildren = await Promise.allSettled(
    Array.from(apiChildren).map((child) => stopApiChild(child))
  )
  if (server) await server.close()
  if (isolated)
    for (const row of originals)
      await pool.query(
        'UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',
        [row.tenant_id, row.user_id, JSON.stringify(row.permissions)]
      )
  if (isolated) {
    await pool.query(
      "UPDATE memberships SET status='disabled',deleted_at=now() WHERE user_id=ANY($1::text[])",
      [scopedUsers]
    )
    await pool.query(
      "UPDATE roles SET status='disabled',deleted_at=now() WHERE id=ANY($1::text[])",
      [scopedRoles]
    )
  }
  await pool.end()
  const stopFailure = stoppedChildren.find(
    (result) => result.status === 'rejected'
  )
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
  { user = 'a-admin', method = 'GET', body, key = randomUUID() } = {}
) => {
  const response = await server.inject({
    method,
    url: `/api${path}`,
    headers: {
      'x-access-token': await login(user),
      'x-tenant-id': user.startsWith('b-') ? 'tenant-b' : 'tenant-a',
      'idempotency-key': key,
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
const metadata = (id) => ({ kind: 'metadata', id })
const fixture = async ({ coordinates = false } = {}) => {
  const application = ok(
    await call('/application-center', {
      method: 'POST',
      body: {
        name: `screen-source-${randomUUID()}`,
        code: `screen-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
    })
  )
  let form = ok(await call(`/form-schemas/${application.formDraftId}`))
  if (coordinates) {
    const schema = structuredClone(form.schema)
    schema.version = 2
    for (const axis of ['longitude', 'latitude']) {
      const widget = structuredClone(
        schema.widgetsConfig.find((item) => item.uid === 'itemName')
      )
      widget.uid = axis
      widget.name = axis
      widget.config.id = axis
      widget.config.label = axis
      widget.config.valueType = 'coordinate'
      widget.config.coordinateAxis = axis
      delete widget.config.defaultValue
      schema.widgetsConfig.push(widget)
    }
    form = ok(
      await call(`/form-schemas/${form.id}`, {
        method: 'PUT',
        body: { schema, expectedRevision: form.revision },
      })
    )
  }
  const workflow = ok(await call(`/workflows/${application.workflowDraftId}`))
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
  const catalogue = ok(
    await call(`/reporting/sources?applicationId=${application.id}`)
  ).list[0]
  const reports = {}
  for (const kind of ['trend', 'distribution', 'detail']) {
    const definition = ok(
      await call('/reporting/definitions', {
        method: 'POST',
        body: {
          schema: {
            version: 1,
            name: `screen-${kind}`,
            source: {
              kind: 'application-records',
              applicationId: application.id,
            },
            kind,
            metric: 'count',
            factTime: 'createdAt',
            timeZone: 'America/New_York',
            fields: [
              metadata('id'),
              metadata('status'),
              metadata('createdAt'),
              ...catalogue.visibleFields
                .filter((field) => field.reference.kind === 'field')
                .map((field) => field.reference),
            ],
          },
        },
      })
    )
    reports[kind] = ok(
      await call(`/reporting/definitions/${definition.id}/publish`, {
        method: 'POST',
        body: { expectedRevision: definition.revision },
      })
    )
  }
  const draft = {
    version: 1,
    title: `Screen ${randomUUID()}`,
    theme: { preset: 'dark', brandColor: '#165DFF' },
    sources: Object.entries(reports).map(([kind, report]) => ({
      sourceKey: kind,
      reportDefinitionVersionId: report.activeVersionId,
      dateWindow: 'today',
      statuses: [],
      refreshSeconds: 15,
    })),
    widgets: [
      {
        id: 'count',
        kind: 'metric',
        title: '数量',
        sourceKey: 'trend',
        layout: { x: 0, y: 0, width: 400, height: 200, z: 0 },
        props: { view: 'count', showTrend: true },
      },
      {
        id: 'distribution',
        kind: 'ranking',
        title: '业务状态',
        sourceKey: 'distribution',
        layout: { x: 400, y: 0, width: 400, height: 400, z: 1 },
        props: { view: 'distribution', limit: 5 },
      },
      {
        id: 'detail',
        kind: 'table',
        title: '明细',
        sourceKey: 'detail',
        layout: { x: 0, y: 400, width: 1000, height: 400, z: 2 },
        props: {
          view: 'detail',
          columns: [metadata('id'), metadata('status')],
          maxRows: 100,
          scrollingPaused: true,
        },
      },
    ],
    alert: {
      enabled: true,
      statuses: ['draft'],
      countThreshold: 1,
      scrollingPaused: true,
    },
  }
  return { application, release, reports, draft, catalogue }
}
const create = async (draft, options = {}) =>
  ok(
    await call('/data-screens/definitions', {
      method: 'POST',
      body: { draft },
      ...options,
    })
  )
const command = (screen, action, extra = {}, options = {}) =>
  call(`/data-screens/definitions/${screen.id}/${action}`, {
    method: 'POST',
    body: { expectedRevision: screen.revision, ...extra },
    ...options,
  })
const run = (screen, options = {}) =>
  call(`/data-screens/definitions/${screen.id}/run`, {
    method: 'POST',
    body: { releaseId: screen.activeReleaseId },
    ...options,
  })
const record = async (release, user = 'a-admin') =>
  ok(
    await call('/business/records', {
      user,
      method: 'POST',
      body: {
        applicationReleaseId: release.id,
        fields: {
          itemName: `screen-item-${randomUUID()}`,
          quantity: 1,
          unitPrice: '12.00',
          reason: '屏幕真实数据测试',
        },
      },
    })
  )

test('immutable screen publication, isolated copy, rollback, command replay and archived history', async () => {
  const f = await fixture(),
    key = randomUUID()
  let screen = await create(f.draft, { key })
  assert.equal((await create(f.draft, { key })).id, screen.id)
  assert.equal(
    (
      await call('/data-screens/definitions', {
        method: 'POST',
        key,
        body: { draft: { ...f.draft, title: 'different' } },
      })
    ).status,
    409
  )
  screen = ok(await command(screen, 'publish'))
  const first = screen.versions[0]
  assert.match(first.contentHash, /^[a-f0-9]{64}$/)
  assert.equal(first.sourceBindings.length, 3)
  assert.ok(
    first.sourceBindings.every(
      (binding) =>
        /^[a-f0-9]{64}$/.test(binding.reportContentHash) &&
        /^[a-f0-9]{64}$/.test(binding.sourceContentHash)
    )
  )
  const originalRevision = screen.revision
  screen = ok(
    await call(`/data-screens/definitions/${screen.id}`, {
      method: 'PUT',
      body: {
        draft: { ...screen.draft, title: 'draft-only-secret' },
        expectedRevision: screen.revision,
      },
    })
  )
  assert.equal(screen.activeReleaseId, first.id)
  assert.deepEqual(screen.versions[0], first)
  assert.equal(
    (
      await call(`/data-screens/definitions/${screen.id}`, {
        method: 'PUT',
        body: { draft: screen.draft, expectedRevision: originalRevision },
      })
    ).status,
    409
  )
  const copied = ok(
    await call(`/data-screens/definitions/${screen.id}/copy`, {
      method: 'POST',
      body: { draft: screen.draft },
    })
  )
  assert.notEqual(copied.id, screen.id)
  assert.equal(copied.activeReleaseId, null)
  assert.deepEqual(copied.versions, [])
  const copiedPublished = ok(await command(copied, 'publish'))
  assert.notEqual(copiedPublished.activeReleaseId, first.id)
  screen = ok(await command(screen, 'publish'))
  assert.equal(screen.versions.length, 2)
  const second = screen.activeReleaseId
  screen = ok(await command(screen, 'rollback', { releaseId: first.id }))
  assert.equal(screen.activeReleaseId, first.id)
  assert.equal(screen.draft.title, 'draft-only-secret')
  assert.equal(
    (
      await call(`/data-screens/definitions/${screen.id}/run`, {
        method: 'POST',
        body: { releaseId: second },
      })
    ).status,
    409
  )
  assert.equal(
    (
      await command(screen, 'rollback', {
        releaseId: copiedPublished.activeReleaseId,
      })
    ).status,
    404
  )
  await assert.rejects(
    pool.query(
      "UPDATE data_screen_releases SET content_hash=repeat('0',64) WHERE tenant_id='tenant-a' AND id=$1",
      [first.id]
    ),
    /immutable/
  )
  screen = ok(await command(screen, 'archive'))
  assert.equal(screen.archived, true)
  assert.equal(screen.enabled, false)
  assert.deepEqual(screen.allowedActions, [])
  assert.equal((await command(screen, 'toggle', { enabled: true })).status, 409)
  assert.equal((await run(screen)).status, 409)
  assert.equal(
    ok(await call(`/data-screens/definitions/${screen.id}`)).versions.length,
    2
  )
  assert.equal(
    (await call(`/data-screens/definitions/${screen.id}`, { user: 'b-admin' }))
      .status,
    404
  )
  assert.equal(
    (
      await call(`/data-screens/definitions/${screen.id}/copy`, {
        user: 'b-admin',
        method: 'POST',
        body: { draft: screen.draft },
      })
    ).status,
    404
  )
})

test('publication failure rolls back release, active pointer, revision, audit, event and idempotency record', async () => {
  const f = await fixture(),
    screen = await create(f.draft),
    key = randomUUID()
  const counts = async () =>
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM data_screen_releases WHERE tenant_id='tenant-a' AND definition_id=$1) AS releases,(SELECT count(*) FROM data_screen_events WHERE tenant_id='tenant-a' AND definition_id=$1) AS events,(SELECT count(*) FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1) AS audits",
        [screen.id]
      )
    ).rows[0]
  const before = await counts()
  failure = 'data-screen:published'
  assert.equal((await command(screen, 'publish', {}, { key })).status, 500)
  assert.deepEqual(await counts(), before)
  const reopened = ok(await call(`/data-screens/definitions/${screen.id}`))
  assert.equal(reopened.revision, screen.revision)
  assert.equal(reopened.activeReleaseId, null)
  const published = ok(await command(screen, 'publish', {}, { key }))
  const replay = ok(await command(screen, 'publish', {}, { key }))
  assert.equal(replay.activeReleaseId, published.activeReleaseId)
  assert.equal(replay.versions.length, 1)
})

test('real current-viewer rows, field projection, server date windows, disabled sources and denied query return no stale payload', async () => {
  const f = await fixture()
  await record(f.release, 'a-admin')
  await record(f.release, 'a-employee')
  const screen = ok(await command(await create(f.draft), 'publish'))
  const admin = ok(await run(screen)),
    employee = ok(await run(screen, { user: 'a-employee' }))
  assert.equal(admin.sources[0].result.total, 1)
  assert.equal(employee.sources[0].result.total, 1)
  assert.notEqual(
    admin.sources[0].result.rows[0].id,
    employee.sources[0].result.rows[0].id
  )
  for (const result of admin.sources) {
    assert.equal(result.status, 'ready')
    assert.ok(result.queriedAt)
    assert.ok(result.dataCutoffAt)
    assert.equal(result.actualQuery.timeZone, 'America/New_York')
    assert.equal(result.actualQuery.pageSize, 100)
    assert.equal(
      result.result.distribution.reduce((sum, point) => sum + point.count, 0),
      1
    )
    assert.equal(
      result.result.trend.reduce((sum, point) => sum + point.count, 0),
      1
    )
  }
  const employeePermissions = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE user_id='a-employee'"
    )
  ).rows[0].permissions
  try {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE user_id='a-employee'",
      [JSON.stringify(['screen:run', 'report:query', 'business:read:self'])]
    )
    const details = ok(
      await call(`/data-screens/definitions/${screen.id}`, {
        user: 'a-employee',
      })
    )
    assert.deepEqual(details.allowedActions, ['run'])
    assert.equal(details.versions.length, 1)
    const masked = ok(await run(screen, { user: 'a-employee' }))
    assert.equal(
      masked.sources[2].result.visibleFields.some(
        (field) => field.reference.kind === 'field'
      ),
      false
    )
    assert.equal(
      Object.keys(masked.sources[2].result.rows[0].values).some((key) =>
        key.startsWith('field:')
      ),
      false
    )
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE user_id='a-employee'",
      [JSON.stringify(['screen:run'])]
    )
    const denied = ok(await run(screen, { user: 'a-employee' }))
    assert.ok(
      denied.sources.every(
        (source) =>
          source.errorCode === 'permission-denied' &&
          source.actualQuery === null &&
          source.result === null &&
          source.dataCutoffAt === null
      )
    )
    assert.equal(
      (
        await call('/data-screens/definitions', {
          user: 'a-employee',
          method: 'POST',
          body: { draft: f.draft },
        })
      ).status,
      403
    )
    await pool.query(
      "UPDATE memberships SET permissions='[]'::jsonb WHERE user_id='a-employee'"
    )
    assert.equal(
      (await call('/data-screens/templates', { user: 'a-employee' })).status,
      403
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE user_id='a-employee'",
      [JSON.stringify(employeePermissions)]
    )
  }
  await pool.query(
    "UPDATE report_definitions SET enabled=false WHERE tenant_id='tenant-a' AND id=$1",
    [f.reports.trend.id]
  )
  const disabled = ok(await run(screen))
  assert.equal(disabled.sources[0].errorCode, 'source-disabled')
  assert.equal(disabled.sources[0].result, null)
  assert.equal(disabled.sources[1].status, 'ready')
  await pool.query(
    "UPDATE applications SET status='archived' WHERE tenant_id='tenant-a' AND id=$1",
    [f.application.id]
  )
  assert.ok(
    ok(await run(screen)).sources.every(
      (source) =>
        source.errorCode === 'source-disabled' && source.result === null
    )
  )
})

test('closed inputs, true templates, incompatible views and non-selected/coordinate fields cannot publish', async () => {
  const templates = ok(await call('/data-screens/templates'))
  assert.deepEqual(
    templates.map((value) => value.key),
    ['operations', 'sales', 'equipment']
  )
  for (const value of templates) {
    contracts.parseDataScreenTemplate(value)
    assert.equal(value.layout.length, value.bindingRecipe.length)
    assert.equal(
      JSON.stringify(value).includes('reportDefinitionVersionId'),
      false
    )
  }
  const f = await fixture()
  for (const draft of [
    { ...f.draft, version: 2 },
    { ...f.draft, rows: [] },
    { ...f.draft, url: 'https://untrusted.invalid' },
    {
      ...f.draft,
      widgets: [
        {
          ...f.draft.widgets[0],
          layout: { x: 1900, y: 0, width: 400, height: 200, z: 0 },
        },
      ],
    },
  ])
    assert.equal(
      (
        await call('/data-screens/definitions', {
          method: 'POST',
          body: { draft },
        })
      ).status,
      422
    )
  assert.equal(
    (
      await call('/data-screens/preview', {
        method: 'POST',
        body: { draft: f.draft, now: new Date().toISOString() },
      })
    ).status,
    422
  )
  assert.equal(
    (await call('/data-screens/definitions?current=Infinity')).status,
    422
  )
  const bad = structuredClone(f.draft)
  bad.widgets[0].sourceKey = 'detail'
  assert.equal((await command(await create(bad), 'publish')).status, 422)
  const unselected = structuredClone(f.draft)
  unselected.widgets[2].props.columns.push(metadata('revision'))
  assert.equal((await command(await create(unselected), 'publish')).status, 422)
  const badMap = structuredClone(f.draft)
  badMap.widgets[2] = {
    ...badMap.widgets[2],
    kind: 'map',
    props: {
      view: 'coordinates',
      longitudeField: metadata('id'),
      latitudeField: metadata('status'),
      maxPoints: 100,
    },
  }
  assert.equal((await command(await create(badMap), 'publish')).status, 422)
  const unknownSource = structuredClone(f.draft)
  unknownSource.sources[0].reportDefinitionVersionId = randomUUID()
  assert.equal(
    (
      await call('/data-screens/definitions', {
        method: 'POST',
        body: { draft: unknownSource },
      })
    ).status,
    404
  )
})

test('all four date windows are derived from PostgreSQL current time in the report timezone', async () => {
  const f = await fixture()
  const expected = (
    await pool.query(
      "WITH d AS (SELECT (statement_timestamp() AT TIME ZONE 'America/New_York')::date AS day) SELECT to_char(day,'YYYY-MM-DD') AS today,to_char(day-6,'YYYY-MM-DD') AS seven,to_char(date_trunc('month',day),'YYYY-MM-DD') AS month,to_char(date_trunc('month',day)-interval '1 month','YYYY-MM-DD') AS previous,to_char(date_trunc('month',day)-interval '1 day','YYYY-MM-DD') AS previous_end FROM d"
    )
  ).rows[0]
  const ranges = {
    'today': [expected.today, expected.today],
    'last-7-days': [expected.seven, expected.today],
    'current-month': [expected.month, expected.today],
    'previous-month': [expected.previous, expected.previous_end],
  }
  for (const [window, [from, to]] of Object.entries(ranges)) {
    const draft = structuredClone(f.draft)
    draft.sources.forEach((source) => {
      source.dateWindow = window
    })
    const preview = ok(
      await call('/data-screens/preview', { method: 'POST', body: { draft } })
    )
    assert.ok(preview.sources.every((source) => source.status === 'empty'))
    assert.deepEqual(preview.sources[0].actualQuery.dateRange, { from, to })
  }
})

test('replayed writes require current screen permission and API recreation preserves published state', async () => {
  const f = await fixture(),
    key = randomUUID(),
    screen = await create(f.draft, { user: 'a-employee', key })
  const permissions = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE user_id='a-employee'"
    )
  ).rows[0].permissions
  try {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE user_id='a-employee'",
      [JSON.stringify(['screen:run'])]
    )
    assert.equal(
      (
        await call('/data-screens/definitions', {
          user: 'a-employee',
          method: 'POST',
          key,
          body: { draft: f.draft },
        })
      ).status,
      403
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE user_id='a-employee'",
      [JSON.stringify(permissions)]
    )
  }
  const published = ok(await command(screen, 'publish'))
  await server.close()
  server = api.createServer(pool)
  await server.ready()
  const reopened = ok(await call(`/data-screens/definitions/${screen.id}`))
  assert.equal(reopened.activeReleaseId, published.activeReleaseId)
  assert.deepEqual(reopened.versions, published.versions)
  assert.equal(ok(await run(reopened)).sources.length, 3)
})

test('run-only reader sees only active layout, 100-row bounded results and current screen disable', async () => {
  const f = await fixture()
  let screen = ok(await command(await create(f.draft), 'publish'))
  const activeTitle = screen.draft.title
  screen = ok(
    await call(`/data-screens/definitions/${screen.id}`, {
      method: 'PUT',
      body: {
        expectedRevision: screen.revision,
        draft: { ...screen.draft, title: 'secret unpublished layout' },
      },
    })
  )
  const permissions = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE user_id='a-employee'"
    )
  ).rows[0].permissions
  try {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE user_id='a-employee'",
      [
        JSON.stringify([
          'screen:run',
          'report:query',
          'business:read:self',
          'business:create',
        ]),
      ]
    )
    const visible = ok(
      await call(`/data-screens/definitions/${screen.id}`, {
        user: 'a-employee',
      })
    )
    assert.equal(visible.draft.title, activeTitle)
    assert.equal(visible.versions.length, 1)
    const list = ok(
      await call(
        `/data-screens/definitions?keyword=${encodeURIComponent(
          'secret unpublished layout'
        )}`,
        { user: 'a-employee' }
      )
    )
    assert.equal(
      list.list.some((value) => value.id === screen.id),
      false
    )
    for (let i = 0; i < 102; i += 1) await record(f.release, 'a-employee')
    const source = ok(await run(screen, { user: 'a-employee' })).sources[2]
    assert.equal(source.result.total, 102)
    assert.equal(source.result.rows.length, 100)
    assert.equal(source.actualQuery.current, 1)
    assert.equal(
      source.result.distribution.reduce((sum, point) => sum + point.count, 0),
      102
    )
    assert.ok(
      source.result.rows.every((row) =>
        Object.values(row.values).every((value) => typeof value !== 'object')
      )
    )
    screen = ok(await command(screen, 'toggle', { enabled: false }))
    assert.equal((await run(screen, { user: 'a-employee' })).status, 409)
    assert.equal(
      (
        await call(`/data-screens/definitions/${screen.id}`, {
          user: 'a-employee',
        })
      ).status,
      404
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE user_id='a-employee'",
      [JSON.stringify(permissions)]
    )
  }
})

test('same key concurrency commits one command; different keys with stale revisions commit at most once', async () => {
  const f = await fixture(),
    screen = await create(f.draft),
    key = randomUUID()
  const identical = await Promise.all([
    command(screen, 'publish', {}, { key }),
    command(screen, 'publish', {}, { key }),
  ])
  assert.equal(
    ok(identical[0]).activeReleaseId,
    ok(identical[1]).activeReleaseId
  )
  const current = ok(identical[0])
  const competing = await Promise.all([
    command(current, 'toggle', { enabled: false }),
    command(current, 'toggle', { enabled: false }),
  ])
  assert.deepEqual(
    competing.map((response) => response.status).sort(),
    [200, 409]
  )
  const row = (
    await pool.query(
      "SELECT count(*) AS count FROM data_screen_events WHERE tenant_id='tenant-a' AND definition_id=$1 AND action='published'",
      [screen.id]
    )
  ).rows[0]
  assert.equal(Number(row.count), 1)
})

const scopedUser = async (permissions) => {
  const username = `screen-reader-${randomUUID().slice(0, 8)}`
  const password = 'Screen-private-test-2026'
  const user = ok(
    await call('/system/users', {
      method: 'POST',
      body: {
        username,
        name: '独立大屏读者',
        phone: '',
        email: '',
        initialPassword: password,
        status: 'enabled',
      },
    })
  )
  scopedUsers.push(user.id)
  passwords.set(username, password)
  const role = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: '大屏范围测试',
        roleKey: `screen-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions,
      },
    })
  )
  scopedRoles.push(role.id)
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

test('independent role and department scopes gate list, direct reads, runs and cached write responses; fields remain viewer-owned', async () => {
  const f = await fixture()
  const common = [
    'screen:run',
    'report:query',
    'report:field:business',
    'business:read:self',
    'business:create',
  ]
  const publisher = await scopedUser([
    ...common,
    'screen:create',
    'screen:publish',
  ])
  const viewer = await scopedUser([...common, 'screen:list', 'screen:update'])
  const creatorDepartment = `screen-dept-${randomUUID()}`,
    otherDepartment = `screen-dept-${randomUUID()}`
  await pool.query(
    "INSERT INTO departments(tenant_id,id,department_name) VALUES('tenant-a',$1,$1),('tenant-a',$2,$2)",
    [creatorDepartment, otherDepartment]
  )
  await pool.query(
    "UPDATE memberships SET department_id=$2 WHERE tenant_id='tenant-a' AND user_id=$1",
    [publisher.id, creatorDepartment]
  )
  await pool.query(
    "UPDATE memberships SET department_id=$2 WHERE tenant_id='tenant-a' AND user_id=$1",
    [viewer.id, otherDepartment]
  )
  const publisherRecord = await record(f.release, publisher.username)
  const viewerRecord = await record(f.release, viewer.username)
  let screen = ok(
    await command(
      await create(f.draft, { user: publisher.username }),
      'publish',
      {},
      { user: publisher.username }
    )
  )
  const key = randomUUID(),
    expectedRevision = screen.revision
  const updateBody = {
    expectedRevision,
    draft: { ...screen.draft, title: `scope-secret-${randomUUID()}` },
  }
  screen = ok(
    await call(`/data-screens/definitions/${screen.id}`, {
      user: viewer.username,
      method: 'PUT',
      key,
      body: updateBody,
    })
  )
  const detail = ok(await run(screen, { user: viewer.username })).sources[2]
    .result
  assert.deepEqual(
    detail.rows.map((row) => row.id),
    [viewerRecord.id]
  )
  assert.equal(
    detail.rows.some((row) => row.id === publisherRecord.id),
    false
  )
  assert.ok(
    detail.visibleFields.some((field) => field.reference.kind === 'field')
  )
  await pool.query(
    "DELETE FROM role_permissions WHERE tenant_id='tenant-a' AND role_id=$1 AND permission_code='report:field:business'",
    [viewer.roleId]
  )
  const masked = ok(await run(screen, { user: viewer.username })).sources[2]
    .result
  assert.equal(masked.total, 1)
  assert.equal(
    masked.visibleFields.some((field) => field.reference.kind === 'field'),
    false
  )
  assert.ok(
    masked.rows.every((row) =>
      Object.keys(row.values).every((name) => !name.startsWith('field:'))
    )
  )
  const assertScopeHidden = async () => {
    const listed = ok(
      await call('/data-screens/definitions', { user: viewer.username })
    )
    assert.equal(
      listed.list.some((item) => item.id === screen.id),
      false
    )
    assert.equal(
      (
        await call(`/data-screens/definitions/${screen.id}`, {
          user: viewer.username,
        })
      ).status,
      404
    )
    assert.equal((await run(screen, { user: viewer.username })).status, 404)
    assert.equal(
      (
        await call(`/data-screens/definitions/${screen.id}`, {
          user: viewer.username,
          method: 'PUT',
          key,
          body: updateBody,
        })
      ).status,
      404
    )
  }
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='self' WHERE role_id=$1",
    [viewer.roleId]
  )
  await assertScopeHidden()
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='department' WHERE role_id=$1",
    [viewer.roleId]
  )
  await pool.query(
    "INSERT INTO role_scope_departments(tenant_id,role_id,department_id) VALUES('tenant-a',$1,$2)",
    [viewer.roleId, creatorDepartment]
  )
  assert.equal(
    ok(
      await call(`/data-screens/definitions/${screen.id}`, {
        user: viewer.username,
      })
    ).id,
    screen.id
  )
  assert.equal(
    ok(
      await call(`/data-screens/definitions/${screen.id}`, {
        user: viewer.username,
        method: 'PUT',
        key,
        body: updateBody,
      })
    ).id,
    screen.id
  )
  await pool.query(
    "DELETE FROM role_scope_departments WHERE tenant_id='tenant-a' AND role_id=$1",
    [viewer.roleId]
  )
  // With no selected root, the viewer belongs to the other department.
  await assertScopeHidden()
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='tenant' WHERE role_id=$1",
    [viewer.roleId]
  )
  await pool.query(
    "UPDATE roles SET status='disabled' WHERE tenant_id='tenant-a' AND id=$1",
    [viewer.roleId]
  )
  assert.equal(
    (await call('/data-screens/definitions', { user: viewer.username })).status,
    403
  )
  assert.equal((await run(screen, { user: viewer.username })).status, 403)
  assert.equal(
    (
      await call(`/data-screens/definitions/${screen.id}`, {
        user: viewer.username,
      })
    ).status,
    404
  )
  assert.equal(
    (
      await call(`/data-screens/definitions/${screen.id}`, {
        user: viewer.username,
        method: 'PUT',
        key,
        body: updateBody,
      })
    ).status,
    403
  )
})

test('typed coordinate map binds correct axes and returns only real signed values; swapped axes fail preview and publish', async () => {
  const f = await fixture({ coordinates: true })
  const longitude = f.catalogue.visibleFields.find(
    (field) => field.coordinateAxis === 'longitude'
  )
  const latitude = f.catalogue.visibleFields.find(
    (field) => field.coordinateAxis === 'latitude'
  )
  assert.ok(longitude)
  assert.ok(latitude)
  const draft = structuredClone(f.draft)
  draft.widgets[2] = {
    ...draft.widgets[2],
    kind: 'map',
    props: {
      view: 'coordinates',
      longitudeField: longitude.reference,
      latitudeField: latitude.reference,
      maxPoints: 100,
    },
  }
  const screen = ok(await command(await create(draft), 'publish'))
  const item = ok(
    await call('/business/records', {
      method: 'POST',
      body: {
        applicationReleaseId: f.release.id,
        fields: {
          itemName: '实际经纬度',
          quantity: 1,
          unitPrice: '12.00',
          reason: '真实录入坐标',
          longitude: '-73.985656',
          latitude: '-33.868812',
        },
      },
    })
  )
  const detail = ok(await run(screen)).sources[2]
  assert.equal(detail.status, 'ready')
  assert.equal(detail.result.rows[0].id, item.id)
  assert.equal(detail.result.rows[0].values[longitude.key], '-73.985656')
  assert.equal(detail.result.rows[0].values[latitude.key], '-33.868812')
  const invalid = structuredClone(draft)
  invalid.widgets[2].props.longitudeField = latitude.reference
  invalid.widgets[2].props.latitudeField = longitude.reference
  assert.equal((await command(await create(invalid), 'publish')).status, 422)
  const rejected = ok(
    await call('/data-screens/preview', {
      method: 'POST',
      body: { draft: invalid },
    })
  ).sources[2]
  assert.equal(rejected.status, 'error')
  assert.equal(rejected.errorCode, 'query-failed')
  assert.equal(rejected.result, null)
  assert.equal(rejected.actualQuery, null)
  // Simulate legacy persisted corruption: it must become null, never a fabricated map point.
  await pool.query(
    "UPDATE business_records SET fields=fields||$2::jsonb WHERE tenant_id='tenant-a' AND id=$1",
    [item.id, JSON.stringify({ longitude: '181', latitude: '-91' })]
  )
  const invalidValues = ok(await run(screen)).sources[2].result.rows[0].values
  assert.equal(invalidValues[longitude.key], null)
  assert.equal(invalidValues[latitude.key], null)
})

test('screen release digest binds exact canonical bytes and rejects forged SQL payloads', async () => {
  const f = await fixture()
  const screen = ok(await command(await create(f.draft), 'publish'))
  const fixed = (
    await pool.query(
      "SELECT * FROM data_screen_releases WHERE tenant_id='tenant-a' AND id=$1",
      [screen.activeReleaseId]
    )
  ).rows[0]
  const payload = {
    snapshot: fixed.schema_snapshot,
    sourceBindings: fixed.source_bindings,
  }
  const hashBytes = (value) =>
    createHash('sha256').update(value, 'utf8').digest('hex')
  assert.equal(fixed.content_canonical, support.contentCanonical(payload))
  assert.equal(fixed.content_hash, hashBytes(fixed.content_canonical))
  assert.equal(fixed.content_hash, support.contentHash(payload))
  assert.equal(screen.versions[0].contentHash, fixed.content_hash)
  assert.deepEqual(screens.assertDataScreenReleaseIntegrity(fixed), fixed)
  const insert = `INSERT INTO data_screen_releases(tenant_id,id,definition_id,version,draft_revision,schema_snapshot,source_bindings,content_canonical,content_hash,published_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`
  const values = (canonical, hash) => [
    fixed.tenant_id,
    randomUUID(),
    fixed.definition_id,
    fixed.version + 1,
    fixed.draft_revision,
    JSON.stringify(fixed.schema_snapshot),
    JSON.stringify(fixed.source_bindings),
    canonical,
    hash,
    fixed.published_by,
  ]
  await assert.rejects(
    pool.query(insert, values(fixed.content_canonical, '0'.repeat(64))),
    (error) => error.code === '23514'
  )
  const wrongPayload = support.contentCanonical({
    ...payload,
    snapshot: { ...payload.snapshot, title: 'forged-content' },
  })
  await assert.rejects(
    pool.query(insert, values(wrongPayload, hashBytes(wrongPayload))),
    (error) => error.code === '23514'
  )
  const wrongBindings = support.contentCanonical({
    ...payload,
    sourceBindings: [],
  })
  await assert.rejects(
    pool.query(insert, values(wrongBindings, hashBytes(wrongBindings))),
    (error) => error.code === '23514'
  )
  const changedHash = { ...fixed, content_hash: '0'.repeat(64) }
  assert.throws(
    () => screens.assertDataScreenReleaseIntegrity(changedHash),
    (error) =>
      error.status === 409 && error.businessCode === 'SCREEN_RELEASE_CORRUPT'
  )
  // PostgreSQL verifies semantic content and the exact byte digest. A semantically
  // equivalent, noncanonical string is then rejected by every API release reader.
  // Keep this adversarial fixture inside a rollback so subsequent suites see no corruption.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const pretty = JSON.stringify(payload, null, 2)
    const noncanonical = (
      await client.query(insert, values(pretty, hashBytes(pretty)))
    ).rows[0]
    assert.throws(
      () => screens.assertDataScreenReleaseIntegrity(noncanonical),
      (error) =>
        error.status === 409 && error.businessCode === 'SCREEN_RELEASE_CORRUPT'
    )
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
  assert.equal(
    ok(await call(`/data-screens/definitions/${screen.id}`)).versions.length,
    1
  )
  assert.equal(ok(await run(screen)).sources.length, 3)
})

const stopApiChild = async (child, signal = 'SIGTERM') => {
  if (!apiChildren.has(child)) return [child.exitCode, child.signalCode]
  if (!child.pid) {
    apiChildren.delete(child)
    return [child.exitCode, child.signalCode]
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    apiChildren.delete(child)
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
    apiChildren.delete(child)
    return outcome
  } finally {
    clearTimeout(force)
    clearTimeout(deadline)
  }
}
const launchApiChild = async () => {
  // The static program creates its own pool. Response logs are routed to stderr;
  // stdout contains only the readiness address and never any environment/token.
  const script = `const {createServer}=require('./services/reference-api/dist/index.js');
    const ready=process.stdout.write.bind(process.stdout);
    process.stdout.write=process.stderr.write.bind(process.stderr);
    const app=createServer();
    process.once('SIGTERM',()=>{app.close().catch(()=>{process.exitCode=1})});
    app.listen({host:'127.0.0.1',port:0}).then(address=>ready(JSON.stringify({ready:true,address,pid:process.pid})+'\\n')).catch(()=>{process.stderr.write('Isolated screen API startup failed\\n');process.exitCode=1;app.close()});`
  const child = spawn(process.execPath, ['-e', script], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  apiChildren.add(child)
  child.stderr.resume()
  let buffer = '',
    timer
  try {
    const address = await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Isolated screen API readiness timed out')),
        10000
      )
      child.once('error', () =>
        reject(new Error('Isolated screen API failed to spawn'))
      )
      child.once('exit', () =>
        reject(new Error('Isolated screen API exited before readiness'))
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
    await stopApiChild(child)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

test('published layout, hashes and authorized real rows survive replacement of the actual API OS process', async () => {
  const f = await fixture()
  const ownRecord = await record(f.release)
  await record(f.release, 'a-employee')
  const screen = ok(await command(await create(f.draft), 'publish'))
  const token = await login('a-admin'),
    otherToken = await login('b-admin')
  const http = async (address, path, body, otherTenant = false) => {
    const response = await fetch(`${address}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-access-token': otherTenant ? otherToken : token,
        'x-tenant-id': otherTenant ? 'tenant-b' : 'tenant-a',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    })
    return { status: response.status, ...(await response.json()) }
  }
  const stableRun = (result) => ({
    ...result,
    sources: result.sources.map(
      ({ queriedAt, dataCutoffAt, result: data, ...source }) => ({
        ...source,
        result:
          data &&
          (({ queriedAt: queryTime, dataCutoffAt: cutoff, ...stable }) =>
            stable)(data),
      })
    ),
  })
  const readPath = `/data-screens/definitions/${screen.id}`
  const runPath = `${readPath}/run`
  const runBody = { releaseId: screen.activeReleaseId }
  const children = []
  const permissions = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'"
    )
  ).rows[0].permissions
  try {
    const first = await launchApiChild()
    children.push(first.child)
    assert.ok(first.child.pid > 0)
    const initial = ok(await http(first.address, readPath))
    assert.deepEqual(initial, screen)
    const firstRun = ok(await http(first.address, runPath, runBody))
    for (const source of firstRun.sources) {
      assert.equal(source.status, 'ready')
      assert.equal(source.result.total, 1)
      assert.deepEqual(
        source.result.rows.map((row) => row.id),
        [ownRecord.id]
      )
      assert.ok(source.queriedAt && source.dataCutoffAt)
    }
    const [, signal] = await stopApiChild(first.child, 'SIGKILL')
    assert.equal(signal, 'SIGKILL')
    assert.equal(first.child.signalCode, 'SIGKILL')
    const second = await launchApiChild()
    children.push(second.child)
    assert.notEqual(second.child.pid, first.child.pid)
    const reopened = ok(await http(second.address, readPath))
    assert.deepEqual(reopened, initial)
    assert.equal(reopened.activeReleaseId, screen.activeReleaseId)
    assert.deepEqual(
      reopened.versions.map((version) => ({
        snapshot: version.snapshot,
        hash: version.contentHash,
        bindings: version.sourceBindings,
      })),
      initial.versions.map((version) => ({
        snapshot: version.snapshot,
        hash: version.contentHash,
        bindings: version.sourceBindings,
      }))
    )
    const resumed = ok(await http(second.address, runPath, runBody))
    assert.deepEqual(stableRun(resumed), stableRun(firstRun))
    assert.ok(
      resumed.sources.every(
        (source, index) =>
          Date.parse(source.queriedAt) >=
          Date.parse(firstRun.sources[index].queriedAt)
      )
    )
    assert.equal(
      (await http(second.address, readPath, undefined, true)).status,
      404
    )
    assert.equal(
      (await http(second.address, runPath, runBody, true)).status,
      404
    )
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",
      [
        JSON.stringify(
          permissions.filter((permission) => permission !== 'report:query')
        ),
      ]
    )
    const revoked = ok(await http(second.address, runPath, runBody))
    assert.ok(
      revoked.sources.every(
        (source) =>
          source.errorCode === 'permission-denied' &&
          source.result === null &&
          source.actualQuery === null &&
          source.dataCutoffAt === null
      )
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",
      [JSON.stringify(permissions)]
    )
    const outcomes = await Promise.allSettled(
      children.map((child) => stopApiChild(child))
    )
    const failed = outcomes.find((outcome) => outcome.status === 'rejected')
    if (failed) throw failed.reason
  }
})

// Keep this last: the deliberately invalid immutable release is confined to this
// fresh fixture in the disposable database and remains as blocked history.
test('HTTP reads, lists, runs and rollback reject corrupt release integrity without leaking data or committing state', async () => {
  const f = await fixture()
  const screen = ok(await command(await create(f.draft), 'publish'))
  const fixed = (
    await pool.query(
      "SELECT * FROM data_screen_releases WHERE tenant_id='tenant-a' AND id=$1",
      [screen.activeReleaseId]
    )
  ).rows[0]
  const corruptId = randomUUID()
  const pretty = JSON.stringify(
    { snapshot: fixed.schema_snapshot, sourceBindings: fixed.source_bindings },
    null,
    2
  )
  const hash = createHash('sha256').update(pretty, 'utf8').digest('hex')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO data_screen_releases(tenant_id,id,definition_id,version,draft_revision,schema_snapshot,source_bindings,content_canonical,content_hash,published_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        fixed.tenant_id,
        corruptId,
        fixed.definition_id,
        fixed.version + 1,
        fixed.draft_revision,
        JSON.stringify(fixed.schema_snapshot),
        JSON.stringify(fixed.source_bindings),
        pretty,
        hash,
        fixed.published_by,
      ]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  const address = await server.listen({ host: '127.0.0.1', port: 0 })
  const token = await login('a-admin')
  const http = async (path, body) => {
    const response = await fetch(`${address}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-access-token': token,
        'x-tenant-id': 'tenant-a',
        'idempotency-key': randomUUID(),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, ...(await response.json()) }
  }
  const denied = (response) => {
    assert.equal(response.status, 409)
    assert.equal(response.businessCode, 'SCREEN_RELEASE_CORRUPT')
    assert.equal(response.data, null)
    assert.equal(
      JSON.stringify(response).includes(fixed.content_canonical),
      false
    )
    assert.equal(JSON.stringify(response).includes(pretty), false)
    assert.equal(response.message, '大屏发布快照校验失败')
  }
  const state = async () =>
    (
      await pool.query(
        `SELECT d.active_release_id,d.revision,
    (SELECT count(*) FROM data_screen_events e WHERE e.tenant_id=d.tenant_id AND e.definition_id=d.id) AS events,
    (SELECT count(*) FROM audit_events a WHERE a.tenant_id=d.tenant_id AND a.target_id=d.id AND a.result='success') AS audits
    FROM data_screen_definitions d WHERE d.tenant_id='tenant-a' AND d.id=$1`,
        [screen.id]
      )
    ).rows[0]
  try {
    denied(await http(`/data-screens/definitions/${screen.id}`))
    denied(
      await http(
        `/data-screens/definitions?keyword=${encodeURIComponent(
          screen.draft.title
        )}`
      )
    )
    const beforeRollback = await state()
    denied(
      await http(`/data-screens/definitions/${screen.id}/rollback`, {
        expectedRevision: screen.revision,
        releaseId: corruptId,
      })
    )
    assert.deepEqual(await state(), beforeRollback)
    await pool.query(
      "UPDATE data_screen_definitions SET active_release_id=$2 WHERE tenant_id='tenant-a' AND id=$1",
      [screen.id, corruptId]
    )
    const beforeRun = await state()
    denied(
      await http(`/data-screens/definitions/${screen.id}/run`, {
        releaseId: corruptId,
      })
    )
    assert.deepEqual(await state(), beforeRun)
  } finally {
    // Restore the pointer and disable this fixture. Immutable bad history remains
    // intentionally unreadable until the enclosing random database is discarded.
    await pool.query(
      "UPDATE data_screen_definitions SET active_release_id=$2,enabled=false WHERE tenant_id='tenant-a' AND id=$1",
      [screen.id, screen.activeReleaseId]
    )
  }
})
