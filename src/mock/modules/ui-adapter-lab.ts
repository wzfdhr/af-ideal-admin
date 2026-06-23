import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  UiAdapterLabErrorResult,
  UiAdapterLabItem,
  UiAdapterLabMutationResult,
  UiAdapterLabPayload,
  UiAdapterLabQuery,
} from '@/api/ui-adapter-lab'
import type { MockParams } from '../types'

export interface UiAdapterLabMockStoreOptions {
  now?: () => string
}

const getNow = () => '2026-06-23 11:00:00'

const seedItems = (): UiAdapterLabItem[] => [
  {
    id: 'lab-button',
    name: 'Aheart Button',
    component: 'Button',
    adapter: 'aheart',
    status: 'blocked',
    owner: 'UI Platform',
    updatedAt: '2026-06-23 10:10:00',
    description: '按钮组件候选适配验证',
  },
  {
    id: 'lab-table',
    name: 'Aheart Table',
    component: 'Table',
    adapter: 'aheart',
    status: 'blocked',
    owner: 'UI Platform',
    updatedAt: '2026-06-23 10:20:00',
    description: '表格组件候选适配验证',
  },
  {
    id: 'lab-form',
    name: 'Aheart Form',
    component: 'Form',
    adapter: 'aheart',
    status: 'blocked',
    owner: 'UI Platform',
    updatedAt: '2026-06-23 10:30:00',
    description: '表单组件候选适配验证',
  },
]

const cloneItem = (item: UiAdapterLabItem): UiAdapterLabItem => ({ ...item })

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const readStatus = (value: unknown): UiAdapterLabQuery['status'] =>
  value === 'ready' || value === 'blocked' ? value : ''

const parseQuery = (url: string): UiAdapterLabQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: toPositiveNumber(query.current, 1),
    pageSize: toPositiveNumber(query.pageSize, 20),
    keyword: readString(query.keyword) || '',
    status: readStatus(query.status),
  }
}

const parseBody = (body: string): UiAdapterLabPayload => {
  try {
    return JSON.parse(body || '{}') as UiAdapterLabPayload
  } catch {
    return {
      name: '',
      component: '',
      status: 'blocked',
      description: '',
    }
  }
}

const getItemIdFromUrl = (url: string) => {
  const match = url.match(/\/api\/ui-adapter-lab\/items\/([^/]+)$/)
  return decodeURIComponent(match?.[1] || '')
}

const normalizePayload = (
  payload: UiAdapterLabPayload
): Pick<UiAdapterLabItem, 'name' | 'component' | 'status' | 'description'> => ({
  name: payload.name.trim(),
  component: payload.component.trim(),
  status: payload.status === 'ready' ? 'ready' : 'blocked',
  description: payload.description.trim(),
})

const validatePayload = (payload: UiAdapterLabPayload) => {
  if (!payload.name.trim()) return '验证项名称不能为空'
  if (!payload.component.trim()) return '组件名称不能为空'
  return ''
}

export const createUiAdapterLabMockStore = (
  options: UiAdapterLabMockStoreOptions = {}
) => {
  const now = options.now || getNow
  let items = seedItems()

  const queryItems = (params: UiAdapterLabQuery) => {
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const status = params.status || ''
    const filtered = items.filter((item) => {
      const matchesKeyword = keyword
        ? `${item.name}${item.component}${item.description}`
            .toLowerCase()
            .includes(keyword)
        : true
      const matchesStatus = status ? item.status === status : true
      return matchesKeyword && matchesStatus
    })
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(cloneItem),
      total: filtered.length,
    }
  }

  const createItem = (
    payload: UiAdapterLabPayload
  ): UiAdapterLabMutationResult => {
    const reason = validatePayload(payload)
    if (reason) return { success: false, reason }

    const normalized = normalizePayload(payload)
    const record: UiAdapterLabItem = {
      id: `lab-${Date.now()}-${items.length + 1}`,
      ...normalized,
      adapter: 'aheart',
      owner: 'UI Platform',
      updatedAt: now(),
    }

    items = [record, ...items]

    return {
      success: true,
      record: cloneItem(record),
    }
  }

  const updateItem = (
    id: string,
    payload: UiAdapterLabPayload
  ): UiAdapterLabMutationResult => {
    const reason = validatePayload(payload)
    if (reason) return { success: false, reason }

    const target = items.find((item) => item.id === id)
    if (!target) {
      return {
        success: false,
        reason: '验证项不存在',
      }
    }

    const updated: UiAdapterLabItem = {
      ...target,
      ...normalizePayload(payload),
      updatedAt: now(),
    }

    items = items.map((item) => (item.id === id ? updated : item))

    return {
      success: true,
      record: cloneItem(updated),
    }
  }

  const simulateError = (): UiAdapterLabErrorResult => ({
    success: false,
    reason: 'Mock adapter service unavailable',
    traceId: 'mock-ui-adapter-lab-500',
  })

  return {
    queryItems,
    createItem,
    updateItem,
    simulateError,
  }
}

const uiAdapterLabStore = createUiAdapterLabMockStore()

const setupUiAdapterLabMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/ui-adapter-lab/items(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) return failedResponseWrap(null, '未登录', 50008)

          return responseWrap(
            uiAdapterLabStore.queryItems(parseQuery(params.url))
          )
        }
      )

      Mock.mock('/api/ui-adapter-lab/items', 'post', (params: MockParams) => {
        if (!isAuthed()) return failedResponseWrap(null, '未登录', 50008)

        return responseWrap(
          uiAdapterLabStore.createItem(parseBody(params.body))
        )
      })

      Mock.mock(
        new RegExp('/api/ui-adapter-lab/items/[^/]+$'),
        'put',
        (params: MockParams) => {
          if (!isAuthed()) return failedResponseWrap(null, '未登录', 50008)

          return responseWrap(
            uiAdapterLabStore.updateItem(
              getItemIdFromUrl(params.url),
              parseBody(params.body)
            )
          )
        }
      )

      Mock.mock('/api/ui-adapter-lab/error', 'post', () =>
        responseWrap(uiAdapterLabStore.simulateError())
      )
    },
  })
}

export default setupUiAdapterLabMock
