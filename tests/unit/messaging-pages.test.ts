import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserStore } from '@/store'
import Templates from '@/components/messaging/templates.vue'
import Announcements from '@/components/messaging/announcements.vue'
import Subscriptions from '@/components/messaging/subscriptions.vue'
import { commitTenantContext } from '@/services/tenant-context'
import type {
  MessageTemplateRecord,
  MessageTemplateReview,
  MessageTemplateVersion,
  MessagingRecipientCatalogue,
} from '@af-admin/contracts'

const api = vi.hoisted(() =>
  Object.fromEntries(
    [
      'archiveMessagingTemplate',
      'restoreMessagingTemplate',
      'createMessagingJob',
      'decideMessagingReview',
      'fetchMessagingRecipients',
      'fetchMessagingReviews',
      'fetchMessagingTemplates',
      'fetchApprovedMessagingTemplates',
      'getMessagingTemplate',
      'previewMessagingTemplate',
      'saveMessagingTemplate',
      'setMessagingTemplateEnabled',
      'submitMessagingTemplate',
      'fetchMessagingAnnouncements',
      'fetchPublishedAnnouncements',
      'publishMessagingAnnouncement',
      'readPublishedAnnouncement',
      'revokeMessagingAnnouncement',
      'saveMessagingAnnouncement',
      'fetchMessagingSubscriptions',
      'updateMessagingSubscription',
    ].map((name) => [name, vi.fn()])
  )
)
vi.mock('@/api/messaging', () => api)
vi.mock('@/services/r1-confirm', () => ({
  confirmR1Action: vi.fn().mockResolvedValue(true),
}))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))
const catalogue: MessagingRecipientCatalogue = {
  people: [
    { id: 'reviewer', name: '审批人', canApprove: true },
    { id: 'author', name: '作者', canApprove: true },
  ],
  roles: [{ id: 'role-1', name: '当前租户角色' }],
  departments: [{ id: 'department-1', name: '当前租户部门' }],
  deliveryModes: [
    { mode: 'in-app', available: true, reason: '' },
    { mode: 'websocket', available: true, reason: '' },
    { mode: 'email', available: false, reason: '未配置邮件服务商' },
  ],
}
const version: MessageTemplateVersion = {
  id: 'immutable-v1',
  templateId: 'template-1',
  version: 1,
  contentHash: 'sha-approved-snapshot',
  approvedBy: 'reviewer',
  approvedAt: '2026-10-13T01:00:00Z',
  schema: {
    name: '审批提醒',
    channel: 'notice',
    title: '批准版 {{person}}',
    content: '批准正文 {{person}}',
    variables: [{ key: 'person', label: '成员', required: true }],
    reviewerId: 'reviewer',
    deliveryModes: ['in-app'],
  },
}
const template: MessageTemplateRecord = {
  id: 'template-1',
  name: '审批提醒',
  channel: 'notice',
  revision: 5,
  draftRevision: 2,
  draftState: 'draft',
  enabled: true,
  activeVersionId: version.id,
  createdBy: 'author',
  updatedAt: '2026-10-13T02:00:00Z',
  archivedAt: null,
  schema: { ...version.schema, title: '尚未审批的新标题 {{person}}' },
  versions: [version],
  reviews: [],
}
const review: MessageTemplateReview = {
  id: 'review-1',
  templateId: template.id,
  templateName: template.name,
  schema: version.schema,
  draftRevision: 1,
  reviewerId: 'reviewer',
  requestedBy: 'author',
  status: 'pending',
  revision: 1,
  reason: '',
  requestedAt: '2026-10-13T01:00:00Z',
  reviewedAt: null,
}
let pinia: ReturnType<typeof createPinia>
const mountPage = (
  component: typeof Templates | typeof Announcements | typeof Subscriptions
) => mount(component, { global: { plugins: [pinia], stubs: { Jobs: true } } })
const permissions = (codes: string[], id = 'author') =>
  useUserStore().$patch({ id, tenantId: 'tenant-a', permissions: codes })
beforeEach(() => {
  vi.clearAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  commitTenantContext('tenant-a')
  permissions(['*'])
  api.fetchMessagingRecipients.mockResolvedValue(catalogue)
  ;[
    'fetchMessagingReviews',
    'fetchMessagingTemplates',
    'fetchApprovedMessagingTemplates',
    'fetchMessagingAnnouncements',
    'fetchPublishedAnnouncements',
  ].forEach((name) => api[name].mockResolvedValue({ list: [], total: 0 }))
  api.fetchMessagingSubscriptions.mockResolvedValue([])
})

describe('real messaging pages', () => {
  it('review-only accounts load assigned immutable review snapshots without configuration or directory reads', async () => {
    permissions(['message:template:approve'], 'reviewer')
    api.fetchMessagingReviews.mockResolvedValue({ list: [review], total: 1 })
    api.decideMessagingReview.mockResolvedValue({
      ...review,
      status: 'approved',
      revision: 2,
    })
    const wrapper = mountPage(Templates)
    await flushPromises()
    expect(wrapper.text()).toContain('批准正文')
    expect(api.fetchMessagingTemplates).not.toHaveBeenCalled()
    expect(api.getMessagingTemplate).not.toHaveBeenCalled()
    expect(api.fetchMessagingRecipients).not.toHaveBeenCalled()
    await wrapper
      .get('[data-testid="messaging-review-approve-review-1"]')
      .trigger('click')
    await flushPromises()
    expect(api.decideMessagingReview).toHaveBeenCalledWith(
      review,
      'approve',
      '',
      expect.any(String)
    )
    wrapper.unmount()
  })

  it('retains author input and command key after a transport failure, then saves and reopens from API', async () => {
    permissions([
      'message:template:create',
      'message:template:list',
      'message:template:update',
    ])
    const saved: MessageTemplateRecord = {
      ...template,
      id: 'saved-template',
      schema: {
        name: '网络恢复模板',
        channel: 'notice',
        title: '保留标题',
        content: '保留正文',
        variables: [],
        reviewerId: 'reviewer',
        deliveryModes: ['in-app'],
      },
      name: '网络恢复模板',
      versions: [],
      activeVersionId: null,
      enabled: false,
    }
    api.saveMessagingTemplate
      .mockRejectedValueOnce(new Error('连接中断'))
      .mockResolvedValue(saved)
    api.getMessagingTemplate.mockResolvedValue(saved)
    const wrapper = mountPage(Templates)
    await flushPromises()
    await wrapper.get('[data-testid="messaging-template-new"]').trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-testid="messaging-template-name"]')
      .setValue(saved.schema.name)
    await wrapper
      .get('[data-testid="messaging-template-title"]')
      .setValue(saved.schema.title)
    await wrapper
      .get('[data-testid="messaging-template-content"]')
      .setValue(saved.schema.content)
    await wrapper
      .get('[data-testid="messaging-template-reviewer"]')
      .setValue('reviewer')
    await wrapper
      .get('[data-testid="messaging-template-save"]')
      .trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('连接中断')
    expect(
      (
        wrapper.get('[data-testid="messaging-template-content"]')
          .element as HTMLTextAreaElement
      ).value
    ).toBe(saved.schema.content)
    const failedKey = api.saveMessagingTemplate.mock.calls[0][1]
    api.fetchMessagingTemplates.mockResolvedValue({ list: [saved], total: 1 })
    await wrapper
      .get('[data-testid="messaging-template-save"]')
      .trigger('submit')
    await flushPromises()
    expect(api.saveMessagingTemplate.mock.calls[1][1]).toBe(failedKey)
    expect(wrapper.text()).toContain('模板草稿已由服务器保存')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '关闭编辑器')
      ?.trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-testid="messaging-template-saved-template"]')
      .trigger('click')
    await flushPromises()
    expect(api.getMessagingTemplate).toHaveBeenCalledWith('saved-template')
    expect(
      (
        wrapper.get('[data-testid="messaging-template-name"]')
          .element as HTMLInputElement
      ).value
    ).toBe(saved.schema.name)
    wrapper.unmount()
  })

  it('send-only accounts select approved versions without requesting private template drafts', async () => {
    permissions(['message:send:create'])
    api.fetchApprovedMessagingTemplates.mockResolvedValue({
      list: [version],
      total: 1,
    })
    api.previewMessagingTemplate.mockResolvedValue({
      title: '批准版 真实成员',
      content: '批准正文 真实成员',
      missingVariables: [],
      variables: { person: '真实成员' },
      recipientCount: 1,
    })
    api.createMessagingJob.mockResolvedValue({
      id: 'durable-job',
      status: 'queued',
      counts: { sent: 0, pending: 1 },
      recipients: [],
    })
    const wrapper = mountPage(Templates)
    await flushPromises()
    expect(api.fetchMessagingTemplates).not.toHaveBeenCalled()
    expect(api.getMessagingTemplate).not.toHaveBeenCalled()
    expect(api.fetchMessagingReviews).not.toHaveBeenCalled()
    expect(api.fetchMessagingRecipients).toHaveBeenCalledWith('send')
    await wrapper
      .get('[data-testid="messaging-send-variable-person"]')
      .setValue('真实成员')
    await wrapper.get('[data-testid="messaging-send-preview"]').trigger('click')
    await flushPromises()
    expect(api.previewMessagingTemplate).toHaveBeenCalledWith(template.id, {
      versionId: version.id,
      variables: { person: '真实成员' },
      audience: { scope: 'self' },
    })
    await wrapper.get('[data-testid="messaging-send-create"]').trigger('submit')
    await flushPromises()
    expect(api.createMessagingJob).toHaveBeenCalledWith(
      {
        templateVersionId: version.id,
        variables: { person: '真实成员' },
        audience: { scope: 'self' },
        deliveryModes: ['in-app'],
        scheduledAt: null,
      },
      expect.any(String)
    )
    expect(
      wrapper.get('[data-testid="messaging-queued-receipt"]').text()
    ).toContain('当前站内写入 0')
    expect(wrapper.text()).not.toContain('发送成功')
    wrapper.unmount()
  })

  it('announcement readers query only published own-accessible snapshots and clear withdrawn detail after refresh', async () => {
    permissions(['message:announcement:read'], 'reader')
    const published = {
      id: 'announcement-v1',
      announcementId: 'announcement-1',
      version: 1,
      title: '有效公告',
      content: '发布正文',
      audience: { scope: 'self' },
      expiresAt: null,
      publishedAt: '2026-10-13T01:00:00Z',
      publishedBy: 'author',
    }
    api.fetchPublishedAnnouncements.mockResolvedValue({
      list: [published],
      total: 1,
    })
    api.readPublishedAnnouncement.mockResolvedValue(published)
    const wrapper = mountPage(Announcements)
    await flushPromises()
    expect(api.fetchMessagingAnnouncements).not.toHaveBeenCalled()
    expect(api.fetchMessagingRecipients).not.toHaveBeenCalled()
    await wrapper
      .get('[data-testid="messaging-published-announcement-v1"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="messaging-announcement-read"]').text()
    ).toContain('发布正文')
    api.fetchPublishedAnnouncements.mockResolvedValue({ list: [], total: 0 })
    await wrapper
      .get('[data-testid="messaging-published-refresh"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="messaging-announcement-read"]').exists()
    ).toBe(false)
    wrapper.unmount()
  })

  it('own subscriptions retain edited preference on conflict and use server default revision zero', async () => {
    permissions(
      ['message:subscription:read', 'message:subscription:update'],
      'reader'
    )
    const row = {
      channel: 'notice',
      subscribed: true,
      deliveryModes: ['in-app'],
      revision: 0,
      stored: false,
      updatedAt: null,
    }
    api.fetchMessagingSubscriptions.mockResolvedValue([row])
    api.updateMessagingSubscription.mockRejectedValueOnce(
      new Error('版本冲突，请重新读取')
    )
    const wrapper = mountPage(Subscriptions)
    await flushPromises()
    expect(api.fetchMessagingRecipients).toHaveBeenCalledWith('subscription')
    await wrapper
      .get('[data-testid="real-subscription-toggle-notice"]')
      .setValue(false)
    await wrapper
      .get('[data-testid="real-subscription-save-notice"]')
      .trigger('submit')
    await flushPromises()
    expect(api.updateMessagingSubscription).toHaveBeenCalledWith(
      { ...row, subscribed: false },
      expect.any(String)
    )
    expect(
      (
        wrapper.get('[data-testid="real-subscription-toggle-notice"]')
          .element as HTMLInputElement
      ).checked
    ).toBe(false)
    expect(wrapper.text()).toContain('版本冲突')
    expect(wrapper.find('[data-testid="message-push-simulate"]').exists()).toBe(
      false
    )
    wrapper.unmount()
  })
})
