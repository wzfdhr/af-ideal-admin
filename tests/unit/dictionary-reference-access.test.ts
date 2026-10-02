import { expect, it } from 'vitest'
import { canVisitR1Page, filterR1Menus } from '@/services/r1-menu'

it('allows the persistent dictionary page only with its own capability, including its menu entry', () => {
  expect(canVisitR1Page('dictSystem', ['system:dict:list'])).toBe(true)
  expect(canVisitR1Page('dictSystem', ['system:dict:update'])).toBe(false)
  const menus = [{ name: 'system', children: [{ name: 'dictSystem' }] }]
  expect(filterR1Menus(menus, ['system:dict:list'])).toEqual(menus)
  expect(filterR1Menus(menus, [])).toEqual([])
})
