import { describe, expect, it } from 'vitest'
import { TENANT_PERMISSIONS } from '@/constants/tenant'
import tenantRoutes from '@/router/routes/modules/tenant'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('tenant routes', () => {
  it('registers tenant center with tenant permissions', () => {
    expect(tenantRoutes.path).toBe('/tenant')
    expect(tenantRoutes.meta?.locale).toBe('menu.tenant')

    const centerRoute = tenantRoutes.children?.find(
      (route) => route.name === 'tenantCenter'
    )

    expect(centerRoute?.path).toBe('center')
    expect(centerRoute?.meta?.locale).toBe('menu.tenant.center')
    expect(centerRoute?.meta?.access?.permissions).toContain(
      TENANT_PERMISSIONS.list
    )
  })

  it('adds locale labels and server menu mock for tenant center', () => {
    expect(zhCN['menu.tenant']).toBe('多租户')
    expect(zhCN['menu.tenant.center']).toBe('租户中心')
    expect(enUS['menu.tenant']).toBe('Tenants')
    expect(enUS['menu.tenant.center']).toBe('Tenant center')

    const tenantMenu = mockMenus.admin.find((menu) => menu.name === 'tenant')

    expect(
      tenantMenu?.children?.some(
        (route) =>
          route.name === 'tenantCenter' &&
          route.path === 'center' &&
          route.meta?.access?.permissions?.includes(TENANT_PERMISSIONS.list)
      )
    ).toBe(true)
  })
})
