import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchDataPermissionRules,
  previewDataPermission,
  updateDataPermissionRule,
  type DataPermissionQuery,
  type DataPermissionUpdatePayload,
  type DataScopePreviewPayload,
} from '@/api/data-permission'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('data permission api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches data permission rules with tenant and scope filters', async () => {
    const query: DataPermissionQuery = {
      current: 1,
      pageSize: 10,
      keyword: '运营',
      tenantId: 'tenant-a',
      dataScope: 'department-and-children',
    }
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await fetchDataPermissionRules(query)

    expect(requestMock.get).toHaveBeenCalledWith('/permissions/data-scopes', {
      params: query,
    })
  })

  it('updates a role data scope and previews visible data rows', async () => {
    const updatePayload: DataPermissionUpdatePayload = {
      dataScope: 'department',
      departmentIds: ['dept-operation'],
      ownerUserIds: [],
      fieldPermissions: ['amount', 'customerName'],
    }
    const previewPayload: DataScopePreviewPayload = {
      roleId: 'role-operator',
      dataScope: 'department',
      departmentIds: ['dept-operation'],
      ownerUserIds: [],
    }

    requestMock.put.mockResolvedValueOnce({
      data: {
        success: true,
      },
    })
    requestMock.post.mockResolvedValueOnce({
      data: {
        visibleRows: [],
        hiddenRows: [],
      },
    })

    await updateDataPermissionRule('role-operator', updatePayload)
    await previewDataPermission(previewPayload)

    expect(requestMock.put).toHaveBeenCalledWith(
      '/permissions/data-scopes/role-operator',
      updatePayload
    )
    expect(requestMock.post).toHaveBeenCalledWith(
      '/permissions/data-scopes/preview',
      previewPayload
    )
  })
})
