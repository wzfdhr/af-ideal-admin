import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchPublishedReportingDefinitions,
  fetchReportingDefinitions,
  fetchReportingSources,
  getReportingDefinition,
  getReportingVersionCatalogue,
  publishReportingDefinition,
  queryReportingVersion,
  saveReportingDefinition,
  setReportingDefinitionEnabled,
} from '@/api/reporting'
import type {
  ReportingDefinitionRecord,
  ReportingDefinitionV1,
  ReportingDefinitionVersion,
  ReportingQueryResultV1,
  ReportingQueryV1,
  ReportingSourceCatalogue,
} from '@af-admin/contracts'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))
vi.mock('@/api/request', () => ({ default: requestMock }))

const id = 'definition/with ?#中文'
const versionId = 'version/with ?#中文'
const key = 'report-command-1'
const headers = { headers: { 'Idempotency-Key': key } }
const schema: ReportingDefinitionV1 = {
  version: 1,
  name: '申请记录明细',
  source: { kind: 'application-records', applicationId: 'application-1' },
  kind: 'detail',
  metric: 'count',
  factTime: 'createdAt',
  timeZone: 'Asia/Shanghai',
  fields: [
    { kind: 'metadata', id: 'createdAt' },
    { kind: 'metadata', id: 'status' },
    { kind: 'field', id: 'subject' },
  ],
}
const version: ReportingDefinitionVersion = {
  id: versionId,
  definitionId: id,
  version: 2,
  schema,
  sourceReleaseId: 'fixed-source-release-4',
  sourceReleaseVersion: 4,
  contentHash: 'fixed-version-hash',
  publishedBy: 'publisher-1',
  publishedAt: '2026-10-13T08:00:00.000Z',
}
const record: ReportingDefinitionRecord = {
  id,
  schema,
  revision: 8,
  enabled: true,
  activeVersionId: versionId,
  createdBy: 'author-1',
  updatedAt: '2026-10-13T08:00:00.000Z',
  versions: [version],
  draftChanged: true,
}
const query: ReportingQueryV1 = {
  version: 1,
  timeZone: 'Asia/Shanghai',
  dateRange: { from: '2026-10-01', to: '2026-10-13' },
  statuses: ['approved'],
  keyword: '申请',
  searchFields: [{ kind: 'field', id: 'subject' }],
  sort: { field: { kind: 'metadata', id: 'createdAt' }, direction: 'desc' },
  current: 2,
  pageSize: 20,
}
const catalogue: ReportingSourceCatalogue = {
  source: schema.source,
  applicationName: '真实申请应用',
  sourceReleaseId: version.sourceReleaseId,
  sourceReleaseVersion: version.sourceReleaseVersion,
  visibleFields: [
    {
      reference: { kind: 'field', id: 'subject' },
      key: 'field:subject',
      label: '申请主题',
      valueType: 'text',
      searchable: true,
      sortable: true,
    },
  ],
  hiddenFields: [
    {
      reference: { kind: 'metadata', id: 'applicantName' },
      reason: 'permission-denied',
    },
  ],
}
const result: ReportingQueryResultV1 = {
  version: 1,
  definitionId: id,
  definitionVersion: version.version,
  source: schema.source,
  sourceReleaseId: version.sourceReleaseId,
  sourceReleaseVersion: version.sourceReleaseVersion,
  policyVersion: 1,
  kind: 'detail',
  metric: 'count',
  factTime: 'createdAt',
  timeZone: query.timeZone,
  dateRange: query.dateRange,
  queriedAt: '2026-10-13T08:05:00.000Z',
  dataCutoffAt: '2026-10-13T08:04:59.000Z',
  scope: 'current-authorized-records',
  releaseScope: 'fixed-published-source',
  visibleFields: catalogue.visibleFields,
  hiddenFields: catalogue.hiddenFields,
  current: query.current,
  pageSize: query.pageSize,
  total: 21,
  rows: [
    {
      id: 'record-21',
      values: { 'field:subject': null },
      hiddenFieldKeys: ['field:subject'],
    },
  ],
  trend: [],
  distribution: [],
}

describe('persistent reporting api', () => {
  beforeEach(() => vi.resetAllMocks())

  it('loads a declared source page without inferring total from the visible list', async () => {
    const page = { list: [catalogue], total: 143, current: 1, pageSize: 20 }
    requestMock.get.mockResolvedValueOnce({ data: page })
    expect(await fetchReportingSources()).toBe(page)
    expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(
      '/reporting/sources',
      { params: { current: 1, pageSize: 20, keyword: '' } }
    )
  })
  it('passes source keyword, pagination and exact application ID without guessing a release or fetching every page', async () => {
    const params = {
      current: 4,
      pageSize: 10,
      keyword: '来源%_',
      applicationId: 'application/with ?#',
    }
    const page = { list: [catalogue], total: 1, current: 4, pageSize: 10 }
    requestMock.get.mockResolvedValueOnce({ data: page })
    expect(await fetchReportingSources(params)).toBe(page)
    expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(
      '/reporting/sources',
      { params }
    )
  })

  it.each([
    ['/reporting/definitions', fetchReportingDefinitions, record],
    [
      '/reporting/definitions/published',
      fetchPublishedReportingDefinitions,
      version,
    ],
  ] as const)(
    'lists %s with server pagination and filters',
    async (url, fetch, item) => {
      const params = { current: 2, pageSize: 20, keyword: '申请' }
      const page = { list: [item], total: 21 }
      requestMock.get.mockResolvedValueOnce({ data: page })

      expect(await fetch(params)).toBe(page)
      expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(url, { params })
    }
  )

  it('loads a definition and its server versions with the identity encoded as one path segment', async () => {
    requestMock.get.mockResolvedValueOnce({ data: record })

    expect(await getReportingDefinition(id)).toBe(record)
    expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(
      `/reporting/definitions/${encodeURIComponent(id)}`
    )
  })

  it('creates the authored schema with its command key without inventing a revision or fixed source release', async () => {
    requestMock.post.mockResolvedValueOnce({ data: record })

    expect(await saveReportingDefinition(schema, key)).toBe(record)
    expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
      '/reporting/definitions',
      { schema },
      headers
    )
    expect(requestMock.put).not.toHaveBeenCalled()
  })

  it('updates using the record revision rather than its published definition or source version', async () => {
    requestMock.put.mockResolvedValueOnce({ data: record })

    expect(await saveReportingDefinition(schema, key, record)).toBe(record)
    expect(requestMock.put).toHaveBeenCalledExactlyOnceWith(
      `/reporting/definitions/${encodeURIComponent(id)}`,
      { schema, expectedRevision: 8 },
      headers
    )
    expect(requestMock.post).not.toHaveBeenCalled()
  })

  it('publishes the current revision with a command key without submitting an active snapshot as new content', async () => {
    requestMock.post.mockResolvedValueOnce({ data: record })

    expect(await publishReportingDefinition(record, key)).toBe(record)
    expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
      `/reporting/definitions/${encodeURIComponent(id)}/publish`,
      { expectedRevision: 8 },
      headers
    )
  })

  it.each([true, false])(
    'sets enabled=%s with the optimistic revision and command key',
    async (enabled) => {
      requestMock.post.mockResolvedValueOnce({ data: record })

      expect(await setReportingDefinitionEnabled(record, enabled, key)).toBe(
        record
      )
      expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
        `/reporting/definitions/${encodeURIComponent(id)}/enabled`,
        { expectedRevision: 8, enabled },
        headers
      )
    }
  )

  it('loads current field authorization for an explicitly selected immutable version without reading the private draft', async () => {
    requestMock.get.mockResolvedValueOnce({ data: catalogue })

    expect(await getReportingVersionCatalogue(versionId)).toBe(catalogue)
    expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(
      `/reporting/versions/${encodeURIComponent(versionId)}/catalogue`
    )
    expect(requestMock.post).not.toHaveBeenCalled()
  })

  it('queries the immutable version with only conditions and preserves the server projection and fixed-source metadata', async () => {
    requestMock.post.mockResolvedValueOnce({ data: result })

    expect(await queryReportingVersion(versionId, query)).toBe(result)
    expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
      `/reporting/versions/${encodeURIComponent(versionId)}/query`,
      { query }
    )
    expect(requestMock.get).not.toHaveBeenCalled()
  })

  it.each([
    [
      'published definitions',
      () => fetchPublishedReportingDefinitions({ current: 1, pageSize: 20 }),
    ],
    ['fixed-version catalogue', () => getReportingVersionCatalogue(versionId)],
  ] as const)(
    'propagates denied %s reads without falling back to private definitions',
    async (_, read) => {
      const denied = new Error('REPORTING_PERMISSION_DENIED')
      requestMock.get.mockRejectedValueOnce(denied)

      await expect(read()).rejects.toBe(denied)
      expect(requestMock.get).toHaveBeenCalledTimes(1)
      expect(requestMock.post).not.toHaveBeenCalled()
      expect(requestMock.put).not.toHaveBeenCalled()
    }
  )

  it('propagates a denied query without fabricating an empty result or querying another version', async () => {
    const denied = new Error('REPORTING_FIELD_PERMISSION_DENIED')
    requestMock.post.mockRejectedValueOnce(denied)

    await expect(queryReportingVersion(versionId, query)).rejects.toBe(denied)
    expect(requestMock.post).toHaveBeenCalledTimes(1)
    expect(requestMock.get).not.toHaveBeenCalled()
  })

  it.each([
    ['update', 'put', () => saveReportingDefinition(schema, key, record)],
    ['publish', 'post', () => publishReportingDefinition(record, key)],
    [
      'disable',
      'post',
      () => setReportingDefinitionEnabled(record, false, key),
    ],
  ] as const)(
    'propagates a %s revision conflict without replaying or mutating the fixed version',
    async (_, method, command) => {
      const before = JSON.parse(JSON.stringify(record))
      const conflict = new Error('REPORTING_REVISION_CONFLICT')
      requestMock[method].mockRejectedValueOnce(conflict)

      await expect(command()).rejects.toBe(conflict)
      expect(requestMock[method]).toHaveBeenCalledTimes(1)
      expect(record).toEqual(before)
    }
  )
})
