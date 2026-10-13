import { describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '@/api/request-client'
import {
  applySourceResult,
  createDataScreenScheduler,
  emptySourceRuntime,
} from '@/components/data-screen/reference/runtime'
import type {
  DataScreenRunResultV1,
  DataScreenSourceRunResultV1,
  DataScreenSourceV1,
} from '@af-admin/contracts'

const source: DataScreenSourceV1 = {
  sourceKey: 'trend',
  reportDefinitionVersionId: 'report-v1',
  dateWindow: 'today',
  statuses: [],
  refreshSeconds: 15,
}
const slowSource: DataScreenSourceV1 = {
  ...source,
  sourceKey: 'detail',
  reportDefinitionVersionId: 'report-v2',
  refreshSeconds: 300,
}
const runSource = (total = 2): DataScreenSourceRunResultV1 => ({
  sourceKey: 'trend',
  reportDefinitionVersionId: 'report-v1',
  actualQuery: null,
  status: total ? 'ready' : 'empty',
  errorCode: null,
  queriedAt: '2026-10-12T12:00:00.000Z',
  dataCutoffAt: '2026-10-12T11:59:59.000Z',
  result: {
    version: 1,
    definitionId: 'report',
    definitionVersion: 1,
    source: { kind: 'application-records', applicationId: 'app' },
    sourceReleaseId: 'app-v1',
    sourceReleaseVersion: 1,
    policyVersion: 1,
    kind: 'trend',
    metric: 'count',
    factTime: 'createdAt',
    timeZone: 'UTC',
    dateRange: { from: '2026-10-12', to: '2026-10-12' },
    queriedAt: '2026-10-12T12:00:00.000Z',
    dataCutoffAt: '2026-10-12T11:59:59.000Z',
    scope: 'current-authorized-records',
    releaseScope: 'fixed-published-source',
    visibleFields: [],
    hiddenFields: [],
    current: 1,
    pageSize: 100,
    total,
    rows: [],
    trend: total ? [{ date: '2026-10-12', count: total }] : [],
    distribution: [],
  },
})
const response = (item = runSource()): DataScreenRunResultV1 => ({
  version: 1,
  dataScreenId: 'screen',
  releaseId: 'preview',
  releaseVersion: 0,
  sources: [item],
})

describe('data screen source runtime', () => {
  it('clears old authorized data immediately when the source reports denied', () => {
    const old = applySourceResult(emptySourceRuntime(), runSource())
    const denied = applySourceResult(old, {
      ...runSource(),
      status: 'error',
      errorCode: 'permission-denied',
      result: null,
    })
    expect(denied.phase).toBe('rights')
    expect(denied.source).toBeNull()
    expect(denied.stale).toBe(false)
  })

  it('does not stack a slow request and drops its response after generation invalidation', async () => {
    let resolve!: (value: DataScreenRunResultV1) => void
    const execute = vi.fn(
      () =>
        new Promise<DataScreenRunResultV1>((done) => {
          resolve = done
        })
    )
    let state = emptySourceRuntime()
    const scheduler = createDataScreenScheduler({
      execute,
      readSources: () => [source],
      readState: () => state,
      onState: (_key, next) => {
        state = next
      },
      visible: () => true,
      setTimer: () => 1,
      clearTimer: () => undefined,
    })
    scheduler.start()
    const first = scheduler.refresh()
    await scheduler.refresh()
    expect(execute).toHaveBeenCalledTimes(1)
    scheduler.invalidate()
    await scheduler.refresh()
    expect(execute).toHaveBeenCalledTimes(1)
    resolve(response())
    await first
    expect(state.source).toBeNull()
    scheduler.refresh()
    expect(execute).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('clears a revoked long-interval source from an all-source response when only the short timer was due', async () => {
    let clock = 0
    const states: Record<string, ReturnType<typeof emptySourceRuntime>> = {
      trend: emptySourceRuntime(),
      detail: emptySourceRuntime(),
    }
    const readyDetail = { ...runSource(4), sourceKey: 'detail' }
    const deniedDetail: DataScreenSourceRunResultV1 = {
      ...readyDetail,
      status: 'error',
      errorCode: 'permission-denied',
      result: null,
    }
    const execute = vi
      .fn<() => Promise<DataScreenRunResultV1>>()
      .mockResolvedValueOnce({
        ...response(),
        sources: [runSource(), readyDetail],
      })
      .mockResolvedValueOnce({
        ...response(),
        sources: [runSource(3), deniedDetail],
      })
    const scheduler = createDataScreenScheduler({
      execute,
      readSources: () => [source, slowSource],
      readState: (key) => states[key],
      onState: (key, next) => {
        states[key] = next
      },
      now: () => clock,
      visible: () => true,
      setTimer: () => 1,
      clearTimer: () => undefined,
    })
    scheduler.start()
    await scheduler.refresh()
    expect(states.detail.source?.result?.total).toBe(4)
    clock = 15_000
    await scheduler.refresh(false)
    expect(states.detail.phase).toBe('rights')
    expect(states.detail.source).toBeNull()
    scheduler.stop()
  })

  it('keeps prior data stale only for a network failure, while a rights failure clears it', async () => {
    let state = applySourceResult(emptySourceRuntime(), runSource())
    let error = new ApiRequestError({
      kind: 'network',
      message: 'offline',
      displayMessage: 'offline',
    })
    const execute = vi.fn(async () => {
      throw error
    })
    const scheduler = createDataScreenScheduler({
      execute,
      readSources: () => [source],
      readState: () => state,
      onState: (_key, next) => {
        state = next
      },
      visible: () => true,
      setTimer: () => 1,
      clearTimer: () => undefined,
    })
    scheduler.start()
    await scheduler.refresh()
    expect(state.stale).toBe(true)
    expect(state.source?.result?.total).toBe(2)
    error = new ApiRequestError({
      kind: 'forbidden',
      message: 'denied',
      displayMessage: 'denied',
    })
    await scheduler.refresh()
    expect(state.phase).toBe('rights')
    expect(state.source).toBeNull()
    scheduler.stop()
  })
})
