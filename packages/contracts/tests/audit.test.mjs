import assert from 'node:assert/strict'
import { test } from 'node:test'
import audit from '../dist/audit.js'

const parse = audit.parseAuditQuery
const invalid = (input) =>
  assert.throws(
    () => parse(input),
    (error) =>
      error.name === 'DomainError' &&
      error.status === 422 &&
      error.businessCode === 'VALIDATION_ERROR'
  )

test('v1 defaults declare bounded paging and an explicit server timezone', () => {
  assert.deepEqual(parse({}), {
    version: 1,
    current: 1,
    pageSize: 20,
    module: '',
    eventType: '',
    result: '',
    operatorName: '',
    targetId: '',
    traceId: '',
    from: '',
    to: '',
    timeZone: 'Asia/Shanghai',
  })
  assert.deepEqual(audit.AUDIT_PERMISSIONS, { read: 'audit:read' })
  assert.equal(audit.AUDIT_PROJECTION_VERSION, 1)
})
test('HTTP decimal pagination and v1 transport strings normalize without precision loss', () => {
  const result = parse({ version: '1', current: '1000000', pageSize: '100' })
  assert.equal(result.current, 1000000)
  assert.equal(result.pageSize, 100)
  assert.equal(result.version, 1)
  assert.deepEqual(parse(result), result)
})
test('pagination rejects unbounded, noninteger and implicit JavaScript coercions', () => {
  for (const current of [
    0,
    -1,
    1000001,
    Infinity,
    NaN,
    1.5,
    '1e2',
    '0x10',
    '+1',
    '01',
    '',
    ' 1 ',
    null,
    true,
    [],
    ['1'],
    '9007199254740993',
  ])
    invalid({ current })
  for (const pageSize of [0, 101, 1.5, '101', '1e2', false, {}, null])
    invalid({ pageSize })
})
test('only the four existing event types and two result values are valid', () => {
  for (const eventType of ['operation', 'security', 'permission', 'export'])
    assert.equal(parse({ eventType }).eventType, eventType)
  for (const result of ['success', 'failure'])
    assert.equal(parse({ result }).result, result)
  invalid({ eventType: 'telemetry' })
  invalid({ result: 'partial-failed' })
  invalid({ result: ['success'] })
})
test('future versions, unknown keys and client-authored facts are refused', () => {
  for (const version of [0, 2, '2', null, true, '01']) invalid({ version })
  for (const field of [
    'detail',
    'source',
    'projectionVersion',
    'operator',
    'occurredAt',
    'actorId',
    'sort',
    'sql',
    'script',
    'url',
    'dateRange',
    'dateRange[]',
  ])
    invalid({
      [field]: field === 'dateRange' ? ['2026-01-01', '2026-01-02'] : 'x',
    })
})
test('literal Unicode operator filters preserve percent and underscore instead of creating wildcard syntax', () => {
  const operatorName = ' 张三_% / Ольга / Zoë / 👩🏽‍💻 '
  assert.equal(parse({ operatorName }).operatorName, operatorName.trim())
  assert.equal(parse({ operatorName: '订单 < 10' }).operatorName, '订单 < 10')
  assert.equal(parse({ operatorName: 'A & B > C' }).operatorName, 'A & B > C')
  assert.equal(
    parse({ operatorName: 'x'.repeat(100) }).operatorName.length,
    100
  )
  invalid({ operatorName: 'x'.repeat(101) })
})
test('plain text rejects controls and executable HTML without accepting structured payloads', () => {
  for (const operatorName of [
    '张\n三',
    'a\u0000b',
    'a\u007fb',
    'a\u0085b',
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<!--secret-->',
    'javascript:alert(1)',
    'data:text/html,<svg>',
    ['张三'],
    { name: '张三' },
    4,
    null,
  ])
    invalid({ operatorName })
})
test('trace and target filters preserve exact bounded registered identifiers', () => {
  for (const field of ['traceId', 'targetId']) {
    assert.equal(
      parse({ [field]: 'trace-123:part_2.v1' })[field],
      'trace-123:part_2.v1'
    )
    assert.equal(parse({ [field]: 'a'.repeat(100) })[field].length, 100)
    for (const value of [
      'a'.repeat(101),
      '%',
      '_',
      'a b',
      '../path',
      'x;DROP TABLE',
      'https://example.invalid',
      'javascript:alert',
      '__proto__',
      'constructor',
      [],
      null,
    ])
      invalid({ [field]: value })
  }
})
test('unknown safe modules remain valid literal filters and unsafe module syntax is rejected', () => {
  assert.equal(
    parse({ module: 'future-module.v2:region' }).module,
    'future-module.v2:region'
  )
  assert.equal(parse({ module: 'x'.repeat(64) }).module.length, 64)
  for (const module of [
    'x'.repeat(65),
    'unknown module',
    '1module',
    'request%',
    'module/path',
    'm;select',
    '<script>',
    'constructor',
    {},
  ])
    invalid({ module })
})
test('IANA timezones and UTC are explicit while offsets, abbreviations and bad zones are rejected', () => {
  assert.equal(parse({ timeZone: 'UTC' }).timeZone, 'UTC')
  assert.equal(
    parse({ timeZone: 'America/New_York' }).timeZone,
    'America/New_York'
  )
  for (const timeZone of [
    '+08:00',
    'CST',
    'GMT',
    'Mars/Olympus',
    ['UTC'],
    null,
  ])
    invalid({ timeZone })
})
test('single-sided dates retain their side without inventing client time or swapping end for start', () => {
  assert.equal(parse({ from: '2026-01-02' }).from, '2026-01-02')
  assert.equal(parse({ from: '2026-01-02' }).to, '')
  assert.equal(parse({ to: '2026-12-03' }).from, '')
  assert.equal(parse({ to: '2026-12-03' }).to, '2026-12-03')
  assert.equal(parse({ from: '', to: '2026-12-03' }).from, '')
})
test('calendar dates reject nonexistent days, timestamps and unsupported years', () => {
  assert.equal(parse({ from: '2024-02-29' }).from, '2024-02-29')
  for (const value of [
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-1-01',
    '2026-01-01T00:00:00Z',
    '1899-12-31',
    '2201-01-01',
    null,
    ['2026-01-01'],
  ]) {
    invalid({ from: value })
    invalid({ to: value })
  }
})
test('date span uses inclusive calendar days across leap days and DST, capped at 366', () => {
  assert.equal(parse({ from: '2024-01-01', to: '2024-12-31' }).to, '2024-12-31')
  assert.equal(
    parse({
      from: '2026-03-07',
      to: '2026-03-09',
      timeZone: 'America/New_York',
    }).to,
    '2026-03-09'
  )
  assert.equal(
    parse({ from: '2026-01-01', to: '2026-01-01' }).from,
    '2026-01-01'
  )
  invalid({ from: '2024-01-01', to: '2025-01-01' })
  invalid({ from: '2026-02-02', to: '2026-02-01' })
})
test('prototype, accessor and symbol-bearing inputs cannot smuggle fields or run getters', () => {
  for (const input of [
    null,
    [],
    new Date(),
    'query',
    Object.create({ current: 1 }),
    JSON.parse('{"__proto__":{"current":2}}'),
  ])
    invalid(input)
  const getter = Object.defineProperty({}, 'current', {
    get() {
      throw new Error('getter must never run')
    },
  })
  invalid(getter)
  invalid({ [Symbol('source')]: 'server' })
  invalid(Object.defineProperty({}, 'unexpected', { value: true }))
  assert.equal(
    parse(Object.assign(Object.create(null), { pageSize: 20 })).pageSize,
    20
  )
})
test('parsing leaves caller data unchanged and returns an independent normalized query', () => {
  const input = Object.freeze({
    current: '2',
    pageSize: '20',
    from: '',
    to: '2026-10-13',
    operatorName: ' 未来角色读者_% ',
    module: 'unknown-role-module',
  })
  const result = parse(input)
  assert.equal(input.current, '2')
  assert.equal(input.operatorName, ' 未来角色读者_% ')
  result.operatorName = 'changed'
  assert.equal(input.operatorName, ' 未来角色读者_% ')
  assert.equal(result.from, '')
  assert.equal(result.to, '2026-10-13')
})
