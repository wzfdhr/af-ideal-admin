import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchMessageNotifications,
  markAllMessagesRead,
  markMessageRead,
  type MessageNotificationQuery,
} from '@/api/message'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('message api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches message notifications with category, status and keyword filters', async () => {
    const query: MessageNotificationQuery = {
      current: 1,
      pageSize: 10,
      category: 'todo',
      status: 'unread',
      keyword: '审批',
    }
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
        unreadTotal: 0,
        categoryUnread: {
          notice: 0,
          message: 0,
          todo: 0,
          alert: 0,
        },
      },
    })

    await fetchMessageNotifications(query)

    expect(requestMock.get).toHaveBeenCalledWith('/messages/notifications', {
      params: query,
    })
  })

  it('marks one notification and all notifications as read', async () => {
    requestMock.post
      .mockResolvedValueOnce({
        data: {
          id: 'msg-1',
          category: 'message',
          title: '私信',
          content: '请查看',
          status: 'read',
          priority: 'normal',
          createdAt: '2026-06-23 09:00:00',
          readAt: '2026-06-23 09:30:00',
        },
      })
      .mockResolvedValueOnce({
        data: {
          updated: 3,
        },
      })

    await markMessageRead('msg-1')
    await markAllMessagesRead({ category: 'message' })

    expect(requestMock.post).toHaveBeenNthCalledWith(
      1,
      '/messages/notifications/msg-1/read'
    )
    expect(requestMock.post).toHaveBeenNthCalledWith(
      2,
      '/messages/notifications/read-all',
      {
        category: 'message',
      }
    )
  })
})
