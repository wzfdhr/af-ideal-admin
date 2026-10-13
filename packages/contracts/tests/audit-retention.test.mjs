import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

const moduleUrl =
  process.env.AUDIT_RETENTION_CONTRACT_MODULE ||
  new URL('../dist/audit-retention.js', import.meta.url).href
const { default: retention } = await import(moduleUrl)
const { default: audit } = await import(
  new URL(
    './audit.js',
    moduleUrl.startsWith('file:') ? moduleUrl : `file://${moduleUrl}`
  ).href
)
const {
  parseAuditRetentionPolicyUpdate: policy,
  parseAuditArchiveRunCreate: run,
  parseAuditArchiveRunCommand: command,
  parseAuditQueryV2: queryV2,
} = retention
const body = (patch = {}) => ({
  expectedRevision: 3,
  enabled: true,
  hotDays: 90,
  timeZone: 'Asia/Shanghai',
  ...patch,
})
const invalid = (parse, input) =>
  assert.throws(
    () => parse(input),
    (error) =>
      error.name === 'DomainError' &&
      error.status === 422 &&
      error.businessCode === 'VALIDATION_ERROR'
  )
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  )

test('logical policy accepts explicit enable/disable and exact hot-day bounds without selecting an executor', () => {
  assert.deepEqual(policy(body()), {
    version: 1,
    expectedRevision: 3,
    enabled: true,
    hotDays: 90,
    timeZone: 'Asia/Shanghai',
  })
  assert.equal(policy(body({ enabled: false, hotDays: 1 })).enabled, false)
  assert.equal(policy(body({ hotDays: 3650 })).hotDays, 3650)
  assert.equal(retention.AUDIT_RETENTION_MIN_HOT_DAYS, 1)
  assert.equal(retention.AUDIT_RETENTION_MAX_HOT_DAYS, 3650)
  assert.equal(Object.hasOwn(policy(body()), 'executor'), false)
})
test('hot days, revision and enable state refuse coercion, missing values and unbounded numbers', () => {
  for (const hotDays of [
    0,
    -1,
    3651,
    1.5,
    Infinity,
    NaN,
    '90',
    null,
    [],
    undefined,
  ])
    invalid(policy, body({ hotDays }))
  for (const enabled of [0, 1, 'true', 'false', null, undefined, {}])
    invalid(policy, body({ enabled }))
  for (const expectedRevision of [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    '1',
    null,
    undefined,
  ]) {
    invalid(policy, body({ expectedRevision }))
    invalid(command, { expectedRevision })
  }
})
test('policy commands require an actual IANA location or UTC and never accept a client clock', () => {
  assert.equal(policy(body({ timeZone: 'UTC' })).timeZone, 'UTC')
  assert.equal(
    policy(body({ timeZone: 'America/New_York' })).timeZone,
    'America/New_York'
  )
  for (const timeZone of [
    '+08:00',
    'CST',
    'GMT',
    'Mars/Olympus',
    '',
    null,
    undefined,
    ['UTC'],
    new Date(),
  ])
    invalid(policy, body({ timeZone }))
  for (const key of ['now', 'boundaryAt', 'scheduledAt', 'lastRunAt'])
    invalid(policy, body({ [key]: '2026-10-13T00:00:00.000Z' }))
})
test('policy clients cannot restore a privileged executor, tenant, status or physical deletion policy', () => {
  for (const key of [
    'executor',
    'executorId',
    'actorId',
    'tenantId',
    'status',
    'nextRunAt',
    'lastRunId',
    'purge',
    'deleteAfterDays',
    'retentionUntil',
    'restoreExecutor',
  ])
    invalid(policy, body({ [key]: 'administrator' }))
  for (const version of [0, 2, '1', null, false, []])
    invalid(policy, body({ version }))
  assert.deepEqual(policy(body({ version: 1 })), policy(body()))
})
test('manual runs preserve a normalized v1 query and only the actual CSV/XLSX/PDF formats', () => {
  for (const format of ['csv', 'xlsx', 'pdf']) {
    const created = run({
      format,
      query: {
        current: '3',
        pageSize: '100',
        operatorName: '张三_%',
        targetId: '_opaque-id',
        to: '2026-10-13',
      },
    })
    assert.equal(created.version, 1)
    assert.equal(created.format, format)
    assert.equal(created.query.version, 1)
    assert.equal(created.query.current, 3)
    assert.equal(created.query.pageSize, 100)
    assert.equal(created.query.operatorName, '张三_%')
    assert.equal(created.query.from, '')
    assert.equal(created.query.to, '2026-10-13')
    assert.equal(Object.hasOwn(created.query, 'archiveState'), false)
  }
  for (const format of ['CSV', 'html', 'pdf.exe', '', null, [], undefined])
    invalid(run, { format, query: {} })
  invalid(run, { format: 'csv' })
  invalid(run, { query: {} })
})
test('manual run bodies reject candidate IDs, snapshots, pagination cursors and server batch controls', () => {
  for (const key of [
    'rows',
    'eventIds',
    'candidates',
    'candidateTotal',
    'candidateHash',
    'cursor',
    'offset',
    'batchSize',
    'maxRows',
    'snapshot',
    'executor',
    'tenantId',
    'source',
    'dataCutoffAt',
    'producerVersion',
    'policyRevision',
    'trigger',
  ])
    invalid(run, { format: 'csv', query: {}, [key]: [] })
  for (const version of [0, 2, '1', null])
    invalid(run, { version, format: 'csv', query: {} })
})
test('cancel and retry commands retain positive revisions but cannot choose state, attempts or frozen candidates', () => {
  for (const parse of [
    command,
    retention.parseAuditArchiveRunCancel,
    retention.parseAuditArchiveRunRetry,
  ]) {
    assert.deepEqual(parse({ expectedRevision: 9 }), {
      version: 1,
      expectedRevision: 9,
    })
    assert.deepEqual(parse({ version: 1, expectedRevision: 10 }), {
      version: 1,
      expectedRevision: 10,
    })
    for (const field of [
      'status',
      'action',
      'attempts',
      'candidateRange',
      'query',
      'format',
      'executorId',
      'policyRevision',
    ])
      invalid(parse, { expectedRevision: 1, [field]: 'client' })
    invalid(parse, { version: 2, expectedRevision: 1 })
  }
})
test('v2 is explicit and preserves omitted archive state rather than materializing all', () => {
  const omitted = queryV2({ version: 2 })
  assert.equal(omitted.version, 2)
  assert.equal(Object.hasOwn(omitted, 'archiveState'), false)
  assert.equal(Object.keys(omitted).includes('archiveState'), false)
  assert.deepEqual(queryV2({ version: '2' }), omitted)
  for (const archiveState of ['all', 'hot', 'archived'])
    assert.equal(
      queryV2({ version: 2, archiveState }).archiveState,
      archiveState
    )
  for (const archiveState of [
    undefined,
    null,
    '',
    'cold',
    'deleted',
    'archived,hot',
    ['hot'],
    {},
  ])
    invalid(queryV2, { version: 2, archiveState })
  for (const version of [undefined, 0, 1, '1', 3, '3', null, true])
    invalid(queryV2, { version })
})
test('v2 delegates exactly the v1 literal/date/timezone/paging rules and does not loosen module identifiers', () => {
  const normalized = queryV2({
    version: 2,
    archiveState: 'hot',
    operatorName: '订单 < 10_%',
    traceId: '-opaque-trace',
    targetId: '_opaque-target',
    to: '2026-10-13',
    timeZone: 'America/New_York',
  })
  assert.equal(normalized.operatorName, '订单 < 10_%')
  assert.equal(normalized.from, '')
  assert.equal(normalized.to, '2026-10-13')
  for (const patch of [
    { current: 0 },
    { pageSize: 101 },
    { module: '-invalid-module' },
    { module: '_invalid-module' },
    { operatorName: '<script>alert(1)</script>' },
    { traceId: '../path' },
    { to: '2026-02-29' },
    { from: '2024-01-01', to: '2025-01-01' },
    { from: '2026-01-02', to: '2026-01-01' },
    { timeZone: '+08:00' },
    { 'dateRange[]': ['', '2026-10-13'] },
  ])
    invalid(queryV2, { version: 2, ...patch })
})
test('archiveState is not accidentally accepted into manual v1 run queries or the frozen public v1 parser', () => {
  invalid(run, { format: 'csv', query: { archiveState: 'all' } })
  invalid(run, { format: 'csv', query: { version: 2, archiveState: 'hot' } })
  invalid(audit.parseAuditQuery, { version: 1, archiveState: 'all' })
  invalid(audit.parseAuditQuery, { version: 2 })
})
test('unknown top-level and nested factual properties never disappear during normalization', () => {
  for (const field of [
    'detail',
    'source',
    'actor',
    'projectionVersion',
    'rows',
    'ids',
    'archiveMembership',
    'includePrivate',
  ]) {
    invalid(queryV2, { version: 2, [field]: {} })
    invalid(run, { format: 'csv', query: { [field]: {} } })
  }
  invalid(policy, body({ hotDays: { value: 90 } }))
  invalid(queryV2, { version: 2, operatorName: { value: '张三' } })
})
test('plain/null-prototype data objects work but class instances, arrays and sparse arrays do not', () => {
  assert.equal(policy(Object.assign(Object.create(null), body())).hotDays, 90)
  assert.equal(
    queryV2(Object.assign(Object.create(null), { version: 2 })).version,
    2
  )
  const sparse = []
  sparse.length = 2
  sparse[1] = 'hidden'
  for (const input of [
    [],
    sparse,
    new Date(),
    Object.create({ version: 1 }),
    null,
    'body',
  ]) {
    invalid(policy, input)
    invalid(run, input)
    invalid(command, input)
    invalid(queryV2, input)
    invalid(run, { format: 'csv', query: input })
  }
})
test('accessors, symbols, nonenumerable fields and own proto keys are rejected before getters execute', () => {
  const never = () => {
    throw new Error('Getter must not run')
  }
  invalid(
    policy,
    Object.defineProperty(body(), 'hotDays', { get: never, enumerable: true })
  )
  invalid(
    command,
    Object.defineProperty({}, 'expectedRevision', {
      get: never,
      enumerable: true,
    })
  )
  invalid(
    queryV2,
    Object.defineProperty({ version: 2 }, 'archiveState', {
      get: never,
      enumerable: true,
    })
  )
  invalid(run, {
    format: 'csv',
    query: Object.defineProperty({}, 'current', {
      get: never,
      enumerable: true,
    }),
  })
  invalid(queryV2, { version: 2, [Symbol('rows')]: [] })
  invalid(
    policy,
    Object.defineProperty(body(), 'executor', { value: 'administrator' })
  )
  invalid(run, {
    format: 'csv',
    query: Object.defineProperty({}, 'current', { value: 1 }),
  })
  invalid(
    queryV2,
    JSON.parse('{"version":2,"__proto__":{"archiveState":"all"}}')
  )
})
test('legacy producer-1 canonical query and snapshot bytes remain unchanged after v2 and archive-run parsing', () => {
  const legacy = audit.parseAuditQuery({
    current: 2,
    module: 'auth',
    eventType: 'operation',
    operatorName: '张三_%',
    targetId: 'target-1',
    traceId: 'trace-1',
    to: '2026-10-13',
  })
  const expected =
    '{"current":2,"eventType":"operation","from":"","module":"auth","operatorName":"张三_%","pageSize":20,"result":"","targetId":"target-1","timeZone":"Asia/Shanghai","to":"2026-10-13","traceId":"trace-1","version":1}'
  assert.equal(canonical(legacy), expected)
  const snapshot = Object.freeze({
    version: 1,
    producerVersion: 1,
    projectionVersion: 1,
    source: 'server',
    query: Object.freeze(legacy),
    queriedAt: '2026-10-13T12:00:00.000Z',
    dataCutoffAt: '2026-10-13T12:00:00.000Z',
    rows: Object.freeze([]),
    total: 0,
  })
  const bytes = Buffer.from(canonical(snapshot)),
    digest = createHash('sha256').update(bytes).digest('hex')
  const v2 = queryV2(Object.freeze({ ...legacy, version: 2 }))
  queryV2({ ...legacy, version: 2, archiveState: 'archived' })
  const manual = run(
    Object.freeze({ version: 1, query: legacy, format: 'pdf' })
  )
  assert.equal(Object.hasOwn(v2, 'archiveState'), false)
  assert.equal(canonical(manual.query), expected)
  assert.deepEqual(Buffer.from(canonical(snapshot)), bytes)
  assert.equal(
    createHash('sha256').update(canonical(snapshot)).digest('hex'),
    digest
  )
  assert.equal(snapshot.producerVersion, 1)
})
test('operational vocabulary distinguishes runs, batches and permanent membership from artifact expiry without a purge API', () => {
  assert.equal(retention.AUDIT_ARCHIVE_BATCH_PRODUCER_VERSION, 2)
  assert.equal(retention.AUDIT_ARCHIVE_BATCH_MAX_ROWS, 2000)
  assert.equal(retention.AUDIT_ARCHIVE_BATCH_MAX_SNAPSHOT_BYTES, 2097152)
  assert.equal(retention.AUDIT_ARCHIVE_BATCH_MAX_FILE_BYTES, 10485760)
  assert.equal(retention.AUDIT_ARCHIVE_MAX_ATTEMPTS, 5)
  assert.equal(retention.AUDIT_ARCHIVE_MAX_CANDIDATES, 100000)
  assert.ok(retention.AUDIT_ARCHIVE_RUN_STATUSES.includes('blocked'))
  assert.ok(retention.AUDIT_ARCHIVE_BATCH_STATUSES.includes('infected'))
  assert.equal(retention.AUDIT_ARCHIVE_RUN_STATUSES.includes('expired'), false)
  assert.equal(
    retention.AUDIT_ARCHIVE_BATCH_STATUSES.includes('expired'),
    false
  )
  for (const key of [
    'parseAuditArchiveBatchSnapshot',
    'parseAuditArchiveCandidateManifest',
    'parseAuditArchiveMembership',
    'parseAuditEventPurge',
  ])
    assert.equal(Object.hasOwn(retention, key), false)
})
test('normalization is independent of frozen caller objects and cannot mutate a stored policy command or date side', () => {
  const original = Object.freeze(body()),
    normalized = policy(original)
  normalized.hotDays = 1
  assert.equal(original.hotDays, 90)
  const query = Object.freeze({
    version: 2,
    from: '',
    to: '2026-10-13',
    archiveState: 'hot',
  })
  const parsed = queryV2(query)
  parsed.archiveState = 'all'
  assert.equal(query.archiveState, 'hot')
  assert.equal(query.from, '')
  assert.equal(parsed.to, '2026-10-13')
})
