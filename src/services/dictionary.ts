import { getDictionaryOptions } from '@/api/common'

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
}: DictionaryServiceOptions = {}) => {
  const cache = new Map<string, Promise<DictionaryOption[]>>()
  const states = new Map<string, DictionaryState>()

  const getState = (key: string) => {
    if (!states.has(key)) {
      states.set(key, createInitialState())
    }

    return states.get(key) as DictionaryState
  }

  const loadRemoteOptions = async (key: string) => {
    const state = getState(key)
    state.loading = true
    state.error = ''

    try {
      const options = await fetcher(key)
      state.options = options
      return options
    } catch (error) {
      const dictionaryError = new DictionaryLoadError(key, error)
      state.options = []
      state.error = dictionaryError.message
      cache.delete(key)
      throw dictionaryError
    } finally {
      state.loading = false
    }
  }

  const getOptions = (key: string, refresh = false) => {
    const staticOptions = staticDictionaries[key]
    if (staticOptions) {
      const state = getState(key)
      state.options = staticOptions
      state.error = ''
      state.loading = false
      return Promise.resolve(staticOptions)
    }

    if (refresh || !cache.has(key)) {
      cache.set(key, loadRemoteOptions(key))
    }

    return cache.get(key) as Promise<DictionaryOption[]>
  }

  const getLabel = (
    key: string,
    value: DictionaryOption['value'],
    fallback = String(value)
  ) => {
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
      return
    }

    cache.clear()
    states.clear()
  }

  return {
    getOptions,
    getLabel,
    getState,
    clear,
  }
}

export const dictionaryService = createDictionaryService()
