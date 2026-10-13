import { Blob as NodeBlob } from 'node:buffer'
import { createHash, webcrypto } from 'node:crypto'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReferenceAuditExports from '@/views/audit/export-jobs/reference.vue'
import useUserStore from '@/store/modules/user'
import type { AuditExportJobV1, AuditQueryV1 } from '@af-admin/contracts'
import type { Component } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

const api = vi.hoisted(() => ({
  archiveAuditExport: vi.fn(),
  commandAuditExport: vi.fn(),
  createAuditExport: vi.fn(),
  downloadAuditExport: vi.fn(),
  fetchAuditExportCapabilities: vi.fn(),
  fetchAuditExports: vi.fn(),
  getAuditExport: vi.fn(),
}))
vi.mock('@/api/audit-exports', () => api)
let createObjectUrl: ReturnType<typeof vi.fn>

const query: AuditQueryV1 = {
  version: 1,
  current: 1,
  pageSize: 100,
  module: 'workflow',
  eventType: 'operation',
  result: 'success',
  operatorName: 'literal%_',
  targetId: 'record:one',
  traceId: '',
  from: '',
  to: '2026-10-13',
  timeZone: 'America/New_York',
}
const bytes = Buffer.from('traceId,module\r\ntrace-1,workflow\r\n')
const job: AuditExportJobV1 = {
  version: 1,
  id: 'audit-job-1',
  source: 'server',
  producerVersion: 1,
  projectionVersion: 1,
  format: 'csv',
  query,
  status: 'completed',
  stage: 'completed',
  revision: 4,
  createdAt: '2026-10-13T10:00:00.000Z',
  updatedAt: '2026-10-13T10:01:00.000Z',
  queriedAt: '2026-10-13T10:00:01.000Z',
  dataCutoffAt: '2026-10-13T10:00:01.000Z',
  totalRows: 24,
  processedRows: 24,
  attempts: 1,
  nextAttemptAt: '2026-10-13T10:00:00.000Z',
  leaseUntil: null,
  errorCode: null,
  errorMessage: null,
  archivedAt: null,
  retentionUntil: '2026-10-20T10:00:00.000Z',
  expiredAt: null,
  restricted: false,
  allowedActions: ['archive', 'download'],
  operator: { id: 'owner', name: 'Owner' },
  visibleFields: ['operator.id', 'operator.name'],
  hiddenFields: [],
  artifact: {
    id: 'artifact-1',
    jobId: 'audit-job-1',
    format: 'csv',
    fileName: 'audit.csv',
    mimeType: 'text/csv; charset=utf-8',
    status: 'ready',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    scanEngine: 'ClamAV 1.5.4',
    scannedAt: '2026-10-13T10:01:00.000Z',
    createdAt: '2026-10-13T10:01:00.000Z',
    expiresAt: '2026-10-20T10:01:00.000Z',
    expiredAt: null,
  },
  events: [],
}
const permissions = [
  'audit:export:list',
  'audit:export:create',
  'audit:export:cancel',
  'audit:export:retry',
  'audit:export:archive',
  'audit:export:download',
]
const pageResult = (list: AuditExportJobV1[] = [job]) => ({
  version: 1,
  source: 'server',
  projectionVersion: 1,
  list,
  total: list.length,
  current: 1,
  pageSize: 20,
})
const mountPage = async (
  url = '/audit/exports',
  ownedPermissions = permissions
) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/audit/exports', component: ReferenceAuditExports }],
  })
  await router.push(url)
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const user = useUserStore()
  user.$patch({
    id: 'owner',
    tenantId: 'tenant-a',
    permissions: ownedPermissions,
  })
  const Host = defineComponent({
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
  const wrapper = mount(Host, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, user }
}

describe('reference audit export page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('Blob', NodeBlob)
    vi.stubGlobal('crypto', webcrypto)
    createObjectUrl = vi.fn(() => 'blob:audit-export')
    ;[globalThis.URL, window.URL].forEach((constructor) => {
      Object.defineProperty(constructor, 'createObjectURL', {
        configurable: true,
        value: createObjectUrl,
      })
      Object.defineProperty(constructor, 'revokeObjectURL', {
        configurable: true,
        value: vi.fn(),
      })
    })
    localStorage.setItem('token', 'audit-export-token')
    localStorage.setItem('userId', 'owner')
    api.fetchAuditExportCapabilities.mockResolvedValue({
      formats: [
        { format: 'csv', available: true, reason: null },
        { format: 'xlsx', available: true, reason: null },
        { format: 'pdf', available: false, reason: '字体或扫描当前不可用' },
      ],
    })
    api.fetchAuditExports.mockResolvedValue(pageResult())
    api.getAuditExport.mockResolvedValue(job)
    api.createAuditExport.mockResolvedValue({
      ...job,
      id: 'created-job',
      status: 'queued',
      stage: 'queued',
      artifact: null,
      allowedActions: ['cancel'],
    })
    api.archiveAuditExport.mockResolvedValue(job)
    api.commandAuditExport.mockResolvedValue(job)
    api.downloadAuditExport.mockResolvedValue({
      blob: new NodeBlob([bytes], { type: 'text/csv; charset=utf-8' }),
      mimeType: 'text/csv; charset=utf-8',
      contentDisposition: 'attachment; filename="audit.csv"',
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(URL, 'createObjectURL')
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  })

  it('shows actual status, attempts, scanner and server total without invented progress', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.text()).toContain('24 / 24 条')
    expect(wrapper.text()).toContain('尝试 1 次')
    expect(wrapper.text()).toContain('ClamAV 1.5.4')
    expect(wrapper.text()).toContain('共 1 项')
    expect(wrapper.text()).not.toMatch(/模拟|100%/)
    expect(
      wrapper
        .get('[data-testid="audit-export-format"]')
        .findAll('option')[2]
        .attributes('disabled')
    ).toBeDefined()
    wrapper.unmount()
  })

  it('creates from the complete validated query and retains explicit input on failure', async () => {
    const { wrapper } = await mountPage(
      '/audit/exports?module=workflow&eventType=operation&result=success&operatorName=literal%25_&targetId=record%3Aone&to=2026-10-13&timeZone=America%2FNew_York'
    )
    await wrapper.get('[data-testid="audit-export-create"]').trigger('click')
    await flushPromises()
    expect(api.createAuditExport).toHaveBeenCalledWith(
      {
        version: 1,
        query,
        format: 'csv',
      },
      expect.any(String)
    )
    api.createAuditExport.mockRejectedValueOnce(new Error('network lost'))
    await wrapper.get('[data-testid="audit-export-create"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="audit-export-error"]').text()).toContain(
      'network lost'
    )
    expect(
      (
        wrapper.get('[data-testid="audit-export-operator"]')
          .element as HTMLInputElement
      ).value
    ).toBe('literal%_')
    expect(api.createAuditExport.mock.calls[1][1]).toBeTruthy()
    wrapper.unmount()
  })

  it('rechecks fresh job state and verifies MIME, size and SHA before native download', async () => {
    const { wrapper } = await mountPage()
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    await wrapper
      .get(`[data-testid="audit-export-download-${job.id}"]`)
      .trigger('click')
    await flushPromises()
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('已校验并下载')
    })
    expect(api.getAuditExport).toHaveBeenCalledWith(job.id)
    expect(api.downloadAuditExport).toHaveBeenCalledWith(job.id)
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain(`${bytes.length} 字节`)
    click.mockRestore()
    wrapper.unmount()
  })

  it('drops downloaded bytes when permissions change during the asynchronous digest', async () => {
    let resolveDigest!: (value: ArrayBuffer) => void
    const pendingDigest = new Promise<ArrayBuffer>((resolve) => {
      resolveDigest = resolve
    })
    const digest = vi.fn(() => pendingDigest)
    vi.stubGlobal('crypto', {
      randomUUID: () => 'download-generation-key',
      subtle: { digest },
    })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const { wrapper, user } = await mountPage()
    await wrapper
      .get(`[data-testid="audit-export-download-${job.id}"]`)
      .trigger('click')
    await vi.waitFor(() => {
      expect(digest).toHaveBeenCalledTimes(1)
    })
    user.$patch({ permissions: [] })
    await flushPromises()
    const digestBytes = createHash('sha256').update(bytes).digest()
    resolveDigest(
      digestBytes.buffer.slice(
        digestBytes.byteOffset,
        digestBytes.byteOffset + digestBytes.byteLength
      ) as ArrayBuffer
    )
    await flushPromises()
    expect(createObjectUrl).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('已校验并下载')
    click.mockRestore()
    wrapper.unmount()
  })

  it('clears private task and artifact facts on same-token permission revocation and drops a late response', async () => {
    let resolve!: (value: ReturnType<typeof pageResult>) => void
    api.fetchAuditExports.mockReset()
    api.fetchAuditExports.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const { wrapper, user } = await mountPage()
    user.$patch({ permissions: [] })
    await flushPromises()
    expect(wrapper.get('[data-testid="audit-export-rights"]').text()).toContain(
      '已清除先前任务'
    )
    resolve(pageResult())
    await flushPromises()
    expect(wrapper.text()).not.toContain(job.artifact?.sha256 || '')
    expect(
      wrapper.find(`[data-testid="audit-export-job-${job.id}"]`).exists()
    ).toBe(false)
    wrapper.unmount()
  })

  it('replaces an opened unrestricted detail with the current restricted list projection', async () => {
    const { wrapper } = await mountPage()
    await wrapper
      .get(`[data-testid="audit-export-job-${job.id}"]`)
      .find('.audit-exports__inspect')
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="audit-export-detail"]').text()).toContain(
      job.artifact?.sha256 || ''
    )
    const restricted: AuditExportJobV1 = {
      ...job,
      restricted: true,
      query: null,
      totalRows: null,
      processedRows: null,
      artifact: null,
      allowedActions: [],
    }
    api.fetchAuditExports.mockResolvedValueOnce(pageResult([restricted]))
    await wrapper.get('[data-testid="audit-export-refresh"]').trigger('click')
    await flushPromises()
    const detail = wrapper.get('[data-testid="audit-export-detail"]')
    expect(detail.text()).toContain('当前权限不能读取')
    expect(detail.text()).not.toContain(job.artifact?.sha256 || '')
    expect(
      wrapper.find(`[data-testid="audit-export-download-${job.id}"]`).exists()
    ).toBe(false)
    wrapper.unmount()
  })

  it('rejects repeated or invalid URL state without issuing a broad list request', async () => {
    api.fetchAuditExports.mockClear()
    const { wrapper } = await mountPage(
      '/audit/exports?targetId=one&targetId=two&pageSize=1000'
    )
    expect(api.fetchAuditExports).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="audit-export-error"]').text()).toContain(
      '不能重复'
    )
    expect(
      (
        wrapper.get('[data-testid="audit-export-target"]')
          .element as HTMLInputElement
      ).value
    ).toBe('one | two')
    await wrapper.get('[data-testid="audit-export-refresh"]').trigger('click')
    await flushPromises()
    expect(api.fetchAuditExports).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not allow a late capability response to enable creation for invalid URL state', async () => {
    let resolve!: (value: {
      formats: { format: 'csv'; available: boolean; reason: null }[]
    }) => void
    api.fetchAuditExportCapabilities.mockReset()
    api.fetchAuditExportCapabilities.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    api.fetchAuditExports.mockClear()
    const { wrapper } = await mountPage('/audit/exports?targetID=typo')
    resolve({ formats: [{ format: 'csv', available: true, reason: null }] })
    await flushPromises()
    expect(api.fetchAuditExports).not.toHaveBeenCalled()
    expect(
      wrapper.get('[data-testid="audit-export-create"]').attributes('disabled')
    ).toBeDefined()
    await wrapper.get('[data-testid="audit-export-create"]').trigger('click')
    expect(api.createAuditExport).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each([
    [
      'cancel',
      {
        ...job,
        status: 'queued' as const,
        allowedActions: ['cancel' as const],
        artifact: null,
      },
    ],
    [
      'retry',
      {
        ...job,
        status: 'failed' as const,
        allowedActions: ['retry' as const],
        artifact: null,
      },
    ],
  ])(
    'rechecks the current revision before a single %s command',
    async (action, current) => {
      api.fetchAuditExports.mockResolvedValueOnce(pageResult([current]))
      api.getAuditExport.mockResolvedValueOnce(current)
      api.commandAuditExport.mockResolvedValueOnce(current)
      const { wrapper } = await mountPage()
      await wrapper
        .get(`[data-testid="audit-export-${action}-${current.id}"]`)
        .trigger('click')
      await flushPromises()
      expect(api.getAuditExport).toHaveBeenCalledWith(current.id)
      expect(api.commandAuditExport).toHaveBeenCalledWith(
        current,
        action,
        expect.any(String)
      )
      wrapper.unmount()
    }
  )

  it('does not issue a list read for create-only or explicit download-only access', async () => {
    api.fetchAuditExports.mockClear()
    const createPage = await mountPage('/audit/exports', [
      'audit:export:create',
    ])
    expect(api.fetchAuditExports).not.toHaveBeenCalled()
    expect(
      createPage.wrapper
        .get('[data-testid="audit-export-list-unavailable"]')
        .text()
    ).toContain('没有任务列表权限')
    expect(
      createPage.wrapper
        .get('[data-testid="audit-export-create"]')
        .attributes('disabled')
    ).toBeUndefined()
    api.getAuditExport.mockImplementation(async (id: string) => ({
      ...job,
      id,
      status: 'queued' as const,
      stage: 'queued' as const,
      artifact: null,
      allowedActions: ['cancel' as const],
    }))
    await createPage.wrapper
      .get('[data-testid="audit-export-create"]')
      .trigger('click')
    await flushPromises()
    expect(api.fetchAuditExports).not.toHaveBeenCalled()
    expect(api.getAuditExport).toHaveBeenCalledWith('created-job')
    await createPage.wrapper
      .get('[data-testid="audit-export-refresh"]')
      .trigger('click')
    await flushPromises()
    expect(api.getAuditExport).toHaveBeenCalledTimes(2)
    createPage.wrapper.unmount()

    api.fetchAuditExports.mockClear()
    api.getAuditExport.mockReset()
    api.getAuditExport.mockResolvedValue(job)
    const downloadPage = await mountPage('/audit/exports?jobId=audit-job-1', [
      'audit:export:download',
    ])
    expect(api.fetchAuditExports).not.toHaveBeenCalled()
    expect(api.getAuditExport).toHaveBeenCalledWith('audit-job-1')
    expect(
      downloadPage.wrapper
        .find('[data-testid="audit-export-detail-download-audit-job-1"]')
        .exists()
    ).toBe(true)
    downloadPage.wrapper.unmount()

    api.fetchAuditExports.mockClear()
    api.getAuditExport.mockReset()
    api.getAuditExport.mockResolvedValue(job)
    const listAndDetail = await mountPage('/audit/exports?jobId=audit-job-1')
    expect(api.fetchAuditExports).toHaveBeenCalledTimes(1)
    expect(api.getAuditExport).toHaveBeenCalledWith('audit-job-1')
    expect(
      listAndDetail.wrapper.find('[data-testid="audit-export-detail"]').exists()
    ).toBe(true)
    listAndDetail.wrapper.unmount()
  })

  it('refreshes and polls an explicit off-page detail independently from the current list page', async () => {
    vi.useFakeTimers()
    const offPage: AuditExportJobV1 = {
      ...job,
      id: 'off-page-job',
      status: 'queued',
      stage: 'queued',
      artifact: null,
      allowedActions: ['cancel'],
    }
    api.fetchAuditExports.mockResolvedValue(pageResult([]))
    api.getAuditExport.mockResolvedValue(offPage)
    const { wrapper } = await mountPage(
      '/audit/exports?jobId=off-page-job&status=failed'
    )
    expect(api.fetchAuditExports).toHaveBeenCalledTimes(1)
    expect(api.getAuditExport).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="audit-export-detail"]').text()).toContain(
      'off-page-job'
    )

    await wrapper.get('[data-testid="audit-export-refresh"]').trigger('click')
    await flushPromises()
    expect(api.fetchAuditExports).toHaveBeenCalledTimes(2)
    expect(api.getAuditExport).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="audit-export-detail"]').text()).toContain(
      'off-page-job'
    )

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(api.fetchAuditExports).toHaveBeenCalledTimes(3)
    expect(api.getAuditExport).toHaveBeenCalledTimes(3)
    expect(wrapper.get('[data-testid="audit-export-detail"]').text()).toContain(
      'off-page-job'
    )
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('keeps a URL-bound detail current after a revision-checked command and same-URL search', async () => {
    const offPage = { ...job, id: 'off-page-command-job' }
    const fresh = { ...offPage, revision: 5 }
    const archived: AuditExportJobV1 = {
      ...fresh,
      revision: 6,
      archivedAt: '2026-10-13T11:00:00.000Z',
      allowedActions: ['unarchive'],
    }
    api.fetchAuditExports.mockResolvedValue(pageResult([]))
    api.getAuditExport.mockResolvedValueOnce(offPage)
    const { wrapper, router } = await mountPage(
      '/audit/exports?jobId=off-page-command-job&status=failed'
    )

    api.getAuditExport.mockResolvedValueOnce(fresh).mockResolvedValue(archived)
    api.archiveAuditExport.mockResolvedValueOnce(archived)
    const archive = wrapper
      .get('[data-testid="audit-export-detail"]')
      .findAll('button')
      .find((button) => button.text() === '归档')
    expect(archive).toBeDefined()
    await archive?.trigger('click')
    await flushPromises()
    expect(api.archiveAuditExport).toHaveBeenCalledWith(
      fresh,
      true,
      expect.any(String)
    )
    expect(wrapper.get('[data-testid="audit-export-detail"]').text()).toContain(
      'off-page-command-job'
    )
    expect(
      wrapper
        .get('[data-testid="audit-export-detail"]')
        .findAll('button')
        .some((button) => button.text() === '取消归档')
    ).toBe(true)

    await wrapper.find('form.audit-exports__list-filter').trigger('submit')
    await flushPromises()
    const canonicalUrl = router.currentRoute.value.fullPath
    const detailReads = api.getAuditExport.mock.calls.length
    await wrapper.find('form.audit-exports__list-filter').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(canonicalUrl)
    expect(api.getAuditExport).toHaveBeenCalledTimes(detailReads + 1)
    expect(wrapper.get('[data-testid="audit-export-detail"]').text()).toContain(
      'off-page-command-job'
    )
    wrapper.unmount()
  })
})
