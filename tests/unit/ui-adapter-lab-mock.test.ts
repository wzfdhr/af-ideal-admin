import { describe, expect, it } from 'vitest'
import { createUiAdapterLabMockStore } from '@/mock/modules/ui-adapter-lab'

describe('ui adapter lab mock store', () => {
  it('filters and paginates adapter lab records', () => {
    const store = createUiAdapterLabMockStore()
    const result = store.queryItems({
      current: 1,
      pageSize: 2,
      keyword: 'table',
      status: '',
    })

    expect(result.total).toBeGreaterThan(0)
    expect(result.list[0].component).toBe('Table')
  })

  it('creates and updates mock-backed adapter validation items', () => {
    const store = createUiAdapterLabMockStore({
      now: () => '2026-06-23 12:00:00',
    })

    const created = store.createItem({
      name: 'Aheart Upload',
      component: 'Upload',
      status: 'blocked',
      description: '上传组件候选验证',
    })

    expect(created.success).toBe(true)
    expect(created.record?.updatedAt).toBe('2026-06-23 12:00:00')

    const updated = store.updateItem(created.record?.id || '', {
      name: 'Aheart Upload',
      component: 'Upload',
      status: 'ready',
      description: '上传组件已通过基础验证',
    })

    expect(updated.success).toBe(true)
    expect(updated.record?.status).toBe('ready')
  })

  it('returns empty and error scenarios for page validation', () => {
    const store = createUiAdapterLabMockStore()

    expect(
      store.queryItems({
        current: 1,
        pageSize: 20,
        keyword: 'no-such-component',
        status: '',
      })
    ).toEqual({ list: [], total: 0 })
    expect(store.simulateError()).toEqual({
      success: false,
      reason: 'Mock adapter service unavailable',
      traceId: 'mock-ui-adapter-lab-500',
    })
  })
})
