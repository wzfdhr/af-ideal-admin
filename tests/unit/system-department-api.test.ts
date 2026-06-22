import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createSystemDepartment,
  deleteSystemDepartment,
  fetchSystemDepartments,
  getSystemDepartmentDetail,
  updateSystemDepartment,
} from '@/api/system/department'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('system department api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches paged departments with query params', async () => {
    requestMock.get.mockResolvedValueOnce({ data: { list: [], total: 0 } })

    await expect(
      fetchSystemDepartments({
        current: 2,
        pageSize: 20,
        departmentName: '运营',
        status: 'enabled',
      })
    ).resolves.toEqual({ list: [], total: 0 })

    expect(requestMock.get).toHaveBeenCalledWith('/system/departments', {
      params: {
        current: 2,
        pageSize: 20,
        departmentName: '运营',
        status: 'enabled',
      },
    })
  })

  it('uses resource endpoints for detail, create, update, and delete', async () => {
    const payload = {
      departmentName: '运营部',
      leader: '运营人员',
      sort: 2,
      status: 'enabled' as const,
    }
    requestMock.get.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.post.mockResolvedValueOnce({ data: { id: '2', ...payload } })
    requestMock.put.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.delete.mockResolvedValueOnce({ data: null })

    await getSystemDepartmentDetail('1')
    await createSystemDepartment(payload)
    await updateSystemDepartment('1', payload)
    await deleteSystemDepartment('1')

    expect(requestMock.get).toHaveBeenCalledWith('/system/departments/1')
    expect(requestMock.post).toHaveBeenCalledWith(
      '/system/departments',
      payload
    )
    expect(requestMock.put).toHaveBeenCalledWith(
      '/system/departments/1',
      payload
    )
    expect(requestMock.delete).toHaveBeenCalledWith('/system/departments/1')
  })
})
