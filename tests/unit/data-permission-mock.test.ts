import { describe, expect, it } from 'vitest'
import { createDataPermissionMockStore } from '@/mock/modules/data-permission'

describe('data permission mock store', () => {
  it('seeds role data scopes and filters by tenant and scope', () => {
    const store = createDataPermissionMockStore()
    const result = store.queryRules({
      current: 1,
      pageSize: 20,
      tenantId: 'tenant-a',
      dataScope: 'department-and-children',
    })

    expect(result.total).toBeGreaterThan(0)
    result.list.forEach((item) => {
      expect(item.tenantId).toBe('tenant-a')
      expect(item.dataScope).toBe('department-and-children')
      expect(item.fieldPermissions.length).toBeGreaterThan(0)
    })
  })

  it('previews all, department and self data visibility boundaries', () => {
    const store = createDataPermissionMockStore()

    const allScope = store.previewScope({
      roleId: 'role-admin',
      dataScope: 'all',
      departmentIds: [],
      ownerUserIds: [],
    })
    const departmentScope = store.previewScope({
      roleId: 'role-operator',
      dataScope: 'department',
      departmentIds: ['dept-operation'],
      ownerUserIds: [],
    })
    const selfScope = store.previewScope({
      roleId: 'role-self',
      dataScope: 'self',
      departmentIds: [],
      ownerUserIds: ['user-self'],
    })

    expect(allScope.visibleRows.length).toBeGreaterThan(
      departmentScope.visibleRows.length
    )
    expect(
      departmentScope.visibleRows.every(
        (row) => row.departmentId === 'dept-operation'
      )
    ).toBe(true)
    expect(
      selfScope.visibleRows.every((row) => row.ownerUserId === 'user-self')
    ).toBe(true)
  })

  it('updates data scope and rejects missing roles', () => {
    const store = createDataPermissionMockStore({
      now: () => '2026-06-23 10:00:00',
    })

    const updated = store.updateRule('role-operator', {
      dataScope: 'department',
      departmentIds: ['dept-operation'],
      ownerUserIds: [],
      fieldPermissions: ['amount'],
    })
    const missing = store.updateRule('missing-role', {
      dataScope: 'all',
      departmentIds: [],
      ownerUserIds: [],
      fieldPermissions: [],
    })

    expect(updated.success).toBe(true)
    expect(updated.record?.dataScope).toBe('department')
    expect(updated.record?.updatedAt).toBe('2026-06-23 10:00:00')
    expect(missing).toEqual({
      success: false,
      reason: '数据权限规则不存在',
    })
  })
})
