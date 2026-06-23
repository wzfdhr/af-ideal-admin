import { describe, expect, it } from 'vitest'
import { createTenantMockStore } from '@/mock/modules/tenant'

describe('tenant mock store', () => {
  it('seeds multiple tenants with organization trees and data scopes', () => {
    const store = createTenantMockStore()
    const result = store.queryTenants({ current: 1, pageSize: 10 })

    expect(result.total).toBeGreaterThanOrEqual(2)
    expect(result.list.map((item) => item.id)).toEqual(
      expect.arrayContaining(['tenant-a', 'tenant-b'])
    )

    const context = store.getTenantContext('tenant-a')

    expect(context.currentTenant.id).toBe('tenant-a')
    expect(context.orgTree.length).toBeGreaterThan(0)
    expect(context.dataScopes.map((item) => item.dataScope)).toEqual(
      expect.arrayContaining([
        'all',
        'tenant',
        'department-and-children',
        'self',
      ])
    )
  })

  it('filters tenants and switches current tenant without losing context', () => {
    const store = createTenantMockStore()
    const filtered = store.queryTenants({
      current: 1,
      pageSize: 10,
      keyword: 'Ideal',
      status: 'enabled',
    })

    expect(filtered.total).toBe(1)
    expect(filtered.list[0].id).toBe('tenant-b')

    const switched = store.switchTenant('tenant-b')
    const context = store.getTenantContext(switched.tenantId)

    expect(switched.tenantId).toBe('tenant-b')
    expect(context.currentTenant.current).toBe(true)
    expect(context.orgTree[0].tenantId).toBe('tenant-b')
  })
})
