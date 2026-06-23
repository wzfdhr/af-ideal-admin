import { describe, expect, it } from 'vitest'
import { THEME_PERMISSIONS } from '@/constants/theme'
import themeRoutes from '@/router/routes/modules/theme'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('theme routes', () => {
  it('registers theme center with theme permissions', () => {
    expect(themeRoutes.path).toBe('/theme')
    expect(themeRoutes.meta?.locale).toBe('menu.theme')

    const centerRoute = themeRoutes.children?.find(
      (route) => route.name === 'themeCenter'
    )

    expect(centerRoute?.path).toBe('center')
    expect(centerRoute?.meta?.locale).toBe('menu.theme.center')
    expect(centerRoute?.meta?.access?.permissions).toContain(
      THEME_PERMISSIONS.view
    )
  })

  it('adds locale labels and server menu mock for theme center', () => {
    expect(zhCN['menu.theme']).toBe('主题中心')
    expect(zhCN['menu.theme.center']).toBe('主题配置')
    expect(enUS['menu.theme']).toBe('Theme center')
    expect(enUS['menu.theme.center']).toBe('Theme settings')

    const themeMenu = mockMenus.admin.find((menu) => menu.name === 'theme')

    expect(
      themeMenu?.children?.some(
        (route) =>
          route.name === 'themeCenter' &&
          route.path === 'center' &&
          route.meta?.access?.permissions?.includes(THEME_PERMISSIONS.view)
      )
    ).toBe(true)
  })
})
