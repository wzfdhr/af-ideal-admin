import request from '@/api/request'
import type {
  MessageNotificationCategory,
  MessageNotificationRecord,
} from '@/api/message'

export type MessageSubscriptionChannel = MessageNotificationCategory
export type MessageDeliveryMode = 'in-app' | 'email' | 'websocket'

export interface MessageSubscriptionRecord {
  id: string
  channel: MessageSubscriptionChannel
  channelName: string
  description: string
  subscribed: boolean
  deliveryModes: MessageDeliveryMode[]
  jumpTarget: string
  lastPushedAt?: string
  updatedAt: string
}

export interface MessageSubscriptionQuery {
  current: number
  pageSize: number
  channel?: MessageSubscriptionChannel | ''
  keyword?: string
}

export interface MessageSubscriptionPageResult {
  list: MessageSubscriptionRecord[]
  total: number
}

export interface MessageSubscriptionUpdatePayload {
  subscribed: boolean
  deliveryModes: MessageDeliveryMode[]
}

export interface MessagePushSimulationPayload {
  channel: MessageSubscriptionChannel
  title: string
  content: string
  jumpTarget: string
}

export interface MessagePushSimulationResult {
  success: boolean
  deliveredTo: MessageDeliveryMode[]
  notification?: MessageNotificationRecord
  reason?: string
}

export const fetchMessageSubscriptions = async (
  params: MessageSubscriptionQuery
) => {
  const response = await request.get<MessageSubscriptionPageResult>(
    '/messages/subscriptions',
    {
      params,
    }
  )
  return response.data
}

export const updateMessageSubscription = async (
  id: string,
  payload: MessageSubscriptionUpdatePayload
) => {
  const response = await request.put<MessageSubscriptionRecord>(
    `/messages/subscriptions/${id}`,
    payload
  )
  return response.data
}

export const simulateMessagePush = async (
  payload: MessagePushSimulationPayload
) => {
  const response = await request.post<MessagePushSimulationResult>(
    '/messages/subscriptions/push-simulations',
    payload
  )
  return response.data
}
