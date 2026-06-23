import request from '@/api/request'
import type { MessageNotificationCategory } from '@/api/message'
import type { MessageDeliveryMode } from '@/api/message-subscription'

export type MessageTemplateChannel = MessageNotificationCategory
export type MessageTemplateStatus = 'draft' | 'enabled' | 'disabled'
export type MessageRecipientScope = 'all' | 'role' | 'department' | 'tenant'
export type MessageSendTaskStatus = 'queued' | 'failed'

export interface MessageTemplateVariable {
  key: string
  label: string
  required: boolean
  defaultValue?: string
}

export interface MessageTemplateRecord {
  id: string
  name: string
  channel: MessageTemplateChannel
  title: string
  content: string
  variables: MessageTemplateVariable[]
  status: MessageTemplateStatus
  recipientScope: MessageRecipientScope
  recipientTarget: string
  deliveryModes?: MessageDeliveryMode[]
  updatedAt: string
}

export interface MessageTemplateQuery {
  current: number
  pageSize: number
  channel?: MessageTemplateChannel | ''
  status?: MessageTemplateStatus | ''
  keyword?: string
}

export interface MessageTemplatePageResult {
  list: MessageTemplateRecord[]
  total: number
}

export interface MessageTemplatePreviewPayload {
  variables: Record<string, string>
  recipientScope: MessageRecipientScope
  recipientTarget: string
}

export interface MessageTemplatePreviewResult {
  title: string
  content: string
  recipientSummary: string
  missingVariables: string[]
}

export interface MessageSendTaskPayload {
  templateId: string
  title: string
  content: string
  recipientScope: MessageRecipientScope
  recipientTarget: string
  deliveryModes: MessageDeliveryMode[]
  scheduledAt?: string
}

export interface MessageSendTaskResult {
  success: boolean
  status: MessageSendTaskStatus
  taskId?: string
  recipientCount: number
  auditLogId?: string
  messageId?: string
  reason?: string
}

export const fetchMessageTemplates = async (params: MessageTemplateQuery) => {
  const response = await request.get<MessageTemplatePageResult>(
    '/messages/templates',
    {
      params,
    }
  )
  return response.data
}

export const previewMessageTemplate = async (
  id: string,
  payload: MessageTemplatePreviewPayload
) => {
  const response = await request.post<MessageTemplatePreviewResult>(
    `/messages/templates/${id}/preview`,
    payload
  )
  return response.data
}

export const createMessageSendTask = async (
  payload: MessageSendTaskPayload
) => {
  const response = await request.post<MessageSendTaskResult>(
    '/messages/send-tasks',
    payload
  )
  return response.data
}
