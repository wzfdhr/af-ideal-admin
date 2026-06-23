import request from '@/api/request'

export interface MessageRecord {
  id: number
  title: string
  time: string
  content: string
  avatar: string
}

export interface NoticeRecord {
  id: number
  title: string
  time: string
  type: string
}

export interface TodoRecord {
  id: number
  title: string
  status: string
  statusText: string
}

export type MessageNotificationCategory =
  | 'notice'
  | 'message'
  | 'todo'
  | 'alert'
export type MessageNotificationStatus = 'read' | 'unread'
export type MessageNotificationPriority = 'low' | 'normal' | 'high'

export interface MessageNotificationRecord {
  id: string
  category: MessageNotificationCategory
  title: string
  content: string
  status: MessageNotificationStatus
  priority: MessageNotificationPriority
  source: string
  createdAt: string
  readAt?: string
  link?: string
}

export interface MessageNotificationQuery {
  current: number
  pageSize: number
  category?: MessageNotificationCategory | ''
  status?: MessageNotificationStatus | ''
  keyword?: string
}

export type MessageCategoryUnread = Record<MessageNotificationCategory, number>

export interface MessageNotificationPageResult {
  list: MessageNotificationRecord[]
  total: number
  unreadTotal: number
  categoryUnread: MessageCategoryUnread
}

export interface MarkAllMessagesReadPayload {
  category?: MessageNotificationCategory | ''
}

export interface MarkAllMessagesReadResult {
  updated: number
}

export const fetchMessageNotifications = async (
  params: MessageNotificationQuery
) => {
  const response = await request.get<MessageNotificationPageResult>(
    '/messages/notifications',
    {
      params,
    }
  )
  return response.data
}

export const markMessageRead = async (id: string) => {
  const response = await request.post<MessageNotificationRecord>(
    `/messages/notifications/${id}/read`
  )
  return response.data
}

export const markAllMessagesRead = async (
  payload: MarkAllMessagesReadPayload = {}
) => {
  const response = await request.post<MarkAllMessagesReadResult>(
    '/messages/notifications/read-all',
    payload
  )
  return response.data
}
