// Node maintenance executes bounded dependent API commands in order.
/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue, default-param-last */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import * as contracts from '@af-admin/contracts'

const API_ORIGIN = 'http://127.0.0.1:10890'
const DATABASE_NAME = 'af_admin_full_c1b35e6ead774464986c87ea453d847e_demo'
const OUTPUT_ROOT =
  'test-results/full-product/data-screens-20261013/demo-fixtures'
const kinds = ['operations', 'sales', 'equipment']
const reportKinds = ['trend', 'distribution', 'detail']
const titles = {
  operations: '运营工单',
  sales: '销售订单',
  equipment: '设备领用',
}
const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')
const metadata = (id) => ({ kind: 'metadata', id })
const input = (uid, label, config = {}) => ({
  uid,
  type: 'input',
  name: label,
  config: { id: uid, label, required: true, maxLength: 100, ...config },
})

export const syntheticSourceSchema = (kind) => {
  assert.ok(['operations', 'sales'].includes(kind))
  const widgetsConfig =
    kind === 'operations'
      ? [
          input('ticketNo', '工单编号'),
          input('taskTitle', '任务标题'),
          input('serviceQueue', '服务队列'),
          input('priority', '工单优先级'),
          input('estimatedHours', '预计工时', {
            valueType: 'integer',
            min: 1,
            max: 100,
          }),
        ]
      : [
          input('orderNo', '订单编号'),
          input('customerName', '合成客户'),
          input('productName', '商品名称'),
          input('quantity', '订购数量', {
            valueType: 'integer',
            min: 1,
            max: 10000,
          }),
          input('unitPrice', '销售单价（元）', {
            valueType: 'decimal',
            min: 0.01,
            max: 100000,
          }),
          input('longitude', '交付经度', {
            required: false,
            valueType: 'coordinate',
            coordinateAxis: 'longitude',
          }),
          input('latitude', '交付纬度', {
            required: false,
            valueType: 'coordinate',
            coordinateAxis: 'latitude',
          }),
        ]
  return contracts.parseForm({
    version: 2,
    formConfig: {
      size: 'medium',
      layout: 'vertical',
      labelAlign: 'right',
      ...(kind === 'sales'
        ? {
            computedFields: [
              {
                id: 'totalAmount',
                operation: 'quantity-times-price',
                quantity: 'quantity',
                price: 'unitPrice',
              },
            ],
          }
        : {}),
    },
    dataSources: [],
    widgetsConfig,
  })
}

// Deliberately synthetic business facts, persisted through the actual record API.
// Coordinates describe six fictional delivery locations, not people or real customer addresses.
export const syntheticRecords = (kind, suffix) => {
  assert.ok(kinds.includes(kind))
  if (kind === 'operations')
    return ['巡检任务', '备份验证', '访问申请', '服务排障', '发布检查'].map(
      (task, index) => ({
        ticketNo: `DEMO-WO-${suffix}-${index + 1}`,
        taskTitle: `合成运营${task}`,
        serviceQueue: index % 2 ? '合成应用服务组' : '合成基础服务组',
        priority: index % 2 ? '普通' : '紧急',
        estimatedHours: index + 1,
      })
    )
  if (kind === 'equipment')
    return ['合成显示器', '合成键盘', '合成扩展坞', '合成测试终端'].map(
      (itemName, index) => ({
        itemName,
        quantity: index + 1,
        unitPrice: ['1299.00', '199.50', '359.90', '2499.00'][index],
        reason: `明确合成的设备领用演示 ${suffix}`,
      })
    )
  return [
    ['-73.985656', '40.748433', '199.90', 2],
    ['-0.127758', '51.507351', '88.25', 3],
    ['151.2093', '-33.868812', '349.99', 1],
    ['-46.633309', '-23.55052', '12.50', 8],
    ['18.424055', '-33.924869', '48.80', 5],
    ['139.691706', '35.689487', '1299.00', 2],
  ].map(([longitude, latitude, unitPrice, quantity], index) => ({
    orderNo: `DEMO-SO-${suffix}-${index + 1}`,
    customerName: `合成客户${index + 1}`,
    productName: `合成商品${index + 1}`,
    quantity,
    unitPrice,
    longitude,
    latitude,
  }))
}

const closedKeys = (value, allowed, label) => {
  assert.ok(
    value && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`
  )
  assert.ok(
    Object.keys(value).every((key) => allowed.includes(key)),
    `${label} contains unknown future fields`
  )
}
const registered = (fields, reference) => {
  const found = fields.find(
    (field) =>
      field.reference.kind === reference.kind &&
      field.reference.id === reference.id
  )
  assert.ok(
    found,
    `Missing current registered field: ${reference.kind}:${reference.id}`
  )
  return found.reference
}

export const bindDemoScreenTemplate = (template, reports, fields, title) => {
  closedKeys(
    template,
    ['version', 'key', 'name', 'theme', 'layout', 'bindingRecipe'],
    'template'
  )
  assert.equal(template.version, 1)
  const parsed = contracts.parseDataScreenTemplate(template)
  const requiredColumns = {
    recordId: metadata('id'),
    status: metadata('status'),
    createdAt: metadata('createdAt'),
  }
  const widgets = parsed.layout.map((item) => {
    const recipe = parsed.bindingRecipe.find(
      (binding) => binding.widgetKey === item.widgetKey
    )
    assert.ok(
      recipe && reports[recipe.sourceSlot],
      'Template recipe must bind an actual published report slot'
    )
    let props
    if (item.kind === 'metric' && recipe.view === 'count')
      props = { view: 'count', showTrend: true }
    else if (item.kind === 'line' && recipe.view === 'trend')
      props = { view: 'trend', showValues: true }
    else if (item.kind === 'pie' && recipe.view === 'distribution')
      props = { view: 'distribution', showLegend: true }
    else if (item.kind === 'ranking' && recipe.view === 'distribution')
      props = { view: 'distribution', limit: 5 }
    else if (item.kind === 'table' && recipe.view === 'detail') {
      const columns = recipe.columnSlots.map((slot) => {
        assert.ok(requiredColumns[slot], 'Unknown future detail column slot')
        return registered(fields, requiredColumns[slot])
      })
      columns.push(
        ...fields
          .filter((field) => field.reference.kind === 'field')
          .map((field) => field.reference)
      )
      props = { view: 'detail', columns, maxRows: 100, scrollingPaused: true }
    } else
      throw new Error('Unsupported future template widget/recipe combination')
    return {
      id: item.widgetKey,
      kind: item.kind,
      title: item.title,
      sourceKey: recipe.sourceSlot,
      layout: item.layout,
      props,
    }
  })
  return contracts.parseDataScreenDefinition({
    version: 1,
    title,
    theme: parsed.theme,
    sources: reportKinds.map((sourceKey) => ({
      sourceKey,
      reportDefinitionVersionId: reports[sourceKey].versionId,
      dateWindow: 'last-7-days',
      statuses: [],
      refreshSeconds: 15,
    })),
    widgets,
    alert: {
      enabled: true,
      statuses: ['draft'],
      countThreshold: 1,
      scrollingPaused: true,
    },
  })
}

// Import-safe API fixture library: the caller supplies a real authenticated transport.
// onProgress receives resource IDs immediately after each successful creation, including partial runs.
export const createDataScreenDemoFixtures = async (
  call,
  { suffix = randomUUID().slice(0, 8), onProgress = async () => undefined } = {}
) => {
  assert.match(suffix, /^[a-zA-Z0-9-]{1,24}$/)
  const fixtures = {}
  const progress = async () => onProgress(structuredClone(fixtures))
  const request = (endpoint, method = 'GET', body) =>
    call(endpoint, method, body, randomUUID())
  const templates = await request('/data-screens/templates')
  assert.ok(Array.isArray(templates) && templates.length === 3)
  assert.deepEqual(
    [...templates.map((item) => item.key)].sort(),
    [...kinds].sort()
  )
  for (const kind of kinds) {
    const fixture = {
      kind,
      suffix,
      ownershipCode: `screen-${kind}-${suffix}`,
      recordIds: [],
      expectedCount: syntheticRecords(kind, suffix).length,
      fields: [],
      reports: {},
    }
    fixtures[kind] = fixture
    await progress()
    const application = await request('/application-center', 'POST', {
      name: `演示·${titles[kind]}-${suffix}`,
      code: `screen-${kind}-${suffix}`,
      template: kind === 'equipment' ? 'equipment' : 'blank',
    })
    Object.assign(fixture, {
      applicationId: application.id,
      formDraftId: application.formDraftId,
      workflowDraftId: application.workflowDraftId,
      applicationRevision: application.revision,
    })
    assert.equal(application.businessKind, 'generic')
    await progress()
    let form = await request(`/form-schemas/${application.formDraftId}`)
    let workflow = await request(`/workflows/${application.workflowDraftId}`)
    if (kind !== 'equipment') {
      form = await request(`/form-schemas/${form.id}`, 'PUT', {
        schema: syntheticSourceSchema(kind),
        expectedRevision: form.revision,
      })
      workflow = await request(`/workflows/${workflow.id}`, 'PUT', {
        schema: contracts.serialWorkflow('a-manager-1', 'a-manager-2'),
        expectedRevision: workflow.revision,
      })
    }
    const current = await request(`/application-center/${application.id}`)
    const release = await request(
      `/applications/${application.id}/releases`,
      'POST',
      {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: workflow.revision,
        expectedRevision: current.revision,
      }
    )
    Object.assign(fixture, {
      sourceReleaseId: release.id,
      sourceReleaseVersion: release.releaseVersion,
      formRevision: form.revision,
      workflowRevision: workflow.revision,
    })
    await progress()
    for (const fields of syntheticRecords(kind, suffix)) {
      const created = await request('/business/records', 'POST', {
        applicationReleaseId: release.id,
        fields,
      })
      fixture.recordIds.push(created.id)
      await progress()
      const saved = await request(`/business/records/${created.id}`)
      assert.equal(saved.applicationReleaseId, release.id)
      assert.equal(saved.status, 'draft')
      assert.deepEqual(
        saved.fields,
        contracts.validateBusinessFields(form.schema, fields)
      )
      if (kind === 'sales')
        assert.deepEqual(
          saved.computedFields,
          contracts.computeBusinessFields(form.schema, saved.fields)
        )
    }
    const cataloguePage = await request(
      `/reporting/sources?applicationId=${encodeURIComponent(application.id)}`
    )
    const catalogue = cataloguePage.list.find(
      (value) => value.source.applicationId === application.id
    )
    assert.ok(catalogue)
    assert.equal(catalogue.sourceReleaseId, release.id)
    const required = [metadata('id'), metadata('status'), metadata('createdAt')]
    const businessFields = catalogue.visibleFields.filter(
      (field) => field.reference.kind === 'field'
    )
    assert.equal(businessFields.length, form.schema.widgetsConfig.length)
    fixture.fields = [
      ...required.map((reference) =>
        catalogue.visibleFields.find(
          (field) => field.key === `${reference.kind}:${reference.id}`
        )
      ),
      ...businessFields,
    ]
    assert.ok(fixture.fields.every(Boolean))
    for (const reportKind of reportKinds) {
      const definition = await request('/reporting/definitions', 'POST', {
        schema: {
          version: 1,
          name: `${titles[kind]}·${reportKind}·${suffix}`,
          source: {
            kind: 'application-records',
            applicationId: application.id,
          },
          kind: reportKind,
          metric: 'count',
          factTime: 'createdAt',
          timeZone: 'America/New_York',
          fields: fixture.fields.map((field) => field.reference),
        },
      })
      fixture.reports[reportKind] = {
        definitionId: definition.id,
        revision: definition.revision,
        versionId: null,
      }
      await progress()
      const published = await request(
        `/reporting/definitions/${definition.id}/publish`,
        'POST',
        { expectedRevision: definition.revision }
      )
      Object.assign(fixture.reports[reportKind], {
        revision: published.revision,
        versionId: published.activeVersionId,
      })
      assert.ok(published.activeVersionId)
      await progress()
      const versionCatalogue = await request(
        `/reporting/versions/${published.activeVersionId}/catalogue`
      )
      assert.equal(versionCatalogue.sourceReleaseId, release.id)
      if (reportKind === 'detail') {
        const visible = versionCatalogue.visibleFields
        assert.ok(Array.isArray(visible))
        fixture.fields.forEach((field) => registered(visible, field.reference))
      }
    }
    const draft = bindDemoScreenTemplate(
      templates.find((item) => item.key === kind),
      fixture.reports,
      fixture.fields,
      `演示·${titles[kind]}-${suffix}`
    )
    if (kind === 'sales') {
      const longitude = fixture.fields.find(
        (field) =>
          field.valueType === 'coordinate' &&
          field.coordinateAxis === 'longitude'
      )
      const latitude = fixture.fields.find(
        (field) =>
          field.valueType === 'coordinate' &&
          field.coordinateAxis === 'latitude'
      )
      assert.ok(
        longitude && latitude,
        'Sales map requires actual registered typed coordinate axes'
      )
      const detail = draft.widgets.find((widget) => widget.kind === 'table')
      assert.ok(detail)
      detail.layout.width = 672
      draft.widgets.push({
        id: 'delivery-map',
        kind: 'map',
        title: '合成交付坐标',
        sourceKey: 'detail',
        layout: { x: 1200, y: 504, width: 696, height: 552, z: 5 },
        props: {
          view: 'coordinates',
          longitudeField: longitude.reference,
          latitudeField: latitude.reference,
          maxPoints: 100,
        },
      })
      contracts.parseDataScreenDefinition(draft)
    }
    const createdScreen = await request('/data-screens/definitions', 'POST', {
      draft,
    })
    fixture.screen = {
      definitionId: createdScreen.id,
      revision: createdScreen.revision,
      releaseId: null,
    }
    await progress()
    const publishedScreen = await request(
      `/data-screens/definitions/${createdScreen.id}/publish`,
      'POST',
      { expectedRevision: createdScreen.revision }
    )
    const screenVersion = publishedScreen.versions.find(
      (version) => version.id === publishedScreen.activeReleaseId
    )
    assert.ok(screenVersion)
    Object.assign(fixture.screen, {
      revision: publishedScreen.revision,
      releaseId: publishedScreen.activeReleaseId,
      contentHash: screenVersion.contentHash,
    })
    await progress()
    const reopened = await request(
      `/data-screens/definitions/${createdScreen.id}`
    )
    assert.equal(reopened.activeReleaseId, fixture.screen.releaseId)
    assert.deepEqual(reopened.draft, draft)
    const run = await request(
      `/data-screens/definitions/${createdScreen.id}/run`,
      'POST',
      { releaseId: fixture.screen.releaseId }
    )
    assert.equal(run.sources.length, 3)
    fixture.verification = {
      sources: run.sources.map((source) => {
        assert.equal(source.status, 'ready')
        assert.equal(source.errorCode, null)
        assert.equal(
          source.reportDefinitionVersionId,
          fixture.reports[source.sourceKey].versionId
        )
        assert.equal(source.result.total, fixture.expectedCount)
        assert.equal(source.result.sourceReleaseId, fixture.sourceReleaseId)
        assert.deepEqual(
          [...source.result.rows.map((row) => row.id)].sort(),
          [...fixture.recordIds].sort()
        )
        assert.ok(Number.isFinite(Date.parse(source.dataCutoffAt)))
        assert.ok(Number.isFinite(Date.parse(source.queriedAt)))
        assert.equal(
          source.result.trend.reduce((sum, point) => sum + point.count, 0),
          fixture.expectedCount
        )
        assert.equal(
          source.result.distribution.reduce(
            (sum, point) => sum + point.count,
            0
          ),
          fixture.expectedCount
        )
        return {
          sourceKey: source.sourceKey,
          status: source.status,
          total: source.result.total,
          queriedAt: source.queriedAt,
          dataCutoffAt: source.dataCutoffAt,
          resultHash: hash(source.result),
          actualQuery: source.actualQuery,
        }
      }),
    }
    await progress()
  }
  return fixtures
}

export const createDataScreenFixtureRecord = async (
  call,
  fixture,
  {
    suffix = randomUUID().slice(0, 8),
    coordinateNull = false,
    overrides = {},
  } = {}
) => {
  assert.ok(kinds.includes(fixture.kind) && fixture.sourceReleaseId)
  const fields = { ...syntheticRecords(fixture.kind, suffix)[0], ...overrides }
  if (coordinateNull) {
    assert.equal(fixture.kind, 'sales')
    delete fields.longitude
    delete fields.latitude
  }
  const saved = await call(
    '/business/records',
    'POST',
    { applicationReleaseId: fixture.sourceReleaseId, fields },
    randomUUID()
  )
  fixture.recordIds.push(saved.id)
  return saved
}

// Explicitly invoked by CI callers only. The CLI retains all fixtures for inspection.
// Application ownership is checked before archiving any resource; no delete SQL or broad cleanup.
export const cleanupDataScreenDemoFixtures = async (call, fixtures) => {
  const failures = []
  for (const fixture of Object.values(fixtures)) {
    if (!fixture.applicationId) continue
    try {
      assert.ok(kinds.includes(fixture.kind))
      assert.equal(
        fixture.ownershipCode,
        `screen-${fixture.kind}-${fixture.suffix}`
      )
      assert.notEqual(fixture.applicationId, 'leave')
      const application = await call(
        `/application-center/${fixture.applicationId}`
      )
      assert.equal(application.code, fixture.ownershipCode)
      assert.equal(application.businessKind, 'generic')
      if (fixture.screen?.definitionId) {
        const screen = await call(
          `/data-screens/definitions/${fixture.screen.definitionId}`
        )
        const ownedVersions = new Set(
          Object.values(fixture.reports)
            .map((report) => report.versionId)
            .filter(Boolean)
        )
        assert.ok(
          screen.draft.sources.every((source) =>
            ownedVersions.has(source.reportDefinitionVersionId)
          )
        )
        if (!screen.archived)
          await call(
            `/data-screens/definitions/${screen.id}/archive`,
            'POST',
            { expectedRevision: screen.revision },
            randomUUID()
          )
      }
      for (const report of Object.values(fixture.reports)) {
        const current = await call(
          `/reporting/definitions/${report.definitionId}`
        )
        assert.equal(current.schema.source.applicationId, fixture.applicationId)
        if (current.enabled)
          await call(
            `/reporting/definitions/${current.id}/enabled`,
            'POST',
            { enabled: false, expectedRevision: current.revision },
            randomUUID()
          )
      }
      for (const id of fixture.recordIds) {
        const record = await call(`/business/records/${id}`)
        assert.equal(record.applicationReleaseId, fixture.sourceReleaseId)
        if (record.status === 'running')
          await call(
            `/business/records/${id}/withdraw`,
            'POST',
            { expectedRevision: record.revision },
            randomUUID()
          )
      }
      if (application.status !== 'archived') {
        const latest = await call(
          `/application-center/${fixture.applicationId}`
        )
        await call(
          `/application-center/${fixture.applicationId}/state`,
          'PUT',
          { status: 'archived', expectedRevision: latest.revision },
          randomUUID()
        )
      }
    } catch (error) {
      failures.push({
        applicationId: fixture.applicationId,
        message: error.message,
      })
    }
  }
  if (failures.length)
    throw new Error(`Fixture cleanup incomplete: ${JSON.stringify(failures)}`)
}

export const assertDemoEnvironment = (env) => {
  assert.equal(env.APP_MODE, 'demo', 'Requires APP_MODE=demo')
  assert.equal(
    env.R1_API_URL,
    API_ORIGIN,
    'Requires exact dedicated R1_API_URL'
  )
  const url = new URL(env.DATABASE_URL || '')
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol))
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(decodeURIComponent(url.pathname.slice(1)), DATABASE_NAME)
  assert.ok(url.username && !url.search && !url.hash)
  return url
}
const atomicJson = async (file, value) => {
  const temp = `${file}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 })
  await rename(temp, file)
}

export const main = async () => {
  const sourceUrl = assertDemoEnvironment(process.env)
  const runId = randomUUID()
  const directory = path.join(OUTPUT_ROOT, runId)
  const reportPath = path.join(directory, 'report.json')
  const manifest = {
    version: 1,
    runId,
    status: 'guarded',
    startedAt: new Date().toISOString(),
    scope: {
      apiOrigin: API_ORIGIN,
      database: DATABASE_NAME,
      tenantId: 'tenant-a',
      actorId: 'a-admin',
    },
    fixtures: {},
    commands: [],
  }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const persist = async () => {
    manifest.updatedAt = new Date().toISOString()
    await atomicJson(reportPath, manifest)
    await atomicJson(path.join(OUTPUT_ROOT, 'latest.json'), {
      runId,
      status: manifest.status,
      reportPath,
      updatedAt: manifest.updatedAt,
    })
  }
  await persist()
  const pool = new Pool({
    connectionString: sourceUrl.toString(),
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  })
  let token
  let bindingStartedAt
  const assertSession = async () => {
    const result = await pool.query(
      "SELECT s.user_id FROM sessions s JOIN session_scopes scope ON scope.token_hash=s.token_hash AND scope.user_id=s.user_id AND scope.tenant_id='tenant-a' JOIN memberships m ON m.tenant_id=scope.tenant_id AND m.user_id=scope.user_id JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE s.token_hash=$1 AND s.user_id='a-admin' AND s.default_tenant_id='tenant-a' AND s.revoked_at IS NULL AND s.expires_at>now()+interval '30 minutes' AND s.created_at>=$2::timestamptz-interval '1 minute' AND scope.epoch=m.session_epoch AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled'",
      [hash(token), bindingStartedAt]
    )
    assert.equal(
      result.rowCount,
      1,
      'Fresh source session/epoch with sufficient remaining lifetime must belong to the exact guarded DB'
    )
  }
  const call = async (endpoint, method = 'GET', body, key = randomUUID()) => {
    assert.ok(
      /^\/[a-zA-Z0-9][a-zA-Z0-9_/?=&%.-]*$/.test(endpoint),
      'Only fixed relative API paths are allowed'
    )
    assert.ok(['GET', 'POST', 'PUT'].includes(method))
    await assertSession()
    const command = {
      method,
      endpoint,
      idempotencyKey: key,
      status: 'pending',
      requestHash: hash(body ?? null),
    }
    manifest.commands.push(command)
    await persist()
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`${API_ORIGIN}/api${endpoint}`, {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            'x-access-token': token,
            'x-tenant-id': 'tenant-a',
            'idempotency-key': key,
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const envelope = await response.json()
        command.httpStatus = response.status
        command.businessCode = envelope.businessCode
        if (response.status >= 500 && attempt === 0) {
          command.retried = true
          await persist()
          continue
        }
        assert.equal(
          response.status,
          200,
          `API ${method} ${endpoint} failed: ${response.status} ${
            envelope.businessCode || 'HTTP_ERROR'
          }`
        )
        assert.equal(envelope.code, 20000)
        command.status = 'succeeded'
        if (typeof envelope.data?.id === 'string')
          command.resourceId = envelope.data.id
        await persist()
        return envelope.data
      } catch (error) {
        command.status = 'unknown-or-failed'
        await persist()
        if (attempt === 0 && !(error instanceof assert.AssertionError)) {
          command.retried = true
          continue
        }
        throw error
      }
    }
    throw new Error('API retry exhausted')
  }
  try {
    assert.equal(
      (await pool.query('SELECT current_database() AS name')).rows[0].name,
      DATABASE_NAME
    )
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS total FROM schema_migrations WHERE name='027_data_screens.sql'"
        )
      ).rows[0].total,
      1,
      'Migration 027 must already be applied by the parent'
    )
    const contextResponse = await fetch(`${API_ORIGIN}/api/runtime-context`, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    assert.equal(contextResponse.status, 200)
    assert.equal((await contextResponse.json()).data.mode, 'demo')
    bindingStartedAt = (await pool.query('SELECT clock_timestamp() AS time'))
      .rows[0].time
    const login = await fetch(`${API_ORIGIN}/api/user/login`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ username: 'a-admin', password: 'a-admin' }),
    })
    assert.equal(login.status, 200)
    token = (await login.json()).data.token
    assert.equal(typeof token, 'string')
    await assertSession()
    const user = await call('/user/info')
    assert.equal(user.id, 'a-admin')
    assert.equal(user.tenantId, 'tenant-a')
    manifest.status = 'creating'
    await persist()
    manifest.fixtures = await createDataScreenDemoFixtures(call, {
      suffix: runId.slice(0, 8),
      onProgress: async (fixtures) => {
        manifest.fixtures = fixtures
        await persist()
      },
    })
    manifest.status = 'verified'
    manifest.verifiedAt = new Date().toISOString()
    await persist()
    process.stdout.write(
      `Verified three real demo sources and screens. Manifest: ${reportPath}\n`
    )
    return manifest
  } catch (error) {
    manifest.status = 'failed'
    manifest.failure = {
      name: error.name,
      message:
        'Stopped; review retained resource IDs and command statuses. No automatic deletion was performed.',
    }
    await persist()
    throw new Error(
      `Data-screen demo preparation failed; inspect ${reportPath}`,
      { cause: error }
    )
  } finally {
    token = undefined
    await pool.end()
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
