import { describe, expect, it } from 'vitest'
import { FILE_RESOURCE_PERMISSIONS } from '@/constants/file-resource'
import fileResourceRoutes from '@/router/routes/modules/file-resource'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('file resource routes', () => {
  it('registers file resource center with permissions', () => {
    expect(fileResourceRoutes.path).toBe('/resource')
    expect(fileResourceRoutes.meta?.locale).toBe('menu.resource')

    const centerRoute = fileResourceRoutes.children?.find(
      (route) => route.name === 'fileResourceCenter'
    )

    expect(centerRoute?.path).toBe('files')
    expect(centerRoute?.meta?.locale).toBe('menu.resource.files')
    expect(centerRoute?.meta?.access?.permissions).toContain(
      FILE_RESOURCE_PERMISSIONS.list
    )
  })

  it('adds locale labels and server menu mock for file resource center', () => {
    expect(zhCN['menu.resource']).toBe('资源中心')
    expect(zhCN['menu.resource.files']).toBe('文件资源')
    expect(enUS['menu.resource']).toBe('Resource center')
    expect(enUS['menu.resource.files']).toBe('File resources')

    const resourceMenu = mockMenus.admin.find(
      (menu) => menu.name === 'resource'
    )

    expect(
      resourceMenu?.children?.some(
        (route) =>
          route.name === 'fileResourceCenter' &&
          route.path === 'files' &&
          route.meta?.access?.permissions?.includes(
            FILE_RESOURCE_PERMISSIONS.list
          )
      )
    ).toBe(true)
  })
})
