import { describe, expect, it } from 'vitest'
import { REPORT_PERMISSIONS } from '@/constants/report'
import visualizationRoutes from '@/router/routes/modules/visualization'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'
import { canVisitR1Page, filterR1Menus } from '@/services/r1-menu'
import { createR1Menu, MENU_ROUTE_CATALOGUE } from '@af-admin/contracts'

describe('report schedule route', () => {
  it('registers current server menus for run-only and export-only accounts', () => {
    const runMenu = createR1Menu(['report:schedule:run:read']).find(
      (item) => item.name === 'visualization'
    )
    expect(runMenu?.children?.map((item) => item.name)).toEqual([
      'reportSchedules',
    ])
    expect(
      MENU_ROUTE_CATALOGUE.find((item) => item.key === 'reportSchedules')
    ).toMatchObject({
      path: '/visualization/reportSchedules',
      componentKey: 'ReportSchedulesPage',
      permissions: ['report:schedule:list', 'report:schedule:run:read'],
      mode: 'any',
    })
    const exportMenu = createR1Menu(['report:export:list']).find(
      (item) => item.name === 'visualization'
    )
    expect(exportMenu?.children?.map((item) => item.name)).toEqual([
      'reportCenter',
    ])
    expect(
      createR1Menu(['report:schedule']).some(
        (item) => item.name === 'visualization'
      )
    ).toBe(false)
  })

  it('admits real rule readers and run readers while denying the Mock-only code', () => {
    expect(canVisitR1Page('reportSchedules', ['report:schedule:list'])).toBe(
      true
    )
    expect(
      canVisitR1Page('reportSchedules', ['report:schedule:run:read'])
    ).toBe(true)
    expect(canVisitR1Page('reportSchedules', ['report:schedule'])).toBe(false)
    expect(canVisitR1Page('reportSchedules', ['report:query'])).toBe(false)
    const menu = [{ name: 'reportSchedules' }]
    expect(filterR1Menus(menu, ['report:schedule:run:read'])).toEqual(menu)
    expect(filterR1Menus(menu, ['report:schedule'])).toEqual([])
  })

  it('registers schedule page with permission code', () => {
    const route = visualizationRoutes.children?.find(
      (item) => item.name === 'reportSchedules'
    )

    expect(REPORT_PERMISSIONS.schedule).toBe('report:schedule')
    expect(REPORT_PERMISSIONS.audit).toBe('report:audit')
    expect(route?.path).toBe('reportSchedules')
    expect(route?.meta?.locale).toBe('menu.visualization.reportSchedules')
    expect(route?.meta?.access?.permissions).toContain(
      REPORT_PERMISSIONS.schedule
    )
  })

  it('adds locale labels and server menu mock for schedules', () => {
    expect(zhCN['menu.visualization.reportSchedules']).toBe('定时报表')
    expect(enUS['menu.visualization.reportSchedules']).toBe('Report schedules')

    const visualizationMenu = mockMenus.admin.find(
      (menu) => menu.name === 'visualization'
    )

    expect(
      visualizationMenu?.children?.some(
        (route) =>
          route.name === 'reportSchedules' &&
          route.path === 'reportSchedules' &&
          route.meta?.access?.permissions?.includes(REPORT_PERMISSIONS.schedule)
      )
    ).toBe(true)
  })
})
