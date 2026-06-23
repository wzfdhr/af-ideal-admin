import { describe, expect, it } from 'vitest'
import { REPORT_PERMISSIONS } from '@/constants/report'
import visualizationRoutes from '@/router/routes/modules/visualization'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('report schedule route', () => {
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
