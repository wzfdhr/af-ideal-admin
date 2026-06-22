import { describe, expect, it } from 'vitest'
import {
  createDataScreenMockStore,
  getDataScreenMockRealtimeData,
} from '@/mock/modules/data-screen'
import { createEnterpriseDataScreenSchema } from '@/components/data-screen/schema'

describe('data screen mock store', () => {
  it('lists, saves and publishes seeded data screen definitions', () => {
    const store = createDataScreenMockStore()
    const listResult = store.listScreens({ current: 1, pageSize: 10 })

    expect(listResult.total).toBeGreaterThan(0)
    expect(listResult.list[0].schema.width).toBe(1920)

    const schema = createEnterpriseDataScreenSchema()
    const saved = store.saveScreen(listResult.list[0].id, { schema })
    expect(saved.status).toBe('draft')

    const published = store.publishScreen(listResult.list[0].id, schema)
    expect(published.status).toBe('published')
    expect(published.version).toBe(saved.version + 1)
  })

  it('returns realtime, empty and alert scenarios for screen widgets', () => {
    expect(getDataScreenMockRealtimeData('realtime')).toEqual(
      expect.objectContaining({
        metrics: expect.arrayContaining([
          expect.objectContaining({
            label: '今日成交额',
          }),
        ]),
        trend: expect.any(Array),
        ranking: expect.any(Array),
        table: expect.any(Array),
        alerts: expect.any(Array),
      })
    )
    expect(getDataScreenMockRealtimeData('realtime', 'empty')).toEqual({
      metrics: [],
      trend: [],
      distribution: [],
      ranking: [],
      table: [],
      alerts: [],
    })
    expect(getDataScreenMockRealtimeData('realtime', 'alert').alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'critical',
        }),
      ])
    )
  })

  it('throws for failure scenario and unknown data sources', () => {
    expect(() => getDataScreenMockRealtimeData('realtime', 'failure')).toThrow(
      '大屏实时数据获取失败'
    )
    expect(() => getDataScreenMockRealtimeData('missing')).toThrow(
      '大屏数据源不存在'
    )
  })
})
