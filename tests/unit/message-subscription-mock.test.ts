import { describe, expect, it } from 'vitest'
import { createMessageSubscriptionMockStore } from '@/mock/modules/message-subscription'

describe('message subscription mock store', () => {
  it('filters subscriptions by channel and keyword', () => {
    const store = createMessageSubscriptionMockStore()
    const result = store.querySubscriptions({
      current: 1,
      pageSize: 10,
      channel: 'todo',
      keyword: '流程',
    })

    expect(result.total).toBe(1)
    expect(result.list[0].channel).toBe('todo')
    expect(
      `${result.list[0].channelName}${result.list[0].description}`
    ).toContain('流程')
  })

  it('updates subscription preferences and simulates push delivery', () => {
    const store = createMessageSubscriptionMockStore({
      now: () => '2026-06-23 11:00:00',
    })

    const disabled = store.updateSubscription('subscription-todo', {
      subscribed: false,
      deliveryModes: ['in-app'],
    })
    const blocked = store.simulatePush({
      channel: 'todo',
      title: '合同审批待处理',
      content: '请进入流程工作台处理审批。',
      jumpTarget: '/Scalability/workflowCenter',
    })

    expect(disabled.subscribed).toBe(false)
    expect(disabled.updatedAt).toBe('2026-06-23 11:00:00')
    expect(blocked.success).toBe(false)
    expect(blocked.reason).toContain('未订阅')

    store.updateSubscription('subscription-todo', {
      subscribed: true,
      deliveryModes: ['in-app', 'websocket'],
    })
    const delivered = store.simulatePush({
      channel: 'todo',
      title: '合同审批待处理',
      content: '请进入流程工作台处理审批。',
      jumpTarget: '/Scalability/workflowCenter',
    })

    expect(delivered.success).toBe(true)
    expect(delivered.deliveredTo).toEqual(['in-app', 'websocket'])
    expect(delivered.notification?.category).toBe('todo')
    expect(delivered.notification?.link).toBe('/Scalability/workflowCenter')
  })
})
