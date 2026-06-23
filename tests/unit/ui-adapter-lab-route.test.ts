import { describe, expect, it } from 'vitest'
import { UI_ADAPTER_LAB_PERMISSIONS } from '@/constants/ui-adapter-lab'
import examplesRoutes from '@/router/routes/modules/examples'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('ui adapter lab routes', () => {
  it('registers the Mock-backed UI adapter lab route', () => {
    expect(examplesRoutes.path).toBe('/examples')
    expect(examplesRoutes.meta?.locale).toBe('menu.examples')

    const labRoute = examplesRoutes.children?.find(
      (route) => route.name === 'uiAdapterLab'
    )

    expect(labRoute?.path).toBe('ui-adapter-lab')
    expect(labRoute?.meta?.locale).toBe('menu.examples.uiAdapterLab')
    expect(labRoute?.meta?.access?.permissions).toContain(
      UI_ADAPTER_LAB_PERMISSIONS.view
    )
  })

  it('adds locale labels and server menu mock for the lab', () => {
    expect(zhCN['menu.examples']).toBe('示例实验室')
    expect(zhCN['menu.examples.uiAdapterLab']).toBe('UI 适配实验页')
    expect(enUS['menu.examples']).toBe('Examples')
    expect(enUS['menu.examples.uiAdapterLab']).toBe('UI adapter lab')

    const examplesMenu = mockMenus.admin.find(
      (menu) => menu.name === 'examples'
    )

    expect(
      examplesMenu?.children?.some(
        (route) =>
          route.name === 'uiAdapterLab' &&
          route.path === 'ui-adapter-lab' &&
          route.meta?.access?.permissions?.includes(
            UI_ADAPTER_LAB_PERMISSIONS.view
          )
      )
    ).toBe(true)
  })
})
