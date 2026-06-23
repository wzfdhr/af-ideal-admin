import { describe, expect, it } from 'vitest'
import { createReportScheduleMockStore } from '@/mock/modules/report-schedule'

describe('report schedule mock store', () => {
  it('filters schedules by status, frequency and keyword', () => {
    const store = createReportScheduleMockStore()
    const result = store.querySchedules({
      current: 1,
      pageSize: 10,
      status: 'enabled',
      frequency: 'weekly',
      keyword: '销售',
    })

    expect(result.total).toBe(1)
    expect(result.list[0]).toEqual(
      expect.objectContaining({
        reportName: '销售趋势报表',
        frequency: 'weekly',
        status: 'enabled',
      })
    )
  })

  it('creates schedules, toggles status and records export audit logs', () => {
    const store = createReportScheduleMockStore({
      now: () => '2026-06-23 12:00:00',
      id: () => 'schedule-new',
    })

    const schedule = store.createSchedule({
      reportId: 'order-detail',
      frequency: 'daily',
      recipientScope: 'department',
      recipientTarget: '运营部',
      exportFormat: 'xlsx',
      enabled: true,
    })
    const toggled = store.toggleSchedule('schedule-new', false)
    const audits = store.queryAudits({ scheduleId: 'schedule-new' })

    expect(schedule.status).toBe('enabled')
    expect(schedule.nextRunAt).toBe('2026-06-24 09:00:00')
    expect(schedule.auditLogId).toBe('audit-schedule-new-create')
    expect(toggled.status).toBe('disabled')
    expect(toggled.auditLogId).toBe('audit-schedule-new-toggle')
    expect(audits.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'create',
          scheduleId: 'schedule-new',
        }),
        expect.objectContaining({
          action: 'toggle',
          scheduleId: 'schedule-new',
          result: 'success',
        }),
      ])
    )
  })

  it('returns failed audit records for invalid schedules', () => {
    const store = createReportScheduleMockStore()
    const toggled = store.toggleSchedule('missing-schedule', false)

    expect(toggled.success).toBe(false)
    expect(toggled.reason).toContain('不存在')
    expect(store.queryAudits({}).list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'toggle',
          result: 'failed',
        }),
      ])
    )
  })
})
