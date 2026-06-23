import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReportSchedules from '@/views/visualization/reportSchedules/index.vue'
import type {
  ReportScheduleAuditPageResult,
  ReportSchedulePageResult,
  ReportScheduleRecord,
} from '@/api/report-schedule'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  createReportSchedule: vi.fn(),
  fetchReportScheduleAudits: vi.fn(),
  fetchReportSchedules: vi.fn(),
  toggleReportSchedule: vi.fn(),
}))

vi.mock('@/api/report-schedule', () => ({
  createReportSchedule: apiMocks.createReportSchedule,
  fetchReportScheduleAudits: apiMocks.fetchReportScheduleAudits,
  fetchReportSchedules: apiMocks.fetchReportSchedules,
  toggleReportSchedule: apiMocks.toggleReportSchedule,
}))

const schedules: ReportScheduleRecord[] = [
  {
    id: 'schedule-sales-weekly',
    reportId: 'sales-trend',
    reportName: '销售趋势报表',
    frequency: 'weekly',
    status: 'enabled',
    recipientScope: 'role',
    recipientTarget: '经营管理员',
    exportFormat: 'xlsx',
    nextRunAt: '2026-06-29 09:00:00',
    lastRunAt: '2026-06-22 09:00:00',
    auditLogId: 'audit-schedule-sales-weekly',
    createdAt: '2026-06-01 09:00:00',
    updatedAt: '2026-06-23 09:00:00',
  },
]

const pageResult: ReportSchedulePageResult = {
  list: schedules,
  total: schedules.length,
}

const auditResult: ReportScheduleAuditPageResult = {
  list: [
    {
      id: 'audit-schedule-sales-weekly',
      scheduleId: 'schedule-sales-weekly',
      reportName: '销售趋势报表',
      action: 'run',
      result: 'success',
      operator: 'system',
      createdAt: '2026-06-22 09:00:00',
      message: '定时报表导出完成',
    },
  ],
  total: 1,
}

describe('ReportSchedules page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchReportSchedules.mockResolvedValue(pageResult)
    apiMocks.fetchReportScheduleAudits.mockResolvedValue(auditResult)
    apiMocks.createReportSchedule.mockResolvedValue({
      ...schedules[0],
      id: 'schedule-order-daily',
      reportName: '订单明细报表',
    })
    apiMocks.toggleReportSchedule.mockResolvedValue({
      success: true,
      id: 'schedule-sales-weekly',
      status: 'disabled',
      auditLogId: 'audit-schedule-sales-weekly-toggle',
    })
  })

  it('loads schedules, audits and supports query filters', async () => {
    const wrapper = mount(ReportSchedules)
    await flushPromises()

    expect(apiMocks.fetchReportSchedules).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      status: '',
      frequency: '',
      keyword: '',
    })
    expect(apiMocks.fetchReportScheduleAudits).toHaveBeenCalledWith({})
    expect(wrapper.find('[data-testid="report-schedules"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('销售趋势报表')
    expect(wrapper.text()).toContain('定时报表导出完成')

    await wrapper
      .find<HTMLSelectElement>('[data-testid="report-schedule-status"]')
      .setValue('enabled')
    await wrapper
      .find<HTMLSelectElement>('[data-testid="report-schedule-frequency"]')
      .setValue('weekly')
    await wrapper
      .find<HTMLInputElement>('[data-testid="report-schedule-keyword"]')
      .setValue('销售')
    await wrapper.find('[data-testid="report-schedule-query"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchReportSchedules).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      status: 'enabled',
      frequency: 'weekly',
      keyword: '销售',
    })
  })

  it('creates schedules and toggles status with audit refresh', async () => {
    const wrapper = mount(ReportSchedules)
    await flushPromises()

    await wrapper
      .find<HTMLSelectElement>('[data-testid="report-schedule-report"]')
      .setValue('order-detail')
    await wrapper
      .find<HTMLSelectElement>(
        '[data-testid="report-schedule-create-frequency"]'
      )
      .setValue('daily')
    await wrapper
      .find('[data-testid="report-schedule-create"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.createReportSchedule).toHaveBeenCalledWith({
      reportId: 'order-detail',
      frequency: 'daily',
      recipientScope: 'department',
      recipientTarget: '运营部',
      exportFormat: 'xlsx',
      enabled: true,
    })
    expect(apiMocks.fetchReportScheduleAudits).toHaveBeenCalledTimes(2)

    await wrapper
      .find('[data-testid="report-schedule-toggle-schedule-sales-weekly"]')
      .trigger('click')
    await flushPromises()

    expect(apiMocks.toggleReportSchedule).toHaveBeenCalledWith(
      'schedule-sales-weekly',
      false
    )
    expect(wrapper.text()).toContain('已更新定时报表')
  })
})
