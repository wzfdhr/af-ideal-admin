import assert from 'node:assert/strict'
import { test } from 'node:test'

const { default: governance } = await import(
  process.env.AUDIT_GOVERNANCE_CONTRACT_MODULE ||
    new URL('../dist/audit-governance.js', import.meta.url).href
)
const {
  parseAuditExportCreate: create,
  parseAuditExportQuery: query,
  parseAuditExportCommand: command,
  parseAuditExportArchive: archive,
} = governance
const expectInvalid = (parse, input) =>
  assert.throws(
    () => parse(input),
    (error) =>
      error.name === 'DomainError' &&
      error.status === 422 &&
      error.businessCode === 'VALIDATION_ERROR'
  )
const creation = (extra = {}) => ({ query: {}, format: 'csv', ...extra })

test('permissions and retention defaults are audit-specific without report, file or purge authority', () => {
  assert.deepEqual(governance.AUDIT_EXPORT_PERMISSIONS, {
    list: 'audit:export:list',
    create: 'audit:export:create',
    cancel: 'audit:export:cancel',
    retry: 'audit:export:retry',
    archive: 'audit:export:archive',
    download: 'audit:export:download',
  })
  assert.deepEqual(governance.AUDIT_RETENTION_PERMISSIONS, {
    manage: 'audit:retention:manage',
  })
  assert.equal(governance.AUDIT_EXPORT_ACTIVE_RETENTION_DAYS, 7)
  assert.equal(governance.AUDIT_EXPORT_ARCHIVE_RETENTION_DAYS, 365)
  assert.equal(
    Object.hasOwn(governance.AUDIT_EXPORT_PERMISSIONS, 'purge'),
    false
  )
})
test('size and version bounds are explicit operational constants, not client-controlled values', () => {
  assert.equal(governance.AUDIT_EXPORT_VERSION, 1)
  assert.equal(governance.AUDIT_EXPORT_PRODUCER_VERSION, 1)
  assert.equal(governance.AUDIT_EXPORT_PROJECTION_VERSION, 1)
  assert.equal(governance.AUDIT_EXPORT_MAX_ROWS, 2000)
  assert.equal(governance.AUDIT_EXPORT_MAX_SNAPSHOT_BYTES, 2097152)
  assert.equal(governance.AUDIT_EXPORT_MAX_FILE_BYTES, 10485760)
  for (const [key, value] of [
    ['maxRows', 2001],
    ['maxRows', 1],
    ['maxSnapshotBytes', 2097153],
    ['maxFileBytes', 10485761],
    ['size', -1],
    ['retentionDays', 9999],
  ])
    expectInvalid(create, creation({ [key]: value }))
})
test('all three closed formats normalize to version one with a real audit query', () => {
  for (const format of ['csv', 'xlsx', 'pdf']) {
    const result = create(creation({ format }))
    assert.equal(result.version, 1)
    assert.equal(result.format, format)
    assert.equal(result.query.version, 1)
    assert.equal(result.query.timeZone, 'Asia/Shanghai')
  }
  assert.deepEqual(create(creation({ version: 1 })), create(creation()))
})
test('future or coerced command versions and unsupported formats fail closed', () => {
  for (const version of [0, 2, '1', '2', null, false, [], { version: 1 }]) {
    expectInvalid(create, creation({ version }))
    expectInvalid(command, { version, expectedRevision: 1 })
    expectInvalid(archive, { version, expectedRevision: 1, archived: true })
  }
  for (const format of [
    'CSV',
    'pdf.exe',
    'html',
    '',
    null,
    1,
    ['csv'],
    { toString: () => 'csv' },
  ])
    expectInvalid(create, creation({ format }))
})
test('creation requires its actual query and format and rejects nonexistent report source identity', () => {
  expectInvalid(create, {})
  expectInvalid(create, { query: {} })
  expectInvalid(create, { format: 'csv' })
  for (const field of [
    'definitionId',
    'definitionVersionId',
    'sourceReleaseId',
    'source',
    'applicationId',
  ])
    expectInvalid(create, creation({ [field]: 'foreign-report-source' }))
})
test('the audit query preserves literal Unicode names, exact identities and both single-sided date forms', () => {
  const actual = create(
    creation({
      query: {
        version: '1',
        operatorName: '张三_% Ольга',
        targetId: 'target-1',
        traceId: 'trace-2',
        module: 'future-module',
        from: '',
        to: '2026-10-13',
        timeZone: 'America/New_York',
        current: '3',
        pageSize: '20',
      },
    })
  )
  assert.equal(actual.query.operatorName, '张三_% Ольга')
  assert.equal(actual.query.targetId, 'target-1')
  assert.equal(actual.query.traceId, 'trace-2')
  assert.equal(actual.query.from, '')
  assert.equal(actual.query.to, '2026-10-13')
  assert.equal(actual.query.current, 3)
  assert.equal(actual.query.pageSize, 20)
  assert.equal(query({ from: '2026-01-01' }).to, '')
  assert.equal(query({ to: '2026-01-01' }).from, '')
  assert.equal(query({ operatorName: '订单 < 10' }).operatorName, '订单 < 10')
})
test('export query retains shared calendar, timezone, pagination and future-schema rejection', () => {
  for (const input of [
    { version: 2 },
    { from: '2026-02-29' },
    { from: '2024-01-01', to: '2025-01-01' },
    { from: '2026-01-02', to: '2026-01-01' },
    { timeZone: '+08:00' },
    { pageSize: 101 },
    { current: 1000001 },
    { dateRange: ['', '2026-10-13'] },
    { 'dateRange[]': ['', '2026-10-13'] },
  ]) {
    expectInvalid(query, input)
    expectInvalid(create, creation({ query: input }))
  }
})
test('forged facts, current identities and scanner results are never accepted as creation fields', () => {
  const forged = {
    rows: [],
    events: [],
    snapshot: {},
    total: 0,
    totalRows: 0,
    processedRows: 0,
    queriedAt: '2026-10-13T00:00:00Z',
    dataCutoffAt: '2026-10-13T00:00:00Z',
    producerVersion: 1,
    projectionVersion: 1,
    actorId: 'administrator',
    operator: { id: 'administrator' },
    createdBy: 'administrator',
    ownerId: 'administrator',
    tenantId: 'other-tenant',
    visibleFields: ['operator.id'],
    hiddenFields: [],
    scannedAt: '2026-10-13T00:00:00Z',
    scanEngine: 'forged-clean',
    scanResult: 'clean',
    status: 'completed',
    artifact: {},
    sha256: '0'.repeat(64),
  }
  for (const [key, value] of Object.entries(forged))
    expectInvalid(create, creation({ [key]: value }))
})
test('nested query cannot smuggle output facts or script-like selectors through an allowed top-level key', () => {
  for (const input of [
    { source: 'server' },
    { rows: [] },
    { detail: { password: 'private' } },
    { scanner: 'clean' },
    { ownerId: 'administrator' },
    { query: { sql: 'SELECT *' } },
    { operatorName: '<script>alert(1)</script>' },
    { module: 'audit;DROP TABLE' },
  ])
    expectInvalid(create, creation({ query: input }))
})
test('cancel and retry use the same numeric positive safe revision command without accepting arbitrary transitions', () => {
  for (const parse of [
    command,
    governance.parseAuditExportCancel,
    governance.parseAuditExportRetry,
  ]) {
    assert.deepEqual(parse({ expectedRevision: 3 }), {
      version: 1,
      expectedRevision: 3,
    })
    assert.equal(
      parse({ expectedRevision: Number.MAX_SAFE_INTEGER }).expectedRevision,
      Number.MAX_SAFE_INTEGER
    )
    for (const expectedRevision of [
      undefined,
      0,
      -1,
      1.5,
      '1',
      null,
      false,
      Infinity,
      NaN,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expectInvalid(parse, { expectedRevision })
    for (const field of [
      'status',
      'action',
      'attempts',
      'claimedBy',
      'leaseUntil',
      'retryAt',
      'rows',
      'query',
    ])
      expectInvalid(parse, { expectedRevision: 1, [field]: 'forged' })
  }
})
test('archive and unarchive require an explicit boolean and a fresh caller revision, not a supplied expiry', () => {
  for (const archived of [true, false])
    assert.deepEqual(archive({ expectedRevision: 7, archived }), {
      version: 1,
      expectedRevision: 7,
      archived,
    })
  for (const archived of [undefined, 0, 1, 'true', 'false', null, [], {}])
    expectInvalid(archive, { expectedRevision: 1, archived })
  for (const key of [
    'archivedAt',
    'expiresAt',
    'expiredAt',
    'retentionUntil',
    'purge',
    'policy',
    'retentionDays',
  ])
    expectInvalid(archive, {
      expectedRevision: 1,
      archived: true,
      [key]: 'client-provided',
    })
  expectInvalid(archive, { expectedRevision: 0, archived: true })
})
test('arrays and sparse arrays are invalid command or nested-query objects', () => {
  const sparse = []
  sparse.length = 2
  sparse[1] = 'forged'
  for (const input of [[], sparse, [creation()], null, new Date(), 'command']) {
    expectInvalid(create, input)
    expectInvalid(command, input)
    expectInvalid(archive, input)
    expectInvalid(create, creation({ query: input }))
  }
})
test('prototype-bearing objects, own proto keys and nonenumerable fields are rejected', () => {
  expectInvalid(
    create,
    Object.assign(Object.create({ inherited: true }), creation())
  )
  expectInvalid(
    create,
    JSON.parse('{"query":{},"format":"csv","__proto__":{"source":"server"}}')
  )
  expectInvalid(
    create,
    Object.defineProperty(creation(), 'snapshot', { value: {} })
  )
  expectInvalid(
    create,
    Object.defineProperty({ format: 'csv' }, 'query', {
      value: {},
      enumerable: false,
    })
  )
  assert.equal(
    create(Object.assign(Object.create(null), creation())).format,
    'csv'
  )
})
test('accessors and symbols are rejected before executing a getter or dropping a hidden payload', () => {
  const explosive = () => {
    throw new Error('getter must not be executed')
  }
  for (const key of ['query', 'format', 'version'])
    expectInvalid(
      create,
      Object.defineProperty(creation(), key, {
        get: explosive,
        enumerable: true,
      })
    )
  expectInvalid(
    command,
    Object.defineProperty({}, 'expectedRevision', {
      get: explosive,
      enumerable: true,
    })
  )
  expectInvalid(
    archive,
    Object.defineProperty({ expectedRevision: 1 }, 'archived', {
      get: explosive,
      enumerable: true,
    })
  )
  expectInvalid(create, creation({ [Symbol('snapshot')]: {} }))
  expectInvalid(
    create,
    creation({
      query: Object.defineProperty({}, 'current', {
        get: explosive,
        enumerable: true,
      }),
    })
  )
})
test('normalization preserves frozen caller input and creates independent objects', () => {
  const originalQuery = Object.freeze({
    operatorName: ' 未来身份_% ',
    to: '2026-10-13',
  })
  const input = Object.freeze(creation({ query: originalQuery }))
  const result = create(input)
  result.query.operatorName = 'changed'
  assert.equal(input.query.operatorName, ' 未来身份_% ')
  assert.notEqual(result, input)
  assert.notEqual(result.query, originalQuery)
  const originalCommand = Object.freeze({
    expectedRevision: 9,
    archived: false,
  })
  assert.deepEqual(archive(originalCommand), {
    version: 1,
    expectedRevision: 9,
    archived: false,
  })
  assert.deepEqual(originalCommand, { expectedRevision: 9, archived: false })
})
test('lifecycle vocabulary represents expiry and quarantine without offering physical deletion', () => {
  assert.ok(governance.AUDIT_EXPORT_STATUSES.includes('expired'))
  assert.ok(governance.AUDIT_EXPORT_ARTIFACT_STATUSES.includes('quarantined'))
  assert.ok(governance.AUDIT_EXPORT_ALLOWED_ACTIONS.includes('unarchive'))
  assert.equal(governance.AUDIT_EXPORT_ALLOWED_ACTIONS.includes('purge'), false)
  for (const key of [
    'parseAuditExportSnapshot',
    'parseAuditExportArtifact',
    'parseAuditExportEvent',
    'parseAuditRetentionPolicy',
  ])
    assert.equal(Object.hasOwn(governance, key), false)
})
