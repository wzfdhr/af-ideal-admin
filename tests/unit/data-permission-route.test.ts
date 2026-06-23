import { describe, expect, it } from 'vitest'
import { DATA_PERMISSION_PERMISSIONS } from '@/constants/data-permission'
import permissionRoutes from '@/router/routes/modules/Permissions'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('data permission route', () => {
  it('registers data permission center under backend permissions', () => {
    const backendRoute = permissionRoutes.children?.find(
      (route) => route.name === 'backend'
    )
    const dataScopeRoute = backendRoute?.children?.find(
      (route) => route.name === 'dataPermissionCenter'
    )

    expect(dataScopeRoute?.path).toBe('data-scope')
    expect(dataScopeRoute?.meta?.locale).toBe(
      'menu.permissions.backend.dataScope'
    )
    expect(dataScopeRoute?.meta?.access?.permissions).toContain(
      DATA_PERMISSION_PERMISSIONS.view
    )
  })

  it('adds locale labels and server menu mock for data permission center', () => {
    expect(zhCN['menu.permissions.backend.dataScope']).toBe('数据权限')
    expect(enUS['menu.permissions.backend.dataScope']).toBe('Data permissions')

    const permissionMenu = mockMenus.admin.find(
      (menu) => menu.name === 'permissions'
    )
    const backendMenu = permissionMenu?.children?.find(
      (menu) => menu.name === 'backend'
    )

    expect(
      backendMenu?.children?.some(
        (route) =>
          route.name === 'dataPermissionCenter' &&
          route.path === 'data-scope' &&
          route.meta?.access?.permissions?.includes(
            DATA_PERMISSION_PERMISSIONS.view
          )
      )
    ).toBe(true)
  })
})
