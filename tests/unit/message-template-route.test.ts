import { describe, expect, it } from 'vitest'
import { MESSAGE_PERMISSIONS } from '@/constants/message'
import messageRoutes from '@/router/routes/modules/message'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('message template routes', () => {
  it('registers template task page with permission code', () => {
    const templateRoute = messageRoutes.children?.find(
      (route) => route.name === 'messageTemplates'
    )

    expect(MESSAGE_PERMISSIONS.template).toBe('message:template')
    expect(MESSAGE_PERMISSIONS.send).toBe('message:send')
    expect(templateRoute?.path).toBe('templates')
    expect(templateRoute?.meta?.locale).toBe('menu.message.templates')
    expect(templateRoute?.meta?.access?.permissions).toContain(
      MESSAGE_PERMISSIONS.template
    )
  })

  it('adds locale labels and server menu mock for template tasks', () => {
    expect(zhCN['menu.message.templates']).toBe('模板任务')
    expect(enUS['menu.message.templates']).toBe('Templates')

    const messageMenu = mockMenus.admin.find((menu) => menu.name === 'message')

    expect(
      messageMenu?.children?.some(
        (route) =>
          route.name === 'messageTemplates' &&
          route.path === 'templates' &&
          route.meta?.access?.permissions?.includes(
            MESSAGE_PERMISSIONS.template
          )
      )
    ).toBe(true)
  })
})
