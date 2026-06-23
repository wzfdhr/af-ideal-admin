import { describe, expect, it } from 'vitest'
import { MESSAGE_PERMISSIONS } from '@/constants/message'
import messageRoutes from '@/router/routes/modules/message'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('message routes', () => {
  it('registers message center page with permission code', () => {
    expect(messageRoutes.path).toBe('/message')
    expect(messageRoutes.meta?.locale).toBe('menu.message')

    const centerRoute = messageRoutes.children?.find(
      (route) => route.name === 'messageCenter'
    )

    expect(centerRoute?.path).toBe('center')
    expect(centerRoute?.meta?.locale).toBe('menu.message.center')
    expect(centerRoute?.meta?.access?.permissions).toContain(
      MESSAGE_PERMISSIONS.list
    )
  })

  it('adds locale labels and server menu mock for message center', () => {
    expect(zhCN['menu.message']).toBe('消息中心')
    expect(zhCN['menu.message.center']).toBe('消息管理')
    expect(enUS['menu.message']).toBe('Message center')
    expect(enUS['menu.message.center']).toBe('Messages')

    const messageMenu = mockMenus.admin.find((menu) => menu.name === 'message')

    expect(
      messageMenu?.children?.some(
        (route) =>
          route.name === 'messageCenter' &&
          route.path === 'center' &&
          route.meta?.access?.permissions?.includes(MESSAGE_PERMISSIONS.list)
      )
    ).toBe(true)
  })
})
