import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchTenantContext,
  fetchTenants,
  switchTenant,
  type TenantQuery,
} from '@/api/tenant'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('tenant api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches tenants with keyword and status filters', async () => {
    const query: TenantQuery = {
      current: 1,
      pageSize: 10,
      keyword: 'Aheart',
      status: 'enabled',
    }
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await fetchTenants(query)

    expect(requestMock.get).toHaveBeenCalledWith('/tenants', {
      params: query,
    })
  })

  it('loads tenant context and switches current tenant', async () => {
    requestMock.get.mockResolvedValueOnce({
      data: {
        currentTenant: {
          id: 'tenant-a',
          name: 'Aheart 科技',
          code: 'AHEART',
          status: 'enabled',
          brandName: 'Aheart',
          themeColor: '#165dff',
          userCount: 12,
          departmentCount: 3,
          current: true,
        },
        orgTree: [],
        dataScopes: [],
      },
    })
    requestMock.post.mockResolvedValueOnce({
      data: {
        tenantId: 'tenant-b',
      },
    })

    await fetchTenantContext('tenant-a')
    await switchTenant('tenant-b')

    expect(requestMock.get).toHaveBeenCalledWith('/tenants/tenant-a/context')
    expect(requestMock.post).toHaveBeenCalledWith('/tenants/switch', {
      tenantId: 'tenant-b',
    })
  })
})
