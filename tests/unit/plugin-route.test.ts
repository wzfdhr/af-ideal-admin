import { describe, expect, it } from 'vitest'
import { PLUGIN_PERMISSIONS } from '@/constants/plugin'
import pluginRoutes from '@/router/routes/modules/plugin'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('plugin routes', () => {
  it('registers plugin center with plugin permissions', () => {
    expect(pluginRoutes.path).toBe('/plugin')
    expect(pluginRoutes.meta?.locale).toBe('menu.plugin')

    const centerRoute = pluginRoutes.children?.find(
      (route) => route.name === 'pluginCenter'
    )

    expect(centerRoute?.path).toBe('center')
    expect(centerRoute?.meta?.locale).toBe('menu.plugin.center')
    expect(centerRoute?.meta?.access?.permissions).toContain(
      PLUGIN_PERMISSIONS.view
    )
  })

  it('adds locale labels and server menu mock for plugin center', () => {
    expect(zhCN['menu.plugin']).toBe('插件中心')
    expect(zhCN['menu.plugin.center']).toBe('插件管理')
    expect(enUS['menu.plugin']).toBe('Plugin center')
    expect(enUS['menu.plugin.center']).toBe('Plugin management')

    const pluginMenu = mockMenus.admin.find((menu) => menu.name === 'plugin')

    expect(
      pluginMenu?.children?.some(
        (route) =>
          route.name === 'pluginCenter' &&
          route.path === 'center' &&
          route.meta?.access?.permissions?.includes(PLUGIN_PERMISSIONS.view)
      )
    ).toBe(true)
  })
})
