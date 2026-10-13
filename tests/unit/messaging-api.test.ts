import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  archiveMessagingTemplate,
  restoreMessagingTemplate,
  fetchApprovedMessagingTemplates,
  cancelMessagingJob,
  createMessagingJob,
  decideMessagingReview,
  fetchMessagingAnnouncements,
  fetchMessagingJobs,
  fetchMessagingRecipients,
  fetchMessagingReviews,
  fetchMessagingSubscriptions,
  fetchMessagingTemplates,
  fetchPublishedAnnouncements,
  getMessagingJob,
  getMessagingTemplate,
  previewMessagingTemplate,
  publishMessagingAnnouncement,
  readPublishedAnnouncement,
  retryMessagingJob,
  revokeMessagingAnnouncement,
  saveMessagingAnnouncement,
  saveMessagingTemplate,
  setMessagingTemplateEnabled,
  submitMessagingTemplate,
  updateMessagingSubscription,
  type MessagingQuery,
} from '@/api/messaging'
import type {
  MessageAnnouncementDraft,
  MessageAnnouncementRecord,
  MessageSendInput,
  MessageSendJobRecord,
  MessageSubscriptionRecord,
  MessageTemplateDraft,
  MessageTemplateRecord,
  MessageTemplateReview,
} from '@af-admin/contracts'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/request', () => ({ default: requestMock }))

const id = 'record/with ?#中文'
const encodedId = encodeURIComponent(id)
const key = 'command-key-1'
const headers = { headers: { 'Idempotency-Key': key } }
const templateSchema: MessageTemplateDraft = {
  name: '审批提醒',
  channel: 'todo',
  title: '{{applicant}}的申请',
  content: '请处理{{applicant}}的申请。',
  variables: [{ key: 'applicant', label: '申请人', required: true }],
  reviewerId: 'reviewer-1',
  deliveryModes: ['in-app', 'websocket'],
}
const template: MessageTemplateRecord = {
  id,
  schema: templateSchema,
  name: templateSchema.name,
  channel: templateSchema.channel,
  revision: 8,
  draftRevision: 3,
  draftState: 'approved',
  enabled: true,
  activeVersionId: 'approved-version-2',
  createdBy: 'author-1',
  updatedAt: '2026-10-13T08:00:00.000Z',
  archivedAt: null,
}
const review: MessageTemplateReview = {
  id,
  templateId: 'template-1',
  templateName: templateSchema.name,
  schema: templateSchema,
  draftRevision: 3,
  reviewerId: 'reviewer-1',
  requestedBy: 'author-1',
  status: 'pending',
  revision: 2,
  reason: '',
  requestedAt: '2026-10-13T08:00:00.000Z',
  reviewedAt: null,
}
const announcementSchema: MessageAnnouncementDraft = {
  title: '系统维护',
  content: '今晚维护，请提前保存工作。',
  audience: { scope: 'department', targetId: 'department-1' },
  expiresAt: '2026-10-14T08:00:00.000Z',
}
const announcement: MessageAnnouncementRecord = {
  id,
  schema: announcementSchema,
  revision: 4,
  status: 'published',
  activeVersionId: 'announcement-version-1',
  createdBy: 'author-1',
  updatedAt: '2026-10-13T08:00:00.000Z',
  publishedRevision: 4,
  draftChanged: false,
}
const job: MessageSendJobRecord = {
  id,
  sourceKind: 'template',
  sourceVersionId: 'approved-version-2',
  title: '张三的申请',
  content: '请处理张三的申请。',
  channel: 'todo',
  audience: { scope: 'users', userIds: ['member-1'] },
  deliveryModes: ['in-app', 'websocket'],
  scheduledAt: '2026-10-14T08:00:00.000Z',
  status: 'failed',
  revision: 6,
  createdBy: 'author-1',
  createdAt: '2026-10-13T08:00:00.000Z',
  counts: {
    pending: 0,
    processing: 0,
    sent: 0,
    skipped: 0,
    failed: 1,
    blocked: 0,
    cancelled: 0,
    realtimeAcknowledged: 0,
  },
}

describe('persistent messaging api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it.each([
    ['templates', fetchMessagingTemplates],
    ['reviews', fetchMessagingReviews],
    ['send-jobs', fetchMessagingJobs],
    ['announcements', fetchMessagingAnnouncements],
    ['announcements/published', fetchPublishedAnnouncements],
  ] as const)(
    'queries %s with the supplied filters',
    async (resource, fetch) => {
      const query: MessagingQuery = {
        current: 2,
        pageSize: 20,
        keyword: '审批',
        channel: 'todo',
        status: 'pending',
      }
      const page = { list: [], total: 0 }
      requestMock.get.mockResolvedValueOnce({ data: page })

      expect(await fetch(query)).toBe(page)
      expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(
        `/messaging/${resource}`,
        { params: query }
      )
    }
  )

  it.each(['send', 'review', 'announcement', 'subscription'] as const)(
    'loads the server recipient catalogue for purpose %s without client tenant parameters',
    async (purpose) => {
      const data = { people: [], roles: [], departments: [], deliveryModes: [] }
      requestMock.get.mockResolvedValueOnce({ data })

      expect(await fetchMessagingRecipients(purpose)).toBe(data)
      expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(
        '/messaging/recipients',
        { params: { purpose } }
      )
    }
  )

  it('defaults recipient catalogues to the send purpose', async () => {
    requestMock.get.mockResolvedValueOnce({ data: {} })

    await fetchMessagingRecipients()

    expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(
      '/messaging/recipients',
      { params: { purpose: 'send' } }
    )
  })

  it('loads the current user subscriptions without client tenant parameters', async () => {
    const data: MessageSubscriptionRecord[] = []
    requestMock.get.mockResolvedValueOnce({ data })

    expect(await fetchMessagingSubscriptions()).toBe(data)
    expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(
      '/messaging/subscriptions'
    )
  })

  it.each([
    ['templates', getMessagingTemplate, ''],
    ['send-jobs', getMessagingJob, ''],
    ['announcements/published', readPublishedAnnouncement, '/read'],
  ] as const)(
    'encodes the %s record identity as one path segment',
    async (resource, get, suffix) => {
      const data = { id }
      requestMock.get.mockResolvedValueOnce({ data })

      expect(await get(id)).toBe(data)
      expect(requestMock.get).toHaveBeenCalledExactlyOnceWith(
        `/messaging/${resource}/${encodedId}${suffix}`
      )
    }
  )

  it('creates a template with its schema and idempotency key', async () => {
    requestMock.post.mockResolvedValueOnce({ data: template })

    expect(await saveMessagingTemplate(templateSchema, key)).toBe(template)
    expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
      '/messaging/templates',
      { schema: templateSchema },
      headers
    )
  })

  it('updates a template using record revision rather than draft or source version', async () => {
    requestMock.put.mockResolvedValueOnce({ data: template })

    expect(await saveMessagingTemplate(templateSchema, key, template)).toBe(
      template
    )
    expect(requestMock.put).toHaveBeenCalledExactlyOnceWith(
      `/messaging/templates/${encodedId}`,
      { expectedRevision: 8, schema: templateSchema },
      headers
    )
  })

  it('submits a template with its optimistic revision and command key', async () => {
    requestMock.post.mockResolvedValueOnce({ data: template })

    expect(await submitMessagingTemplate(template, key)).toBe(template)
    expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
      `/messaging/templates/${encodedId}/submit`,
      { expectedRevision: 8 },
      headers
    )
  })

  it.each([true, false])(
    'sets template enabled=%s using the current record revision',
    async (enabled) => {
      requestMock.post.mockResolvedValueOnce({ data: template })

      expect(await setMessagingTemplateEnabled(template, enabled, key)).toBe(
        template
      )
      expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
        `/messaging/templates/${encodedId}/enabled`,
        { expectedRevision: 8, enabled },
        headers
      )
    }
  )

  it.each(['approve', 'reject'] as const)(
    'sends a review %s decision with review revision and reason',
    async (decision) => {
      const reason = decision === 'reject' ? '请补充正文' : ''
      requestMock.post.mockResolvedValueOnce({ data: review })

      expect(await decideMessagingReview(review, decision, reason, key)).toBe(
        review
      )
      expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
        `/messaging/reviews/${encodedId}/decision`,
        { expectedRevision: 2, decision, reason },
        headers
      )
    }
  )

  it('previews an explicitly selected immutable template version and audience', async () => {
    const body = {
      versionId: 'approved-version-2',
      variables: { applicant: '张三' },
      audience: { scope: 'role' as const, targetId: 'role-1' },
    }
    const preview = {
      title: '张三的申请',
      content: '请处理张三的申请。',
      variables: body.variables,
      missingVariables: [],
      recipientCount: 1,
      recipientIds: ['member-1'],
    }
    requestMock.post.mockResolvedValueOnce({ data: preview })

    expect(await previewMessagingTemplate(id, body)).toBe(preview)
    expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
      `/messaging/templates/${encodedId}/preview`,
      body
    )
  })

  it('creates a send job pinned to a template version with server-resolved recipients', async () => {
    const body: MessageSendInput = {
      templateVersionId: 'approved-version-2',
      variables: { applicant: '张三' },
      audience: { scope: 'department', targetId: 'department-1' },
      deliveryModes: ['in-app', 'websocket'],
      scheduledAt: '2026-10-14T08:00:00.000Z',
    }
    requestMock.post.mockResolvedValueOnce({ data: job })

    expect(await createMessagingJob(body, key)).toBe(job)
    expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
      '/messaging/send-jobs',
      body,
      headers
    )
    expect(body).not.toHaveProperty('title')
    expect(body).not.toHaveProperty('recipientIds')
  })

  it.each([
    ['cancel', cancelMessagingJob],
    ['retry', retryMessagingJob],
  ] as const)(
    'sends job %s as a revision command without replacing its source version',
    async (action, command) => {
      requestMock.post.mockResolvedValueOnce({ data: job })

      expect(await command(job, key)).toBe(job)
      expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
        `/messaging/send-jobs/${encodedId}/${action}`,
        { expectedRevision: 6 },
        headers
      )
      expect(job.sourceVersionId).toBe('approved-version-2')
    }
  )

  it('creates an announcement with the authored schema and command key', async () => {
    requestMock.post.mockResolvedValueOnce({ data: announcement })

    expect(await saveMessagingAnnouncement(announcementSchema, key)).toBe(
      announcement
    )
    expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
      '/messaging/announcements',
      { schema: announcementSchema },
      headers
    )
  })

  it('updates an announcement with the current revision', async () => {
    requestMock.put.mockResolvedValueOnce({ data: announcement })

    expect(
      await saveMessagingAnnouncement(announcementSchema, key, announcement)
    ).toBe(announcement)
    expect(requestMock.put).toHaveBeenCalledExactlyOnceWith(
      `/messaging/announcements/${encodedId}`,
      { expectedRevision: 4, schema: announcementSchema },
      headers
    )
  })

  it.each([
    ['publish', publishMessagingAnnouncement],
    ['revoke', revokeMessagingAnnouncement],
  ] as const)(
    'sends announcement %s using the revision and idempotency key',
    async (action, command) => {
      requestMock.post.mockResolvedValueOnce({ data: announcement })

      expect(await command(announcement, key)).toBe(announcement)
      expect(requestMock.post).toHaveBeenCalledExactlyOnceWith(
        `/messaging/announcements/${encodedId}/${action}`,
        { expectedRevision: 4 },
        headers
      )
    }
  )

  it.each([0, 5])(
    'persists subscription choices using revision %s including an unstored preference',
    async (revision) => {
      const subscription: MessageSubscriptionRecord = {
        channel: 'todo',
        subscribed: false,
        deliveryModes: ['in-app'],
        revision,
        stored: revision > 0,
        updatedAt: null,
      }
      requestMock.put.mockResolvedValueOnce({ data: subscription })

      expect(await updateMessagingSubscription(subscription, key)).toBe(
        subscription
      )
      expect(requestMock.put).toHaveBeenCalledExactlyOnceWith(
        '/messaging/subscriptions/todo',
        {
          expectedRevision: revision,
          subscribed: false,
          deliveryModes: ['in-app'],
        },
        headers
      )
    }
  )

  it('propagates revision conflicts without silently retrying or changing the record', async () => {
    const conflict = new Error('MESSAGING_REVISION_CONFLICT')
    requestMock.post.mockRejectedValueOnce(conflict)

    await expect(submitMessagingTemplate(template, key)).rejects.toBe(conflict)
    expect(requestMock.post).toHaveBeenCalledTimes(1)
    expect(template.revision).toBe(8)
    expect(template.activeVersionId).toBe('approved-version-2')
  })
})

it('reads approved immutable snapshots through the sender endpoint only', async () => {
  const result = { list: [], total: 0 }
  const query = { current: 2, pageSize: 20 }
  requestMock.get.mockResolvedValue({ data: result })
  expect(await fetchApprovedMessagingTemplates(query)).toBe(result)
  expect(requestMock.get).toHaveBeenCalledWith(
    '/messaging/templates/approved',
    { params: query }
  )
})
it('archives and restores using server revisions and idempotency keys', async () => {
  requestMock.delete.mockResolvedValue({ data: template })
  requestMock.post.mockResolvedValue({ data: template })
  expect(await archiveMessagingTemplate(template, key)).toBe(template)
  expect(requestMock.delete).toHaveBeenCalledWith(
    `/messaging/templates/${encodedId}`,
    { ...headers, data: { expectedRevision: template.revision } }
  )
  expect(await restoreMessagingTemplate(template, key)).toBe(template)
  expect(requestMock.post).toHaveBeenCalledWith(
    `/messaging/templates/${encodedId}/restore`,
    { expectedRevision: template.revision },
    headers
  )
})
