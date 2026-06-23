import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageCenter from '@/views/message/center/index.vue'
import type {
  MessageNotificationPageResult,
  MessageNotificationRecord,
} from '@/api/message'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  fetchMessageNotifications: vi.fn(),
  markAllMessagesRead: vi.fn(),
  markMessageRead: vi.fn(),
}))

vi.mock('@/api/message', () => ({
  fetchMessageNotifications: apiMocks.fetchMessageNotifications,
  markAllMessagesRead: apiMocks.markAllMessagesRead,
  markMessageRead: apiMocks.markMessageRead,
}))

const records: MessageNotificationRecord[] = [
  {
    id: 'todo-approval',
    category: 'todo',
    title: '合同审批待处理',
    content: '合同审批需要在今天完成',
    status: 'unread',
    priority: 'high',
    source: '流程中心',
    link: '/Scalability/workflowCenter',
    createdAt: '2026-06-23 09:00:00',
  },
  {
    id: 'notice-maintenance',
    category: 'notice',
    title: '系统维护公告',
    content: '今晚 23:00 维护',
    status: 'read',
    priority: 'normal',
    source: '系统公告',
    createdAt: '2026-06-23 08:00:00',
    readAt: '2026-06-23 08:30:00',
  },
]

const pageResult: MessageNotificationPageResult = {
  list: records,
  total: records.length,
  unreadTotal: 1,
  categoryUnread: {
    notice: 0,
    message: 0,
    todo: 1,
    alert: 0,
  },
}

describe('MessageCenter page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchMessageNotifications.mockResolvedValue(pageResult)
    apiMocks.markMessageRead.mockResolvedValue({
      ...records[0],
      status: 'read',
      readAt: '2026-06-23 10:00:00',
    })
    apiMocks.markAllMessagesRead.mockResolvedValue({ updated: 1 })
  })

  it('loads notifications, counters and supports query filters', async () => {
    const wrapper = mount(MessageCenter)
    await flushPromises()

    expect(apiMocks.fetchMessageNotifications).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      category: '',
      status: '',
      keyword: '',
    })
    expect(wrapper.find('[data-testid="message-center"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('合同审批待处理')
    expect(wrapper.text()).toContain('未读 1 条')

    await wrapper
      .find<HTMLSelectElement>('[data-testid="message-category"]')
      .setValue('todo')
    await wrapper
      .find<HTMLInputElement>('[data-testid="message-keyword"]')
      .setValue('审批')
    await wrapper.find('[data-testid="message-query"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchMessageNotifications).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      category: 'todo',
      status: '',
      keyword: '审批',
    })
  })

  it('marks one notification and all filtered notifications as read', async () => {
    const wrapper = mount(MessageCenter)
    await flushPromises()

    await wrapper
      .find('[data-testid="message-read-todo-approval"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.markMessageRead).toHaveBeenCalledWith('todo-approval')
    expect(apiMocks.fetchMessageNotifications).toHaveBeenCalledTimes(2)

    await wrapper.find('[data-testid="message-read-all"]').trigger('click')
    await flushPromises()

    expect(apiMocks.markAllMessagesRead).toHaveBeenCalledWith({
      category: '',
    })
    expect(apiMocks.fetchMessageNotifications).toHaveBeenCalledTimes(3)
  })
})
