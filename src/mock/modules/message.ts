import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { responseWrap } from '@/utils/mock'
import type {
  MarkAllMessagesReadPayload,
  MarkAllMessagesReadResult,
  MessageCategoryUnread,
  MessageNotificationCategory,
  MessageNotificationPageResult,
  MessageNotificationQuery,
  MessageNotificationRecord,
  MessageNotificationStatus,
} from '@/api/message'
import type { MockParams } from '../types'

export interface MessageMockStoreOptions {
  now?: () => string
}

const getNow = () => '2026-06-23 10:00:00'

const createCategoryUnread = (): MessageCategoryUnread => ({
  notice: 0,
  message: 0,
  todo: 0,
  alert: 0,
})

const seedMessages = (): MessageNotificationRecord[] => [
  {
    id: 'notice-maintenance',
    category: 'notice',
    title: '系统维护公告',
    content: '今晚 23:00 到 23:30 进行例行维护，请提前保存工作。',
    status: 'unread',
    priority: 'normal',
    source: '系统公告',
    createdAt: '2026-06-23 08:00:00',
    link: '/dashboard/workplace',
  },
  {
    id: 'message-security',
    category: 'message',
    title: '安全策略更新提醒',
    content: '新的权限策略已生效，请检查系统角色配置。',
    status: 'unread',
    priority: 'high',
    source: '权限中心',
    createdAt: '2026-06-23 08:30:00',
    link: '/system/roleSystem',
  },
  {
    id: 'todo-contract-approval',
    category: 'todo',
    title: '合同审批待处理',
    content: '合同审批需要在今天完成，请进入流程工作台处理。',
    status: 'unread',
    priority: 'high',
    source: '流程中心',
    createdAt: '2026-06-23 09:00:00',
    link: '/Scalability/workflowCenter',
  },
  {
    id: 'alert-report-export',
    category: 'alert',
    title: '报表导出失败',
    content: '订单明细报表导出失败，请稍后重试或联系管理员。',
    status: 'unread',
    priority: 'normal',
    source: '报表中心',
    createdAt: '2026-06-23 09:20:00',
    link: '/visualization/reportCenter',
  },
  {
    id: 'todo-form-review',
    category: 'todo',
    title: '表单发布审批',
    content: '采购申请表发布审批等待处理。',
    status: 'read',
    priority: 'normal',
    source: '表单设计器',
    createdAt: '2026-06-22 18:00:00',
    readAt: '2026-06-23 09:10:00',
    link: '/Scalability/formDesign',
  },
]

const cloneMessage = (
  record: MessageNotificationRecord
): MessageNotificationRecord => ({
  ...record,
})

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const parseQuery = (url: string): MessageNotificationQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: Number(readString(query.current) || 1),
    pageSize: Number(readString(query.pageSize) || 20),
    category: readString(query.category) as
      | MessageNotificationCategory
      | ''
      | undefined,
    status: readString(query.status) as MessageNotificationStatus | '',
    keyword: readString(query.keyword) || '',
  }
}

const parseBody = (body: string): MarkAllMessagesReadPayload => {
  try {
    return JSON.parse(body || '{}') as MarkAllMessagesReadPayload
  } catch {
    return {}
  }
}

const getCategoryUnread = (
  messages: MessageNotificationRecord[]
): MessageCategoryUnread =>
  messages.reduce<MessageCategoryUnread>((result, item) => {
    if (item.status === 'unread') {
      result[item.category] += 1
    }
    return result
  }, createCategoryUnread())

export const createMessageMockStore = (
  options: MessageMockStoreOptions = {}
) => {
  const now = options.now || getNow
  let messages = seedMessages()

  const queryMessages = (
    params: MessageNotificationQuery
  ): MessageNotificationPageResult => {
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const categoryUnread = getCategoryUnread(messages)

    const filtered = messages.filter((item) => {
      const matchCategory = params.category
        ? item.category === params.category
        : true
      const matchStatus = params.status ? item.status === params.status : true
      const matchKeyword = keyword
        ? `${item.title}${item.content}${item.source}`
            .toLowerCase()
            .includes(keyword)
        : true

      return matchCategory && matchStatus && matchKeyword
    })
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(cloneMessage),
      total: filtered.length,
      unreadTotal: Object.values(categoryUnread).reduce(
        (total, count) => total + count,
        0
      ),
      categoryUnread,
    }
  }

  const markRead = (id: string): MessageNotificationRecord => {
    messages = messages.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'read',
            readAt: item.readAt || now(),
          }
        : item
    )

    const record = messages.find((item) => item.id === id)
    if (!record) {
      throw new Error('message not found')
    }

    return cloneMessage(record)
  }

  const markAllRead = (
    payload: MarkAllMessagesReadPayload = {}
  ): MarkAllMessagesReadResult => {
    let updated = 0

    messages = messages.map((item) => {
      const shouldUpdate =
        item.status === 'unread' &&
        (payload.category ? item.category === payload.category : true)

      if (!shouldUpdate) return item

      updated += 1
      return {
        ...item,
        status: 'read',
        readAt: item.readAt || now(),
      }
    })

    return { updated }
  }

  return {
    queryMessages,
    markRead,
    markAllRead,
  }
}

const messageStore = createMessageMockStore()

const setupMessageMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/messages/notifications(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          responseWrap(messageStore.queryMessages(parseQuery(params.url)))
      )

      Mock.mock(
        new RegExp('/api/messages/notifications/([^/]+)/read$'),
        'post',
        (params: MockParams) => {
          const match = params.url.match(
            /\/api\/messages\/notifications\/([^/]+)\/read$/
          )
          return responseWrap(messageStore.markRead(match?.[1] || ''))
        }
      )

      Mock.mock(
        new RegExp('/api/messages/notifications/read-all$'),
        'post',
        (params: MockParams) =>
          responseWrap(messageStore.markAllRead(parseBody(params.body)))
      )
    },
  })
}

export default setupMessageMock
