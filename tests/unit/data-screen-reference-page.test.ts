import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReferenceDataScreen from '@/components/data-screen/reference/index.vue'
import type {
  DataScreenDefinitionV1,
  DataScreenDetails,
  ReportingDefinitionVersion,
  ReportingSourceCatalogue,
} from '@af-admin/contracts'

const api = vi.hoisted(() => ({
  fetchDataScreenTemplates: vi.fn(),
  fetchDataScreenDefinitions: vi.fn(),
  getDataScreenDefinition: vi.fn(),
  updateDataScreenDefinition: vi.fn(),
  publishDataScreenDefinition: vi.fn(),
  previewDataScreen: vi.fn(),
}))
const reporting = vi.hoisted(() => ({
  fetchPublishedReportingDefinitions: vi.fn(),
  getReportingVersionCatalogue: vi.fn(),
}))
const geometry = vi.hoisted(() => ({ setCanvasRectProperty: vi.fn() }))

vi.mock('@/api/data-screens', async (original) => ({
  ...(await original<typeof import('@/api/data-screens')>()),
  ...api,
}))
vi.mock('@/api/reporting', () => reporting)
vi.mock(
  '@/components/data-screen/reference/canvas-geometry',
  async (original) => ({
    ...(await original<
      typeof import('@/components/data-screen/reference/canvas-geometry')
    >()),
    setCanvasRectProperty: geometry.setCanvasRectProperty,
  })
)

const trend: ReportingDefinitionVersion = {
  id: 'trend-v1',
  definitionId: 'trend',
  version: 1,
  schema: {
    version: 1,
    name: '真实趋势',
    source: { kind: 'application-records', applicationId: 'app' },
    kind: 'trend',
    metric: 'count',
    factTime: 'createdAt',
    timeZone: 'UTC',
    fields: [{ kind: 'metadata', id: 'createdAt' }],
  },
  sourceReleaseId: 'app-release',
  sourceReleaseVersion: 1,
  contentHash: 'hash',
  publishedBy: 'admin',
  publishedAt: '2026-10-12T00:00:00.000Z',
}
const draft: DataScreenDefinitionV1 = {
  version: 1,
  title: '真实大屏',
  theme: { preset: 'dark', brandColor: '#165DFF' },
  sources: [
    {
      sourceKey: 'trend',
      reportDefinitionVersionId: trend.id,
      dateWindow: 'today',
      statuses: [],
      refreshSeconds: 30,
    },
  ],
  widgets: [
    {
      id: 'metric',
      kind: 'metric',
      title: '真实数量',
      sourceKey: 'trend',
      layout: { x: 24, y: 24, width: 320, height: 192, z: 0 },
      props: { view: 'count', showTrend: false },
    },
  ],
  alert: {
    enabled: false,
    statuses: [],
    countThreshold: 1,
    scrollingPaused: false,
  },
}
const details: DataScreenDetails = {
  id: 'screen-1',
  draft,
  revision: 3,
  enabled: true,
  archived: false,
  activeReleaseId: null,
  versions: [],
  allowedActions: ['update', 'publish'],
  createdAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
}
const disabledDetails: DataScreenDetails = {
  ...details,
  id: 'screen-disabled',
  draft: {
    ...draft,
    title: '已停用来源大屏',
    sources: [
      {
        ...draft.sources[0],
        reportDefinitionVersionId: 'disabled-report-v1',
      },
    ],
  },
}
const catalogue: ReportingSourceCatalogue = {
  source: trend.schema.source,
  applicationName: '真实应用',
  sourceReleaseId: 'app-release',
  sourceReleaseVersion: 1,
  visibleFields: [],
  hiddenFields: [],
}

describe('reference data screen page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    class ResizeObserverStub {
      observe() {
        return undefined
      }

      disconnect() {
        return undefined
      }
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    api.fetchDataScreenTemplates.mockResolvedValue([])
    api.fetchDataScreenDefinitions.mockResolvedValue({
      list: [details],
      total: 1,
      current: 1,
      pageSize: 50,
    })
    api.getDataScreenDefinition.mockResolvedValue(details)
    api.updateDataScreenDefinition.mockResolvedValue(details)
    reporting.fetchPublishedReportingDefinitions.mockResolvedValue({
      list: [trend],
      total: 1,
    })
    reporting.getReportingVersionCatalogue.mockResolvedValue(catalogue)
    geometry.setCanvasRectProperty.mockImplementation(
      (rect, property, value) => ({ ...rect, [property]: value })
    )
  })

  it('routes property editing through shared geometry and saves the resulting durable draft', async () => {
    const wrapper = mount(ReferenceDataScreen)
    await flushPromises()
    await wrapper.get('[data-testid="screen-widget-metric"]').trigger('click')
    await wrapper.get('[data-testid="screen-prop-x"]').setValue('80')
    expect(geometry.setCanvasRectProperty).toHaveBeenCalledWith(
      expect.objectContaining({ width: 320, height: 192 }),
      'x',
      80
    )
    await wrapper.get('[data-testid="screen-save"]').trigger('click')
    await flushPromises()
    expect(api.updateDataScreenDefinition).toHaveBeenCalledWith(
      details,
      expect.objectContaining({
        widgets: [
          expect.objectContaining({
            layout: expect.objectContaining({ x: 80 }),
          }),
        ],
      }),
      expect.any(String)
    )
    wrapper.unmount()
  })

  it('persists unsaved editing before publishing the immutable version', async () => {
    const updated = {
      ...details,
      revision: 4,
      draft: { ...draft, title: '待发布标题' },
    }
    api.updateDataScreenDefinition.mockResolvedValueOnce(updated)
    api.publishDataScreenDefinition.mockResolvedValueOnce({
      ...updated,
      revision: 5,
    })
    const wrapper = mount(ReferenceDataScreen)
    await flushPromises()
    await wrapper.get('[data-testid="screen-title"]').setValue('待发布标题')
    await wrapper.get('[data-testid="screen-publish"]').trigger('click')
    await flushPromises()
    expect(api.updateDataScreenDefinition).toHaveBeenCalledWith(
      details,
      expect.objectContaining({ title: '待发布标题' }),
      expect.any(String)
    )
    expect(api.publishDataScreenDefinition).toHaveBeenCalledWith(
      updated,
      expect.any(String)
    )
    wrapper.unmount()
  })

  it('clears a disabled previous screen banner when an active screen opens and still reports a current failure', async () => {
    api.fetchDataScreenDefinitions.mockResolvedValueOnce({
      list: [disabledDetails, details],
      total: 2,
      current: 1,
      pageSize: 50,
    })
    api.getDataScreenDefinition.mockImplementation(async (id: string) =>
      id === disabledDetails.id ? disabledDetails : details
    )
    reporting.getReportingVersionCatalogue.mockImplementation(
      async (id: string) => {
        if (id === 'disabled-report-v1')
          throw new Error('报表已停用当前不能查询')
        return catalogue
      }
    )
    const wrapper = mount(ReferenceDataScreen)
    await flushPromises()
    expect(wrapper.get('.notice.error').text()).toContain('报表已停用')
    await wrapper
      .get(`[data-testid="screen-definition-${details.id}"]`)
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('.notice.error').exists()).toBe(false)
    expect(
      (
        wrapper.get('[data-testid="screen-binding-trend"]')
          .element as HTMLSelectElement
      ).value
    ).toBe(trend.id)
    await wrapper
      .get(`[data-testid="screen-definition-${disabledDetails.id}"]`)
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('.notice.error').text()).toContain('报表已停用')
    wrapper.unmount()
  })

  it('drops a late catalogue failure from the previous screen generation', async () => {
    let rejectOld!: (error: Error) => void
    const lateFailure = new Promise<ReportingSourceCatalogue>(
      (_resolve, reject) => {
        rejectOld = reject
      }
    )
    api.fetchDataScreenDefinitions.mockResolvedValueOnce({
      list: [disabledDetails, details],
      total: 2,
      current: 1,
      pageSize: 50,
    })
    api.getDataScreenDefinition.mockImplementation(async (id: string) =>
      id === disabledDetails.id ? disabledDetails : details
    )
    reporting.getReportingVersionCatalogue.mockImplementation((id: string) =>
      id === 'disabled-report-v1' ? lateFailure : Promise.resolve(catalogue)
    )
    const wrapper = mount(ReferenceDataScreen)
    await flushPromises()
    await wrapper
      .get(`[data-testid="screen-definition-${details.id}"]`)
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('.notice.error').exists()).toBe(false)
    rejectOld(new Error('旧大屏迟到的停用错误'))
    await flushPromises()
    expect(wrapper.find('.notice.error').exists()).toBe(false)
    expect(wrapper.get('[data-testid="screen-title"]').element).toHaveProperty(
      'value',
      details.draft.title
    )
    wrapper.unmount()
  })
})
