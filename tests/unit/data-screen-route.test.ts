import { describe, expect, it } from 'vitest'
import visualizationRoutes from '@/router/routes/modules/visualization'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('data screen route', () => {
  it('registers data screen under visualization routes', () => {
    expect(
      visualizationRoutes.children?.some(
        (route) =>
          route.name === 'dataScreen' &&
          route.path === 'dataScreen' &&
          route.meta?.locale === 'menu.visualization.dataScreen'
      )
    ).toBe(true)
  })

  it('adds locale labels for data screen menu', () => {
    expect(zhCN['menu.visualization.dataScreen']).toBe('数据大屏')
    expect(enUS['menu.visualization.dataScreen']).toBe('Data screen')
  })

  it('keeps server menu mock aligned with the data screen route', () => {
    const visualizationMenu = mockMenus.admin.find(
      (menu) => menu.name === 'visualization'
    )

    expect(
      visualizationMenu?.children?.some(
        (route) =>
          route.name === 'dataScreen' &&
          route.path === 'dataScreen' &&
          route.meta?.locale === 'menu.visualization.dataScreen'
      )
    ).toBe(true)
  })
})
