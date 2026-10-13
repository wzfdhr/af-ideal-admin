import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Reporting from '@/components/reporting/index.vue'
import { useUserStore } from '@/store'
import { commitTenantContext } from '@/services/tenant-context'
import { REPORTING_PERMISSIONS as P } from '@af-admin/contracts'
import type {
  ReportingDefinitionRecord,
  ReportingDefinitionVersion,
  ReportingQueryResultV1,
  ReportingSourceCatalogue,
} from '@af-admin/contracts'

enableAutoUnmount(afterEach)
const api = vi.hoisted(() =>
  Object.fromEntries(
    [
      'fetchPublishedReportingDefinitions',
      'fetchReportingDefinitions',
      'fetchReportingSources',
      'getReportingDefinition',
      'getReportingVersionCatalogue',
      'publishReportingDefinition',
      'queryReportingVersion',
      'saveReportingDefinition',
      'setReportingDefinitionEnabled',
    ].map((name) => [name, vi.fn()])
  )
)
vi.mock('@/api/reporting', () => api)
vi.mock('@/services/r1-confirm', () => ({
  confirmR1Action: vi.fn().mockResolvedValue(true),
}))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))
const source: ReportingSourceCatalogue = {
  source: { kind: 'application-records', applicationId: 'application-1' },
  applicationName: '登记设备申请',
  sourceReleaseId: 'current-source-release',
  sourceReleaseVersion: 2,
  visibleFields: [
    {
      reference: { kind: 'metadata', id: 'id' },
      key: 'metadata:id',
      label: '记录编号',
      valueType: 'text',
      searchable: true,
      sortable: true,
    },
    {
      reference: { kind: 'metadata', id: 'status' },
      key: 'metadata:status',
      label: '业务状态',
      valueType: 'status',
      searchable: false,
      sortable: true,
    },
    {
      reference: { kind: 'metadata', id: 'createdAt' },
      key: 'metadata:createdAt',
      label: '创建时间',
      valueType: 'datetime',
      searchable: false,
      sortable: true,
    },
    {
      reference: { kind: 'metadata', id: 'applicantName' },
      key: 'metadata:applicantName',
      label: '申请人姓名',
      valueType: 'text',
      searchable: true,
      sortable: true,
    },
  ],
  hiddenFields: [],
}
const fixedCatalogue = {
  ...source,
  sourceReleaseId: 'fixed-source-release',
  sourceReleaseVersion: 1,
}
const version: ReportingDefinitionVersion = {
  id: 'fixed-report-version',
  definitionId: 'report-1',
  version: 1,
  sourceReleaseId: 'fixed-source-release',
  sourceReleaseVersion: 1,
  contentHash: 'fixed-server-content-hash',
  publishedBy: 'author',
  publishedAt: '2026-10-13T00:00:00Z',
  schema: {
    version: 1,
    name: '真实设备明细',
    source: source.source,
    kind: 'detail',
    metric: 'count',
    factTime: 'createdAt',
    timeZone: 'UTC',
    fields: source.visibleFields.map((field) => field.reference),
  },
}
const record: ReportingDefinitionRecord = {
  id: 'report-1',
  schema: version.schema,
  revision: 7,
  enabled: true,
  activeVersionId: version.id,
  createdBy: 'author',
  updatedAt: '2026-10-13T01:00:00Z',
  versions: [version],
  draftChanged: false,
}
const result: ReportingQueryResultV1 = {
  version: 1,
  definitionId: record.id,
  definitionVersion: 1,
  source: source.source,
  sourceReleaseId: version.sourceReleaseId,
  sourceReleaseVersion: 1,
  policyVersion: 1,
  kind: 'detail',
  metric: 'count',
  factTime: 'createdAt',
  timeZone: 'UTC',
  dateRange: { from: '2026-10-01', to: '2026-10-13' },
  queriedAt: '2026-10-13T01:00:00Z',
  dataCutoffAt: '2026-10-13T00:59:59Z',
  scope: 'current-authorized-records',
  releaseScope: 'fixed-published-source',
  visibleFields: source.visibleFields,
  hiddenFields: [],
  current: 1,
  pageSize: 10,
  total: 1,
  rows: [
    {
      id: 'own-record',
      values: {
        'metadata:id': 'own-record',
        'metadata:status': 'approved',
        'metadata:applicantName': '已授权申请人',
      },
    },
  ],
  trend: [],
  distribution: [],
}
let pinia: ReturnType<typeof createPinia>
const page = () => mount(Reporting, { global: { plugins: [pinia] } })
const permissions = (codes: string[]) =>
  useUserStore().$patch({
    id: 'author',
    tenantId: 'tenant-a',
    permissions: codes,
  })
beforeEach(() => {
  vi.clearAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  commitTenantContext('tenant-a')
  permissions([P.query])
  api.fetchPublishedReportingDefinitions.mockResolvedValue({
    list: [version],
    total: 1,
  })
  api.fetchReportingDefinitions.mockResolvedValue({ list: [], total: 0 })
  api.fetchReportingSources.mockResolvedValue({
    list: [source],
    total: 1,
    current: 1,
    pageSize: 20,
  })
  api.getReportingVersionCatalogue.mockResolvedValue(fixedCatalogue)
  api.getReportingDefinition.mockResolvedValue(record)
  api.queryReportingVersion.mockResolvedValue(result)
})
const setDates = async (wrapper: ReturnType<typeof page>) => {
  await wrapper
    .get('[data-testid="reporting-query-from"]')
    .setValue('2026-10-01')
  await wrapper.get('[data-testid="reporting-query-to"]').setValue('2026-10-13')
}
const submitQuery = async (wrapper: ReturnType<typeof page>) => {
  await wrapper.get('[data-testid="reporting-query-form"]').trigger('submit')
  await flushPromises()
}

describe('real reporting state and authority', () => {
  it('query-only accounts use the published library and exact version catalogue without private drafts or active-source guessing', async () => {
    const wrapper = page()
    await flushPromises()
    expect(api.fetchPublishedReportingDefinitions).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '',
    })
    expect(api.getReportingVersionCatalogue).toHaveBeenCalledWith(version.id)
    expect(api.fetchReportingDefinitions).not.toHaveBeenCalled()
    expect(api.getReportingDefinition).not.toHaveBeenCalled()
    expect(api.fetchReportingSources).not.toHaveBeenCalled()
    expect(
      wrapper.find('[data-testid="reporting-definition-new"]').exists()
    ).toBe(false)
    await setDates(wrapper)
    await submitQuery(wrapper)
    expect(api.queryReportingVersion).toHaveBeenCalledWith(
      version.id,
      expect.objectContaining({
        dateRange: result.dateRange,
        timeZone: 'UTC',
        sort: {
          field: { kind: 'metadata', id: 'createdAt' },
          direction: 'desc',
        },
      })
    )
    expect(
      wrapper.get('[data-testid="real-reporting-results"]').text()
    ).toContain('fixed-source-release')
    expect(wrapper.find('[data-testid="report-export"]').exists()).toBe(false)
    expect(
      wrapper.find('[data-testid="report-schedule-create"]').exists()
    ).toBe(false)
  })

  it('rechecks current catalogue before querying and retains revoked search input while clearing old results', async () => {
    const wrapper = page()
    await flushPromises()
    await setDates(wrapper)
    await submitQuery(wrapper)
    expect(wrapper.text()).toContain('已授权申请人')
    await wrapper
      .get('[data-testid="reporting-query-keyword"]')
      .setValue('保留关键词')
    await wrapper
      .get('[data-testid="reporting-search-field-metadata:applicantName"]')
      .setValue(true)
    await wrapper
      .get('[data-testid="reporting-query-sort"]')
      .setValue('metadata:applicantName')
    api.getReportingVersionCatalogue.mockResolvedValue({
      ...fixedCatalogue,
      visibleFields: source.visibleFields.filter(
        (field) => field.reference.id !== 'applicantName'
      ),
      hiddenFields: [
        {
          reference: { kind: 'metadata', id: 'applicantName' },
          reason: 'permission-denied',
        },
      ],
    })
    api.queryReportingVersion.mockClear()
    await submitQuery(wrapper)
    expect(api.queryReportingVersion).not.toHaveBeenCalled()
    expect(
      wrapper.get('[data-testid="reporting-query-keyword"]').element
    ).toHaveProperty('value', '保留关键词')
    expect(wrapper.get('[data-testid="reporting-error"]').text()).toContain(
      '输入已保留'
    )
    expect(
      wrapper.find('[data-testid="real-reporting-results"]').exists()
    ).toBe(false)
    expect(
      wrapper
        .find('[data-testid="reporting-search-field-metadata:applicantName"]')
        .exists()
    ).toBe(false)
    expect(
      wrapper.get('[data-testid="reporting-query-sort"]').text()
    ).toContain('当前排序选择不可用')
  })

  it('retains date and keyword inputs after invalid closed range and transport rejection without empty-result fallback', async () => {
    const wrapper = page()
    await flushPromises()
    await setDates(wrapper)
    await wrapper
      .get('[data-testid="reporting-query-from"]')
      .setValue('2026-10-14')
    await submitQuery(wrapper)
    expect(api.queryReportingVersion).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="reporting-error"]').text()).toContain(
      '日期闭区间'
    )
    expect(
      wrapper.get('[data-testid="reporting-query-from"]').element
    ).toHaveProperty('value', '2026-10-14')
    await setDates(wrapper)
    api.queryReportingVersion.mockRejectedValueOnce(
      new Error('真实查询连接中断')
    )
    await submitQuery(wrapper)
    expect(wrapper.get('[data-testid="reporting-error"]').text()).toContain(
      '真实查询连接中断'
    )
    expect(
      wrapper.find('[data-testid="reporting-result-empty"]').exists()
    ).toBe(false)
    expect(
      wrapper.get('[data-testid="reporting-query-to"]').element
    ).toHaveProperty('value', '2026-10-13')
  })

  it('discards an old tenant query response even if it resolves after the replacement published library', async () => {
    let resolve!: (value: ReportingQueryResultV1) => void
    api.queryReportingVersion.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const wrapper = page()
    await flushPromises()
    await setDates(wrapper)
    await wrapper.get('[data-testid="reporting-query-form"]').trigger('submit')
    await flushPromises()
    expect(api.queryReportingVersion).toHaveBeenCalledOnce()
    api.fetchPublishedReportingDefinitions.mockResolvedValue({
      list: [],
      total: 0,
    })
    commitTenantContext('tenant-b')
    useUserStore().$patch({ tenantId: 'tenant-b' })
    await flushPromises()
    resolve(result)
    await flushPromises()
    expect(
      wrapper.find('[data-testid="real-reporting-results"]').exists()
    ).toBe(false)
    expect(wrapper.text()).not.toContain('已授权申请人')
  })

  it('source paging and filtering retain the selected source and custom fields while using declared page totals', async () => {
    permissions([P.list, P.create, P.update])
    const otherSource = {
      ...source,
      source: { ...source.source, applicationId: 'other-application' },
      applicationName: '其他来源',
    }
    api.fetchReportingSources.mockImplementation((params) => {
      if (params.applicationId)
        return Promise.resolve({
          list: [source],
          total: 1,
          current: 1,
          pageSize: 1,
        })
      if (params.keyword === '无匹配')
        return Promise.resolve({ list: [], total: 0, current: 1, pageSize: 20 })
      return Promise.resolve({
        list: params.current === 1 ? [source] : [otherSource],
        total: 41,
        current: params.current,
        pageSize: 20,
      })
    })
    const wrapper = page()
    await flushPromises()
    await wrapper
      .get('[data-testid="reporting-definition-new"]')
      .trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-testid="reporting-draft-field-metadata:applicantName"]')
      .setValue(true)
    expect(
      wrapper.get('[data-testid="reporting-source-page"]').text()
    ).toContain('共 41 项')
    await wrapper.get('[data-testid="reporting-source-next"]').trigger('click')
    await flushPromises()
    expect(api.fetchReportingSources).toHaveBeenLastCalledWith({
      current: 2,
      pageSize: 20,
      keyword: '',
    })
    expect(
      wrapper.get('[data-testid="reporting-definition-source"]').element
    ).toHaveProperty('value', source.source.applicationId)
    expect(
      wrapper.get('[data-testid="reporting-definition-source"]').text()
    ).toContain('当前页之外')
    expect(
      wrapper.get(
        '[data-testid="reporting-draft-field-metadata:applicantName"]'
      ).element
    ).toHaveProperty('checked', true)
    await wrapper
      .get('[data-testid="reporting-source-keyword"]')
      .setValue('无匹配')
    await wrapper
      .get('[data-testid="reporting-source-search"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="reporting-source-page"]').text()
    ).toContain('共 0 项')
    expect(
      wrapper.get('[data-testid="reporting-definition-source"]').element
    ).toHaveProperty('value', source.source.applicationId)
    expect(
      wrapper.get(
        '[data-testid="reporting-draft-field-metadata:applicantName"]'
      ).element
    ).toHaveProperty('checked', true)
    expect(
      wrapper
        .get('[data-testid="reporting-source-next"]')
        .attributes('disabled')
    ).toBeDefined()
  })

  it('reopens a saved source through an exact independent lookup when it is absent from the directory page', async () => {
    permissions([P.list, P.create, P.update])
    const otherSource = {
      ...source,
      source: { ...source.source, applicationId: 'other-application' },
    }
    api.fetchReportingDefinitions.mockResolvedValue({
      list: [record],
      total: 1,
    })
    api.fetchReportingSources.mockImplementation((params) =>
      Promise.resolve(
        params.applicationId
          ? { list: [source], total: 1, current: 1, pageSize: 1 }
          : { list: [otherSource], total: 101, current: 1, pageSize: 20 }
      )
    )
    const wrapper = page()
    await flushPromises()
    await wrapper
      .get('[data-testid="reporting-definition-report-1"]')
      .trigger('click')
    await flushPromises()
    expect(api.fetchReportingSources).toHaveBeenCalledWith({
      current: 1,
      pageSize: 1,
      applicationId: record.schema.source.applicationId,
    })
    expect(
      wrapper.get('[data-testid="reporting-definition-source"]').element
    ).toHaveProperty('value', record.schema.source.applicationId)
    expect(
      wrapper.get('[data-testid="reporting-definition-source"]').text()
    ).toContain('当前页之外')
    expect(
      wrapper.get(
        '[data-testid="reporting-draft-field-metadata:applicantName"]'
      ).element
    ).toHaveProperty('checked', true)
    expect(
      wrapper.get('[data-testid="reporting-source-page"]').text()
    ).toContain('共 101 项')
  })

  it('save retries reuse the same key and values, then reopen uses server revision and actual stored schema', async () => {
    permissions([P.list, P.create, P.update])
    const saved = {
      ...record,
      schema: {
        ...version.schema,
        name: '保留并重开',
        kind: 'trend',
        fields: [
          { kind: 'metadata', id: 'status' },
          { kind: 'metadata', id: 'createdAt' },
        ],
      },
      activeVersionId: null,
      versions: [],
      enabled: false,
    }
    api.saveReportingDefinition
      .mockRejectedValueOnce(new Error('保存连接中断'))
      .mockResolvedValue(saved)
    api.getReportingDefinition.mockResolvedValue(saved)
    const wrapper = page()
    await flushPromises()
    expect(api.fetchPublishedReportingDefinitions).not.toHaveBeenCalled()
    await wrapper
      .get('[data-testid="reporting-definition-new"]')
      .trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-testid="reporting-definition-name"]')
      .setValue(saved.schema.name)
    await wrapper
      .get('[data-testid="reporting-definition-timezone"]')
      .setValue('UTC')
    await wrapper
      .get('[data-testid="reporting-definition-editor"] form')
      .trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="reporting-error"]').text()).toContain(
      '保存连接中断'
    )
    expect(
      wrapper.get('[data-testid="reporting-definition-name"]').element
    ).toHaveProperty('value', saved.schema.name)
    const key = api.saveReportingDefinition.mock.calls[0][1]
    api.fetchReportingDefinitions.mockResolvedValue({ list: [saved], total: 1 })
    await wrapper
      .get('[data-testid="reporting-definition-editor"] form')
      .trigger('submit')
    await flushPromises()
    expect(api.saveReportingDefinition.mock.calls[1][1]).toBe(key)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '关闭配置编辑')
      ?.trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-testid="reporting-definition-report-1"]')
      .trigger('click')
    await flushPromises()
    expect(api.getReportingDefinition).toHaveBeenCalledWith('report-1')
    expect(
      wrapper.get('[data-testid="reporting-definition-name"]').element
    ).toHaveProperty('value', saved.schema.name)
    expect(
      wrapper.get('[data-testid="reporting-definition-timezone"]').element
    ).toHaveProperty('value', 'UTC')
  })
})
