import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DataPermissionCenter from '@/views/backendPermissions/data-scope/index.vue'
import type {
  DataPermissionPageResult,
  DataPermissionRecord,
  DataScopePreviewResult,
} from '@/api/data-permission'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  fetchDataPermissionRules: vi.fn(),
  previewDataPermission: vi.fn(),
  updateDataPermissionRule: vi.fn(),
}))

vi.mock('@/api/data-permission', () => ({
  fetchDataPermissionRules: apiMocks.fetchDataPermissionRules,
  previewDataPermission: apiMocks.previewDataPermission,
  updateDataPermissionRule: apiMocks.updateDataPermissionRule,
}))

const rule: DataPermissionRecord = {
  roleId: 'role-operator',
  roleName: '运营人员',
  roleKey: 'operator',
  tenantId: 'tenant-a',
  tenantName: 'Aheart 科技',
  dataScope: 'department-and-children',
  departmentIds: ['dept-operation'],
  departments: ['运营部'],
  ownerUserIds: [],
  fieldPermissions: ['customerName', 'amount'],
  updatedAt: '2026-06-23 09:00:00',
}

const pageResult: DataPermissionPageResult = {
  list: [rule],
  total: 1,
}

const previewResult: DataScopePreviewResult = {
  visibleRows: [
    {
      id: 'order-1',
      tenantId: 'tenant-a',
      tenantName: 'Aheart 科技',
      departmentId: 'dept-operation',
      departmentName: '运营部',
      ownerUserId: 'user-operator',
      ownerName: '运营人员',
      customerName: '上海客户',
      amount: 12000,
    },
  ],
  hiddenRows: [],
}

describe('DataPermissionCenter page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchDataPermissionRules.mockResolvedValue(pageResult)
    apiMocks.previewDataPermission.mockResolvedValue(previewResult)
    apiMocks.updateDataPermissionRule.mockResolvedValue({
      success: true,
      record: rule,
    })
  })

  it('loads data permission rules and preview rows', async () => {
    const wrapper = mount(DataPermissionCenter)
    await flushPromises()
    await flushPromises()

    expect(apiMocks.fetchDataPermissionRules).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '',
      tenantId: '',
      dataScope: '',
    })
    expect(apiMocks.previewDataPermission).toHaveBeenCalledWith({
      roleId: 'role-operator',
      dataScope: 'department-and-children',
      departmentIds: ['dept-operation'],
      ownerUserIds: [],
    })
    expect(
      wrapper.find('[data-testid="data-permission-center"]').exists()
    ).toBe(true)
    expect(wrapper.text()).toContain('运营人员')
    expect(wrapper.text()).toContain('上海客户')
  })

  it('filters and updates role data scope', async () => {
    const wrapper = mount(DataPermissionCenter)
    await flushPromises()

    await wrapper
      .find<HTMLInputElement>('[data-testid="data-permission-keyword"]')
      .setValue('运营')
    await wrapper
      .find<HTMLSelectElement>('[data-testid="data-permission-scope"]')
      .setValue('department')
    await wrapper.find('[data-testid="data-permission-query"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchDataPermissionRules).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '运营',
      tenantId: '',
      dataScope: 'department',
    })

    await wrapper
      .find<HTMLSelectElement>('[data-testid="data-permission-edit-scope"]')
      .setValue('self')
    await wrapper.find('[data-testid="data-permission-save"]').trigger('click')
    await flushPromises()

    expect(apiMocks.updateDataPermissionRule).toHaveBeenCalledWith(
      'role-operator',
      {
        dataScope: 'self',
        departmentIds: ['dept-operation'],
        ownerUserIds: [],
        fieldPermissions: ['customerName', 'amount'],
      }
    )
  })
})
