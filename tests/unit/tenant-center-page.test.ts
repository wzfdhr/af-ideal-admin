import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TenantCenter from '@/views/tenant/center/index.vue'
import type { TenantContext, TenantPageResult } from '@/api/tenant'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  fetchTenantContext: vi.fn(),
  fetchTenants: vi.fn(),
  switchTenant: vi.fn(),
}))

vi.mock('@/api/tenant', () => ({
  fetchTenantContext: apiMocks.fetchTenantContext,
  fetchTenants: apiMocks.fetchTenants,
  switchTenant: apiMocks.switchTenant,
}))

const tenantResult: TenantPageResult = {
  list: [
    {
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
    {
      id: 'tenant-b',
      name: 'Ideal 数据',
      code: 'IDEAL',
      status: 'enabled',
      brandName: 'Ideal',
      themeColor: '#0e9f6e',
      userCount: 8,
      departmentCount: 2,
      current: false,
    },
  ],
  total: 2,
}

const tenantContext: TenantContext = {
  currentTenant: tenantResult.list[0],
  orgTree: [
    {
      id: 'dept-root',
      tenantId: 'tenant-a',
      name: 'Aheart 总部',
      type: 'company',
      leader: '系统管理员',
      dataScope: 'all',
      children: [
        {
          id: 'dept-product',
          tenantId: 'tenant-a',
          name: '产品部',
          type: 'department',
          parentId: 'dept-root',
          leader: '张三',
          dataScope: 'department-and-children',
          children: [],
        },
      ],
    },
  ],
  dataScopes: [
    {
      roleId: 'role-admin',
      roleName: '平台管理员',
      tenantId: 'tenant-a',
      dataScope: 'all',
      departments: ['Aheart 总部'],
    },
  ],
}

describe('TenantCenter page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchTenants.mockResolvedValue(tenantResult)
    apiMocks.fetchTenantContext.mockResolvedValue(tenantContext)
    apiMocks.switchTenant.mockResolvedValue({ tenantId: 'tenant-b' })
  })

  it('loads tenants, current tenant context, organization tree and data scopes', async () => {
    const wrapper = mount(TenantCenter)
    await flushPromises()
    await flushPromises()

    expect(apiMocks.fetchTenants).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '',
      status: '',
    })
    expect(apiMocks.fetchTenantContext).toHaveBeenCalledWith('tenant-a')
    expect(wrapper.find('[data-testid="tenant-center"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Aheart 科技')
    expect(wrapper.text()).toContain('Aheart 总部')
    expect(wrapper.text()).toContain('平台管理员')
  })

  it('filters tenants and switches current tenant', async () => {
    const wrapper = mount(TenantCenter)
    await flushPromises()

    await wrapper
      .find<HTMLInputElement>('[data-testid="tenant-keyword"]')
      .setValue('Ideal')
    await wrapper.find('[data-testid="tenant-query"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchTenants).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      keyword: 'Ideal',
      status: '',
    })

    await wrapper
      .find('[data-testid="tenant-switch-tenant-b"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.switchTenant).toHaveBeenCalledWith('tenant-b')
    expect(apiMocks.fetchTenantContext).toHaveBeenCalledWith('tenant-b')
  })
})
