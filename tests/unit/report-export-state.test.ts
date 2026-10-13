import { createHash, webcrypto } from 'node:crypto'
import { Blob as NodeBlob } from 'node:buffer'
import { defineComponent, h } from 'vue'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExportCreate from '@/components/reporting/export-create.vue'
import ExportJobs from '@/components/reporting/export-jobs.vue'
import { useReportExportState } from '@/components/reporting/use-report-export-state'
import { useUserStore } from '@/store'
import { commitTenantContext } from '@/services/tenant-context'
import {
  REPORT_EXPORT_PERMISSIONS as P,
  REPORTING_PERMISSIONS as RP,
} from '@af-admin/contracts'
import type {
  ReportingDefinitionVersion,
  ReportingExportJob,
  ReportingQueryV1,
  ReportingSourceCatalogue,
} from '@af-admin/contracts'

enableAutoUnmount(afterEach)
const api = vi.hoisted(() =>
  Object.fromEntries(
    [
      'archiveReportExport',
      'commandReportExport',
      'createReportExport',
      'downloadReportExport',
      'fetchReportExportCapabilities',
      'fetchReportExports',
      'getReportExport',
    ].map((name) => [name, vi.fn()])
  )
)
const sourceApi = vi.hoisted(() => ({ getReportingVersionCatalogue: vi.fn() }))
vi.mock('@/api/reporting-exports', () => api)
vi.mock('@/api/reporting', () => sourceApi)
const fields: ReportingSourceCatalogue['visibleFields'] = [
  {
    reference: { kind: 'metadata', id: 'createdAt' },
    key: 'metadata:createdAt',
    label: '创建时间',
    valueType: 'datetime',
    sortable: true,
    searchable: false,
  },
  {
    reference: { kind: 'field', id: 'subject' },
    key: 'field:subject',
    label: '主题',
    valueType: 'text',
    sortable: true,
    searchable: true,
  },
]
const version: ReportingDefinitionVersion = {
  id: 'version-1',
  definitionId: 'report-1',
  version: 1,
  sourceReleaseId: 'release-1',
  sourceReleaseVersion: 3,
  contentHash: 'hash',
  publishedBy: 'owner',
  publishedAt: '2026-10-13T00:00:00Z',
  schema: {
    version: 1,
    name: '真实报表',
    source: { kind: 'application-records', applicationId: 'app-1' },
    kind: 'detail',
    metric: 'count',
    factTime: 'createdAt',
    timeZone: 'UTC',
    fields: fields.map((field) => field.reference),
  },
}
const query: ReportingQueryV1 = {
  version: 1,
  timeZone: 'UTC',
  dateRange: { from: '2026-10-01', to: '2026-10-13' },
  statuses: [],
  keyword: '私人筛选',
  searchFields: [{ kind: 'field', id: 'subject' }],
  sort: { field: { kind: 'metadata', id: 'createdAt' }, direction: 'asc' },
  current: 4,
  pageSize: 10,
}
const bytes = Buffer.from('真实,文件\r\n1,已授权\r\n')
const job: ReportingExportJob = {
  id: 'job-1',
  definitionId: 'report-1',
  definitionVersionId: 'version-1',
  reportName: '真实报表',
  sourceReleaseId: 'release-1',
  sourceReleaseVersion: 3,
  format: 'csv',
  query,
  status: 'completed',
  stage: 'completed',
  revision: 3,
  createdBy: 'owner',
  createdAt: '2026-10-13T00:00:00Z',
  updatedAt: '2026-10-13T00:01:00Z',
  totalRows: 12,
  processedRows: 12,
  attempts: 2,
  nextAttemptAt: '2026-10-13T00:00:00Z',
  leaseUntil: null,
  errorCode: null,
  errorMessage: null,
  archivedAt: null,
  restricted: false,
  allowedActions: ['archive', 'download'],
  artifact: {
    id: 'artifact-1',
    fileName: '真实.csv',
    mimeType: 'text/csv',
    status: 'ready',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    scanEngine: 'ClamAV 1.5.4',
    scannedAt: '2026-10-13T00:01:00Z',
    createdAt: '2026-10-13T00:01:00Z',
    expiresAt: '2026-10-20T00:01:00Z',
    expiredAt: null,
  },
  events: [
    {
      id: 'event-1',
      action: 'completed',
      actorId: null,
      occurredAt: '2026-10-13T00:01:00Z',
      detail: {},
    },
  ],
}
let pinia: ReturnType<typeof createPinia>
let state: ReturnType<typeof useReportExportState>
const setPermissions = (permissions = [...Object.values(P), RP.query]) =>
  useUserStore().$patch({ id: 'owner', tenantId: 'tenant-a', permissions })
const page = (ready = true) =>
  mount(
    defineComponent({
      setup() {
        state = useReportExportState()
        return () =>
          h('main', [
            h(ExportCreate, {
              state,
              version,
              query: JSON.parse(JSON.stringify(query)),
              ready,
              totalRows: 12,
            }),
            h(ExportJobs, { state }),
          ])
      },
    }),
    { global: { plugins: [pinia] } }
  )
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:private-file'),
      revokeObjectURL: vi.fn(),
    })
  )
  pinia = createPinia()
  setActivePinia(pinia)
  commitTenantContext('tenant-a')
  setPermissions()
  api.fetchReportExportCapabilities.mockResolvedValue({
    formats: [
      { format: 'csv', available: true, reason: null },
      { format: 'xlsx', available: true, reason: null },
      { format: 'pdf', available: false, reason: '字体不可用' },
    ],
  })
  api.fetchReportExports.mockResolvedValue({
    list: [job],
    total: 41,
    current: 1,
    pageSize: 20,
  })
  api.getReportExport.mockResolvedValue(job)
  api.createReportExport.mockResolvedValue({
    ...job,
    status: 'queued',
    artifact: null,
  })
  api.commandReportExport.mockResolvedValue(job)
  api.archiveReportExport.mockResolvedValue(job)
  api.downloadReportExport.mockResolvedValue({
    blob: new NodeBlob([bytes], { type: 'text/csv' }),
    mimeType: 'text/csv',
  })
  sourceApi.getReportingVersionCatalogue.mockResolvedValue({
    source: version.schema.source,
    applicationName: '真实应用',
    sourceReleaseId: 'release-1',
    sourceReleaseVersion: 3,
    visibleFields: fields,
    hiddenFields: [],
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('real export state and permission changes', () => {
  it('displays actual count, stage, attempts, scanner and server total without invented progress', async () => {
    const wrapper = page()
    await flushPromises()
    expect(wrapper.text()).toContain('12 / 12 条')
    expect(wrapper.text()).toContain('已尝试 2 次')
    expect(wrapper.text()).toContain('ClamAV 1.5.4')
    expect(wrapper.text()).toContain('共 41 项')
    expect(wrapper.text()).not.toMatch(/100%|模拟/)
    expect(
      wrapper
        .get('[data-testid="reporting-export-format"]')
        .findAll('option')[2]
        .attributes('disabled')
    ).toBeDefined()
  })
  it('requires the current query and exported format capability before creation', async () => {
    const wrapper = page(false)
    await flushPromises()
    expect(
      wrapper
        .get('[data-testid="reporting-export-submit"]')
        .attributes('disabled')
    ).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(api.createReportExport).not.toHaveBeenCalled()
    state.format.value = 'pdf'
    await state.create(version, query)
    expect(api.createReportExport).not.toHaveBeenCalled()
  })
  it('captures click-time filters and exports all matching rows rather than the visible page', async () => {
    page()
    await flushPromises()
    const pending = deferred<ReportingSourceCatalogue>()
    sourceApi.getReportingVersionCatalogue.mockReturnValueOnce(pending.promise)
    const input = JSON.parse(JSON.stringify(query))
    const creation = state.create(version, input)
    input.keyword = 'later change'
    pending.resolve({
      source: version.schema.source,
      applicationName: '真实应用',
      sourceReleaseId: 'release-1',
      sourceReleaseVersion: 3,
      visibleFields: fields,
      hiddenFields: [],
    })
    await creation
    expect(api.createReportExport.mock.calls[0][0]).toMatchObject({
      definitionVersionId: 'version-1',
      query: { keyword: '私人筛选', current: 1, pageSize: 10 },
      format: 'csv',
    })
    expect(Object.keys(api.createReportExport.mock.calls[0][0])).toEqual([
      'definitionVersionId',
      'query',
      'format',
    ])
  })
  it('rechecks revoked search/sort fields before POST and preserves query input', async () => {
    page()
    await flushPromises()
    sourceApi.getReportingVersionCatalogue.mockResolvedValueOnce({
      visibleFields: [fields[0]],
      hiddenFields: [
        { reference: fields[1].reference, reason: 'permission-denied' },
      ],
    })
    await state.create(version, query)
    expect(state.error.value).toContain('当前不可用或未授权')
    expect(query.keyword).toBe('私人筛选')
    expect(api.createReportExport).not.toHaveBeenCalled()
  })
  it('keeps the idempotency key for an uncertain create retry and leaves format selected', async () => {
    page()
    await flushPromises()
    api.createReportExport.mockRejectedValueOnce(new Error('network lost'))
    state.format.value = 'xlsx'
    await state.create(version, query)
    expect(state.error.value).toBe('network lost')
    await state.create(version, query)
    expect(api.createReportExport.mock.calls[1][1]).toBe(
      api.createReportExport.mock.calls[0][1]
    )
    expect(state.format.value).toBe('xlsx')
  })
  it('refreshes a conflicting command revision while preserving list filters and avoiding automatic replay', async () => {
    page()
    await flushPromises()
    state.keyword.value = 'keep filter'
    api.archiveReportExport.mockRejectedValueOnce(
      new Error('REVISION_CONFLICT')
    )
    api.getReportExport.mockResolvedValueOnce({ ...job, revision: 5 })
    await state.command(job, 'archive')
    expect(state.error.value).toBe('REVISION_CONFLICT')
    expect(state.selected.value?.revision).toBe(5)
    expect(state.keyword.value).toBe('keep filter')
    expect(api.archiveReportExport).toHaveBeenCalledTimes(1)
  })
  it('removes sensitive cached filters and artifact facts immediately on changed permissions', async () => {
    const wrapper = page()
    await flushPromises()
    await state.inspect(job.id)
    const waiting = deferred<any>()
    api.fetchReportExports.mockReturnValueOnce(waiting.promise)
    setPermissions([P.list])
    expect(state.jobs.value).toEqual([])
    expect(state.selected.value).toBeUndefined()
    await flushPromises()
    expect(wrapper.text()).not.toContain('私人筛选')
    waiting.resolve({
      list: [
        {
          ...job,
          restricted: true,
          query: null,
          totalRows: null,
          processedRows: null,
          artifact: { ...job.artifact, size: null, sha256: null },
          allowedActions: [],
        },
      ],
      total: 1,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('当前权限不能读取行数')
    expect(
      wrapper
        .find(`[data-testid="reporting-export-download-${job.id}"]`)
        .exists()
    ).toBe(false)
  })
  it('ignores an old identity list response and resets private filters on tenant switch', async () => {
    const waiting = deferred<any>()
    api.fetchReportExports.mockReturnValueOnce(waiting.promise)
    page()
    await flushPromises()
    state.keyword.value = 'old secret'
    api.fetchReportExports.mockResolvedValue({ list: [], total: 0 })
    commitTenantContext('tenant-b')
    useUserStore().$patch({ id: 'different', tenantId: 'tenant-b' })
    waiting.resolve({ list: [job], total: 1 })
    await flushPromises()
    expect(state.keyword.value).toBe('')
    expect(state.jobs.value).toEqual([])
  })
  it('combines button permission and server allowedActions for cancellation and retry', async () => {
    page()
    await flushPromises()
    const queued = {
      ...job,
      status: 'queued' as const,
      allowedActions: ['cancel' as const],
    }
    await state.command(queued, 'retry')
    expect(api.commandReportExport).not.toHaveBeenCalled()
    setPermissions([P.list])
    await state.command(queued, 'cancel')
    expect(api.commandReportExport).not.toHaveBeenCalled()
  })
  it('saves real Blob bytes only after fresh permission, MIME, length and SHA-256 checks', async () => {
    page()
    await flushPromises()
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    await state.download(job)
    expect(api.getReportExport).toHaveBeenCalledWith(job.id)
    expect(api.downloadReportExport).toHaveBeenCalledWith(job.id)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(state.notice.value).toContain(`${bytes.length} 字节`)
    click.mockRestore()
  })
  it('rejects mismatched actual content without issuing a file save', async () => {
    page()
    await flushPromises()
    api.downloadReportExport.mockResolvedValueOnce({
      blob: new NodeBlob([Buffer.alloc(bytes.length)]),
      mimeType: 'text/csv',
    })
    await state.download(job)
    expect(state.error.value).toContain('摘要校验失败')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it.each([
    ['text/csv; charset=utf-8', 'text/csv; charset=utf-8'],
    ['text/csv; charset=utf-8', ' TEXT/CSV ; charset=UTF-8 '],
    [' Text/CSV ; charset=utf-8 ', 'text/csv'],
  ])(
    'accepts equivalent CSV media types with parameters, case and whitespace (%s / %s)',
    async (artifactType, headerType) => {
      page()
      await flushPromises()
      api.getReportExport.mockResolvedValueOnce({
        ...job,
        artifact: { ...job.artifact, mimeType: artifactType },
      })
      api.downloadReportExport.mockResolvedValueOnce({
        blob: new NodeBlob([bytes], { type: headerType }),
        mimeType: headerType,
      })
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined)
      try {
        await state.download(job)
        expect(state.error.value).toBe('')
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
        expect(click).toHaveBeenCalledTimes(1)
        expect(state.notice.value).toContain(`${bytes.length} 字节`)
      } finally {
        click.mockRestore()
      }
    }
  )
  it.each(['application/json; charset=utf-8', 'text/plain; charset=utf-8', ''])(
    'rejects a different or missing media type even with matching bytes and hash (%s)',
    async (headerType) => {
      page()
      await flushPromises()
      api.getReportExport.mockResolvedValueOnce({
        ...job,
        artifact: { ...job.artifact, mimeType: 'text/csv; charset=utf-8' },
      })
      api.downloadReportExport.mockResolvedValueOnce({
        blob: new NodeBlob([bytes], { type: headerType }),
        mimeType: headerType,
      })
      await state.download(job)
      expect(state.error.value).toContain('下载文件与服务器文件记录不符')
      expect(URL.createObjectURL).not.toHaveBeenCalled()
    }
  )
  it('stops download when a fresh server projection revokes field access', async () => {
    page()
    await flushPromises()
    api.getReportExport.mockResolvedValueOnce({
      ...job,
      restricted: true,
      query: null,
      totalRows: null,
      processedRows: null,
      allowedActions: [],
      artifact: { ...job.artifact, size: null, sha256: null },
    })
    await state.download(job)
    expect(state.error.value).toContain('当前权限或文件状态已变化')
    expect(api.downloadReportExport).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('requires both creation and report query permission without reading format capabilities', async () => {
    setPermissions([P.list, P.create])
    const wrapper = page()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="reporting-export-create"]').exists()
    ).toBe(false)
    expect(api.fetchReportExportCapabilities).not.toHaveBeenCalled()
    await state.create(version, query)
    expect(api.createReportExport).not.toHaveBeenCalled()
  })
  it('discards an in-flight download after identity changes', async () => {
    page()
    await flushPromises()
    const waiting = deferred<any>()
    api.downloadReportExport.mockReturnValueOnce(waiting.promise)
    const download = state.download(job)
    await flushPromises()
    commitTenantContext('tenant-b')
    useUserStore().$patch({ id: 'new-owner', tenantId: 'tenant-b' })
    waiting.resolve({ blob: new NodeBlob([bytes]), mimeType: 'text/csv' })
    await download
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(state.notice.value).toBe('')
  })
})
