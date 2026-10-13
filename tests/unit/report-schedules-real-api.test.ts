import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  commandReportScheduleRun,
  fetchReportScheduleRecipientOptions,
  fetchReportScheduleRuns,
  fetchReportSchedules,
  getReportSchedule,
  getReportScheduleRun,
  previewReportSchedule,
  saveReportSchedule,
  setReportScheduleEnabled,
} from '@/api/reporting-schedules'
import type {
  ReportSchedule,
  ReportScheduleDefinitionV1,
  ReportScheduleRun,
} from '@af-admin/contracts'

const request = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))
vi.mock('@/api/request', () => ({ default: request }))
const id = 'schedule/中文 ?#'
const schedule = { id, revision: 8 } as ReportSchedule
const run = { id: 'run/中文 ?#', revision: 4 } as ReportScheduleRun
const schema: ReportScheduleDefinitionV1 = {
  version: 1,
  name: '真实月报',
  definitionVersionId: 'fixed-report-version',
  timing: {
    frequency: 'monthly',
    timeZone: 'Asia/Shanghai',
    time: '09:30',
    dayOfMonth: 31,
  },
  dataWindow: 'previous-period',
  recipients: { kind: 'role', roleId: 'actual-role-id' },
  format: 'xlsx',
}
const key = 'stable-command'
const headers = { headers: { 'Idempotency-Key': key } }
beforeEach(() => vi.resetAllMocks())
describe('persistent report schedule API', () => {
  it('reads declared server pagination and never infers totals from visible rows', async () => {
    const page = { list: [schedule], total: 61, current: 4, pageSize: 20 }
    request.get.mockResolvedValueOnce({ data: page })
    const params = { current: 4, pageSize: 20, keyword: '月报' }
    expect(await fetchReportSchedules(params)).toBe(page)
    expect(request.get).toHaveBeenCalledWith('/reporting/schedules', { params })
  })
  it('encodes schedule and run identifiers in one segment', async () => {
    request.get
      .mockResolvedValueOnce({ data: schedule })
      .mockResolvedValueOnce({ data: run })
    expect(await getReportSchedule(id)).toBe(schedule)
    expect(await getReportScheduleRun(run.id)).toBe(run)
    expect(request.get.mock.calls.map(([url]) => url)).toEqual([
      `/reporting/schedules/${encodeURIComponent(id)}`,
      `/reporting/schedules/runs/${encodeURIComponent(run.id)}`,
    ])
  })
  it('creates an explicit enabled rule without supplying client now, slot, recipients or success', async () => {
    request.post.mockResolvedValueOnce({ data: schedule })
    expect(await saveReportSchedule(schema, true, key)).toBe(schedule)
    expect(request.post).toHaveBeenCalledWith(
      '/reporting/schedules',
      { schema, enabled: true },
      headers
    )
  })
  it('edits with the current optimistic revision and a durable command key', async () => {
    request.put.mockResolvedValueOnce({ data: schedule })
    expect(await saveReportSchedule(schema, false, key, schedule)).toBe(
      schedule
    )
    expect(request.put).toHaveBeenCalledWith(
      `/reporting/schedules/${encodeURIComponent(id)}`,
      { schema, expectedRevision: 8 },
      headers
    )
    expect(request.post).not.toHaveBeenCalled()
  })
  it.each([true, false])(
    'toggles enabled=%s with the current revision',
    async (enabled) => {
      request.post.mockResolvedValueOnce({ data: schedule })
      expect(await setReportScheduleEnabled(schedule, enabled, key)).toBe(
        schedule
      )
      expect(request.post).toHaveBeenCalledWith(
        `/reporting/schedules/${encodeURIComponent(id)}/enabled`,
        { enabled, expectedRevision: 8 },
        headers
      )
    }
  )
  it('scopes edit directories and preview to the original schedule identity', async () => {
    const directory = { roles: [], departments: [], maxRecipients: 200 }
    request.get.mockResolvedValueOnce({ data: directory })
    expect(await fetchReportScheduleRecipientOptions('update', id)).toBe(
      directory
    )
    expect(request.get).toHaveBeenCalledWith(
      '/reporting/schedules/recipient-options',
      { params: { purpose: 'update', scheduleId: id } }
    )
    const preview = { nextRunAt: '2026-11-30T01:30:00Z', recipientTotal: 3 }
    request.post.mockResolvedValueOnce({ data: preview })
    expect(await previewReportSchedule(schema, id)).toBe(preview)
    expect(request.post).toHaveBeenCalledWith('/reporting/schedules/preview', {
      schema,
      scheduleId: id,
    })
  })
  it('reads real runs independently from configuration or report-query endpoints', async () => {
    const page = { list: [run], total: 1, current: 1, pageSize: 20 }
    const params = {
      current: 1,
      pageSize: 20,
      scheduleId: id,
      status: 'partial-failed' as const,
    }
    request.get.mockResolvedValueOnce({ data: page })
    expect(await fetchReportScheduleRuns(params)).toBe(page)
    expect(request.get).toHaveBeenCalledExactlyOnceWith(
      '/reporting/schedules/runs',
      { params }
    )
  })
  it.each(['retry', 'cancel'] as const)(
    'commands %s with the fixed run revision',
    async (action) => {
      request.post.mockResolvedValueOnce({ data: run })
      expect(await commandReportScheduleRun(run, action, key)).toBe(run)
      expect(request.post).toHaveBeenCalledWith(
        `/reporting/schedules/runs/${encodeURIComponent(run.id)}/${action}`,
        { expectedRevision: 4 },
        headers
      )
    }
  )
  it('propagates denial without a simulated preview or empty success', async () => {
    const denied = new Error('SCHEDULE_RECIPIENT_PERMISSION_DENIED')
    request.post.mockRejectedValueOnce(denied)
    await expect(previewReportSchedule(schema)).rejects.toBe(denied)
    expect(request.post).toHaveBeenCalledTimes(1)
    expect(request.get).not.toHaveBeenCalled()
  })
})
