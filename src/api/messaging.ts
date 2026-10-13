import request from './request'
import type {
  MessageAnnouncementDraft,
  MessageAnnouncementRecord,
  MessagePublishedAnnouncement,
  MessageSendInput,
  MessageSendJobRecord,
  MessageSubscriptionRecord,
  MessageTemplateDraft,
  MessageTemplateRecord,
  MessageTemplateReview,
  MessageTemplateVersion,
  MessagingAudience,
  MessagingDeliveryMode,
  MessagingRecipientCatalogue,
} from '@af-admin/contracts'

export interface MessagingPage<T> {
  list: T[]
  total: number
}
export interface MessagingQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: string
  channel?: string
}
export interface MessagingPreview {
  title: string
  content: string
  missingVariables: string[]
  variables: Record<string, string>
  recipientCount: number
  recipientIds?: string[]
}
const path = (id: string) => encodeURIComponent(id)
const commandHeaders = (key: string) => ({
  headers: { 'Idempotency-Key': key },
})
export const fetchMessagingRecipients = async (
  purpose: 'send' | 'review' | 'announcement' | 'subscription' = 'send'
) =>
  (
    await request.get<MessagingRecipientCatalogue>('/messaging/recipients', {
      params: { purpose },
    })
  ).data
export const fetchMessagingTemplates = async (params: MessagingQuery) =>
  (
    await request.get<MessagingPage<MessageTemplateRecord>>(
      '/messaging/templates',
      { params }
    )
  ).data
export const getMessagingTemplate = async (id: string) =>
  (await request.get<MessageTemplateRecord>(`/messaging/templates/${path(id)}`))
    .data
export const saveMessagingTemplate = async (
  schema: MessageTemplateDraft,
  key: string,
  record?: MessageTemplateRecord
) =>
  (record
    ? await request.put<MessageTemplateRecord>(
        `/messaging/templates/${path(record.id)}`,
        { expectedRevision: record.revision, schema },
        commandHeaders(key)
      )
    : await request.post<MessageTemplateRecord>(
        '/messaging/templates',
        { schema },
        commandHeaders(key)
      )
  ).data
export const submitMessagingTemplate = async (
  record: MessageTemplateRecord,
  key: string
) =>
  (
    await request.post<MessageTemplateRecord>(
      `/messaging/templates/${path(record.id)}/submit`,
      { expectedRevision: record.revision },
      commandHeaders(key)
    )
  ).data
export const setMessagingTemplateEnabled = async (
  record: MessageTemplateRecord,
  enabled: boolean,
  key: string
) =>
  (
    await request.post<MessageTemplateRecord>(
      `/messaging/templates/${path(record.id)}/enabled`,
      { expectedRevision: record.revision, enabled },
      commandHeaders(key)
    )
  ).data
export const fetchMessagingReviews = async (params: MessagingQuery) =>
  (
    await request.get<MessagingPage<MessageTemplateReview>>(
      '/messaging/reviews',
      { params }
    )
  ).data
export const decideMessagingReview = async (
  review: MessageTemplateReview,
  decision: 'approve' | 'reject',
  reason: string,
  key: string
) =>
  (
    await request.post<MessageTemplateReview>(
      `/messaging/reviews/${path(review.id)}/decision`,
      { expectedRevision: review.revision, decision, reason },
      commandHeaders(key)
    )
  ).data
export const previewMessagingTemplate = async (
  id: string,
  body: {
    versionId: string
    variables: Record<string, string>
    audience: MessagingAudience
  }
) =>
  (
    await request.post<MessagingPreview>(
      `/messaging/templates/${path(id)}/preview`,
      body
    )
  ).data
export const fetchMessagingJobs = async (params: MessagingQuery) =>
  (
    await request.get<MessagingPage<MessageSendJobRecord>>(
      '/messaging/send-jobs',
      { params }
    )
  ).data
export const getMessagingJob = async (id: string) =>
  (await request.get<MessageSendJobRecord>(`/messaging/send-jobs/${path(id)}`))
    .data
export const createMessagingJob = async (body: MessageSendInput, key: string) =>
  (
    await request.post<MessageSendJobRecord>(
      '/messaging/send-jobs',
      body,
      commandHeaders(key)
    )
  ).data
export const cancelMessagingJob = async (
  job: MessageSendJobRecord,
  key: string
) =>
  (
    await request.post<MessageSendJobRecord>(
      `/messaging/send-jobs/${path(job.id)}/cancel`,
      { expectedRevision: job.revision },
      commandHeaders(key)
    )
  ).data
export const retryMessagingJob = async (
  job: MessageSendJobRecord,
  key: string
) =>
  (
    await request.post<MessageSendJobRecord>(
      `/messaging/send-jobs/${path(job.id)}/retry`,
      { expectedRevision: job.revision },
      commandHeaders(key)
    )
  ).data
export const fetchMessagingAnnouncements = async (params: MessagingQuery) =>
  (
    await request.get<MessagingPage<MessageAnnouncementRecord>>(
      '/messaging/announcements',
      { params }
    )
  ).data
export const saveMessagingAnnouncement = async (
  schema: MessageAnnouncementDraft,
  key: string,
  record?: MessageAnnouncementRecord
) =>
  (record
    ? await request.put<MessageAnnouncementRecord>(
        `/messaging/announcements/${path(record.id)}`,
        { expectedRevision: record.revision, schema },
        commandHeaders(key)
      )
    : await request.post<MessageAnnouncementRecord>(
        '/messaging/announcements',
        { schema },
        commandHeaders(key)
      )
  ).data
export const publishMessagingAnnouncement = async (
  record: MessageAnnouncementRecord,
  key: string
) =>
  (
    await request.post<MessageAnnouncementRecord>(
      `/messaging/announcements/${path(record.id)}/publish`,
      { expectedRevision: record.revision },
      commandHeaders(key)
    )
  ).data
export const revokeMessagingAnnouncement = async (
  record: MessageAnnouncementRecord,
  key: string
) =>
  (
    await request.post<MessageAnnouncementRecord>(
      `/messaging/announcements/${path(record.id)}/revoke`,
      { expectedRevision: record.revision },
      commandHeaders(key)
    )
  ).data
export const fetchPublishedAnnouncements = async (params: MessagingQuery) =>
  (
    await request.get<MessagingPage<MessagePublishedAnnouncement>>(
      '/messaging/announcements/published',
      { params }
    )
  ).data
export const readPublishedAnnouncement = async (id: string) =>
  (
    await request.get<MessagePublishedAnnouncement>(
      `/messaging/announcements/published/${path(id)}/read`
    )
  ).data
export const fetchMessagingSubscriptions = async () =>
  (await request.get<MessageSubscriptionRecord[]>('/messaging/subscriptions'))
    .data
export const updateMessagingSubscription = async (
  record: MessageSubscriptionRecord,
  key: string
) =>
  (
    await request.put<MessageSubscriptionRecord>(
      `/messaging/subscriptions/${path(record.channel)}`,
      {
        expectedRevision: record.revision,
        subscribed: record.subscribed,
        deliveryModes: record.deliveryModes as MessagingDeliveryMode[],
      },
      commandHeaders(key)
    )
  ).data

export const archiveMessagingTemplate = async (
  record: MessageTemplateRecord,
  key: string
) =>
  (
    await request.delete<MessageTemplateRecord>(
      `/messaging/templates/${path(record.id)}`,
      { ...commandHeaders(key), data: { expectedRevision: record.revision } }
    )
  ).data
export const restoreMessagingTemplate = async (
  record: MessageTemplateRecord,
  key: string
) =>
  (
    await request.post<MessageTemplateRecord>(
      `/messaging/templates/${path(record.id)}/restore`,
      { expectedRevision: record.revision },
      commandHeaders(key)
    )
  ).data

export const fetchApprovedMessagingTemplates = async (params: MessagingQuery) =>
  (
    await request.get<MessagingPage<MessageTemplateVersion>>(
      '/messaging/templates/approved',
      { params }
    )
  ).data
