import { describe, expect, it } from 'vitest'
import scalabilityRoutes from '@/router/routes/modules/formDesign'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('workflow designer route', () => {
  it('registers workflow designer under scalability routes', () => {
    expect(
      scalabilityRoutes.children?.some(
        (route) =>
          route.name === 'workflowDesign' &&
          route.path === 'workflowDesign' &&
          route.meta?.locale === 'menu.Scalability.workflowDesign'
      )
    ).toBe(true)
  })

  it('adds locale labels for workflow designer menu', () => {
    expect(zhCN['menu.Scalability.workflowDesign']).toBe('流程设计器')
    expect(enUS['menu.Scalability.workflowDesign']).toBe('Workflow design')
  })

  it('keeps server menu mock aligned with the workflow designer route', () => {
    const scalabilityMenu = mockMenus.admin.find(
      (menu) => menu.name === 'Scalability'
    )

    expect(
      scalabilityMenu?.children?.some(
        (route) =>
          route.name === 'workflowDesign' &&
          route.path === 'workflowDesign' &&
          route.meta?.locale === 'menu.Scalability.workflowDesign'
      )
    ).toBe(true)
  })
})
