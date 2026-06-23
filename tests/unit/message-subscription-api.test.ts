import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchMessageSubscriptions,
  simulateMessagePush,
  updateMessageSubscription,
  type MessagePushSimulationPayload,
  type MessageSubscriptionQuery,
} from '@/api/message-subscription'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('message subscription api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches message subscriptions with channel and keyword filters', async () => {
    const query: MessageSubscriptionQuery = {
      current: 1,
      pageSize: 10,
      channel: 'todo',
      keyword: '审批',
    }
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await fetchMessageSubscriptions(query)

    expect(requestMock.get).toHaveBeenCalledWith('/messages/subscriptions', {
      params: query,
    })
  })

  it('updates delivery preferences and triggers a push simulation', async () => {
    const payload: MessagePushSimulationPayload = {
      channel: 'todo',
      title: '合同审批待处理',
      content: '请进入流程工作台处理审批。',
      jumpTarget: '/Scalability/workflowCenter',
    }
    requestMock.put.mockResolvedValueOnce({
      data: {
        id: 'subscription-todo',
        subscribed: false,
        deliveryModes: ['in-app'],
      },
    })
    requestMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        deliveredTo: ['in-app', 'websocket'],
      },
    })

    await updateMessageSubscription('subscription-todo', {
      subscribed: false,
      deliveryModes: ['in-app'],
    })
    await simulateMessagePush(payload)

    expect(requestMock.put).toHaveBeenCalledWith(
      '/messages/subscriptions/subscription-todo',
      {
        subscribed: false,
        deliveryModes: ['in-app'],
      }
    )
    expect(requestMock.post).toHaveBeenCalledWith(
      '/messages/subscriptions/push-simulations',
      payload
    )
  })
})
