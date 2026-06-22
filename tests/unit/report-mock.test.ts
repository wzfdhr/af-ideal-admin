import { describe, expect, it } from 'vitest'
import { createReportMockStore } from '@/mock/modules/report'

describe('report mock store', () => {
  it('lists reports and exposes report-level and field-level permissions', () => {
    const store = createReportMockStore()
    const result = store.listReports({ current: 1, pageSize: 20 })

    expect(result.total).toBe(3)
    expect(result.list.map((report) => report.type)).toEqual([
      'trend',
      'distribution',
      'detail',
    ])
    expect(result.list[0].permissionCode).toBe('report:sales-trend:view')
    expect(store.getReport('order-detail').fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'customer',
          permissionCode: 'report:order-detail:customer',
        }),
      ])
    )
  })

  it('queries trend, distribution and detail reports through Mock data', () => {
    const store = createReportMockStore()

    expect(store.queryReport('sales-trend', {}).trend).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          time: '2026-06-01',
        }),
      ])
    )
    expect(store.queryReport('channel-distribution', {}).distribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '官网',
        }),
      ])
    )
    expect(store.queryReport('order-detail', { keyword: 'Aheart' })).toEqual(
      expect.objectContaining({
        type: 'detail',
        rows: expect.arrayContaining([
          expect.objectContaining({
            customer: 'Aheart 科技',
          }),
        ]),
      })
    )
  })

  it('creates export tasks and keeps created, in-progress, completed and failed statuses', () => {
    const store = createReportMockStore()
    const created = store.createExportTask({
      reportId: 'order-detail',
      params: { keyword: 'Aheart' },
      scenario: 'created',
    })
    const running = store.createExportTask({
      reportId: 'order-detail',
      params: {},
      scenario: 'in-progress',
    })
    const completed = store.createExportTask({
      reportId: 'order-detail',
      params: {},
      scenario: 'completed',
    })
    const failed = store.createExportTask({
      reportId: 'order-detail',
      params: {},
      scenario: 'failed',
    })

    expect([
      created.status,
      running.status,
      completed.status,
      failed.status,
    ]).toEqual(['created', 'in-progress', 'completed', 'failed'])
    expect(store.listExportTasks({ reportId: 'order-detail' }).list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'created' }),
        expect.objectContaining({ status: 'in-progress' }),
        expect.objectContaining({ status: 'completed' }),
        expect.objectContaining({ status: 'failed' }),
      ])
    )
  })
})
