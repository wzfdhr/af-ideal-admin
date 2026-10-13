import { ApiRequestError } from '@/api/request-client'
import type {
  BusinessRecordStatus,
  DataScreenRunResultV1,
  DataScreenSourceRunResultV1,
  DataScreenSourceV1,
} from '@af-admin/contracts'

export type SourceRuntimePhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error'
  | 'rights'

export interface SourceRuntimeState {
  phase: SourceRuntimePhase
  refreshing: boolean
  stale: boolean
  lastSuccessAt: string | null
  dataCutoffAt: string | null
  message: string
  source: DataScreenSourceRunResultV1 | null
}

export const emptySourceRuntime = (): SourceRuntimeState => ({
  phase: 'idle',
  refreshing: false,
  stale: false,
  lastSuccessAt: null,
  dataCutoffAt: null,
  message: '',
  source: null,
})

export interface DataScreenAlertFact {
  collectionKey: string
  applicationId: string
  sourceReleaseId: string
  sourceReleaseVersion: number
  statuses: BusinessRecordStatus[]
  count: number
  queriedAt: string
  dataCutoffAt: string
}

/**
 * Report views over the same authorized business collection are alternative
 * projections, not additive facts. Distinct windows or status filters remain
 * separate facts because their sets may overlap and cannot safely be summed.
 */
export const buildDataScreenAlertFacts = (
  states: readonly SourceRuntimeState[],
  alertStatuses: readonly BusinessRecordStatus[]
): DataScreenAlertFact[] => {
  const facts = new Map<string, DataScreenAlertFact>()
  states.forEach((state) => {
    const { source } = state
    const result = source?.result
    const query = source?.actualQuery
    if (
      !source ||
      source.status === 'error' ||
      !result ||
      !query ||
      !source.dataCutoffAt
    )
      return
    const queryStatuses = [...query.statuses].sort()
    const collectionKey = JSON.stringify({
      applicationId: result.source.applicationId,
      sourceReleaseId: result.sourceReleaseId,
      timeZone: query.timeZone,
      from: query.dateRange.from,
      to: query.dateRange.to,
      statuses: queryStatuses,
    })
    const fact: DataScreenAlertFact = {
      collectionKey,
      applicationId: result.source.applicationId,
      sourceReleaseId: result.sourceReleaseId,
      sourceReleaseVersion: result.sourceReleaseVersion,
      statuses: alertStatuses.filter(
        (status) => !queryStatuses.length || queryStatuses.includes(status)
      ),
      count: result.distribution
        .filter((item) => alertStatuses.includes(item.status))
        .reduce((sum, item) => sum + item.count, 0),
      queriedAt: source.queriedAt,
      dataCutoffAt: source.dataCutoffAt,
    }
    const previous = facts.get(collectionKey)
    if (!previous || previous.queriedAt < fact.queriedAt)
      facts.set(collectionKey, fact)
  })
  return Array.from(facts.values()).sort((left, right) =>
    left.collectionKey.localeCompare(right.collectionKey)
  )
}

export const isNetworkFailure = (error: unknown) =>
  error instanceof ApiRequestError && error.context.kind === 'network'

export const isRightsFailure = (error: unknown) =>
  error instanceof ApiRequestError &&
  ['unauthorized', 'forbidden'].includes(error.context.kind)

export const applySourceResult = (
  previous: SourceRuntimeState,
  source: DataScreenSourceRunResultV1
): SourceRuntimeState => {
  if (source.errorCode === 'permission-denied') {
    return {
      ...emptySourceRuntime(),
      phase: 'rights',
      message: '当前身份无权读取该来源，已清除旧数据',
      dataCutoffAt: source.dataCutoffAt,
    }
  }
  if (source.status === 'error') {
    if (source.errorCode === 'network-error' && previous.source) {
      return {
        ...previous,
        refreshing: false,
        stale: true,
        message: '网络中断，当前显示上次成功数据',
      }
    }
    let message = '真实来源查询失败'
    if (source.errorCode === 'source-disabled') message = '来源已停用'
    else if (source.errorCode === 'source-unavailable') message = '来源不可用'
    return {
      ...emptySourceRuntime(),
      phase: 'error',
      message,
      dataCutoffAt: source.dataCutoffAt,
    }
  }
  const empty = !source.result || source.result.total === 0
  return {
    phase: empty ? 'empty' : 'ready',
    refreshing: false,
    stale: false,
    lastSuccessAt: source.queriedAt || previous.lastSuccessAt,
    dataCutoffAt: source.dataCutoffAt,
    message: empty ? '当前授权范围内暂无数据' : '',
    source,
  }
}

export interface DataScreenSchedulerOptions {
  execute: () => Promise<DataScreenRunResultV1>
  readSources: () => readonly DataScreenSourceV1[]
  onState: (sourceKey: string, state: SourceRuntimeState) => void
  readState: (sourceKey: string) => SourceRuntimeState
  now?: () => number
  setTimer?: (callback: () => void, milliseconds: number) => unknown
  clearTimer?: (timer: unknown) => void
  visible?: () => boolean
}

/**
 * One bounded request services all due sources. Generation invalidation drops
 * responses from a previous identity, tenant, draft or release.
 */
export const createDataScreenScheduler = (
  options: DataScreenSchedulerOptions
) => {
  const now = options.now || Date.now
  const setTimer =
    options.setTimer ||
    ((callback, milliseconds) => window.setTimeout(callback, milliseconds))
  const clearTimer =
    options.clearTimer || ((timer) => window.clearTimeout(timer as number))
  const visible =
    options.visible || (() => document.visibilityState !== 'hidden')
  let timer: unknown
  let active = false
  let pending = false
  let generation = 0
  const nextDue = new Map<string, number>()

  const cancelTimer = () => {
    if (timer !== undefined) clearTimer(timer)
    timer = undefined
  }

  const plan = () => {
    cancelTimer()
    if (!active || !visible()) return
    const sources = options.readSources()
    if (!sources.length) return
    const at = now()
    const delay = Math.max(
      0,
      Math.min(
        ...sources.map((source) => (nextDue.get(source.sourceKey) || at) - at)
      )
    )
    timer = setTimer(() => {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      refresh(false)
    }, delay)
  }

  async function refresh(force = true) {
    if (!active || pending || !visible()) return
    const sources = options.readSources()
    const at = now()
    const due = sources.filter(
      (source) => force || (nextDue.get(source.sourceKey) || 0) <= at
    )
    if (!due.length) {
      plan()
      return
    }
    const requestGeneration = generation
    pending = true
    due.forEach((source) => {
      const previous = options.readState(source.sourceKey)
      options.onState(source.sourceKey, {
        ...previous,
        phase: previous.source ? previous.phase : 'loading',
        refreshing: Boolean(previous.source),
        message: '',
      })
    })
    try {
      const response = await options.execute()
      if (!active || requestGeneration !== generation) return
      const byKey = new Map(
        response.sources.map((source) => [source.sourceKey, source])
      )
      // The endpoint authorizes every source on each execution. Apply every
      // returned source now so a revoked long-interval source cannot retain
      // data until its own timer becomes due.
      sources.forEach((source) => {
        const result = byKey.get(source.sourceKey)
        if (result)
          options.onState(
            source.sourceKey,
            applySourceResult(options.readState(source.sourceKey), result)
          )
        else if (due.some((item) => item.sourceKey === source.sourceKey))
          options.onState(source.sourceKey, {
            ...emptySourceRuntime(),
            phase: 'error',
            message: '服务端未返回该来源',
          })
        nextDue.set(source.sourceKey, now() + source.refreshSeconds * 1000)
      })
    } catch (error) {
      if (!active || requestGeneration !== generation) return
      const rights = isRightsFailure(error)
      const network = isNetworkFailure(error)
      // Request-level authorization and network outcomes cover the full
      // all-source execution, including sources whose timers were not due.
      sources.forEach((source) => {
        const previous = options.readState(source.sourceKey)
        if (network && previous.source) {
          options.onState(source.sourceKey, {
            ...previous,
            refreshing: false,
            stale: true,
            message: '网络中断，当前显示上次成功数据',
          })
        } else {
          options.onState(source.sourceKey, {
            ...emptySourceRuntime(),
            phase: rights ? 'rights' : 'error',
            message: rights
              ? '当前身份无权读取该来源，已清除旧数据'
              : '刷新失败，未保留未经确认的数据',
          })
        }
        nextDue.set(source.sourceKey, now() + source.refreshSeconds * 1000)
      })
    } finally {
      // Keep one physical request in flight across generation invalidations.
      // Its response is discarded above, then the newest generation runs.
      pending = false
      plan()
    }
  }

  const start = () => {
    active = true
    generation += 1
    nextDue.clear()
    plan()
  }
  const invalidate = () => {
    generation += 1
    nextDue.clear()
    cancelTimer()
    if (active) plan()
  }
  const stop = () => {
    active = false
    generation += 1
    pending = false
    nextDue.clear()
    cancelTimer()
  }
  const visibilityChanged = () => {
    if (!active) return
    if (visible()) {
      nextDue.clear()
      plan()
    } else cancelTimer()
  }

  return { start, stop, invalidate, refresh, visibilityChanged }
}
