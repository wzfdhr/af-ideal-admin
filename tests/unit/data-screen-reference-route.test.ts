import { describe, expect, it } from 'vitest'
import { canVisitR1Page, filterR1Menus } from '@/services/r1-menu'
import {
  createR1Menu,
  MENU_ROUTE_CATALOGUE,
  PLATFORM_PERMISSION_CATALOGUE,
  DATA_SCREEN_PERMISSIONS,
} from '@af-admin/contracts'

describe('real data screen access', () => {
  it('admits run-only viewers without granting reporting or editing rights', () => {
    const menus = createR1Menu([DATA_SCREEN_PERMISSIONS.run])
    const visualization = menus.find((item) => item.name === 'visualization')
    expect(visualization?.children?.map((item) => item.name)).toEqual([
      'dataScreen',
    ])
    expect(canVisitR1Page('dataScreen', ['screen:run'])).toBe(true)
    expect(canVisitR1Page('dataScreen', ['screen:list'])).toBe(true)
    expect(canVisitR1Page('dataScreen', ['report:query'])).toBe(false)
    expect(canVisitR1Page('dataScreen', ['screen:publish'])).toBe(false)
    const page = [{ name: 'dataScreen' }]
    expect(filterR1Menus(page, ['screen:run'])).toEqual(page)
    expect(filterR1Menus(page, ['report:query'])).toEqual([])
  })

  it('registers the same server route and independently delegable commands', () => {
    expect(
      MENU_ROUTE_CATALOGUE.find((item) => item.key === 'dataScreen')
    ).toMatchObject({
      path: '/visualization/dataScreen',
      componentKey: 'DataScreenPage',
      permissions: ['screen:list', 'screen:run'],
      mode: 'any',
    })
    const commands = PLATFORM_PERMISSION_CATALOGUE.filter((item) =>
      item.code.startsWith('screen:')
    )
    expect(commands.map((item) => item.code).sort()).toEqual(
      Object.values(DATA_SCREEN_PERMISSIONS).sort()
    )
    expect(
      commands.every((item) => item.title && item.module === '真实大屏')
    ).toBe(true)
  })
})
