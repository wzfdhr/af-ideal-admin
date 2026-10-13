import { describe, expect, it } from 'vitest'
import { canVisitR1Page, filterR1Menus } from '@/services/r1-menu'
import auditRoutes from '@/router/routes/modules/audit'
import { createR1Menu, MENU_ROUTE_CATALOGUE } from '@af-admin/contracts'

const governance = [
  'audit:retention:manage',
  'audit:read',
  'audit:export:create',
  'audit:export:archive',
]

describe('audit retention governance entry', () => {
  it('requires every governance capability in the server catalogue, menu and direct route', () => {
    const catalogue = MENU_ROUTE_CATALOGUE.find(
      (route) => route.key === 'auditRetention'
    )
    expect(catalogue).toMatchObject({
      path: '/audit/retention',
      componentKey: 'AuditRetention',
      permissions: governance,
      mode: 'all',
    })
    const route = auditRoutes.children?.find(
      (child) => child.name === 'auditRetention'
    )
    expect(route?.meta?.access).toEqual({
      permissions: governance,
      mode: 'all',
    })
    const page = [{ name: 'auditRetention' }]
    expect(canVisitR1Page('auditRetention', governance)).toBe(true)
    expect(filterR1Menus(page, governance)).toEqual(page)
    governance.forEach((omitted) => {
      const partial = governance.filter((code) => code !== omitted)
      expect(canVisitR1Page('auditRetention', partial)).toBe(false)
      expect(filterR1Menus(page, partial)).toEqual([])
      const audit = createR1Menu(partial).find(
        (entry) => entry.name === 'audit'
      )
      expect(
        audit?.children?.some((entry) => entry.name === 'auditRetention')
      ).not.toBe(true)
    })
    expect(canVisitR1Page('auditRetention', ['audit:export:download'])).toBe(
      false
    )
  })
})
