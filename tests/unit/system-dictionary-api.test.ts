import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createSystemDictionary,
  deleteSystemDictionary,
  fetchSystemDictionaries,
  getSystemDictionaryDetail,
  updateSystemDictionary,
} from '@/api/system/dictionary'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('system dictionary api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches paged dictionaries with query params', async () => {
    requestMock.get.mockResolvedValueOnce({ data: { list: [], total: 0 } })

    await expect(
      fetchSystemDictionaries({
        current: 2,
        pageSize: 20,
        dictName: '状态',
        dictStatus: 'enabled',
      })
    ).resolves.toEqual({ list: [], total: 0 })

    expect(requestMock.get).toHaveBeenCalledWith('/system/dictionaries', {
      params: {
        current: 2,
        pageSize: 20,
        dictName: '状态',
        dictStatus: 'enabled',
      },
    })
  })

  it('uses resource endpoints for detail, create, update, and delete', async () => {
    const payload = {
      dictName: '状态',
      dictType: 'sys_status',
      dictStatus: 'enabled' as const,
      description: '系统状态',
    }
    requestMock.get.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.post.mockResolvedValueOnce({ data: { id: '2', ...payload } })
    requestMock.put.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.delete.mockResolvedValueOnce({ data: null })

    await getSystemDictionaryDetail('1')
    await createSystemDictionary(payload)
    await updateSystemDictionary('1', payload)
    await deleteSystemDictionary('1')

    expect(requestMock.get).toHaveBeenCalledWith('/system/dictionaries/1')
    expect(requestMock.post).toHaveBeenCalledWith(
      '/system/dictionaries',
      payload
    )
    expect(requestMock.put).toHaveBeenCalledWith(
      '/system/dictionaries/1',
      payload
    )
    expect(requestMock.delete).toHaveBeenCalledWith('/system/dictionaries/1')
  })
})
