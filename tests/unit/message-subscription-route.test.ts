import { describe, expect, it } from 'vitest'
import { MESSAGE_PERMISSIONS } from '@/constants/message'
import messageRoutes from '@/router/routes/modules/message'
import zhCN from '@/router/locale/zh-CN'
import enUS from '@/router/locale/en-US'
import { mockMenus } from '@/mock/seed'

describe('message subscription routes', () => {
  it('registers subscription page with permission code', () => {
    const subscriptionRoute = messageRoutes.children?.find(
      (route) => route.name === 'messageSubscriptions'
    )

    expect(MESSAGE_PERMISSIONS.subscribe).toBe('message:subscribe')
    expect(subscriptionRoute?.path).toBe('subscriptions')
    expect(subscriptionRoute?.meta?.locale).toBe('menu.message.subscriptions')
    expect(subscriptionRoute?.meta?.access?.permissions).toContain(
      MESSAGE_PERMISSIONS.subscribe
    )
  })

  it('adds locale labels and server menu mock for message subscriptions', () => {
    expect(zhCN['menu.message.subscriptions']).toBe('订阅配置')
    expect(enUS['menu.message.subscriptions']).toBe('Subscriptions')

    const messageMenu = mockMenus.admin.find((menu) => menu.name === 'message')

    expect(
      messageMenu?.children?.some(
        (route) =>
          route.name === 'messageSubscriptions' &&
          route.path === 'subscriptions' &&
          route.meta?.access?.permissions?.includes(
            MESSAGE_PERMISSIONS.subscribe
          )
      )
    ).toBe(true)
  })
})
