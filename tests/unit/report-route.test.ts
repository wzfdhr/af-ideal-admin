import { describe, expect, it } from 'vitest'
import visualizationRoutes from '@/router/routes/modules/visualization'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('report center route', () => {
  it('registers report center under visualization routes', () => {
    expect(
      visualizationRoutes.children?.some(
        (route) =>
          route.name === 'reportCenter' &&
          route.path === 'reportCenter' &&
          route.meta?.locale === 'menu.visualization.reportCenter'
      )
    ).toBe(true)
  })

  it('adds locale labels for report center menu', () => {
    expect(zhCN['menu.visualization.reportCenter']).toBe('报表中心')
    expect(enUS['menu.visualization.reportCenter']).toBe('Report center')
  })

  it('keeps server menu mock aligned with the report center route', () => {
    const visualizationMenu = mockMenus.admin.find(
      (menu) => menu.name === 'visualization'
    )

    expect(
      visualizationMenu?.children?.some(
        (route) =>
          route.name === 'reportCenter' &&
          route.path === 'reportCenter' &&
          route.meta?.locale === 'menu.visualization.reportCenter'
      )
    ).toBe(true)
  })
})
