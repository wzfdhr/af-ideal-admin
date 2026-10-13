import assert from 'node:assert/strict'
import { test } from 'node:test'

const { default: reporting } = await import(
  process.env.REPORTING_CONTRACT_MODULE ||
    new URL('../dist/reporting.js', import.meta.url).href
)
const metadata = (id) => ({ kind: 'metadata', id })
const field = (id) => ({ kind: 'field', id })
const definition = (extra = {}) => ({
  version: 1,
  name: '业务申请数量报表',
  source: { kind: 'application-records', applicationId: 'application-1' },
  kind: 'detail',
  metric: 'count',
  factTime: 'createdAt',
  timeZone: 'Asia/Shanghai',
  fields: [
    metadata('id'),
    metadata('createdAt'),
    metadata('status'),
    field('itemName'),
  ],
  ...extra,
})
const query = (extra = {}) => ({
  version: 1,
  timeZone: 'Asia/Shanghai',
  dateRange: { from: '2026-10-01', to: '2026-10-13' },
  statuses: ['draft', 'running'],
  keyword: '设备',
  searchFields: [field('itemName')],
  sort: { field: metadata('createdAt'), direction: 'desc' },
  current: 1,
  pageSize: 20,
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

test('closed v1 definitions declare real source, count metric and createdAt fact time for all three views', () => {
  for (const kind of ['trend', 'distribution', 'detail']) {
    const input = definition({ kind }),
      result = reporting.parseReportingDefinition(input)
    assert.deepEqual(result, input)
    assert.equal(result.factTime, 'createdAt')
    input.fields[0].id = 'status'
    assert.equal(
      result.fields[0].id,
      'id',
      'Parsing must not retain mutable request field references'
    )
  }
  assert.equal(
    reporting.parseReportingDefinition(definition({ name: '  数量口径  ' }))
      .name,
    '数量口径'
  )
})

test('definitions refuse future versions, alternate sources, arbitrary metrics, authority and query fields', () => {
  for (const version of [undefined, null, 0, 2, '1', true])
    rejects(
      () => reporting.parseReportingDefinition(definition({ version })),
      'version'
    )
  for (const kind of [
    'sql',
    'registered-dictionary',
    'external',
    null,
    ['application-records'],
  ])
    rejects(
      () =>
        reporting.parseReportingDefinition(
          definition({ source: { kind, applicationId: 'app-1' } })
        ),
      'source.kind'
    )
  for (const metric of ['sum', 'avg', 'amount', 'count(*)', true])
    rejects(
      () => reporting.parseReportingDefinition(definition({ metric })),
      'metric'
    )
  for (const factTime of [undefined, 'submittedAt', 'updatedAt', 'now()', null])
    rejects(
      () => reporting.parseReportingDefinition(definition({ factTime })),
      'factTime'
    )
  for (const kind of ['chart', 'pie', 'csv', '', 1])
    rejects(
      () => reporting.parseReportingDefinition(definition({ kind })),
      'kind'
    )
  for (const key of [
    'rows',
    'count',
    'total',
    'success',
    'scenario',
    'completed',
    'tenantId',
    'permission',
    'sql',
    'script',
    'expression',
    'dateRange',
    'current',
  ])
    rejects(
      () =>
        reporting.parseReportingDefinition({
          ...definition(),
          [key]: 'forged',
        }),
      key
    )
  for (const key of ['tenantId', 'url', 'releaseId', 'sql', 'jsonPath'])
    rejects(
      () =>
        reporting.parseReportingDefinition(
          definition({
            source: {
              kind: 'application-records',
              applicationId: 'app-1',
              [key]: 'untrusted',
            },
          })
        ),
      key
    )
  for (const applicationId of [
    '',
    'tenant-b/app',
    'app.secret',
    'https://api.invalid',
    '__proto__',
    'constructor',
    'app;DROP TABLE records',
  ])
    rejects(() =>
      reporting.parseReportingDefinition(
        definition({ source: { kind: 'application-records', applicationId } })
      )
    )
})

test('field references use distinct namespaces and safe registered IDs without interpreting expressions or paths', () => {
  const schema = reporting.parseReportingDefinition(
    definition({
      fields: [metadata('id'), field('id'), field('report-field-alias-1')],
    })
  )
  assert.equal(
    schema.fields.length,
    3,
    'A metadata ID and same-named source field are distinct references'
  )
  assert.deepEqual(
    reporting.parseReportingFieldReference(field('0-0123_ab')),
    field('0-0123_ab')
  )
  for (const id of [
    '__proto__',
    '__PROTO__',
    'constructor',
    'Constructor',
    'PROTOTYPE',
    'amount.value',
    'fields/amount',
    'fields\\amount',
    'field:amount',
    '$.amount',
    'amount[0]',
    'SUM(amount)',
    'amount+1',
    'amount value',
    'amount;DROP',
    '{{amount}}',
  ])
    rejects(() => reporting.parseReportingFieldReference(field(id)), 'field.id')
  for (const key of ['path', 'sql', 'operator', 'expression', 'label', 'value'])
    rejects(
      () =>
        reporting.parseReportingFieldReference({
          ...field('amount'),
          [key]: 'untrusted',
        }),
      key
    )
  for (const id of ['count', 'name', 'submittedAt', 'fields'])
    rejects(
      () => reporting.parseReportingFieldReference(metadata(id)),
      'field.id'
    )
  for (const kind of ['jsonPath', 'script', '', true])
    rejects(
      () => reporting.parseReportingFieldReference({ kind, id: 'id' }),
      'field.kind'
    )
  rejects(
    () =>
      reporting.parseReportingFieldReference(
        JSON.parse(
          '{"kind":"field","id":"amount","__proto__":{"visible":true}}'
        )
      ),
    '__proto__'
  )
})

test('field lists and names enforce boundaries and normalized identity deduplication', () => {
  const fifty = Array.from({ length: 50 }, (_, index) =>
    field(`field-${index}`)
  )
  assert.equal(
    reporting.parseReportingDefinition(definition({ fields: fifty })).fields
      .length,
    50
  )
  assert.equal(
    reporting.parseReportingFieldReference(field('a'.repeat(100))).id.length,
    100
  )
  rejects(() => reporting.parseReportingFieldReference(field('a'.repeat(101))))
  assert.equal(
    reporting.parseReportingDefinition(
      definition({ name: '名'.repeat(100), fields: [metadata('id')] })
    ).name.length,
    100
  )
  for (const name of ['', '   ', '名'.repeat(101), null, 5])
    rejects(
      () => reporting.parseReportingDefinition(definition({ name })),
      'name'
    )
  for (const fields of [
    [],
    null,
    {},
    [null],
    [...fifty, field('field-50')],
    [field('amount'), field(' amount ')],
    [metadata('id'), metadata('id')],
  ])
    rejects(() => reporting.parseReportingDefinition(definition({ fields })))
})

test('query syntax is separate from definition and accepts only actual BusinessRecordStatus values', () => {
  const result = reporting.parseReportingQuery(query(), definition())
  assert.deepEqual(result, query())
  assert.deepEqual(
    reporting.parseReportingQuery(
      query({
        statuses: undefined,
        keyword: undefined,
        searchFields: undefined,
      })
    ).statuses,
    []
  )
  assert.equal(
    reporting.parseReportingQuery(
      query({ keyword: undefined, searchFields: undefined })
    ).keyword,
    ''
  )
  assert.deepEqual(
    reporting.parseReportingQuery(
      query({ statuses: [...reporting.REPORTING_BUSINESS_STATUSES] })
    ).statuses,
    ['draft', 'running', 'approved', 'rejected', 'withdrawn']
  )
  for (const statuses of [
    ['pending'],
    ['completed'],
    ['cancelled'],
    ['enabled'],
    ['archived'],
    ['APPROVED'],
    ['running', 'running'],
    null,
    false,
    '',
    [1],
  ])
    rejects(
      () => reporting.parseReportingQuery(query({ statuses })),
      'statuses'
    )
  for (const key of [
    'source',
    'applicationId',
    'metric',
    'factTime',
    'fields',
    'kind',
    'tenantId',
    'ownerId',
    'scope',
    'permission',
    'success',
    'count',
    'rows',
    'queriedAt',
    'dataCutoffAt',
    'policyVersion',
    'scenario',
    'downloadUrl',
    'sql',
    'jsonPath',
    'script',
  ])
    rejects(
      () => reporting.parseReportingQuery({ ...query(), [key]: 'forged' }),
      key
    )
  rejects(() => reporting.parseReportingQuery(definition()))
  rejects(() => reporting.parseReportingDefinition(query()))
  for (const version of [undefined, null, 2, '1', true])
    rejects(() => reporting.parseReportingQuery(query({ version })), 'version')
})

test('real bounded Gregorian intervals reject rollover dates and accept leap-century and same-day cases', () => {
  for (const day of ['2000-02-29', '2024-02-29', '1900-01-01', '2200-12-31'])
    assert.deepEqual(
      reporting.parseReportingDateRange({ from: day, to: day }),
      { from: day, to: day }
    )
  for (const day of [
    '2023-02-29',
    '1900-02-29',
    '2100-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-10-00',
    '2026-10-32',
    '2026-1-01',
    '2026-01-1',
    '2026-10-13T00:00:00Z',
    '2026-10-13 ',
    '1899-12-31',
    '2201-01-01',
    '',
    null,
  ])
    rejects(() =>
      reporting.parseReportingDateRange({ from: day, to: '2026-10-13' })
    )
  rejects(
    () =>
      reporting.parseReportingDateRange({
        from: '2026-10-14',
        to: '2026-10-13',
      }),
    'dateRange'
  )
  assert.deepEqual(
    reporting.parseReportingDateRange({ from: '2024-01-01', to: '2024-12-31' }),
    { from: '2024-01-01', to: '2024-12-31' }
  )
  rejects(
    () =>
      reporting.parseReportingDateRange({
        from: '2024-01-01',
        to: '2025-01-01',
      }),
    'dateRange'
  )
  rejects(
    () =>
      reporting.parseReportingDateRange({
        from: '2026-10-01',
        to: '2026-10-13',
        boundary: 'exclusive',
      }),
    'boundary'
  )
  for (const dateRange of [
    undefined,
    [],
    null,
    '2026-10-01',
    { from: '2026-10-01' },
  ])
    rejects(() => reporting.parseReportingQuery(query({ dateRange })))
})

test('queries require explicit named business time zones and preserve civil dates across offset and DST boundaries', () => {
  for (const timeZone of [
    'Asia/Shanghai',
    'UTC',
    'America/New_York',
    'America/Argentina/Buenos_Aires',
    'Pacific/Kiritimati',
    'Etc/GMT+12',
  ]) {
    const range = { from: '2026-03-08', to: '2026-03-09' }
    const parsed = reporting.parseReportingQuery(
      query({ timeZone, dateRange: range })
    )
    assert.deepEqual(
      parsed.dateRange,
      range,
      'Parsing must not silently replace local dates with UTC dates'
    )
    assert.ok(parsed.timeZone)
  }
  for (const timeZone of [
    undefined,
    null,
    '',
    'Z',
    'CST',
    'PST',
    '+08:00',
    '-12:00',
    'GMT+8',
    'Asia/Unknown',
    'Server/Local',
    {},
    8,
  ]) {
    rejects(
      () => reporting.parseReportingQuery(query({ timeZone })),
      'timeZone'
    )
    rejects(
      () => reporting.parseReportingDefinition(definition({ timeZone })),
      'timeZone'
    )
  }
  rejects(
    () =>
      reporting.parseReportingQuery(
        query({ timeZone: 'America/New_York' }),
        definition()
      ),
    'timeZone'
  )
  assert.equal(
    reporting.parseReportingQuery(
      query({ timeZone: 'Etc/UTC' }),
      definition({ timeZone: 'UTC' })
    ).timeZone,
    'UTC'
  )
})

test('searching and sorting are explicit safe references and must match a supplied fixed definition', () => {
  rejects(
    () => reporting.parseReportingQuery(query({ searchFields: [] })),
    'searchFields'
  )
  rejects(
    () => reporting.parseReportingQuery(query({ keyword: null })),
    'keyword'
  )
  rejects(
    () => reporting.parseReportingQuery(query({ keyword: 'a'.repeat(101) })),
    'keyword'
  )
  assert.equal(
    reporting.parseReportingQuery(query({ keyword: 'a'.repeat(100) })).keyword
      .length,
    100
  )
  rejects(
    () =>
      reporting.parseReportingQuery(
        query({ searchFields: [field('itemName'), field(' itemName ')] })
      ),
    'searchFields'
  )
  rejects(
    () =>
      reporting.parseReportingQuery(
        query({ searchFields: [field('another-safe-id')] }),
        definition()
      ),
    'fields'
  )
  rejects(
    () =>
      reporting.parseReportingQuery(
        query({ sort: { field: field('another-safe-id'), direction: 'asc' } }),
        definition()
      ),
    'fields'
  )
  // Without a source catalogue this safe ID remains only syntactically valid; the backend must refuse unknown/unauthorized IDs.
  assert.equal(
    reporting.parseReportingQuery(
      query({ searchFields: [field('unknown-safe-registry-id')] })
    ).searchFields[0].id,
    'unknown-safe-registry-id'
  )
  for (const direction of [
    'DESC',
    'desc NULLS FIRST',
    'random()',
    true,
    undefined,
  ])
    rejects(
      () =>
        reporting.parseReportingQuery(
          query({ sort: { field: metadata('createdAt'), direction } })
        ),
      'sort.direction'
    )
  for (const sort of [
    undefined,
    null,
    [],
    { field: field('amount.value'), direction: 'asc' },
    { field: metadata('createdAt'), direction: 'asc', sql: 'DROP' },
  ])
    rejects(() => reporting.parseReportingQuery(query({ sort })))
  rejects(
    () =>
      reporting.parseReportingQuery(
        query({
          sort: {
            field: { ...field('itemName'), path: '$.secret' },
            direction: 'asc',
          },
        })
      ),
    'path'
  )
})

test('pagination is strictly numeric, integer and bounded without string/boolean coercion', () => {
  assert.equal(
    reporting.parseReportingQuery(query({ current: 1000000, pageSize: 100 }))
      .current,
    1000000
  )
  assert.equal(
    reporting.parseReportingQuery(query({ current: 1, pageSize: 1 })).pageSize,
    1
  )
  for (const current of [
    undefined,
    null,
    0,
    -1,
    1.5,
    '1',
    true,
    NaN,
    Infinity,
    1000001,
  ])
    rejects(() => reporting.parseReportingQuery(query({ current })), 'current')
  for (const pageSize of [
    undefined,
    null,
    0,
    -1,
    1.5,
    '20',
    true,
    NaN,
    Infinity,
    101,
  ])
    rejects(
      () => reporting.parseReportingQuery(query({ pageSize })),
      'pageSize'
    )
})

test('nested and non-data objects cannot bypass the closed v1 input boundary', () => {
  for (const input of [null, [], new Date(), false, 1, 'definition'])
    rejects(() => reporting.parseReportingDefinition(input))
  rejects(
    () => reporting.parseReportingDefinition(Object.create(definition())),
    'definition'
  )
  rejects(() => reporting.parseReportingQuery(Object.create(query())), 'query')
  rejects(
    () =>
      reporting.parseReportingQuery(
        query({
          dateRange: { from: '2026-10-01', to: '2026-10-13', timeZone: 'UTC' },
        })
      ),
    'timeZone'
  )
  rejects(
    () => reporting.parseReportingQuery(query(), definition({ version: 2 })),
    'version'
  )
  const input = query(),
    parsed = reporting.parseReportingQuery(input)
  input.statuses.push('rejected')
  input.searchFields[0].id = 'other'
  input.sort.field.id = 'status'
  input.dateRange.from = '2026-10-02'
  assert.deepEqual(parsed.statuses, ['draft', 'running'])
  assert.equal(parsed.searchFields[0].id, 'itemName')
  assert.equal(parsed.sort.field.id, 'createdAt')
  assert.equal(parsed.dateRange.from, '2026-10-01')
})

test('sparse field, search and status arrays reject missing elements with a controlled 422', () => {
  rejects(
    () =>
      reporting.parseReportingDefinition(definition({ fields: new Array(1) })),
    'field'
  )
  rejects(
    () => reporting.parseReportingQuery(query({ searchFields: new Array(1) })),
    'field'
  )
  rejects(
    () =>
      reporting.parseReportingQuery(
        query({ searchFields: new Array(1) }),
        definition()
      ),
    'field'
  )
  rejects(
    () => reporting.parseReportingQuery(query({ statuses: new Array(1) })),
    'statuses'
  )
  const fields = [metadata('id'), field('itemName')]
  delete fields[1]
  rejects(
    () => reporting.parseReportingDefinition(definition({ fields })),
    'field'
  )
})
