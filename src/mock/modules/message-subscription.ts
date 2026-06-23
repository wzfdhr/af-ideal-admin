import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type { MessageNotificationRecord } from '@/api/message'
import type {
  MessageDeliveryMode,
  MessagePushSimulationPayload,
  MessagePushSimulationResult,
  MessageSubscriptionChannel,
  MessageSubscriptionPageResult,
  MessageSubscriptionQuery,
  MessageSubscriptionRecord,
  MessageSubscriptionUpdatePayload,
} from '@/api/message-subscription'
import type { MockParams } from '../types'

export interface MessageSubscriptionMockStoreOptions {
  now?: () => string
  id?: () => string
}

const getNow = () => '2026-06-23 10:00:00'

const getDefaultId = () => Mock.Random.guid()

const defaultDeliveryModes: MessageDeliveryMode[] = [
  'in-app',
  'email',
  'websocket',
]

const channelLabels: Record<MessageSubscriptionChannel, string> = {
  notice: '公告',
  message: '站内信',
  todo: '待办',
  alert: '告警',
}

const seedSubscriptions = (): MessageSubscriptionRecord[] => [
  {
    id: 'subscription-notice',
    channel: 'notice',
    channelName: '公告',
    description: '系统维护、版本发布和平台公告提醒',
    subscribed: true,
    deliveryModes: ['in-app', 'email'],
    jumpTarget: '/dashboard/workplace',
    lastPushedAt: '2026-06-23 08:00:00',
    updatedAt: '2026-06-23 08:00:00',
  },
  {
    id: 'subscription-message',
    channel: 'message',
    channelName: '站内信',
    description: '权限策略、账号安全和协作消息提醒',
    subscribed: true,
    deliveryModes: ['in-app'],
    jumpTarget: '/message/center',
    lastPushedAt: '2026-06-23 08:30:00',
    updatedAt: '2026-06-23 08:30:00',
  },
  {
    id: 'subscription-todo',
    channel: 'todo',
    channelName: '待办',
    description: '流程审批、表单发布等任务提醒',
    subscribed: true,
    deliveryModes: ['in-app', 'websocket'],
    jumpTarget: '/Scalability/workflowCenter',
    lastPushedAt: '2026-06-23 09:00:00',
    updatedAt: '2026-06-23 09:00:00',
  },
  {
    id: 'subscription-alert',
    channel: 'alert',
    channelName: '告警',
    description: '报表导出失败、权限异常和系统异常提醒',
    subscribed: false,
    deliveryModes: ['in-app'],
    jumpTarget: '/visualization/reportCenter',
    updatedAt: '2026-06-22 18:00:00',
  },
]

const cloneSubscription = (
  record: MessageSubscriptionRecord
): MessageSubscriptionRecord => ({
  ...record,
  deliveryModes: [...record.deliveryModes],
})

const cloneNotification = (
  record: MessageNotificationRecord
): MessageNotificationRecord => ({
  ...record,
})

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseQuery = (url: string): MessageSubscriptionQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: toPositiveNumber(query.current, 1),
    pageSize: toPositiveNumber(query.pageSize, 20),
    channel: (readString(query.channel) || '') as
      | MessageSubscriptionChannel
      | '',
    keyword: readString(query.keyword) || '',
  }
}

const parseJson = <T>(body: string, fallback: T): T => {
  try {
    return JSON.parse(body || '{}') as T
  } catch {
    return fallback
  }
}

const getSubscriptionIdFromUrl = (url: string) => {
  const match = url.match(/\/api\/messages\/subscriptions\/([^/]+)$/)
  return decodeURIComponent(match?.[1] || '')
}

const normalizeDeliveryModes = (modes: MessageDeliveryMode[]) => {
  const uniqueModes = Array.from(new Set(modes))
  return uniqueModes.filter((mode) => defaultDeliveryModes.includes(mode))
}

export const createMessageSubscriptionMockStore = (
  options: MessageSubscriptionMockStoreOptions = {}
) => {
  const now = options.now || getNow
  const id = options.id || getDefaultId
  let subscriptions = seedSubscriptions()
  let simulatedNotifications: MessageNotificationRecord[] = []

  const querySubscriptions = (
    params: MessageSubscriptionQuery
  ): MessageSubscriptionPageResult => {
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const filtered = subscriptions.filter((item) => {
      const matchedChannel = params.channel
        ? item.channel === params.channel
        : true
      const matchedKeyword = keyword
        ? `${item.channelName}${item.description}${item.jumpTarget}`
            .toLowerCase()
            .includes(keyword)
        : true

      return matchedChannel && matchedKeyword
    })
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(cloneSubscription),
      total: filtered.length,
    }
  }

  const updateSubscription = (
    subscriptionId: string,
    payload: MessageSubscriptionUpdatePayload
  ) => {
    const record = subscriptions.find((item) => item.id === subscriptionId)

    if (!record) {
      throw new Error('subscription not found')
    }

    const updatedAt = now()
    const deliveryModes = normalizeDeliveryModes(payload.deliveryModes)
    subscriptions = subscriptions.map((item) =>
      item.id === subscriptionId
        ? {
            ...item,
            subscribed: payload.subscribed,
            deliveryModes: deliveryModes.length ? deliveryModes : ['in-app'],
            updatedAt,
          }
        : item
    )

    const updatedRecord = subscriptions.find(
      (item) => item.id === subscriptionId
    ) as MessageSubscriptionRecord

    return cloneSubscription(updatedRecord)
  }

  const simulatePush = (
    payload: MessagePushSimulationPayload
  ): MessagePushSimulationResult => {
    const subscription = subscriptions.find(
      (item) => item.channel === payload.channel
    )

    if (!subscription || !subscription.subscribed) {
      return {
        success: false,
        deliveredTo: [],
        reason: `${channelLabels[payload.channel]}未订阅`,
      }
    }

    const timestamp = now()
    const notification: MessageNotificationRecord = {
      id: id(),
      category: payload.channel,
      title: payload.title,
      content: payload.content,
      status: 'unread',
      priority: payload.channel === 'alert' ? 'high' : 'normal',
      source: '消息推送模拟',
      createdAt: timestamp,
      link: payload.jumpTarget,
    }

    subscriptions = subscriptions.map((item) =>
      item.id === subscription.id
        ? {
            ...item,
            lastPushedAt: timestamp,
          }
        : item
    )
    simulatedNotifications = [notification, ...simulatedNotifications]

    return {
      success: true,
      deliveredTo: [...subscription.deliveryModes],
      notification: cloneNotification(notification),
    }
  }

  const getSimulatedNotifications = () =>
    simulatedNotifications.map(cloneNotification)

  return {
    querySubscriptions,
    updateSubscription,
    simulatePush,
    getSimulatedNotifications,
  }
}

const subscriptionStore = createMessageSubscriptionMockStore()

const setupMessageSubscriptionMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/messages/subscriptions(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            subscriptionStore.querySubscriptions(parseQuery(params.url))
          )
        }
      )

      Mock.mock(
        new RegExp('/api/messages/subscriptions/[^/]+$'),
        'put',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            subscriptionStore.updateSubscription(
              getSubscriptionIdFromUrl(params.url),
              parseJson<MessageSubscriptionUpdatePayload>(params.body, {
                subscribed: true,
                deliveryModes: ['in-app'],
              })
            )
          )
        }
      )

      Mock.mock(
        new RegExp('/api/messages/subscriptions/push-simulations$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            subscriptionStore.simulatePush(
              parseJson<MessagePushSimulationPayload>(params.body, {
                channel: 'message',
                title: '',
                content: '',
                jumpTarget: '/message/center',
              })
            )
          )
        }
      )
    },
  })
}

export default setupMessageSubscriptionMock
