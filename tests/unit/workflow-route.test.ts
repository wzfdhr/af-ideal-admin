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

  it('registers workflow center under scalability routes', () => {
    expect(
      scalabilityRoutes.children?.some(
        (route) =>
          route.name === 'workflowCenter' &&
          route.path === 'workflowCenter' &&
          route.meta?.locale === 'menu.Scalability.workflowCenter'
      )
    ).toBe(true)
  })

  it('adds locale labels for workflow center menu', () => {
    expect(zhCN['menu.Scalability.workflowCenter']).toBe('流程工作台')
    expect(enUS['menu.Scalability.workflowCenter']).toBe('Workflow center')
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

  it('keeps server menu mock aligned with the workflow center route', () => {
    const scalabilityMenu = mockMenus.admin.find(
      (menu) => menu.name === 'Scalability'
    )

    expect(
      scalabilityMenu?.children?.some(
        (route) =>
          route.name === 'workflowCenter' &&
          route.path === 'workflowCenter' &&
          route.meta?.locale === 'menu.Scalability.workflowCenter'
      )
    ).toBe(true)
  })
})
