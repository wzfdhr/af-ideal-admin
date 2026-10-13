import { Blob as NodeBlob } from 'node:buffer'
import { createHash, webcrypto } from 'node:crypto'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '@/api/request-client'
import ReferenceAuditRetention from '@/views/audit/retention/reference.vue'
import useUserStore from '@/store/modules/user'
import type {
  AuditArchiveBatchV1,
  AuditArchiveRunV1,
  AuditQueryV1,
  AuditRetentionPolicyV1,
} from '@af-admin/contracts'
import type { Component } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

const api = vi.hoisted(() => ({
  commandAuditArchiveRun: vi.fn(),
  createAuditArchiveRun: vi.fn(),
  downloadAuditArchiveBatch: vi.fn(),
  fetchAuditArchiveBatches: vi.fn(),
  fetchAuditArchiveCapabilities: vi.fn(),
  fetchAuditArchiveEvents: vi.fn(),
  fetchAuditArchiveRuns: vi.fn(),
  fetchAuditRetentionPolicy: vi.fn(),
  getAuditArchiveBatch: vi.fn(),
  getAuditArchiveRun: vi.fn(),
  updateAuditRetentionPolicy: vi.fn(),
}))
vi.mock('@/api/audit-retention', () => api)

const query: AuditQueryV1 = {
  version: 1,
  current: 1,
  pageSize: 100,
  module: 'workflow',
  eventType: 'operation',
  result: 'success',
  operatorName: 'literal%_',
  targetId: '-opaque-target',
  traceId: '_opaque-trace',
  from: '',
  to: '2026-10-13',
  timeZone: 'America/New_York',
}
const policy: AuditRetentionPolicyV1 = {
  version: 1,
  source: 'server',
  revision: 3,
  enabled: true,
  hotDays: 90,
  timeZone: 'America/New_York',
  executor: { id: 'owner', name: 'Owner' },
  executorVisibleFields: ['operator.id', 'operator.name'],
  executorHiddenFields: [],
  updatedAt: '2026-10-13T10:00:00.000Z',
  nextRunAt: '2026-10-14T04:00:00.000Z',
  lastRunId: null,
  allowedActions: ['update'],
}
const bytes = Buffer.from('archive batch bytes')
const run: AuditArchiveRunV1 = {
  version: 1,
  id: '-archive-run-1',
  source: 'server',
  projectionVersion: 1,
  trigger: 'manual',
  policyRevision: null,
  occurrence: null,
  executor: { id: 'owner', name: 'Owner' },
  executorVisibleFields: ['operator.id', 'operator.name'],
  executorHiddenFields: [],
  query,
  format: 'csv',
  status: 'completed',
  revision: 4,
  queriedAt: '2026-10-13T10:00:01.000Z',
  dataCutoffAt: '2026-10-13T10:00:01.000Z',
  candidateHash: 'candidate-hash',
  coverage: {
    candidateTotal: 2,
    coveredTotal: 2,
    remainingTotal: 0,
    batchTotal: 1,
    completedBatchTotal: 1,
  },
  attempts: 1,
  nextAttemptAt: '2026-10-13T10:00:00.000Z',
  leaseUntil: null,
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-10-13T10:00:00.000Z',
  updatedAt: '2026-10-13T10:01:00.000Z',
  completedAt: '2026-10-13T10:01:00.000Z',
  restricted: false,
  allowedActions: [],
}
const batch: AuditArchiveBatchV1 = {
  version: 1,
  kind: 'archive-batch',
  source: 'server',
  producerVersion: 2,
  projectionVersion: 1,
  id: '_batch-1',
  runId: run.id,
  ordinal: 1,
  candidateRange: { firstOrdinal: 1, lastOrdinal: 2 },
  candidateTotal: 2,
  status: 'completed',
  revision: 3,
  jobId: 'archive-job-1',
  snapshotHash: 'snapshot-hash',
  artifact: {
    id: 'archive-artifact-1',
    jobId: 'archive-job-1',
    format: 'csv',
    fileName: 'archive.csv',
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
  attempts: 1,
  nextAttemptAt: '2026-10-13T10:00:00.000Z',
  leaseUntil: null,
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-10-13T10:00:00.000Z',
  completedAt: '2026-10-13T10:01:00.000Z',
  restricted: false,
}
const permissions = [
  'audit:retention:manage',
  'audit:read',
  'audit:export:create',
  'audit:export:archive',
  'audit:export:download',
]
const runPage = (list: AuditArchiveRunV1[] = [run]) => ({
  version: 1 as const,
  source: 'server' as const,
  projectionVersion: 1 as const,
  list,
  total: list.length,
  current: 1,
  pageSize: 20,
})
const batchPage = (
  list: AuditArchiveBatchV1[] = [batch],
  options: { total?: number; current?: number; pageSize?: number } = {}
) => ({
  version: 1 as const,
  source: 'server' as const,
  projectionVersion: 1 as const,
  list,
  total: options.total ?? list.length,
  current: options.current ?? 1,
  pageSize: options.pageSize ?? 20,
})
const eventPage = () => ({
  version: 1 as const,
  source: 'server' as const,
  projectionVersion: 1 as const,
  list: [],
  total: 0,
  current: 1,
  pageSize: 100,
})
const mountPage = async (
  url = '/audit/retention',
  ownedPermissions = permissions
) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/audit/retention', component: ReferenceAuditRetention }],
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

describe('reference audit retention page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('Blob', NodeBlob)
    vi.stubGlobal('crypto', webcrypto)
    ;[globalThis.URL, window.URL].forEach((constructor) => {
      Object.defineProperty(constructor, 'createObjectURL', {
        configurable: true,
        value: vi.fn(() => 'blob:audit-retention'),
      })
      Object.defineProperty(constructor, 'revokeObjectURL', {
        configurable: true,
        value: vi.fn(),
      })
    })
    localStorage.setItem('token', 'audit-retention-token')
    localStorage.setItem('userId', 'owner')
    api.fetchAuditRetentionPolicy.mockResolvedValue(policy)
    api.fetchAuditArchiveCapabilities.mockResolvedValue({
      formats: [
        { format: 'csv', available: true, reason: null },
        { format: 'xlsx', available: true, reason: null },
        { format: 'pdf', available: false, reason: '字体不可用' },
      ],
    })
    api.fetchAuditArchiveRuns.mockResolvedValue(runPage())
    api.getAuditArchiveRun.mockResolvedValue(run)
    api.getAuditArchiveBatch.mockResolvedValue(batch)
    api.fetchAuditArchiveBatches.mockResolvedValue(batchPage())
    api.fetchAuditArchiveEvents.mockResolvedValue(eventPage())
    api.createAuditArchiveRun.mockResolvedValue({
      ...run,
      id: '_created-run',
      status: 'queued',
      coverage: {
        candidateTotal: null,
        coveredTotal: null,
        remainingTotal: null,
        batchTotal: null,
        completedBatchTotal: null,
      },
      allowedActions: ['cancel'],
    })
    api.updateAuditRetentionPolicy.mockResolvedValue({
      ...policy,
      revision: 4,
    })
    api.commandAuditArchiveRun.mockResolvedValue(run)
    api.downloadAuditArchiveBatch.mockResolvedValue({
      blob: new NodeBlob([bytes], { type: 'text/csv; charset=utf-8' }),
      mimeType: 'text/csv; charset=utf-8',
      contentDisposition: 'attachment; filename="archive.csv"',
      sha256: batch.artifact?.sha256,
      size: String(bytes.length),
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(URL, 'createObjectURL')
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  })

  it('requires all four governance permissions before making any request', async () => {
    const { wrapper } = await mountPage('/audit/retention', [
      'audit:retention:manage',
      'audit:read',
      'audit:export:create',
    ])
    expect(
      wrapper.get('[data-testid="audit-retention-rights"]').text()
    ).toContain('必须同时拥有')
    expect(api.fetchAuditRetentionPolicy).not.toHaveBeenCalled()
    expect(api.fetchAuditArchiveRuns).not.toHaveBeenCalled()
    expect(api.fetchAuditArchiveCapabilities).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows server coverage and zero-candidate completion without invented progress', async () => {
    const emptyRun: AuditArchiveRunV1 = {
      ...run,
      id: 'empty-run',
      coverage: {
        candidateTotal: 0,
        coveredTotal: 0,
        remainingTotal: 0,
        batchTotal: 0,
        completedBatchTotal: 0,
      },
    }
    api.fetchAuditArchiveRuns.mockResolvedValueOnce(runPage([emptyRun]))
    const { wrapper } = await mountPage()
    expect(wrapper.text()).toContain('候选 0 · 已覆盖 0 · 剩余 0 · 批次 0 / 0')
    expect(wrapper.text()).toContain('原始审计事实永久保留')
    expect(wrapper.text()).not.toMatch(/100%|模拟进度/)
    wrapper.unmount()
  })

  it('prevents a delayed overview from restoring private data after a restricted detail', async () => {
    let resolveRuns!: (value: ReturnType<typeof runPage>) => void
    api.fetchAuditArchiveRuns.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRuns = resolve
      })
    )
    api.getAuditArchiveRun.mockResolvedValueOnce({
      ...run,
      restricted: true,
      query: null,
      candidateHash: null,
      coverage: {
        candidateTotal: null,
        coveredTotal: null,
        remainingTotal: null,
        batchTotal: null,
        completedBatchTotal: null,
      },
      allowedActions: [],
    })
    const mounted = mountPage('/audit/retention?runId=-archive-run-1')
    await flushPromises()
    resolveRuns(runPage())
    const { wrapper } = await mounted
    await flushPromises()
    expect(wrapper.text()).toContain('当前归档详情权限已变化')
    expect(wrapper.text()).not.toContain('candidate-hash')
    expect(wrapper.text()).not.toContain('ClamAV 1.5.4')
    expect(
      wrapper.find('[data-testid="audit-retention-detail"]').exists()
    ).toBe(false)
    wrapper.unmount()
  })

  it('prevents a delayed overview from restoring private data after a parallel 403', async () => {
    let resolveRuns!: (value: ReturnType<typeof runPage>) => void
    api.fetchAuditArchiveRuns.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRuns = resolve
      })
    )
    api.fetchAuditArchiveBatches.mockRejectedValueOnce(
      new ApiRequestError({
        kind: 'forbidden',
        message: 'forbidden',
        displayMessage: '没有访问权限',
        httpStatus: 403,
      })
    )
    const mounted = mountPage('/audit/retention?runId=-archive-run-1')
    await flushPromises()
    resolveRuns(runPage())
    const { wrapper } = await mounted
    await flushPromises()
    expect(wrapper.get('[data-testid="audit-retention-rights"]').exists()).toBe(
      true
    )
    expect(wrapper.text()).not.toContain('candidate-hash')
    expect(wrapper.text()).not.toContain('ClamAV 1.5.4')
    wrapper.unmount()
  })

  it('rejects repeated or unknown URL state without issuing a broad read', async () => {
    const { wrapper } = await mountPage(
      '/audit/retention?targetId=one&targetId=two&archiveState=hot'
    )
    expect(api.fetchAuditRetentionPolicy).not.toHaveBeenCalled()
    expect(api.fetchAuditArchiveRuns).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="audit-retention-error"]').text()).toMatch(
      /未知归档参数|不能重复/
    )
    expect(
      (
        wrapper.get('[data-testid="audit-retention-target"]')
          .element as HTMLInputElement
      ).value
    ).toBe('one | two')
    wrapper.unmount()
  })

  it('rechecks current policy revision, derives executor server-side and preserves draft on failure', async () => {
    api.updateAuditRetentionPolicy.mockRejectedValueOnce(
      new Error('revision conflict')
    )
    const { wrapper } = await mountPage()
    const hotDays = wrapper.get('[data-testid="audit-retention-hot-days"]')
    await hotDays.setValue('120')
    await wrapper
      .get('[data-testid="audit-retention-save-policy"]')
      .trigger('submit')
    await flushPromises()
    expect(api.fetchAuditRetentionPolicy).toHaveBeenCalledTimes(2)
    expect(api.updateAuditRetentionPolicy).toHaveBeenCalledWith(
      {
        version: 1,
        expectedRevision: 3,
        enabled: true,
        hotDays: 120,
        timeZone: 'America/New_York',
      },
      expect.any(String)
    )
    expect(api.updateAuditRetentionPolicy.mock.calls[0][0]).not.toHaveProperty(
      'executor'
    )
    expect(
      wrapper.get('[data-testid="audit-retention-error"]').text()
    ).toContain('revision conflict')
    expect((hotDays.element as HTMLInputElement).value).toBe('120')
    wrapper.unmount()
  })

  it('keeps an edited policy draft through automatic polling and shows the fresh server revision', async () => {
    vi.useFakeTimers()
    const processing: AuditArchiveRunV1 = {
      ...run,
      status: 'processing',
      completedAt: null,
      allowedActions: ['cancel'],
    }
    api.fetchAuditArchiveRuns.mockResolvedValue(runPage([processing]))
    api.fetchAuditRetentionPolicy
      .mockResolvedValueOnce(policy)
      .mockResolvedValue({
        ...policy,
        revision: 4,
        hotDays: 30,
      })
    const { wrapper } = await mountPage()
    const hotDays = wrapper.get('[data-testid="audit-retention-hot-days"]')
    await hotDays.setValue('120')
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect((hotDays.element as HTMLInputElement).value).toBe('120')
    expect(
      wrapper.get('[data-testid="audit-retention-policy-state"]').text()
    ).toContain('修订 4')
    expect(
      wrapper.get('[data-testid="audit-retention-policy-dirty"]').text()
    ).toContain('自动刷新不会覆盖输入')
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('stops after 20 polls for a delayed off-page active detail and resets only on manual refresh', async () => {
    vi.useFakeTimers()
    const offPage: AuditArchiveRunV1 = {
      ...run,
      id: 'off-page-processing',
      status: 'processing',
      completedAt: null,
      allowedActions: ['cancel'],
    }
    api.fetchAuditArchiveRuns.mockResolvedValue(runPage([run]))
    api.getAuditArchiveRun.mockImplementation(
      () =>
        new Promise((resolve) => {
          window.setTimeout(() => resolve(offPage), 100)
        })
    )
    const mounted = mountPage('/audit/retention?runId=off-page-processing')
    await vi.advanceTimersByTimeAsync(100)
    const { wrapper } = await mounted
    await flushPromises()
    expect(api.getAuditArchiveRun).toHaveBeenCalledTimes(1)

    const advancePolls = async (remaining: number): Promise<void> => {
      if (remaining <= 0) return
      await vi.advanceTimersByTimeAsync(3100)
      await flushPromises()
      await advancePolls(remaining - 1)
    }
    await advancePolls(20)
    expect(api.getAuditArchiveRun).toHaveBeenCalledTimes(21)
    expect(wrapper.text()).toContain('自动刷新已达到本次上限')

    await vi.advanceTimersByTimeAsync(30000)
    await flushPromises()
    expect(api.getAuditArchiveRun).toHaveBeenCalledTimes(21)

    await wrapper
      .get('[data-testid="audit-retention-refresh"]')
      .trigger('click')
    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    expect(api.getAuditArchiveRun).toHaveBeenCalledTimes(22)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('creates one full candidate run from opaque IDs and retains input on failure', async () => {
    const { wrapper } = await mountPage(
      '/audit/retention?module=workflow&eventType=operation&result=success&operatorName=literal%25_&targetId=-opaque-target&traceId=_opaque-trace&to=2026-10-13&timeZone=America%2FNew_York'
    )
    await wrapper.get('[data-testid="audit-retention-create"]').trigger('click')
    await flushPromises()
    expect(api.createAuditArchiveRun).toHaveBeenCalledWith(
      { version: 1, query, format: 'csv' },
      expect.any(String)
    )
    expect(api.createAuditArchiveRun).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('rechecks the current revision before a retry command', async () => {
    const failed: AuditArchiveRunV1 = {
      ...run,
      status: 'failed',
      allowedActions: ['retry'],
      errorCode: 'ARCHIVE_RENDER_FAILED',
      errorMessage: 'render failed',
    }
    const fresh = { ...failed, revision: 5 }
    api.fetchAuditArchiveRuns.mockResolvedValueOnce(runPage([failed]))
    api.getAuditArchiveRun.mockResolvedValueOnce(fresh)
    api.commandAuditArchiveRun.mockResolvedValueOnce(fresh)
    const { wrapper } = await mountPage()
    await wrapper
      .get(`[data-testid="audit-retention-retry-${failed.id}"]`)
      .trigger('click')
    await flushPromises()
    expect(api.getAuditArchiveRun).toHaveBeenCalledWith(failed.id)
    expect(api.commandAuditArchiveRun).toHaveBeenCalledWith(
      fresh,
      'retry',
      expect.any(String)
    )
    wrapper.unmount()
  })

  it('keeps a command result B selected when the URL previously named A', async () => {
    const selectedA = { ...run, id: 'run-a' }
    const failedB: AuditArchiveRunV1 = {
      ...run,
      id: 'run-b',
      status: 'failed',
      allowedActions: ['retry'],
      errorCode: 'ARCHIVE_BATCH_FAILED',
      errorMessage: 'batch failed',
    }
    const freshB = { ...failedB, revision: 5 }
    api.fetchAuditArchiveRuns.mockResolvedValue(runPage([failedB]))
    api.getAuditArchiveRun.mockImplementation(async (id: string) =>
      id === 'run-a' ? selectedA : freshB
    )
    api.commandAuditArchiveRun.mockResolvedValueOnce(freshB)
    const { wrapper, router } = await mountPage('/audit/retention?runId=run-a')
    await wrapper
      .get('[data-testid="audit-retention-retry-run-b"]')
      .trigger('click')
    await flushPromises()
    expect(api.commandAuditArchiveRun).toHaveBeenCalledWith(
      freshB,
      'retry',
      expect.any(String)
    )
    expect(router.currentRoute.value.query.runId).toBe('run-b')
    expect(
      wrapper.get('[data-testid="audit-retention-detail"]').text()
    ).toContain('run-b')
    wrapper.unmount()
  })

  it('paginates 201 batches and downloads batch 101 through exact fresh metadata', async () => {
    const batch101: AuditArchiveBatchV1 = {
      ...batch,
      id: '_batch-101',
      ordinal: 101,
      candidateRange: { firstOrdinal: 101, lastOrdinal: 101 },
    }
    api.fetchAuditArchiveBatches.mockResolvedValueOnce(
      batchPage([batch101], { total: 201, current: 6, pageSize: 20 })
    )
    api.getAuditArchiveBatch.mockResolvedValueOnce(batch101)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const { wrapper } = await mountPage(
      '/audit/retention?runId=-archive-run-1&batchCurrent=6&batchPageSize=20'
    )
    expect(api.fetchAuditArchiveBatches).toHaveBeenCalledWith(run.id, {
      current: 6,
      pageSize: 20,
    })
    expect(
      wrapper.get('[data-testid="audit-retention-batch-page"]').text()
    ).toMatch(/第 6 \/ 11 页.*共 201 批/)
    await wrapper
      .get('[data-testid="audit-retention-download-_batch-101"]')
      .trigger('click')
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(api.getAuditArchiveBatch).toHaveBeenCalledWith(run.id, batch101.id)
    click.mockRestore()
    wrapper.unmount()
  })

  it('saves a batch only after the current metadata, response headers and bytes agree', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL')
    const { wrapper } = await mountPage('/audit/retention?runId=-archive-run-1')
    await wrapper
      .get('[data-testid="audit-retention-download-_batch-1"]')
      .trigger('click')
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(api.downloadAuditArchiveBatch).toHaveBeenCalledWith(run.id, batch.id)
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('已校验并下载 archive.csv')
    click.mockRestore()
    wrapper.unmount()
  })

  it('rechecks the current batch, verifies MIME, size and SHA, and drops bytes after permission revocation', async () => {
    let resolveDigest!: (value: ArrayBuffer) => void
    const pendingDigest = new Promise<ArrayBuffer>((resolve) => {
      resolveDigest = resolve
    })
    const digest = vi.fn(() => pendingDigest)
    vi.stubGlobal('crypto', {
      randomUUID: () => 'download-key',
      subtle: { digest },
    })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const { wrapper, user } = await mountPage(
      '/audit/retention?runId=-archive-run-1'
    )
    await wrapper
      .get('[data-testid="audit-retention-download-_batch-1"]')
      .trigger('click')
    await vi.waitFor(() => expect(digest).toHaveBeenCalledTimes(1))
    expect(api.getAuditArchiveRun).toHaveBeenCalled()
    expect(api.fetchAuditArchiveBatches).toHaveBeenCalled()
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
    expect(click).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain(batch.artifact?.sha256 || '')
    expect(wrapper.get('[data-testid="audit-retention-rights"]').exists()).toBe(
      true
    )
    click.mockRestore()
    wrapper.unmount()
  })
})
