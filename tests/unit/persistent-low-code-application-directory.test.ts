/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import PersistentDesigner from '@/components/low-code/designer-persistent.vue'
import { setToken } from '@/services/auth'
import { commitTenantContext } from '@/services/tenant-context'
import { createBusinessLowCodePage } from '@af-admin/contracts'
import type { ManagedApplication } from '@af-admin/contracts'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const user = vi.hoisted(() => ({
  id: 'a-admin',
  tenantId: 'tenant-a',
  permissions: ['*'],
}))
const applicationApi = vi.hoisted(() => ({
  getApplication: vi.fn(),
  listApplications: vi.fn(),
}))
const runtimeApi = vi.hoisted(() => ({
  archivePersistentPage: vi.fn(),
  fetchPersistentPages: vi.fn(),
  generatePersistentPage: vi.fn(),
  getPersistentPage: vi.fn(),
  persistentLowCodeSources: vi.fn(),
  previewPersistentPage: vi.fn(),
  publishPersistentPage: vi.fn(),
  rolloutPersistentPage: vi.fn(),
  savePersistentPage: vi.fn(),
}))
const routing = vi.hoisted(() => ({
  route: { query: {} as Record<string, string> },
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('@/store', () => ({ useUserStore: () => user }))
vi.mock('@/api/application-center', () => applicationApi)
vi.mock('@/api/low-code-runtime', () => runtimeApi)
vi.mock('@/services/ui-permissions', () => ({ hasPermission: () => true }))
vi.mock('@/services/r1-confirm', () => ({
  confirmR1Action: vi.fn().mockResolvedValue(true),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routing.push,
    replace: routing.replace,
  }),
  useRoute: () => routing.route,
  onBeforeRouteLeave: vi.fn(),
}))

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const ProTableStub = defineComponent({
  name: 'ProTable',
  setup(_, { expose }) {
    expose({ reload: vi.fn().mockResolvedValue(undefined) })
    return () => h('div', { 'data-testid': 'persistent-table-stub' })
  },
})

const application = (
  id: string,
  code: string,
  releaseId: string
): ManagedApplication => ({
  id,
  tenantId: 'tenant-a',
  code,
  name: `应用-${code}`,
  description: '',
  businessKind: 'generic',
  status: 'enabled',
  revision: 2,
  formDraftId: `form-${id}`,
  workflowDraftId: `workflow-${id}`,
  activeReleaseId: releaseId,
  formRevision: 1,
  workflowRevision: 1,
  createdAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z',
})

const target = application('app-target', 'target-code', 'release-target')
const page = {
  id: 'page-target',
  name: '业务管理页',
  schema: createBusinessLowCodePage('source-target'),
  revision: 1,
  status: 'enabled' as const,
  activeReleaseId: null,
  rolloutReleaseId: null,
  rolloutPercent: 0,
  updatedAt: '2026-10-13T00:00:00.000Z',
}

const mountDesigner = () =>
  mount(PersistentDesigner, {
    global: {
      stubs: {
        'a-button': ButtonStub,
        'ProTable': ProTableStub,
        'PersistentRuntime': true,
      },
    },
  })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('persistent low-code application directory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setToken('low-code-original-token')
    commitTenantContext('tenant-a')
    routing.route.query = {}
    routing.replace.mockImplementation(async ({ query }) => {
      routing.route.query = { ...query }
    })
    applicationApi.listApplications.mockResolvedValue({ list: [], total: 0 })
    applicationApi.getApplication.mockResolvedValue(target)
    runtimeApi.persistentLowCodeSources.mockResolvedValue({ list: [] })
    runtimeApi.generatePersistentPage.mockResolvedValue(page)
    runtimeApi.getPersistentPage.mockResolvedValue(page)
  })

  it('searches a bounded real directory and keeps the selected identity across result pages', async () => {
    applicationApi.listApplications
      .mockResolvedValueOnce({ list: [], total: 386 })
      .mockResolvedValueOnce({ list: [target], total: 1 })
      .mockResolvedValueOnce({ list: [], total: 0 })
    const wrapper = mountDesigner()
    await flushPromises()

    expect(applicationApi.listApplications).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '',
      status: 'enabled',
    })
    const keyword = wrapper.get(
      '[data-testid="persistent-application-keyword"]'
    )
    await keyword.setValue(target.code)
    await keyword.trigger('keydown.enter')
    await flushPromises()
    expect(applicationApi.listApplications).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      keyword: target.code,
      status: 'enabled',
    })
    await wrapper
      .get('select[aria-label="生成页面业务发布版"]')
      .setValue(target.activeReleaseId)
    expect(
      wrapper.get('[data-testid="persistent-application-selection"]').text()
    ).toContain(target.code)

    await keyword.setValue('another-page')
    await wrapper
      .get('[data-testid="persistent-application-search"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="persistent-application-selection"]').text()
    ).toContain(target.code)
    await wrapper
      .get('[data-testid="persistent-page-generate"]')
      .trigger('click')
    await flushPromises()

    expect(applicationApi.getApplication).toHaveBeenCalledWith(target.id)
    expect(runtimeApi.generatePersistentPage).toHaveBeenCalledWith(
      '业务管理页',
      target.activeReleaseId,
      expect.any(String)
    )
  })

  it('keeps an editor inert until the full generate chain finishes, then preserves fast title input', async () => {
    applicationApi.listApplications
      .mockResolvedValueOnce({ list: [], total: 386 })
      .mockResolvedValueOnce({ list: [target], total: 1 })
    const wrapper = mountDesigner()
    await flushPromises()
    const keyword = wrapper.get(
      '[data-testid="persistent-application-keyword"]'
    )
    await keyword.setValue(target.code)
    await keyword.trigger('keydown.enter')
    await flushPromises()
    await wrapper
      .get('select[aria-label="生成页面业务发布版"]')
      .setValue(target.activeReleaseId)
    const pendingRoute = deferred<void>()
    routing.replace.mockReturnValueOnce(pendingRoute.promise)

    await wrapper
      .get('[data-testid="persistent-page-generate"]')
      .trigger('click')
    await flushPromises()
    const editor = wrapper.get('[data-testid="persistent-page-editor"]')
    const title = editor.get('input[aria-label="低代码页面标题"]')
    expect(editor.attributes('aria-busy')).toBe('true')
    expect((title.element as HTMLInputElement).matches(':disabled')).toBe(true)

    pendingRoute.resolve()
    await flushPromises()
    expect(editor.attributes('aria-busy')).toBe('false')
    expect((title.element as HTMLInputElement).matches(':disabled')).toBe(false)
    await title.setValue('快速输入但不会丢失的标题')
    await flushPromises()
    expect((title.element as HTMLInputElement).value).toBe(
      '快速输入但不会丢失的标题'
    )
  })

  it('ignores an older search response that arrives after a newer identity result', async () => {
    let resolveOlder: (value: unknown) => void = () => undefined
    let resolveNewer: (value: unknown) => void = () => undefined
    const older = new Promise((resolve) => {
      resolveOlder = resolve
    })
    const newer = new Promise((resolve) => {
      resolveNewer = resolve
    })
    const recent = application('app-recent', 'recent-code', 'release-recent')
    applicationApi.listApplications
      .mockResolvedValueOnce({ list: [], total: 386 })
      .mockImplementationOnce(() => older)
      .mockImplementationOnce(() => newer)
    const wrapper = mountDesigner()
    await flushPromises()
    const keyword = wrapper.get(
      '[data-testid="persistent-application-keyword"]'
    )

    await keyword.setValue('older')
    await keyword.trigger('keydown.enter')
    await keyword.setValue('recent')
    await keyword.trigger('keydown.enter')
    resolveNewer({ list: [recent], total: 1 })
    await flushPromises()
    resolveOlder({ list: [target], total: 1 })
    await flushPromises()

    const options = wrapper
      .findAll('select[aria-label="生成页面业务发布版"] option')
      .map((option) => option.text())
    expect(options).toContain(recent.name)
    expect(options).not.toContain(target.name)
  })

  it('does not continue from a pending application detail read into a POST after a token-only replacement', async () => {
    applicationApi.listApplications
      .mockResolvedValueOnce({ list: [], total: 386 })
      .mockResolvedValueOnce({ list: [target], total: 1 })
    const wrapper = mountDesigner()
    await flushPromises()
    const keyword = wrapper.get(
      '[data-testid="persistent-application-keyword"]'
    )
    await keyword.setValue(target.code)
    await keyword.trigger('keydown.enter')
    await flushPromises()
    await wrapper
      .get('select[aria-label="生成页面业务发布版"]')
      .setValue(target.activeReleaseId)
    const pendingDetail = deferred<ManagedApplication>()
    applicationApi.getApplication.mockReturnValueOnce(pendingDetail.promise)

    await wrapper
      .get('[data-testid="persistent-page-generate"]')
      .trigger('click')
    expect(
      wrapper
        .get('[data-testid="persistent-page-generate"]')
        .attributes('disabled')
    ).toBeDefined()
    setToken('low-code-replacement-token')
    pendingDetail.resolve(target)
    await flushPromises()

    expect(runtimeApi.generatePersistentPage).not.toHaveBeenCalled()
    expect(
      wrapper
        .get('[data-testid="persistent-page-generate"]')
        .attributes('disabled')
    ).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('drops token-stale initial directory and selected metadata without opening the old page', async () => {
    const pendingDirectory = deferred<{
      list: ManagedApplication[]
      total: number
    }>()
    const pendingSelection = deferred<ManagedApplication>()
    const pendingSources = deferred<{ list: [] }>()
    routing.route.query = {
      applicationId: target.id,
      pageId: page.id,
    }
    applicationApi.listApplications.mockReturnValueOnce(
      pendingDirectory.promise
    )
    applicationApi.getApplication.mockReturnValueOnce(pendingSelection.promise)
    runtimeApi.persistentLowCodeSources.mockReturnValueOnce(
      pendingSources.promise
    )
    const wrapper = mountDesigner()
    setToken('low-code-replacement-token')
    pendingDirectory.resolve({ list: [target], total: 1 })
    pendingSelection.resolve(target)
    pendingSources.resolve({ list: [] })
    await flushPromises()

    expect(
      wrapper.find('[data-testid="persistent-application-selection"]').exists()
    ).toBe(false)
    expect(
      wrapper
        .findAll('select[aria-label="生成页面业务发布版"] option')
        .map((option) => option.text())
    ).not.toContain(target.name)
    expect(runtimeApi.getPersistentPage).not.toHaveBeenCalled()
    expect(
      wrapper.find('[data-testid="persistent-page-editor"]').exists()
    ).toBe(false)
    expect(
      wrapper
        .get('[data-testid="persistent-application-search"]')
        .attributes('disabled')
    ).toBeUndefined()
  })

  it('does not assign a token-stale preview result before checking its scope', async () => {
    routing.route.query = { pageId: page.id }
    const pendingPreview = deferred<{
      schema: typeof page.schema
      releaseId: string
      releaseVersion: number
      pageRevision: number
      preview: boolean
      forms: Record<string, never>
      sourceErrors: Record<string, string>
      dataAvailable: Record<string, boolean>
    }>()
    runtimeApi.previewPersistentPage.mockReturnValueOnce(pendingPreview.promise)
    const wrapper = mountDesigner()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="persistent-page-editor"]').exists()
    ).toBe(true)

    await wrapper
      .get('[data-testid="persistent-page-preview"]')
      .trigger('click')
    setToken('low-code-replacement-token')
    pendingPreview.resolve({
      schema: page.schema,
      releaseId: 'preview-release',
      releaseVersion: 1,
      pageRevision: 1,
      preview: true,
      forms: {},
      sourceErrors: {},
      dataAvailable: {},
    })
    await flushPromises()

    expect(wrapper.find('persistent-runtime-stub').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('uses the page identity captured when initialization starts instead of a later route value', async () => {
    const pendingSources = deferred<{ list: [] }>()
    routing.route.query = { pageId: page.id }
    runtimeApi.persistentLowCodeSources.mockReturnValueOnce(
      pendingSources.promise
    )
    mountDesigner()
    routing.route.query = { pageId: 'later-route-page' }
    pendingSources.resolve({ list: [] })
    await flushPromises()

    expect(runtimeApi.getPersistentPage).toHaveBeenCalledTimes(1)
    expect(runtimeApi.getPersistentPage).toHaveBeenCalledWith(page.id)
    expect(runtimeApi.getPersistentPage).not.toHaveBeenCalledWith(
      'later-route-page'
    )
  })
})
