import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createReportSchedule,
  fetchReportScheduleAudits,
  fetchReportSchedules,
  toggleReportSchedule,
  type CreateReportSchedulePayload,
  type ReportScheduleAuditQuery,
  type ReportScheduleQuery,
} from '@/api/report-schedule'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('report schedule api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches schedules with status, frequency and keyword filters', async () => {
    const query: ReportScheduleQuery = {
      current: 1,
      pageSize: 10,
      status: 'enabled',
      frequency: 'weekly',
      keyword: '订单',
    }
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await fetchReportSchedules(query)

    expect(requestMock.get).toHaveBeenCalledWith('/report-schedules', {
      params: query,
    })
  })

  it('creates and toggles schedules, then fetches audit records', async () => {
    const payload: CreateReportSchedulePayload = {
      reportId: 'order-detail',
      frequency: 'daily',
      recipientScope: 'department',
      recipientTarget: '运营部',
      exportFormat: 'xlsx',
      enabled: true,
    }
    const auditQuery: ReportScheduleAuditQuery = {
      scheduleId: 'schedule-order-daily',
    }
    requestMock.post
      .mockResolvedValueOnce({
        data: {
          id: 'schedule-order-daily',
          status: 'enabled',
          auditLogId: 'audit-schedule-order-daily-create',
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          id: 'schedule-order-daily',
          status: 'disabled',
          auditLogId: 'audit-schedule-order-daily-toggle',
        },
      })
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await createReportSchedule(payload)
    await toggleReportSchedule('schedule-order-daily', false)
    await fetchReportScheduleAudits(auditQuery)

    expect(requestMock.post).toHaveBeenNthCalledWith(
      1,
      '/report-schedules',
      payload
    )
    expect(requestMock.post).toHaveBeenNthCalledWith(
      2,
      '/report-schedules/schedule-order-daily/toggle',
      { enabled: false }
    )
    expect(requestMock.get).toHaveBeenCalledWith('/report-schedule-audits', {
      params: auditQuery,
    })
  })
})
