import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReferenceAuditLog from '@/views/audit/log-list/reference.vue'
import { ApiRequestError } from '@/api/request-client'
import useUserStore from '@/store/modules/user'
import type {
  AuditCatalogueV1,
  AuditEventPageV2,
  AuditEventPageV1,
  AuditEventRecordV1,
  AuditQueryV1,
  AuditQueryV2,
} from '@af-admin/contracts'
import type { Component } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

const api = vi.hoisted(() => ({
  fetchAuditCatalogue: vi.fn(),
  fetchAuditEventPage: vi.fn(),
}))
vi.mock('@/api/audit', () => api)

const catalogue: AuditCatalogueV1 = {
  version: 1,
  source: 'server',
  projectionVersion: 1,
  modules: [
    { code: 'workflow', label: '审批流程' },
    { code: 'system', label: '系统管理' },
  ],
  actions: [
    { module: 'workflow', action: 'workflow.approve', eventType: 'operation' },
    { module: 'system', action: 'system.role.update', eventType: 'permission' },
  ],
  eventTypes: ['operation', 'security', 'permission', 'export'],
  results: ['success', 'failure'],
}
const query = (overrides: Partial<AuditQueryV1> = {}): AuditQueryV1 => ({
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
  ...overrides,
})
const queryV2 = (
  archiveState: AuditQueryV2['archiveState'],
  overrides: Partial<Omit<AuditQueryV2, 'version' | 'archiveState'>> = {}
): AuditQueryV2 => ({
  ...query(overrides),
  ...overrides,
  version: 2,
  archiveState,
})
const event = (
  id: string,
  overrides: Partial<AuditEventRecordV1> = {}
): AuditEventRecordV1 => ({
  id,
  source: 'server',
  projectionVersion: 1,
  module: 'workflow',
  action: 'workflow.approve',
  eventType: 'operation',
  result: 'success',
  operator: { id: null, name: null, role: null },
  target: { type: 'business-record', id: 'record-1' },
  occurredAt: '2026-10-13T10:00:00.000Z',
  traceId: `trace-${id}`,
  detail: { revision: 3, retried: false, errorCode: null },
  visibleFields: [],
  hiddenFields: ['operator.name'],
  ...overrides,
})
const page = (
  applied: AuditQueryV1,
  list: AuditEventRecordV1[] = [event('one')],
  total = list.length
): AuditEventPageV1 => ({
  version: 1,
  source: 'server',
  projectionVersion: 1,
  query: applied,
  queriedAt: '2026-10-13T10:00:01.000Z',
  list,
  total,
  current: applied.current,
  pageSize: applied.pageSize,
})
const pageV2 = (
  applied: AuditQueryV2,
  list: AuditEventRecordV1[] = [event('one')],
  total = list.length
): AuditEventPageV2 => ({
  version: 2,
  source: 'server',
  projectionVersion: 1,
  query: applied,
  queriedAt: '2026-10-13T10:00:01.000Z',
  list,
  total,
  current: applied.current,
  pageSize: applied.pageSize,
})
const mountPage = async (url = '/audit/logs') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/audit/logs', component: ReferenceAuditLog }],
  })
  await router.push(url)
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const user = useUserStore()
  user.$patch({
    id: 'auditor-1',
    tenantId: 'tenant-a',
    permissions: ['audit:read'],
  })
  const RouteHost = defineComponent({
    setup: () => () =>
      h(RouterView, null, {
        default: ({
          Component: Matched,
          route,
        }: {
          Component: Component
          route: RouteLocationNormalizedLoaded
        }) => h(Matched, { key: route.fullPath }),
      }),
  })
  const wrapper = mount(RouteHost, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, router, user }
}

describe('reference audit v1 page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.setItem('token', 'audit-token')
    localStorage.setItem('userId', 'auditor-1')
    api.fetchAuditCatalogue.mockResolvedValue(catalogue)
    api.fetchAuditEventPage.mockImplementation(
      async (value: AuditQueryV1 | AuditQueryV2) =>
        value.version === 2 ? pageV2(value) : page(value)
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn() },
    })
  })

  it('restores safe URL filters with independent end date and literal operator text, then copies trace only on explicit click', async () => {
    const { wrapper, router } = await mountPage(
      '/audit/logs?operatorName=Ops%25_&to=2026-10-13&targetId=record%3Aexact&traceId=trace%3Aexact&timeZone=America%2FNew_York'
    )
    expect(api.fetchAuditEventPage).toHaveBeenCalledWith(
      query({
        operatorName: 'Ops%_',
        targetId: 'record:exact',
        traceId: 'trace:exact',
        to: '2026-10-13',
        timeZone: 'America/New_York',
      })
    )
    expect(
      (
        wrapper.get('[data-testid="audit-date-from"]')
          .element as HTMLInputElement
      ).value
    ).toBe('')
    expect(
      (wrapper.get('[data-testid="audit-date-to"]').element as HTMLInputElement)
        .value
    ).toBe('2026-10-13')
    expect(wrapper.text()).toContain('来源：server · 投影版本：1')
    expect(wrapper.text()).toContain('2026-10-13 06:00:00 (America/New_York)')
    expect(wrapper.text()).toContain('操作人字段已隐藏')
    expect(wrapper.text()).toContain('revision')
    expect(wrapper.text()).not.toContain('password')
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="audit-copy-one"]').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('trace-one')
    expect(router.currentRoute.value.query.operatorName).toBe('Ops%_')
    wrapper.unmount()
  })

  it('preserves entered filters and identifies failed fields after a server validation failure', async () => {
    const { wrapper } = await mountPage()
    api.fetchAuditEventPage.mockRejectedValueOnce(
      new ApiRequestError({
        kind: 'business',
        message: 'Trace ID格式错误',
        displayMessage: 'Trace ID格式错误',
        httpStatus: 422,
        errors: { traceId: ['必须为安全精确标识'] },
      })
    )
    await wrapper
      .get('[data-testid="audit-operator"]')
      .setValue('保留的操作人%')
    await wrapper.get('[data-testid="audit-trace"]').setValue('bad:trace')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="audit-error"]').text()).toContain(
      '失败字段：traceId'
    )
    expect(
      (
        wrapper.get('[data-testid="audit-operator"]')
          .element as HTMLInputElement
      ).value
    ).toBe('保留的操作人%')
    expect(
      (wrapper.get('[data-testid="audit-trace"]').element as HTMLInputElement)
        .value
    ).toBe('bad:trace')
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    wrapper.unmount()
  })

  it('submits an unknown but valid module literally and accepts an empty authorized result', async () => {
    api.fetchAuditEventPage.mockImplementationOnce(
      async (value: AuditQueryV1) => page(value, [], 0)
    )
    const { wrapper } = await mountPage(
      '/audit/logs?module=future-module&timeZone=Asia%2FShanghai'
    )
    expect(api.fetchAuditEventPage).toHaveBeenCalledWith(
      query({ module: 'future-module' })
    )
    expect(wrapper.get('[data-testid="audit-module"]').element).toHaveProperty(
      'value',
      'future-module'
    )
    expect(wrapper.get('[data-testid="audit-empty"]').text()).toContain(
      '没有审计事实'
    )
    wrapper.unmount()
  })

  it('restores explicit v2 archive state and submits archived or hot as raw v2 params', async () => {
    const restored = await mountPage(
      '/audit/logs?archiveState=hot&timeZone=Asia%2FShanghai'
    )
    expect(api.fetchAuditEventPage).toHaveBeenCalledWith(queryV2('hot'))
    expect(
      (
        restored.wrapper.get('[data-testid="audit-archive-state"]')
          .element as HTMLSelectElement
      ).value
    ).toBe('hot')
    expect(restored.router.currentRoute.value.query.version).toBe('2')
    expect(restored.router.currentRoute.value.query.archiveState).toBe('hot')
    api.fetchAuditEventPage.mockClear()
    await restored.wrapper.get('[data-testid="audit-refresh"]').trigger('click')
    await flushPromises()
    expect(api.fetchAuditEventPage).toHaveBeenLastCalledWith(queryV2('hot'))
    restored.wrapper.unmount()

    api.fetchAuditEventPage.mockClear()
    const explicitAll = await mountPage(
      '/audit/logs?version=2&archiveState=all&timeZone=Asia%2FShanghai'
    )
    expect(api.fetchAuditEventPage).toHaveBeenLastCalledWith(queryV2('all'))
    explicitAll.wrapper.unmount()

    api.fetchAuditEventPage.mockClear()
    const submitted = await mountPage()
    expect(api.fetchAuditEventPage).toHaveBeenLastCalledWith(query())
    await submitted.wrapper
      .get('[data-testid="audit-archive-state"]')
      .setValue('archived')
    await submitted.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.fetchAuditEventPage).toHaveBeenLastCalledWith(
      queryV2('archived')
    )
    expect(submitted.router.currentRoute.value.query.version).toBe('2')
    expect(submitted.router.currentRoute.value.query.archiveState).toBe(
      'archived'
    )
    submitted.wrapper.unmount()
  })

  it('keeps an absent archive state on the canonical v1 request and clears facts when a v2 query fails', async () => {
    const { wrapper, router } = await mountPage('/audit/logs?module=workflow')
    expect(api.fetchAuditEventPage).toHaveBeenLastCalledWith(
      query({ module: 'workflow' })
    )
    expect(router.currentRoute.value.query).not.toHaveProperty('archiveState')
    expect(wrapper.text()).toContain('trace-one')

    api.fetchAuditEventPage.mockRejectedValueOnce(
      new ApiRequestError({
        kind: 'business',
        message: '归档查询暂不可用',
        displayMessage: '归档查询暂不可用',
        httpStatus: 422,
        errors: { archiveState: ['暂不可用'] },
      })
    )
    await wrapper.get('[data-testid="audit-archive-state"]').setValue('hot')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.fetchAuditEventPage).toHaveBeenLastCalledWith(
      queryV2('hot', { module: 'workflow' })
    )
    expect(wrapper.get('[data-testid="audit-error"]').text()).toContain(
      '失败字段：archiveState'
    )
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    expect(
      (
        wrapper.get('[data-testid="audit-archive-state"]')
          .element as HTMLSelectElement
      ).value
    ).toBe('hot')
    wrapper.unmount()
  })

  it.each([
    ['/audit/logs?targetId=record%3Aone&version=2', '审计查询仅支持v1'],
    [
      '/audit/logs?archiveState=cold&version=2',
      '归档筛选仅支持all、hot或archived',
    ],
    [
      '/audit/logs?archiveState=hot&version=3',
      '归档状态检索必须明确使用查询v2',
    ],
    [
      '/audit/logs?archiveState=hot&dateRange=2026-10-01&version=2',
      'URL包含未知审计参数 dateRange',
    ],
    ['/audit/logs?from=2026-02-30', '真实YYYY-MM-DD'],
    [
      '/audit/logs?targetId=record%3Aone&targetId=record%3Atwo',
      'targetId 不能重复',
    ],
  ])(
    'rejects unsafe URL state without silently issuing a broad query: %s',
    async (url, message) => {
      api.fetchAuditEventPage.mockClear()
      const { wrapper, router } = await mountPage(url)
      expect(api.fetchAuditEventPage).not.toHaveBeenCalled()
      expect(wrapper.get('[data-testid="audit-error"]').text()).toContain(
        message
      )
      expect(router.currentRoute.value.fullPath).toContain(url.split('?')[1])
      expect(wrapper.findAll('tbody tr')).toHaveLength(0)
      await wrapper.get('[data-testid="audit-refresh"]').trigger('click')
      await wrapper.get('[data-testid="audit-retry"]').trigger('click')
      await flushPromises()
      expect(api.fetchAuditEventPage).not.toHaveBeenCalled()
      expect(wrapper.get('[data-testid="audit-error"]').text()).toContain(
        message
      )
      wrapper.unmount()
    }
  )

  it('invalidates an in-flight response when same-token user permissions refresh', async () => {
    let resolve!: (value: AuditEventPageV1) => void
    api.fetchAuditEventPage.mockReset()
    api.fetchAuditEventPage.mockReturnValueOnce(
      new Promise<AuditEventPageV1>((done) => {
        resolve = done
      })
    )
    const { wrapper, user } = await mountPage()
    user.$patch({ permissions: [] })
    await flushPromises()
    expect(wrapper.get('[data-testid="audit-rights"]').text()).toContain(
      '已清除先前结果'
    )
    resolve(page(query(), [event('stale-permission')]))
    await flushPromises()
    expect(wrapper.text()).not.toContain('trace-stale-permission')
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    wrapper.unmount()
  })

  it('drops a late previous query and clears current facts immediately on permission revocation', async () => {
    let resolveOld!: (value: AuditEventPageV1) => void
    const old = new Promise<AuditEventPageV1>((resolve) => {
      resolveOld = resolve
    })
    api.fetchAuditEventPage.mockReset()
    api.fetchAuditEventPage
      .mockReturnValueOnce(old)
      .mockImplementationOnce(async (value: AuditQueryV1) =>
        page(value, [event('current')])
      )
    const { wrapper } = await mountPage()
    await wrapper.get('[data-testid="audit-operator"]').setValue('当前条件')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('trace-current')
    resolveOld(page(query(), [event('late')]))
    await flushPromises()
    expect(wrapper.text()).not.toContain('trace-late')

    api.fetchAuditEventPage.mockRejectedValueOnce(
      new ApiRequestError({
        kind: 'forbidden',
        message: '没有审计权限',
        displayMessage: '没有审计权限',
        httpStatus: 403,
      })
    )
    await wrapper.get('[data-testid="audit-refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="audit-rights"]').text()).toContain(
      '已清除先前结果'
    )
    expect(wrapper.text()).not.toContain('trace-current')
    wrapper.unmount()
  })

  it('clamps a page after the authorized total shrinks and fetches the real last page', async () => {
    api.fetchAuditEventPage.mockReset()
    api.fetchAuditEventPage
      .mockImplementationOnce(async (value: AuditQueryV1) =>
        page(value, [], 21)
      )
      .mockImplementationOnce(async (value: AuditQueryV1) =>
        page(value, [event('last-page')], 21)
      )
    const { wrapper, router } = await mountPage(
      '/audit/logs?current=5&pageSize=20&timeZone=Asia%2FShanghai'
    )
    await flushPromises()
    expect(api.fetchAuditEventPage).toHaveBeenCalledTimes(2)
    expect(api.fetchAuditEventPage).toHaveBeenLastCalledWith(
      query({ current: 2 })
    )
    expect(router.currentRoute.value.query.current).toBe('2')
    expect(wrapper.text()).toContain('trace-last-page')
    expect(wrapper.text()).toContain('第 2 / 2 页')
    wrapper.unmount()
  })
})
