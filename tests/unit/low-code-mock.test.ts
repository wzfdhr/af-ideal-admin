import { describe, expect, it } from 'vitest'
import {
  createLowCodeMockStore,
  getLowCodeMockDataSource,
} from '@/mock/modules/low-code'
import { createQueryTablePageSchema } from '@/components/low-code/schema'

describe('low-code mock store', () => {
  it('creates, saves, publishes and rolls back low-code pages', () => {
    const store = createLowCodeMockStore()
    const schema = createQueryTablePageSchema()
    const created = store.createPage({
      name: '客户查询',
      schema,
    })

    expect(created.status).toBe('draft')
    expect(created.version).toBe(1)

    const saved = store.savePage(created.id, { schema })
    expect(saved.status).toBe('draft')

    const published = store.publishPage(created.id, schema)
    expect(published.status).toBe('published')
    expect(published.version).toBe(2)

    const rolledBack = store.rollbackPage(created.id, 1)
    expect(rolledBack.status).toBe('rolled-back')
    expect(rolledBack.version).toBe(1)
  })

  it('lists and retrieves seeded query table pages', () => {
    const store = createLowCodeMockStore()

    const result = store.listPages({
      current: 1,
      pageSize: 10,
      keyword: '客户',
    })

    expect(result.total).toBeGreaterThan(0)
    expect(store.getPage(result.list[0].id).schema.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'ProTable',
        }),
      ])
    )
  })

  it('previews Mock data sources with success, empty and failure scenarios', () => {
    expect(getLowCodeMockDataSource('customers')).toEqual(
      expect.objectContaining({
        total: 3,
        columns: expect.arrayContaining(['name', 'status']),
      })
    )
    expect(getLowCodeMockDataSource('empty')).toEqual({
      columns: ['name', 'status', 'owner'],
      list: [],
      total: 0,
    })
    expect(() => getLowCodeMockDataSource('failure')).toThrow(
      '低代码数据源预览失败'
    )
  })
})
