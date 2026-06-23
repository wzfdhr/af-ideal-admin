import { describe, expect, it } from 'vitest'
import { createMessageMockStore } from '@/mock/modules/message'

describe('message mock store', () => {
  it('seeds notices, messages, todos and alerts with unread counters', () => {
    const store = createMessageMockStore()
    const result = store.queryMessages({ current: 1, pageSize: 20 })

    expect(result.list.map((item) => item.category)).toEqual(
      expect.arrayContaining(['notice', 'message', 'todo', 'alert'])
    )
    expect(result.total).toBeGreaterThanOrEqual(4)
    expect(result.unreadTotal).toBeGreaterThan(0)
    expect(result.categoryUnread.todo).toBeGreaterThan(0)
  })

  it('filters notifications and supports single and batch read operations', () => {
    const store = createMessageMockStore({
      now: () => '2026-06-23 10:00:00',
    })
    const todoResult = store.queryMessages({
      current: 1,
      pageSize: 10,
      category: 'todo',
      status: 'unread',
      keyword: '审批',
    })

    expect(todoResult.total).toBeGreaterThan(0)
    todoResult.list.forEach((item) => {
      expect(item.category).toBe('todo')
      expect(item.status).toBe('unread')
      expect(`${item.title}${item.content}`).toContain('审批')
    })

    const readRecord = store.markRead(todoResult.list[0].id)

    expect(readRecord.status).toBe('read')
    expect(readRecord.readAt).toBe('2026-06-23 10:00:00')

    const batchResult = store.markAllRead({ category: 'todo' })
    const unreadTodoResult = store.queryMessages({
      current: 1,
      pageSize: 10,
      category: 'todo',
      status: 'unread',
    })

    expect(batchResult.updated).toBeGreaterThanOrEqual(0)
    expect(unreadTodoResult.total).toBe(0)
  })
})
