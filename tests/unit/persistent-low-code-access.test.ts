import { describe, expect, it } from 'vitest'
import { canVisitR1Page, filterR1Menus } from '@/services/r1-menu'
import {
  migrateLowCodePageSchema,
  createQueryTablePageSchema,
} from '@/components/low-code/schema'
import lowCodeRoutes from '@/router/routes/modules/lowCode'
import {
  createBusinessLowCodePage,
  parseLowCodePage,
} from '@af-admin/contracts'

describe('persistent low-code access and compatible formats', () => {
  it('keeps configuration capability independent from page run and business capabilities', () => {
    expect(canVisitR1Page('lowCodeBuilder', ['low-code:page:list'])).toBe(true)
    expect(canVisitR1Page('lowCodeBuilder', ['low-code:page:run'])).toBe(false)
    expect(canVisitR1Page('lowCodeRuntime', ['low-code:page:run'])).toBe(true)
    expect(canVisitR1Page('lowCodeRuntime', ['business:read:self'])).toBe(false)
    const menus = [
      { name: 'Scalability', children: [{ name: 'lowCodeBuilder' }] },
      { name: 'lowCode', children: [{ name: 'lowCodeRuntimePages' }] },
    ]
    expect(filterR1Menus(menus, ['low-code:page:run'])).toEqual([menus[1]])
    expect(
      lowCodeRoutes.children?.find((route) => route.name === 'lowCodeRuntime')
        ?.meta?.access?.permissions
    ).toEqual(['low-code:page:run'])
  })
  it('retains the legacy explicit Mock page but rejects unknown formats instead of silently normalizing them', () => {
    const legacy = createQueryTablePageSchema()
    expect(migrateLowCodePageSchema(legacy).materials.length).toBe(
      legacy.materials.length
    )
    expect(() => migrateLowCodePageSchema({ ...legacy, version: 2 })).toThrow(
      '格式版本'
    )
    const current = createBusinessLowCodePage('source-id')
    expect(parseLowCodePage(current).materials.length).toBe(4)
    expect(() => parseLowCodePage({ ...current, version: 3 })).toThrow('格式')
  })
})
