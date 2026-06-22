import { describe, expect, it } from 'vitest'
import auditRoutes from '@/router/routes/modules/audit'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('audit routes', () => {
  it('registers audit log page under audit routes', () => {
    expect(auditRoutes.path).toBe('/audit')
    expect(
      auditRoutes.children?.some(
        (route) =>
          route.name === 'auditLogs' &&
          route.path === 'logs' &&
          route.meta?.locale === 'menu.audit.logs'
      )
    ).toBe(true)
  })

  it('adds locale labels for audit menus', () => {
    expect(zhCN['menu.audit']).toBe('审计中心')
    expect(zhCN['menu.audit.logs']).toBe('审计日志')
    expect(enUS['menu.audit']).toBe('Audit center')
    expect(enUS['menu.audit.logs']).toBe('Audit logs')
  })

  it('keeps server menu mock aligned with audit routes', () => {
    const auditMenu = mockMenus.admin.find((menu) => menu.name === 'audit')

    expect(
      auditMenu?.children?.some(
        (route) =>
          route.name === 'auditLogs' &&
          route.path === 'logs' &&
          route.meta?.locale === 'menu.audit.logs'
      )
    ).toBe(true)
  })
})
