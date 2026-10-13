import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MessageCenter from '@/views/message/center/real.vue'
import { useUserStore } from '@/store'
import { commitTenantContext } from '@/services/tenant-context'
import type { MessageNotificationPageResult } from '@/api/message'

enableAutoUnmount(afterEach)
const api = vi.hoisted(() => ({
  fetchMessageNotifications: vi.fn(),
  markMessageRead: vi.fn(),
  markAllMessagesRead: vi.fn(),
}))
vi.mock('@/api/message', () => api)
vi.mock('@/components/messaging/use-messaging-realtime', () => ({
  useMessagingRealtime: () => ({
    status: { value: 'off' },
    reason: { value: '' },
    reconnect: vi.fn(),
  }),
}))
const result = (total: number, id: string): MessageNotificationPageResult => ({
  list: total
    ? [
        {
          id,
          title: id,
          content: '真实受权消息',
          source: '流程中心',
          category: 'message',
          priority: 'normal',
          status: 'unread',
          createdAt: '2026-10-13T00:00:00Z',
          link: `/leave/requests/${id}`,
        },
      ]
    : [],
  total,
  unreadTotal: total,
  categoryUnread: { notice: 0, message: total, todo: 0, alert: 0 },
})
beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  commitTenantContext('tenant-a')
  useUserStore().$patch({ id: 'reader-a', tenantId: 'tenant-a' })
  api.markMessageRead.mockResolvedValue({})
  api.markAllMessagesRead.mockResolvedValue({ updated: 1 })
})

describe('real inbox finite pagination', () => {
  it('loads later records using bounded server pages and keeps first/last controls honest', async () => {
    api.fetchMessageNotifications.mockImplementation(({ current }) =>
      Promise.resolve(result(41, `page-${current}`))
    )
    const wrapper = mount(MessageCenter)
    await flushPromises()
    expect(
      wrapper.get('[data-testid="message-first"]').attributes('disabled')
    ).toBeDefined()
    expect(
      wrapper.get('[data-testid="message-previous"]').attributes('disabled')
    ).toBeDefined()
    await wrapper.get('[data-testid="message-next"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('tbody').text()).toContain('page-2')
    expect(api.fetchMessageNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({ current: 2, pageSize: 20 })
    )
    await wrapper.get('[data-testid="message-last"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="message-page-state"]').text()).toContain(
      '第 3 / 3 页'
    )
    expect(wrapper.get('tbody').text()).toContain('page-3')
    expect(
      wrapper.get('[data-testid="message-next"]').attributes('disabled')
    ).toBeDefined()
    expect(
      wrapper.get('[data-testid="message-last"]').attributes('disabled')
    ).toBeDefined()
    await wrapper.get('[data-testid="message-first"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('tbody').text()).toContain('page-1')
    expect(
      api.fetchMessageNotifications.mock.calls.every(
        ([query]) => query.pageSize === 20
      )
    ).toBe(true)
  })

  it('query and reset start at page one, including an empty filtered result', async () => {
    api.fetchMessageNotifications.mockResolvedValue(result(41, 'old'))
    const wrapper = mount(MessageCenter)
    await flushPromises()
    await wrapper.get('[data-testid="message-last"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="message-keyword"]').setValue('唯一消息')
    api.fetchMessageNotifications.mockResolvedValue(result(0, ''))
    await wrapper.get('[data-testid="message-query"]').trigger('click')
    await flushPromises()
    expect(api.fetchMessageNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({ current: 1, keyword: '唯一消息', pageSize: 20 })
    )
    expect(wrapper.get('[data-testid="message-page-state"]').text()).toContain(
      '第 1 / 1 页'
    )
    expect(
      wrapper.get('[data-testid="message-next"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.get('tbody').text()).toContain('暂无消息')
    const reset = wrapper
      .findAll('button')
      .find((button) => button.text() === '重置')
    expect(reset).toBeDefined()
    await reset?.trigger('click')
    await flushPromises()
    expect(api.fetchMessageNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({ current: 1, keyword: '' })
    )
  })

  it('rechecks the last valid page if the authorized result set shrinks during a read refresh', async () => {
    api.fetchMessageNotifications.mockResolvedValue(result(41, 'last-message'))
    const wrapper = mount(MessageCenter)
    await flushPromises()
    await wrapper.get('[data-testid="message-last"]').trigger('click')
    await flushPromises()
    api.fetchMessageNotifications
      .mockResolvedValueOnce(result(40, 'stale-page'))
      .mockResolvedValueOnce(result(40, 'valid-last-page'))
    await wrapper
      .get('[data-testid="message-read-last-message"]')
      .trigger('click')
    await flushPromises()
    expect(api.markMessageRead).toHaveBeenCalledWith('last-message')
    expect(api.fetchMessageNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({ current: 2, pageSize: 20 })
    )
    expect(wrapper.get('[data-testid="message-page-state"]').text()).toContain(
      '第 2 / 2 页'
    )
    expect(wrapper.get('tbody').text()).toContain('valid-last-page')
    expect(wrapper.get('tbody').text()).not.toContain('stale-page')
  })

  it('resets paging on identity/tenant change and discards a late old-page response', async () => {
    api.fetchMessageNotifications.mockResolvedValue(result(41, 'tenant-a'))
    const wrapper = mount(MessageCenter)
    await flushPromises()
    let releaseOld!: (value: MessageNotificationPageResult) => void
    api.fetchMessageNotifications.mockImplementationOnce(
      () =>
        new Promise<MessageNotificationPageResult>((resolve) => {
          releaseOld = resolve
        })
    )
    await wrapper.get('[data-testid="message-next"]').trigger('click')
    expect(
      wrapper.get('[data-testid="message-next"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.get('tbody').text()).not.toContain('tenant-a')
    api.fetchMessageNotifications.mockResolvedValue(
      result(1, 'tenant-b-message')
    )
    commitTenantContext('tenant-b')
    useUserStore().$patch({ id: 'reader-b', tenantId: 'tenant-b' })
    await flushPromises()
    expect(api.fetchMessageNotifications).toHaveBeenLastCalledWith(
      expect.objectContaining({ current: 1, pageSize: 20 })
    )
    releaseOld(result(41, 'old-tenant-secret'))
    await flushPromises()
    expect(wrapper.get('tbody').text()).toContain('tenant-b-message')
    expect(wrapper.get('tbody').text()).not.toContain('old-tenant-secret')
    expect(wrapper.get('[data-testid="message-page-state"]').text()).toContain(
      '第 1 / 1 页'
    )
  })
})
