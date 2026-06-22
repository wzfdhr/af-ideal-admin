import { describe, expect, it } from 'vitest'
import scalabilityRoutes from '@/router/routes/modules/formDesign'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('low-code builder route', () => {
  it('registers low-code builder under scalability routes', () => {
    expect(
      scalabilityRoutes.children?.some(
        (route) =>
          route.name === 'lowCodeBuilder' &&
          route.path === 'lowCodeBuilder' &&
          route.meta?.locale === 'menu.Scalability.lowCodeBuilder'
      )
    ).toBe(true)
  })

  it('adds locale labels for low-code builder menu', () => {
    expect(zhCN['menu.Scalability.lowCodeBuilder']).toBe('低代码搭建')
    expect(enUS['menu.Scalability.lowCodeBuilder']).toBe('Low-code builder')
  })

  it('keeps server menu mock aligned with the low-code builder route', () => {
    const scalabilityMenu = mockMenus.admin.find(
      (menu) => menu.name === 'Scalability'
    )

    expect(
      scalabilityMenu?.children?.some(
        (route) =>
          route.name === 'lowCodeBuilder' &&
          route.path === 'lowCodeBuilder' &&
          route.meta?.locale === 'menu.Scalability.lowCodeBuilder'
      )
    ).toBe(true)
  })
})
