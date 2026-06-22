import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createReportExportTask,
  fetchReportData,
  fetchReportExportTasks,
  fetchReports,
  getReportDetail,
} from '@/api/report'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('report api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches report list and detail with query filters', async () => {
    requestMock.get
      .mockResolvedValueOnce({
        data: {
          list: [],
          total: 0,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'sales-trend',
          name: '销售趋势报表',
        },
      })

    await expect(
      fetchReports({ current: 1, pageSize: 20, type: 'trend' })
    ).resolves.toEqual({
      list: [],
      total: 0,
    })
    expect(requestMock.get).toHaveBeenCalledWith('/reports', {
      params: {
        current: 1,
        pageSize: 20,
        type: 'trend',
      },
    })

    await expect(getReportDetail('sales-trend')).resolves.toEqual({
      id: 'sales-trend',
      name: '销售趋势报表',
    })
    expect(requestMock.get).toHaveBeenLastCalledWith('/reports/sales-trend')
  })

  it('queries report data with conditions and field permission metadata', async () => {
    requestMock.post.mockResolvedValueOnce({
      data: {
        type: 'detail',
        columns: [
          {
            key: 'customer',
            label: '客户',
            permissionCode: 'report:detail:customer',
          },
        ],
        rows: [{ customer: 'Aheart 科技' }],
        trend: [],
        distribution: [],
        total: 1,
      },
    })

    await expect(
      fetchReportData('order-detail', {
        keyword: 'Aheart',
        dateRange: ['2026-06-01', '2026-06-23'],
      })
    ).resolves.toEqual({
      type: 'detail',
      columns: [
        {
          key: 'customer',
          label: '客户',
          permissionCode: 'report:detail:customer',
        },
      ],
      rows: [{ customer: 'Aheart 科技' }],
      trend: [],
      distribution: [],
      total: 1,
    })
    expect(requestMock.post).toHaveBeenCalledWith(
      '/reports/order-detail/data',
      {
        keyword: 'Aheart',
        dateRange: ['2026-06-01', '2026-06-23'],
      }
    )
  })

  it('creates export task and fetches task queue statuses', async () => {
    requestMock.post.mockResolvedValueOnce({
      data: {
        id: 'export-1',
        reportId: 'order-detail',
        status: 'in-progress',
      },
    })
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [
          { id: 'export-1', status: 'created' },
          { id: 'export-2', status: 'in-progress' },
          { id: 'export-3', status: 'completed' },
          { id: 'export-4', status: 'failed' },
        ],
        total: 4,
      },
    })

    await expect(
      createReportExportTask({
        reportId: 'order-detail',
        params: { keyword: 'Aheart' },
        scenario: 'in-progress',
      })
    ).resolves.toEqual({
      id: 'export-1',
      reportId: 'order-detail',
      status: 'in-progress',
    })
    expect(requestMock.post).toHaveBeenCalledWith('/report-export-tasks', {
      reportId: 'order-detail',
      params: { keyword: 'Aheart' },
      scenario: 'in-progress',
    })

    await expect(
      fetchReportExportTasks({ reportId: 'order-detail' })
    ).resolves.toEqual({
      list: [
        { id: 'export-1', status: 'created' },
        { id: 'export-2', status: 'in-progress' },
        { id: 'export-3', status: 'completed' },
        { id: 'export-4', status: 'failed' },
      ],
      total: 4,
    })
    expect(requestMock.get).toHaveBeenCalledWith('/report-export-tasks', {
      params: { reportId: 'order-detail' },
    })
  })
})
