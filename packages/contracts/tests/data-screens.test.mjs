import assert from 'node:assert/strict'
import { test } from 'node:test'

/* eslint-disable no-restricted-syntax, no-return-assign */
import {
  DATA_SCREEN_PERMISSIONS,
  DATA_SCREEN_RUN_ERROR_CODES,
  DATA_SCREEN_TEMPLATE_KEYS,
  parseCreateDataScreen,
  parseArchiveDataScreen,
  parseDataScreenDefinition,
  parseDataScreenRevisionCommand,
  parseDataScreenTemplate,
  parsePreviewDataScreen,
  parsePublishDataScreen,
  parsePublishableDataScreenDefinition,
  parseRollbackDataScreen,
  parseRunDataScreen,
  parseToggleDataScreen,
  parseUpdateDataScreen,
} from '../dist/index.js'

const metadata = (id) => ({ kind: 'metadata', id })
const field = (id) => ({ kind: 'field', id })
const source = (sourceKey = 'main') => ({
  sourceKey,
  reportDefinitionVersionId: `report-version-${sourceKey}`,
  dateWindow: 'last-7-days',
  statuses: ['running', 'approved'],
  refreshSeconds: 30,
})
const widget = (kind, z, extra = {}) => {
  const propsByKind = {
    line: { view: 'trend', showValues: true },
    bar: { view: 'distribution', showValues: false },
    pie: { view: 'distribution', showLegend: true },
    ranking: { view: 'distribution', limit: 5 },
    metric: { view: 'count', showTrend: true },
    table: {
      view: 'detail',
      columns: [metadata('id'), field('itemName')],
      maxRows: 100,
      scrollingPaused: false,
    },
    map: {
      view: 'coordinates',
      longitudeField: field('longitude'),
      latitudeField: field('latitude'),
      maxPoints: 100,
    },
  }
  return {
    id: `${kind}-${z}`,
    kind,
    title: `${kind}展示`,
    sourceKey: 'main',
    layout: {
      x: z === 0 ? 7.5 : z * 240,
      y: 0,
      width: z === 0 ? 200 : 240,
      height: 160,
      z,
    },
    props: propsByKind[kind],
    ...extra,
  }
}
const definition = (extra = {}) => ({
  version: 1,
  title: '企业业务大屏',
  theme: { preset: 'enterprise', brandColor: '#2F54EB' },
  sources: [source()],
  widgets: ['line', 'bar', 'pie', 'ranking', 'metric', 'table', 'map'].map(
    (kind, index) => widget(kind, index)
  ),
  alert: {
    enabled: true,
    statuses: ['rejected'],
    countThreshold: 10,
    scrollingPaused: false,
  },
  ...extra,
})
const rejects = (run, fieldName) =>
  assert.throws(run, (error) => {
    assert.equal(error.status, 422)
    assert.equal(error.businessCode, 'VALIDATION_ERROR')
    if (fieldName)
      assert.ok(error.errors?.[fieldName], `Expected error for ${fieldName}`)
    return true
  })

test('v1 closes seven display kinds over real report views and preserves exact center coordinates', () => {
  const input = definition({ title: '订单 < 10 与订单 > 100' })
  const parsed = parseDataScreenDefinition(input)
  assert.deepEqual(parsed, input)
  assert.equal(parsed.widgets[0].layout.x, 7.5)
  assert.deepEqual(
    parsed.widgets.map(({ kind, props }) => [kind, props.view]),
    [
      ['line', 'trend'],
      ['bar', 'distribution'],
      ['pie', 'distribution'],
      ['ranking', 'distribution'],
      ['metric', 'count'],
      ['table', 'detail'],
      ['map', 'coordinates'],
    ]
  )
  input.sources[0].statuses[0] = 'draft'
  input.widgets[5].props.columns[0].id = 'status'
  assert.equal(parsed.sources[0].statuses[0], 'running')
  assert.equal(parsed.widgets[5].props.columns[0].id, 'id')
})

test('definitions reject future formats, unknown execution fields, markup and inherited objects', () => {
  for (const version of [undefined, null, 0, 2, '1'])
    rejects(() => parseDataScreenDefinition(definition({ version })), 'version')
  for (const key of [
    'url',
    'sql',
    'script',
    'credentials',
    'rawRows',
    'clientNow',
    'status',
    'success',
    'hash',
    'output',
    'data',
  ])
    rejects(
      () => parseDataScreenDefinition(definition({ [key]: 'forged' })),
      key
    )
  for (const title of [
    '<b>企业大屏</b>',
    '<script>alert(1)</script>',
    '企业\n大屏',
    '<!--hidden-->',
  ])
    rejects(() => parseDataScreenDefinition(definition({ title })), 'title')
  rejects(
    () => parseDataScreenDefinition(Object.create(definition())),
    'definition'
  )
  rejects(
    () =>
      parseDataScreenDefinition(
        JSON.parse(
          JSON.stringify(definition()).replace(
            '"title":"企业业务大屏"',
            '"title":"企业业务大屏","__proto__":{"admin":true}'
          )
        )
      ),
    '__proto__'
  )
})

test('sources fix published report versions, calendar windows, statuses and bounded refresh without proxy inputs', () => {
  for (const dateWindow of [
    'today',
    'last-7-days',
    'current-month',
    'previous-month',
  ]) {
    const parsed = parseDataScreenDefinition(
      definition({ sources: [{ ...source(), dateWindow }] })
    )
    assert.equal(parsed.sources[0].dateWindow, dateWindow)
  }
  for (const refreshSeconds of [15, 300])
    assert.equal(
      parseDataScreenDefinition(
        definition({ sources: [{ ...source(), refreshSeconds }] })
      ).sources[0].refreshSeconds,
      refreshSeconds
    )
  for (const refreshSeconds of [14, 301, 15.5, '30', Infinity])
    rejects(() =>
      parseDataScreenDefinition(
        definition({ sources: [{ ...source(), refreshSeconds }] })
      )
    )
  for (const sourceExtra of [
    { url: 'https://example.invalid' },
    { sql: 'select *' },
    { headers: { authorization: 'credential' } },
    { reportDefinitionId: 'mutable-head' },
    { rows: [{ count: 99 }] },
  ])
    rejects(() =>
      parseDataScreenDefinition(
        definition({ sources: [{ ...source(), ...sourceExtra }] })
      )
    )
  rejects(() =>
    parseDataScreenDefinition(
      definition({ sources: [source(), source('main')] })
    )
  )
  rejects(() =>
    parseDataScreenDefinition(
      definition({
        sources: [{ ...source(), statuses: ['approved', 'approved'] }],
      })
    )
  )
  rejects(() =>
    parseDataScreenDefinition(
      definition({ sources: [{ ...source(), statuses: ['completed'] }] })
    )
  )
})

test('layout enforces finite canvas bounds, minimum size, widget limit and contiguous unique layers', () => {
  const alterWidget = (alter) => {
    const value = definition()
    alter(value.widgets)
    return value
  }
  for (const alter of [
    (widgets) => (widgets[0].layout.x = -1),
    (widgets) => (widgets[0].layout.y = Infinity),
    (widgets) => (widgets[0].layout.width = 159),
    (widgets) => (widgets[0].layout.height = 95),
    (widgets) => (widgets[6].layout.x = 1800),
    (widgets) => (widgets[1].layout.z = 0),
    (widgets) => (widgets[6].layout.z = 8),
  ])
    rejects(() => parseDataScreenDefinition(alterWidget(alter)))
  const tooMany = Array.from({ length: 31 }, (_, z) => widget('metric', z))
  rejects(
    () => parseDataScreenDefinition(definition({ widgets: tooMany })),
    'widgets'
  )
})

test('widget props stay kind-specific and source references must exist', () => {
  for (const [index, mutation] of [
    [0, (props) => (props.view = 'distribution')],
    [1, (props) => (props.view = 'detail')],
    [2, (props) => (props.showValues = true)],
    [3, (props) => (props.limit = 6)],
    [4, (props) => (props.view = 'sum')],
    [5, (props) => (props.expression = 'row.amount')],
    [6, (props) => (props.url = 'https://tiles.invalid')],
  ]) {
    const value = definition()
    mutation(value.widgets[index].props)
    rejects(() => parseDataScreenDefinition(value))
  }
  const missing = definition()
  missing.widgets[0].sourceKey = 'missing'
  rejects(() => parseDataScreenDefinition(missing), 'widgets')
  const duplicateWidget = definition()
  duplicateWidget.widgets[1].id = duplicateWidget.widgets[0].id
  rejects(() => parseDataScreenDefinition(duplicateWidget), 'widgets')
})

test('table and map bindings are bounded registered references while server retains selected-field and numeric-type authority', () => {
  const duplicateColumns = definition()
  duplicateColumns.widgets[5].props.columns = [field('same'), field('same')]
  rejects(
    () => parseDataScreenDefinition(duplicateColumns),
    'widget.props.columns'
  )
  const tooManyColumns = definition()
  tooManyColumns.widgets[5].props.columns = Array.from({ length: 21 }, (_, i) =>
    field(`column-${i}`)
  )
  rejects(
    () => parseDataScreenDefinition(tooManyColumns),
    'widget.props.columns'
  )
  const sameCoordinates = definition()
  sameCoordinates.widgets[6].props.latitudeField = field('longitude')
  rejects(
    () => parseDataScreenDefinition(sameCoordinates),
    'widget.props.latitudeField'
  )
  for (const value of [0, 101, 1.5, '100']) {
    const table = definition()
    table.widgets[5].props.maxRows = value
    rejects(() => parseDataScreenDefinition(table))
    const map = definition()
    map.widgets[6].props.maxPoints = value
    rejects(() => parseDataScreenDefinition(map))
  }
  for (const badField of ['longitude.path', '$.latitude', 'SUM(coord)']) {
    const value = definition()
    value.widgets[6].props.longitudeField = field(badField)
    rejects(() => parseDataScreenDefinition(value), 'field.id')
  }
})

test('empty draft is valid but publish requires runnable widgets and rejects unused sources', () => {
  const empty = definition({ sources: [], widgets: [] })
  assert.deepEqual(parseDataScreenDefinition(empty), empty)
  rejects(() => parsePublishableDataScreenDefinition(empty), 'sources')
  const noWidgets = definition({ widgets: [] })
  rejects(() => parsePublishableDataScreenDefinition(noWidgets), 'widgets')
  const unused = definition({ sources: [source(), source('secondary')] })
  rejects(() => parsePublishableDataScreenDefinition(unused), 'sources')
  assert.deepEqual(
    parsePublishableDataScreenDefinition(definition()),
    definition()
  )
})

test('alert facts use registered statuses and finite authorized count thresholds', () => {
  const disabled = definition({
    alert: {
      enabled: false,
      statuses: [],
      countThreshold: 1,
      scrollingPaused: true,
    },
  })
  assert.deepEqual(parseDataScreenDefinition(disabled).alert, disabled.alert)
  for (const countThreshold of [0, 1000001, 1.5, Infinity, '10'])
    rejects(() =>
      parseDataScreenDefinition(
        definition({ alert: { ...definition().alert, countThreshold } })
      )
    )
  rejects(() =>
    parseDataScreenDefinition(
      definition({ alert: { ...definition().alert, statuses: [] } })
    )
  )
  rejects(() =>
    parseDataScreenDefinition(
      definition({ alert: { ...definition().alert, statuses: ['pending'] } })
    )
  )
})

test('create, update, preview, publish, rollback, toggle, archive and run have exact authority-free inputs', () => {
  assert.deepEqual(
    parseCreateDataScreen({ draft: definition() }).draft,
    definition()
  )
  assert.deepEqual(
    parsePreviewDataScreen({ draft: definition() }).draft,
    definition()
  )
  assert.equal(
    parseUpdateDataScreen({ draft: definition(), expectedRevision: 2 })
      .expectedRevision,
    2
  )
  assert.deepEqual(parseDataScreenRevisionCommand({ expectedRevision: 3 }), {
    expectedRevision: 3,
  })
  assert.deepEqual(parsePublishDataScreen({ expectedRevision: 3 }), {
    expectedRevision: 3,
  })
  assert.deepEqual(parseArchiveDataScreen({ expectedRevision: 3 }), {
    expectedRevision: 3,
  })
  assert.deepEqual(
    parseRollbackDataScreen({ releaseId: 'release-1', expectedRevision: 4 }),
    { releaseId: 'release-1', expectedRevision: 4 }
  )
  assert.deepEqual(
    parseToggleDataScreen({ enabled: false, expectedRevision: 5 }),
    { enabled: false, expectedRevision: 5 }
  )
  assert.deepEqual(parseRunDataScreen({ releaseId: 'release-1' }), {
    releaseId: 'release-1',
  })
  for (const expectedRevision of [undefined, null, 0, -1, 1.5, '1', Infinity]) {
    rejects(() =>
      parseUpdateDataScreen({ draft: definition(), expectedRevision })
    )
    rejects(() => parseDataScreenRevisionCommand({ expectedRevision }))
    rejects(() => parsePublishDataScreen({ expectedRevision }))
    rejects(() => parseArchiveDataScreen({ expectedRevision }))
    rejects(() =>
      parseRollbackDataScreen({ releaseId: 'release-1', expectedRevision })
    )
    rejects(() => parseToggleDataScreen({ enabled: true, expectedRevision }))
  }
  for (const key of ['status', 'success', 'hash', 'output', 'data']) {
    rejects(() => parseCreateDataScreen({ draft: definition(), [key]: true }))
    rejects(() => parsePreviewDataScreen({ draft: definition(), [key]: true }))
    rejects(() => parseRunDataScreen({ releaseId: 'release-1', [key]: true }))
  }
  rejects(() =>
    parseRollbackDataScreen({
      releaseId: 'release-1',
      expectedRevision: 1,
      snapshot: definition(),
    })
  )
  rejects(() => parseToggleDataScreen({ enabled: 'true', expectedRevision: 1 }))
})

const template = (key = 'operations') => ({
  version: 1,
  key,
  name: `${key}模板`,
  theme: { preset: 'ocean', brandColor: '#1677FF' },
  layout: [
    {
      widgetKey: 'total',
      kind: 'metric',
      title: '业务总量',
      layout: { x: 0, y: 0, width: 320, height: 160, z: 0 },
    },
    {
      widgetKey: 'detail',
      kind: 'table',
      title: '业务明细',
      layout: { x: 0, y: 160, width: 960, height: 480, z: 1 },
    },
  ],
  bindingRecipe: [
    { widgetKey: 'total', sourceSlot: 'business', view: 'count' },
    {
      widgetKey: 'detail',
      sourceSlot: 'business',
      view: 'detail',
      columnSlots: ['primary', 'status'],
    },
  ],
})

test('operations, sales and equipment templates carry only compatible layout and binding recipes', () => {
  for (const key of DATA_SCREEN_TEMPLATE_KEYS)
    assert.deepEqual(parseDataScreenTemplate(template(key)), template(key))
  assert.deepEqual(DATA_SCREEN_TEMPLATE_KEYS, [
    'operations',
    'sales',
    'equipment',
  ])
  const future = template('finance')
  rejects(() => parseDataScreenTemplate(future), 'template.key')
  const staticNumber = template()
  staticNumber.layout[0].businessNumber = 999
  rejects(() => parseDataScreenTemplate(staticNumber), 'businessNumber')
  const forgedBinding = template()
  forgedBinding.bindingRecipe[0].count = 999
  rejects(() => parseDataScreenTemplate(forgedBinding), 'count')
  const incompatible = template()
  incompatible.bindingRecipe[0].view = 'distribution'
  rejects(
    () => parseDataScreenTemplate(incompatible),
    'template.bindingRecipe.view'
  )
  const missingBinding = template()
  missingBinding.bindingRecipe.pop()
  rejects(
    () => parseDataScreenTemplate(missingBinding),
    'template.bindingRecipe'
  )
})

test('permission and run error catalogues are fixed and do not expose dynamic error text', () => {
  assert.deepEqual(DATA_SCREEN_PERMISSIONS, {
    list: 'screen:list',
    create: 'screen:create',
    update: 'screen:update',
    publish: 'screen:publish',
    rollback: 'screen:rollback',
    toggle: 'screen:toggle',
    archive: 'screen:archive',
    run: 'screen:run',
  })
  assert.deepEqual(DATA_SCREEN_RUN_ERROR_CODES, [
    'permission-denied',
    'source-disabled',
    'source-unavailable',
    'network-error',
    'query-failed',
  ])
})
