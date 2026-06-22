import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createSystemRole,
  deleteSystemRole,
  fetchSystemRoles,
  getSystemRoleDetail,
  updateSystemRole,
} from '@/api/system/role'
import { recordAuditEvent } from '@/services/audit'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

vi.mock('@/services/audit', () => ({
  recordAuditEvent: vi.fn(),
}))

describe('system role api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches paged roles with query params', async () => {
    requestMock.get.mockResolvedValueOnce({ data: { list: [], total: 0 } })

    await expect(
      fetchSystemRoles({
        current: 2,
        pageSize: 20,
        roleName: '管理员',
        roleKey: 'admin',
        status: 'enabled',
      })
    ).resolves.toEqual({ list: [], total: 0 })

    expect(requestMock.get).toHaveBeenCalledWith('/system/roles', {
      params: {
        current: 2,
        pageSize: 20,
        roleName: '管理员',
        roleKey: 'admin',
        status: 'enabled',
      },
    })
  })

  it('uses resource endpoints for detail, create, update, and delete', async () => {
    const payload = {
      roleName: '运营人员',
      roleKey: 'operator',
      roleSort: 2,
      dataScope: 'dept',
      status: 'enabled' as const,
      remark: '运营角色',
    }
    requestMock.get.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.post.mockResolvedValueOnce({ data: { id: '2', ...payload } })
    requestMock.put.mockResolvedValueOnce({ data: { id: '1', ...payload } })
    requestMock.delete.mockResolvedValueOnce({ data: null })

    await getSystemRoleDetail('1')
    await createSystemRole(payload)
    await updateSystemRole('1', payload)
    await deleteSystemRole('1')

    expect(requestMock.get).toHaveBeenCalledWith('/system/roles/1')
    expect(requestMock.post).toHaveBeenCalledWith('/system/roles', payload)
    expect(requestMock.put).toHaveBeenCalledWith('/system/roles/1', payload)
    expect(requestMock.delete).toHaveBeenCalledWith('/system/roles/1')
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'system',
        action: 'role.create',
        eventType: 'permission',
        result: 'success',
        target: {
          type: 'role',
          id: '2',
          name: '运营人员',
        },
      })
    )
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'system',
        action: 'role.update',
        eventType: 'permission',
        result: 'success',
        target: {
          type: 'role',
          id: '1',
          name: '运营人员',
        },
      })
    )
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'system',
        action: 'role.delete',
        eventType: 'permission',
        result: 'success',
        target: {
          type: 'role',
          id: '1',
        },
      })
    )
  })
})
