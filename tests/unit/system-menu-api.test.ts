import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createSystemMenu,
  deleteSystemMenu,
  fetchSystemMenus,
  getSystemMenuDetail,
  updateSystemMenu,
} from '@/api/system/menu'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('system menu api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches paged menus with query params', async () => {
    requestMock.get.mockResolvedValueOnce({ data: { list: [], total: 0 } })

    await expect(
      fetchSystemMenus({
        current: 2,
        pageSize: 20,
        menuName: '系统',
        status: 'enabled',
      })
    ).resolves.toEqual({ list: [], total: 0 })

    expect(requestMock.get).toHaveBeenCalledWith('/system/menus', {
      params: {
        current: 2,
        pageSize: 20,
        menuName: '系统',
        status: 'enabled',
      },
    })
  })

  it('uses resource endpoints for detail, create, update, and delete', async () => {
    const payload = {
      menuName: '系统管理',
      menuType: 'catalog' as const,
      path: '/system',
      permission: 'system:view',
      sort: 1,
      status: 'enabled' as const,
    }
    requestMock.get.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.post.mockResolvedValueOnce({ data: { id: '2', ...payload } })
    requestMock.put.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.delete.mockResolvedValueOnce({ data: null })

    await getSystemMenuDetail('1')
    await createSystemMenu(payload)
    await updateSystemMenu('1', payload)
    await deleteSystemMenu('1')

    expect(requestMock.get).toHaveBeenCalledWith('/system/menus/1')
    expect(requestMock.post).toHaveBeenCalledWith('/system/menus', payload)
    expect(requestMock.put).toHaveBeenCalledWith('/system/menus/1', payload)
    expect(requestMock.delete).toHaveBeenCalledWith('/system/menus/1')
  })
})
