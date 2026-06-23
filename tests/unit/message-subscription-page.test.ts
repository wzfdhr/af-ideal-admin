import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageSubscriptions from '@/views/message/subscriptions/index.vue'
import type {
  MessagePushSimulationResult,
  MessageSubscriptionPageResult,
  MessageSubscriptionRecord,
} from '@/api/message-subscription'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  fetchMessageSubscriptions: vi.fn(),
  simulateMessagePush: vi.fn(),
  updateMessageSubscription: vi.fn(),
}))

vi.mock('@/api/message-subscription', () => ({
  fetchMessageSubscriptions: apiMocks.fetchMessageSubscriptions,
  simulateMessagePush: apiMocks.simulateMessagePush,
  updateMessageSubscription: apiMocks.updateMessageSubscription,
}))

const records: MessageSubscriptionRecord[] = [
  {
    id: 'subscription-todo',
    channel: 'todo',
    channelName: '待办',
    description: '流程审批、表单发布等任务提醒',
    subscribed: true,
    deliveryModes: ['in-app', 'websocket'],
    jumpTarget: '/Scalability/workflowCenter',
    lastPushedAt: '2026-06-23 09:00:00',
    updatedAt: '2026-06-23 08:30:00',
  },
  {
    id: 'subscription-alert',
    channel: 'alert',
    channelName: '告警',
    description: '报表导出失败和系统异常提醒',
    subscribed: false,
    deliveryModes: ['in-app'],
    jumpTarget: '/visualization/reportCenter',
    updatedAt: '2026-06-22 18:00:00',
  },
]

const pageResult: MessageSubscriptionPageResult = {
  list: records,
  total: records.length,
}

const pushResult: MessagePushSimulationResult = {
  success: true,
  deliveredTo: ['in-app', 'websocket'],
  notification: {
    id: 'push-todo-1',
    category: 'todo',
    title: '合同审批待处理',
    content: '请进入流程工作台处理审批。',
    status: 'unread',
    priority: 'high',
    source: '消息推送模拟',
    createdAt: '2026-06-23 11:00:00',
    link: '/Scalability/workflowCenter',
  },
}

describe('MessageSubscriptions page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchMessageSubscriptions.mockResolvedValue(pageResult)
    apiMocks.updateMessageSubscription.mockResolvedValue({
      ...records[0],
      subscribed: false,
      updatedAt: '2026-06-23 11:00:00',
    })
    apiMocks.simulateMessagePush.mockResolvedValue(pushResult)
  })

  it('loads subscriptions and supports channel keyword query', async () => {
    const wrapper = mount(MessageSubscriptions)
    await flushPromises()

    expect(apiMocks.fetchMessageSubscriptions).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      channel: '',
      keyword: '',
    })
    expect(wrapper.find('[data-testid="message-subscriptions"]').exists()).toBe(
      true
    )
    expect(wrapper.text()).toContain('待办')

    await wrapper
      .find<HTMLSelectElement>('[data-testid="message-subscription-channel"]')
      .setValue('todo')
    await wrapper
      .find<HTMLInputElement>('[data-testid="message-subscription-keyword"]')
      .setValue('流程')
    await wrapper
      .find('[data-testid="message-subscription-query"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.fetchMessageSubscriptions).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      channel: 'todo',
      keyword: '流程',
    })
  })

  it('updates a subscription and simulates a websocket push with jump target', async () => {
    const wrapper = mount(MessageSubscriptions)
    await flushPromises()

    await wrapper
      .find<HTMLInputElement>(
        '[data-testid="message-subscription-toggle-subscription-todo"]'
      )
      .setValue(false)
    await wrapper
      .find('[data-testid="message-subscription-save-subscription-todo"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.updateMessageSubscription).toHaveBeenCalledWith(
      'subscription-todo',
      {
        subscribed: false,
        deliveryModes: ['in-app', 'websocket'],
      }
    )

    await wrapper
      .find<HTMLSelectElement>('[data-testid="message-push-channel"]')
      .setValue('todo')
    await wrapper
      .find<HTMLInputElement>('[data-testid="message-push-title"]')
      .setValue('合同审批待处理')
    await wrapper
      .find<HTMLInputElement>('[data-testid="message-push-content"]')
      .setValue('请进入流程工作台处理审批。')
    await wrapper
      .find<HTMLInputElement>('[data-testid="message-push-jump-target"]')
      .setValue('/Scalability/workflowCenter')
    await wrapper.find('[data-testid="message-push-simulate"]').trigger('click')
    await flushPromises()

    expect(apiMocks.simulateMessagePush).toHaveBeenCalledWith({
      channel: 'todo',
      title: '合同审批待处理',
      content: '请进入流程工作台处理审批。',
      jumpTarget: '/Scalability/workflowCenter',
    })
    expect(wrapper.text()).toContain('投递 2 个通道')
  })
})
