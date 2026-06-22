import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createSystemUser,
  deleteSystemUser,
  fetchSystemUsers,
  getSystemUserDetail,
  updateSystemUser,
} from '@/api/system/user'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('system user api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches paged users with query params', async () => {
    requestMock.get.mockResolvedValueOnce({ data: { list: [], total: 0 } })

    await expect(
      fetchSystemUsers({
        current: 2,
        pageSize: 20,
        username: 'admin',
        phone: '176',
        status: 'enabled',
      })
    ).resolves.toEqual({ list: [], total: 0 })

    expect(requestMock.get).toHaveBeenCalledWith('/system/users', {
      params: {
        current: 2,
        pageSize: 20,
        username: 'admin',
        phone: '176',
        status: 'enabled',
      },
    })
  })

  it('uses resource endpoints for detail, create, update, and delete', async () => {
    const payload = {
      username: 'operator',
      name: '运营人员',
      phone: '17666666666',
      email: 'operator@example.com',
      dept: '运营部',
      status: 'enabled' as const,
      role: 'operator',
    }
    requestMock.get.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.post.mockResolvedValueOnce({ data: { id: '2', ...payload } })
    requestMock.put.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.delete.mockResolvedValueOnce({ data: null })

    await getSystemUserDetail('1')
    await createSystemUser(payload)
    await updateSystemUser('1', payload)
    await deleteSystemUser('1')

    expect(requestMock.get).toHaveBeenCalledWith('/system/users/1')
    expect(requestMock.post).toHaveBeenCalledWith('/system/users', payload)
    expect(requestMock.put).toHaveBeenCalledWith('/system/users/1', payload)
    expect(requestMock.delete).toHaveBeenCalledWith('/system/users/1')
  })
})
