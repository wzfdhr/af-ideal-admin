import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createUiAdapterLabItem,
  fetchUiAdapterLabItems,
  simulateUiAdapterLabError,
  updateUiAdapterLabItem,
  type UiAdapterLabQuery,
} from '@/api/ui-adapter-lab'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('ui adapter lab api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches lab items with pagination and filters', async () => {
    const query: UiAdapterLabQuery = {
      current: 1,
      pageSize: 20,
      keyword: 'table',
      status: 'ready',
    }
    requestMock.get.mockResolvedValueOnce({
      data: { list: [], total: 0 },
    })

    await fetchUiAdapterLabItems(query)

    expect(requestMock.get).toHaveBeenCalledWith('/ui-adapter-lab/items', {
      params: query,
    })
  })

  it('creates, updates and simulates an error state through mock APIs', async () => {
    requestMock.post.mockResolvedValueOnce({
      data: { success: true, record: { id: 'lab-new' } },
    })
    requestMock.put.mockResolvedValueOnce({
      data: { success: true, record: { id: 'lab-table' } },
    })
    requestMock.post.mockResolvedValueOnce({
      data: {
        success: false,
        reason: 'Mock adapter service unavailable',
        traceId: 'mock-ui-adapter-lab-500',
      },
    })

    await createUiAdapterLabItem({
      name: 'Aheart Table',
      component: 'Table',
      status: 'blocked',
      description: '候选表格验证',
    })
    await updateUiAdapterLabItem('lab-table', {
      name: 'Aheart Table',
      component: 'Table',
      status: 'ready',
      description: '表格已通过候选验证',
    })
    await simulateUiAdapterLabError()

    expect(requestMock.post).toHaveBeenNthCalledWith(
      1,
      '/ui-adapter-lab/items',
      {
        name: 'Aheart Table',
        component: 'Table',
        status: 'blocked',
        description: '候选表格验证',
      }
    )
    expect(requestMock.put).toHaveBeenCalledWith(
      '/ui-adapter-lab/items/lab-table',
      {
        name: 'Aheart Table',
        component: 'Table',
        status: 'ready',
        description: '表格已通过候选验证',
      }
    )
    expect(requestMock.post).toHaveBeenNthCalledWith(2, '/ui-adapter-lab/error')
  })
})
