import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseReportExportCreate,
  parseReportExportCommand,
  parseReportExportArchive,
  PLATFORM_PERMISSION_CATALOGUE,
  REPORT_EXPORT_PERMISSIONS,
} from '../dist/index.js'

const query = () => ({
  version: 1,
  timeZone: 'Asia/Shanghai',
  dateRange: { from: '2026-10-01', to: '2026-10-13' },
  statuses: ['draft'],
  keyword: '',
  searchFields: [],
  sort: { field: { kind: 'metadata', id: 'createdAt' }, direction: 'desc' },
  current: 2,
  pageSize: 10,
})
const create = (extra = {}) => ({
  definitionVersionId: 'version-fixed-1',
  query: query(),
  format: 'csv',
  ...extra,
})
const invalid = (run) => assert.throws(run, (error) => {
  assert.equal(error.status, 422)
  assert.equal(error.businessCode, 'VALIDATION_ERROR')
  return true
})

test('export creation preserves approved query and supports only registered formats', () => {
  for (const format of ['csv', 'xlsx', 'pdf']) {
    const request = create({ format })
    const result = parseReportExportCreate(request)
    assert.deepEqual(result, request)
    request.query.statuses.push('running')
    request.query.dateRange.to = '2026-10-31'
    assert.deepEqual(result.query.statuses, ['draft'])
    assert.equal(result.query.dateRange.to, '2026-10-13')
  }
  for (const format of [null, undefined, 'CSV', 'sql', 'html', 'docx', [], 1])
    invalid(() => parseReportExportCreate(create({ format })))
})

test('export commands reject client supplied output, authority, paths and completion facts', () => {
  for (const key of [
    'rows', 'columns', 'total', 'totalRows', 'snapshot', 'tenantId', 'createdBy',
    'status', 'stage', 'processedRows', 'artifact', 'scanEngine', 'sha256',
    'objectKey', 'fileName', 'sourceReleaseId', 'policyVersion', 'producerVersion', 'leaseUntil',
    'success', 'scenario', 'sql', 'recipientIds',
  ]) invalid(() => parseReportExportCreate(create({ [key]: 'forged' })))
  for (const request of [null, [], 'json', 5])
    invalid(() => parseReportExportCreate(request))
})

test('export creation rejects future query formats, unbounded pages and calendar or source expressions', () => {
  for (const patch of [
    { version: 2 },
    { pageSize: 2000 },
    { current: 0 },
    { timeZone: 'unregistered/time-zone' },
    { dateRange: { from: '2026-02-30', to: '2026-10-13' } },
    { dateRange: { from: '2025-01-01', to: '2026-10-13' } },
    { sort: { field: { kind: 'jsonPath', id: '$.fields.secret' }, direction: 'desc' } },
    { rows: [] },
  ]) invalid(() => parseReportExportCreate(create({ query: { ...query(), ...patch } })))
  for (const definitionVersionId of ['', ' ', null, 1, 'x'.repeat(101)])
    invalid(() => parseReportExportCreate(create({ definitionVersionId })))
})

test('cancel and retry require an exact positive revision and no writable job facts', () => {
  assert.deepEqual(parseReportExportCommand({ expectedRevision: 7 }), { expectedRevision: 7 })
  for (const expectedRevision of [undefined, null, 0, -1, 1.2, '1', Infinity, Number.MAX_SAFE_INTEGER + 1])
    invalid(() => parseReportExportCommand({ expectedRevision }))
  for (const key of ['status', 'attempts', 'leaseUntil', 'snapshot', 'actorId', 'errorCode'])
    invalid(() => parseReportExportCommand({ expectedRevision: 1, [key]: 'forged' }))
})

test('archive is an explicit versioned command and cannot select arbitrary expiry or storage', () => {
  for (const archived of [true, false])
    assert.deepEqual(parseReportExportArchive({ archived, expectedRevision: 3 }), { archived, expectedRevision: 3 })
  for (const archived of [undefined, null, 0, 1, 'true', 'false'])
    invalid(() => parseReportExportArchive({ archived, expectedRevision: 3 }))
  for (const key of ['expiresAt', 'expiredAt', 'archivedAt', 'retentionDays', 'objectKey'])
    invalid(() => parseReportExportArchive({ archived: true, expectedRevision: 3, [key]: 'forged' }))
  invalid(() => parseReportExportArchive({ archived: true }))
})

test('every independently revocable export capability is present exactly once in the permission catalogue', () => {
  for (const code of Object.values(REPORT_EXPORT_PERMISSIONS)) {
    const entries = PLATFORM_PERMISSION_CATALOGUE.filter((item) => item.code === code)
    assert.equal(entries.length, 1, code)
    assert.ok(entries[0].title)
  }
})
