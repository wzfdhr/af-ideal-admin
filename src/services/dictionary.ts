import { getDictionaryOptions } from '@/api/common'
import { tenantScope, ContextChangedError } from '@/services/tenant-context'

export interface DictionaryOption {
  label: string
  value: string | number | boolean
  disabled?: boolean
  [key: string]: unknown
}

export interface DictionaryState {
  loading: boolean
  error: string
  options: DictionaryOption[]
}

export interface DictionaryServiceOptions {
  fetcher?: (key: string) => Promise<DictionaryOption[]>
  staticDictionaries?: Record<string, DictionaryOption[]>
  scope?: () => string
  ttlMs?: number
  now?: () => number
}

export class DictionaryLoadError extends Error {
  key: string

  constructor(key: string, cause?: unknown) {
    super(`字典 ${key} 加载失败`)
    this.name = 'DictionaryLoadError'
    this.key = key
    this.cause = cause
  }
}

const createInitialState = (): DictionaryState => ({
  loading: false,
  error: '',
  options: [],
})

export const createDictionaryService = ({
  fetcher = getDictionaryOptions,
  staticDictionaries = {},
  scope = () => '',
  ttlMs = 30000,
  now = Date.now,
}: DictionaryServiceOptions = {}) => {
  const cache = new Map<string, Promise<DictionaryOption[]>>()
  const states = new Map<string, DictionaryState>()
  const expires = new Map<string, number>()
  const tickets = new Map<string, number>()
  let activeScope = scope()
  let serial = 0

  const syncScope = () => {
    const current = scope()
    if (current !== activeScope) {
      cache.clear()
      states.clear()
      expires.clear()
      tickets.clear()
      activeScope = current
    }
  }

  const getState = (key: string) => {
    syncScope()
    if (!states.has(key)) {
      states.set(key, createInitialState())
    }

    return states.get(key) as DictionaryState
  }

  const loadRemoteOptions = async (key: string, ticket: number) => {
    const state = getState(key)
    const requestScope = activeScope
    state.loading = true
    state.error = ''

    try {
      const options = await fetcher(key)
      syncScope()
      if (activeScope !== requestScope || tickets.get(key) !== ticket)
        throw new ContextChangedError()
      state.options = options
      expires.set(key, now() + ttlMs)
      return options
    } catch (error) {
      if (scope() !== requestScope || tickets.get(key) !== ticket)
        throw new ContextChangedError()
      const dictionaryError = new DictionaryLoadError(key, error)
      state.options = []
      state.error = dictionaryError.message
      cache.delete(key)
      throw dictionaryError
    } finally {
      if (scope() === requestScope && tickets.get(key) === ticket)
        state.loading = false
    }
  }

  const getOptions = (key: string, refresh = false) => {
    syncScope()
    const staticOptions = staticDictionaries[key]
    if (staticOptions) {
      const state = getState(key)
      state.options = staticOptions
      state.error = ''
      state.loading = false
      return Promise.resolve(staticOptions)
    }

    if (
      refresh ||
      !cache.has(key) ||
      (expires.has(key) && now() >= (expires.get(key) || 0))
    ) {
      serial += 1
      tickets.set(key, serial)
      expires.delete(key)
      cache.set(key, loadRemoteOptions(key, serial))
    }

    return cache.get(key) as Promise<DictionaryOption[]>
  }

  const getLabel = (
    key: string,
    value: DictionaryOption['value'],
    fallback = String(value)
  ) => {
    syncScope()
    const state = getState(key)
    const options = state.options.length
      ? state.options
      : staticDictionaries[key] || []
    return options.find((option) => option.value === value)?.label || fallback
  }

  const clear = (key?: string) => {
    if (key) {
      cache.delete(key)
      states.delete(key)
      expires.delete(key)
      tickets.delete(key)
      return
    }

    cache.clear()
    states.clear()
    expires.clear()
    tickets.clear()
  }

  return {
    getOptions,
    getLabel,
    getState,
    clear,
  }
}

export const dictionaryService = createDictionaryService({
  scope: () => {
    const current = tenantScope.snapshot()
    return `${current.tenantId || ''}:${current.generation}`
  },
})
