import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Schedules from '@/components/reporting/schedules-index.vue'
import { useUserStore } from '@/store'
import { ApiRequestError } from '@/api/request-client'
import { commitTenantContext } from '@/services/tenant-context'
import {
  REPORT_SCHEDULE_PERMISSIONS as P,
  REPORT_EXPORT_PERMISSIONS as EP,
  REPORTING_PERMISSIONS as RP,
} from '@af-admin/contracts'
import type {
  ReportSchedule,
  ReportScheduleRun,
  ReportingDefinitionVersion,
} from '@af-admin/contracts'

enableAutoUnmount(afterEach)
const api = vi.hoisted(() =>
  Object.fromEntries(
    [
      'commandReportScheduleRun',
      'fetchReportScheduleRecipientOptions',
      'fetchReportScheduleRuns',
      'fetchReportSchedules',
      'getReportSchedule',
      'getReportScheduleRun',
      'previewReportSchedule',
      'saveReportSchedule',
      'setReportScheduleEnabled',
    ].map((name) => [name, vi.fn()])
  )
)
const reportsApi = vi.hoisted(() => ({
  fetchPublishedReportingDefinitions: vi.fn(),
}))
const exportsApi = vi.hoisted(() => ({
  fetchReportExportCapabilities: vi.fn(),
}))
const route = reactive<{ query: { runId?: string | string[] } }>({ query: {} })
vi.mock('@/api/reporting-schedules', () => api)
vi.mock('@/api/reporting', () => reportsApi)
vi.mock('@/api/reporting-exports', () => exportsApi)
vi.mock('@/services/r1-confirm', () => ({
  confirmR1Action: vi.fn().mockResolvedValue(true),
}))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRoute: () => route,
}))
const report: ReportingDefinitionVersion = {
  id: 'report-version',
  definitionId: 'report',
  version: 2,
  sourceReleaseId: 'source-4',
  sourceReleaseVersion: 4,
  contentHash: 'hash',
  publishedBy: 'owner',
  publishedAt: '2026-10-13T00:00:00Z',
  schema: {
    version: 1,
    name: '固定日报',
    source: { kind: 'application-records', applicationId: 'app' },
    kind: 'detail',
    metric: 'count',
    factTime: 'createdAt',
    timeZone: 'UTC',
    fields: [{ kind: 'metadata', id: 'createdAt' }],
  },
}
const schedule: ReportSchedule = {
  id: 'schedule-1',
  revision: 3,
  enabled: true,
  activeVersionId: 'rule-version-2',
  version: 2,
  nextRunAt: '2026-10-14T09:00:00Z',
  lastRunAt: '2026-10-13T09:00:00Z',
  createdBy: 'owner',
  createdAt: '2026-10-13T00:00:00Z',
  updatedAt: '2026-10-13T00:00:00Z',
  allowedActions: ['update', 'toggle'],
  schema: {
    version: 1,
    name: '实际日报',
    definitionVersionId: report.id,
    timing: { frequency: 'daily', timeZone: 'UTC', time: '09:00' },
    dataWindow: 'current-period',
    recipients: { kind: 'role', roleId: 'role-real' },
    format: 'csv',
  },
  versions: [],
}
const run: ReportScheduleRun = {
  id: 'run-1',
  scheduleId: schedule.id,
  periodId: 'period-1',
  ruleVersionId: 'rule-version-1',
  ruleVersion: 1,
  slotAt: '2026-10-13T09:00:00Z',
  query: null,
  status: 'partial-failed',
  revision: 2,
  createdBy: 'owner',
  createdAt: '2026-10-13T09:00:00Z',
  updatedAt: '2026-10-13T09:00:20Z',
  attempts: 2,
  nextAttemptAt: '2026-10-13T09:01:00Z',
  leaseUntil: null,
  errorCode: 'RECIPIENT_BLOCKED',
  errorMessage: '实际撤权',
  recipientTotal: 2,
  completedRecipients: 1,
  failedRecipients: 0,
  blockedRecipients: 1,
  skippedRecipients: 0,
  cancelledRecipients: 0,
  allowedActions: ['retry'],
  recipients: [
    {
      id: 'recipient-1',
      userId: 'member-1',
      name: null,
      status: 'completed',
      exportJobId: 'export-1',
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      notifiedAt: '2026-10-13T09:00:20Z',
    },
  ],
}
let pinia: ReturnType<typeof createPinia>
const permissions = (
  codes = [...Object.values(P), EP.create, EP.list, RP.query]
) =>
  useUserStore().$patch({
    id: 'owner',
    tenantId: 'tenant-a',
    permissions: codes,
  })
const page = () =>
  mount(Schedules, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
const newDraft = async (wrapper: ReturnType<typeof page>) => {
  await wrapper.get('[data-testid="report-schedule-new"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-testid="report-schedule-name"]').setValue('真实规则')
  await wrapper
    .get('[data-testid="report-schedule-report"]')
    .setValue(report.id)
  await wrapper.get('[data-testid="report-schedule-time"]').setValue('10:30')
}
beforeEach(() => {
  vi.clearAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  commitTenantContext('tenant-a')
  permissions()
  route.query = {}
  api.fetchReportSchedules.mockResolvedValue({
    list: [schedule],
    total: 41,
    current: 1,
    pageSize: 20,
  })
  api.getReportSchedule.mockResolvedValue(schedule)
  api.fetchReportScheduleRuns.mockResolvedValue({
    list: [run],
    total: 1,
    current: 1,
    pageSize: 20,
  })
  api.getReportScheduleRun.mockResolvedValue(run)
  api.fetchReportScheduleRecipientOptions.mockResolvedValue({
    roles: [{ id: 'role-real', name: '实际角色', eligibleRecipientCount: 2 }],
    departments: [
      { id: 'dept-real', name: '实际部门', eligibleRecipientCount: 1 },
    ],
    maxRecipients: 200,
  })
  api.previewReportSchedule.mockResolvedValue({
    nextRunAt: '2026-10-14T10:30:00Z',
    timeZone: 'UTC',
    dateRange: { from: '2026-10-13', to: '2026-10-13' },
    recipientTotal: 2,
    recipients: [{ userId: 'member-1', name: '真实成员' }],
    unavailableRecipientCount: 1,
    maxRecipients: 200,
  })
  api.saveReportSchedule.mockResolvedValue(schedule)
  api.setReportScheduleEnabled.mockResolvedValue({
    ...schedule,
    enabled: false,
  })
  api.commandReportScheduleRun.mockResolvedValue({ ...run, status: 'queued' })
  reportsApi.fetchPublishedReportingDefinitions.mockResolvedValue({
    list: [report],
    total: 63,
  })
  exportsApi.fetchReportExportCapabilities.mockResolvedValue({
    formats: [
      { format: 'csv', available: true, reason: null },
      { format: 'xlsx', available: true, reason: null },
      { format: 'pdf', available: false, reason: '服务器字体不可用' },
    ],
  })
})
describe('real scheduling state and authority', () => {
  it('opens an authorized run alert link by exact server identity without configuration or query authority', async () => {
    permissions([P.runRead])
    route.query = { runId: run.id }
    const wrapper = page()
    await flushPromises()
    expect(api.getReportScheduleRun).toHaveBeenCalledWith(run.id)
    expect(
      wrapper.get('[data-testid="report-schedule-run-detail"]').text()
    ).toContain(run.id)
    expect(api.fetchReportSchedules).not.toHaveBeenCalled()
    expect(reportsApi.fetchPublishedReportingDefinitions).not.toHaveBeenCalled()
    expect(api.fetchReportScheduleRecipientOptions).not.toHaveBeenCalled()
    expect(exportsApi.fetchReportExportCapabilities).not.toHaveBeenCalled()
  })
  it('rejects arrays, oversized, empty and unpermitted run link parameters', async () => {
    permissions([P.runRead])
    route.query = { runId: ['one', 'two'] }
    page()
    await flushPromises()
    route.query = { runId: 'x'.repeat(101) }
    await flushPromises()
    route.query = { runId: '   ' }
    await flushPromises()
    expect(api.getReportScheduleRun).not.toHaveBeenCalled()
    permissions([])
    route.query = { runId: run.id }
    await flushPromises()
    expect(api.getReportScheduleRun).not.toHaveBeenCalled()
  })
  it('fences a pending linked run when the query is removed and preserves unrelated editor input', async () => {
    const wrapper = page()
    await flushPromises()
    await newDraft(wrapper)
    const waiting = deferred<ReportScheduleRun>()
    api.getReportScheduleRun.mockReturnValueOnce(waiting.promise)
    route.query = { runId: 'pending-run' }
    await flushPromises()
    route.query = {}
    waiting.resolve({ ...run, id: 'old-linked-run' })
    await flushPromises()
    expect(
      wrapper.find('[data-testid="report-schedule-run-detail"]').exists()
    ).toBe(false)
    expect(
      (
        wrapper.get('[data-testid="report-schedule-name"]')
          .element as HTMLInputElement
      ).value
    ).toBe('真实规则')
  })
  it.each([403, 404])(
    'clears a previous linked run when the current server rejects the next link with %s',
    async (httpStatus) => {
      permissions([P.runRead])
      route.query = { runId: run.id }
      const wrapper = page()
      await flushPromises()
      expect(
        wrapper.get('[data-testid="report-schedule-run-detail"]').text()
      ).toContain(run.id)
      api.getReportScheduleRun.mockRejectedValueOnce(
        new ApiRequestError({
          kind: httpStatus === 403 ? 'forbidden' : 'not-found',
          httpStatus,
          message: `run denied ${httpStatus}`,
          displayMessage: `run denied ${httpStatus}`,
        })
      )
      route.query = { runId: 'denied-run' }
      await flushPromises()
      expect(
        wrapper.find('[data-testid="report-schedule-run-detail"]').exists()
      ).toBe(false)
      expect(
        wrapper.get('[data-testid="report-schedule-error"]').text()
      ).toContain(`run denied ${httpStatus}`)
    }
  )
  it('does not restore a linked run after identity and tenant change or run-read revocation', async () => {
    permissions([P.runRead])
    const waiting = deferred<ReportScheduleRun>()
    api.getReportScheduleRun.mockReturnValueOnce(waiting.promise)
    route.query = { runId: run.id }
    const wrapper = page()
    await flushPromises()
    permissions([])
    commitTenantContext('tenant-b')
    useUserStore().$patch({ id: 'other-owner', tenantId: 'tenant-b' })
    waiting.resolve(run)
    await flushPromises()
    expect(
      wrapper.find('[data-testid="report-schedule-run-detail"]').exists()
    ).toBe(false)
    expect(api.getReportScheduleRun).toHaveBeenCalledTimes(1)
  })
  it('run-only viewers never request private configuration, report library, recipient directory or export capabilities', async () => {
    permissions([P.runRead])
    const wrapper = page()
    await flushPromises()
    expect(wrapper.text()).toContain('部分收件失败')
    expect(wrapper.text()).toContain('完成 1')
    expect(api.fetchReportScheduleRuns).toHaveBeenCalledTimes(1)
    expect(api.fetchReportSchedules).not.toHaveBeenCalled()
    expect(reportsApi.fetchPublishedReportingDefinitions).not.toHaveBeenCalled()
    expect(api.fetchReportScheduleRecipientOptions).not.toHaveBeenCalled()
    expect(exportsApi.fetchReportExportCapabilities).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="report-schedule-new"]').exists()).toBe(
      false
    )
  })
  it('shows only real directory counts and exact server preview without fabricating a clock or success', async () => {
    const wrapper = page()
    await flushPromises()
    await newDraft(wrapper)
    await wrapper
      .get('[data-testid="report-schedule-recipient-kind"]')
      .setValue('role')
    await wrapper
      .get('[data-testid="report-schedule-role"]')
      .setValue('role-real')
    expect(wrapper.text()).toContain('当前候选 2 人')
    await wrapper
      .get('[data-testid="report-schedule-preview"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="report-schedule-preview-result"]').text()
    ).toContain('2026-10-14T10:30:00Z')
    expect(
      wrapper.get('[data-testid="report-schedule-preview-result"]').text()
    ).toContain('符合资格 2 人')
    expect(wrapper.text()).toContain('未准入 1 人')
    expect(api.saveReportSchedule).not.toHaveBeenCalled()
    expect(api.previewReportSchedule.mock.calls[0][0]).toMatchObject({
      timing: { timeZone: 'UTC', time: '10:30' },
      recipients: { kind: 'role', roleId: 'role-real' },
    })
  })
  it('emits closed weekly/monthly schemas and ties timezone to the chosen fixed report', async () => {
    const wrapper = page()
    await flushPromises()
    await newDraft(wrapper)
    expect(
      wrapper
        .get('[data-testid="report-schedule-time-zone"]')
        .attributes('readonly')
    ).toBeDefined()
    expect(
      (
        wrapper.get('[data-testid="report-schedule-time-zone"]')
          .element as HTMLInputElement
      ).value
    ).toBe('UTC')
    await wrapper
      .get('[data-testid="report-schedule-frequency"]')
      .setValue('weekly')
    await wrapper.get('[data-testid="report-schedule-weekday"]').setValue(7)
    await wrapper
      .get('[data-testid="report-schedule-preview"]')
      .trigger('click')
    await flushPromises()
    expect(api.previewReportSchedule.mock.calls[0][0].timing).toEqual({
      frequency: 'weekly',
      timeZone: 'UTC',
      time: '10:30',
      weekday: 7,
    })
    await wrapper
      .get('[data-testid="report-schedule-frequency"]')
      .setValue('monthly')
    await wrapper.get('[data-testid="report-schedule-day"]').setValue(31)
    await wrapper
      .get('[data-testid="report-schedule-preview"]')
      .trigger('click')
    await flushPromises()
    expect(api.previewReportSchedule.mock.calls[1][0].timing).toEqual({
      frequency: 'monthly',
      timeZone: 'UTC',
      time: '10:30',
      dayOfMonth: 31,
    })
    expect(wrapper.text()).toContain('不存在的日期跳过该月')
  })
  it('invalidates an old preview when user input changes while preserving new input', async () => {
    const wrapper = page()
    await flushPromises()
    await newDraft(wrapper)
    const waiting = deferred<any>()
    api.previewReportSchedule.mockReturnValueOnce(waiting.promise)
    await wrapper
      .get('[data-testid="report-schedule-preview"]')
      .trigger('click')
    await wrapper.get('[data-testid="report-schedule-time"]').setValue('11:45')
    waiting.resolve({
      nextRunAt: 'old time',
      recipientTotal: 99,
      recipients: [],
    })
    await flushPromises()
    expect(
      wrapper.find('[data-testid="report-schedule-preview-result"]').exists()
    ).toBe(false)
    expect(
      (
        wrapper.get('[data-testid="report-schedule-time"]')
          .element as HTMLInputElement
      ).value
    ).toBe('11:45')
  })
  it('preserves input and stable create key after uncertain network failure', async () => {
    const wrapper = page()
    await flushPromises()
    await newDraft(wrapper)
    await wrapper
      .get('[data-testid="report-schedule-enable-create"]')
      .setValue(true)
    api.saveReportSchedule.mockRejectedValueOnce(new Error('真实网络失败'))
    await wrapper
      .get('[data-testid="report-schedule-editor"] form')
      .trigger('submit')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="report-schedule-error"]').text()
    ).toContain('真实网络失败')
    expect(
      (
        wrapper.get('[data-testid="report-schedule-name"]')
          .element as HTMLInputElement
      ).value
    ).toBe('真实规则')
    await wrapper
      .get('[data-testid="report-schedule-editor"] form')
      .trigger('submit')
    await flushPromises()
    expect(api.saveReportSchedule.mock.calls[0][1]).toBe(true)
    expect(api.saveReportSchedule.mock.calls[1][2]).toBe(
      api.saveReportSchedule.mock.calls[0][2]
    )
  })
  it('refreshes a revision conflict without clearing authored changes or replaying the update', async () => {
    const wrapper = page()
    await flushPromises()
    await wrapper
      .get('[data-testid="report-schedule-edit-schedule-1"]')
      .trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-testid="report-schedule-name"]')
      .setValue('保留编辑')
    api.saveReportSchedule.mockRejectedValueOnce(
      new ApiRequestError({
        kind: 'business',
        httpStatus: 409,
        message: 'REVISION_CONFLICT',
        displayMessage: 'REVISION_CONFLICT',
      })
    )
    api.getReportSchedule.mockResolvedValueOnce({ ...schedule, revision: 5 })
    await wrapper
      .get('[data-testid="report-schedule-editor"] form')
      .trigger('submit')
    await flushPromises()
    expect(
      (
        wrapper.get('[data-testid="report-schedule-name"]')
          .element as HTMLInputElement
      ).value
    ).toBe('保留编辑')
    expect(wrapper.text()).toContain('修订 5')
    expect(api.saveReportSchedule).toHaveBeenCalledTimes(1)
    expect(api.fetchReportScheduleRecipientOptions).toHaveBeenLastCalledWith(
      'update',
      schedule.id
    )
  })
  it('preserves the original update revision and key across an uncertain network retry', async () => {
    const wrapper = page()
    await flushPromises()
    await wrapper
      .get('[data-testid="report-schedule-edit-schedule-1"]')
      .trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-testid="report-schedule-name"]')
      .setValue('未知结果仍保留输入')
    api.saveReportSchedule.mockRejectedValueOnce(
      new Error('network response lost')
    )
    await wrapper
      .get('[data-testid="report-schedule-editor"] form')
      .trigger('submit')
    await flushPromises()
    expect(api.getReportSchedule).toHaveBeenCalledTimes(1)
    await wrapper
      .get('[data-testid="report-schedule-editor"] form')
      .trigger('submit')
    await flushPromises()
    expect(api.saveReportSchedule.mock.calls[1][2]).toBe(
      api.saveReportSchedule.mock.calls[0][2]
    )
    expect(api.saveReportSchedule.mock.calls[1][3].revision).toBe(3)
  })
  it('format failure remains explicit and never saves a fake schedule', async () => {
    const wrapper = page()
    await flushPromises()
    await newDraft(wrapper)
    await wrapper.get('[data-testid="report-schedule-format"]').setValue('pdf')
    await wrapper
      .get('[data-testid="report-schedule-preview"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="report-schedule-error"]').text()
    ).toContain('格式不可用')
    expect(api.previewReportSchedule).not.toHaveBeenCalled()
    expect(api.saveReportSchedule).not.toHaveBeenCalled()
  })
  it('discards old tenant configuration and preview responses and clears private inputs', async () => {
    const waiting = deferred<any>()
    api.fetchReportSchedules.mockReturnValueOnce(waiting.promise)
    const wrapper = page()
    await flushPromises()
    await newDraft(wrapper)
    const previewWait = deferred<any>()
    api.previewReportSchedule.mockReturnValueOnce(previewWait.promise)
    await wrapper
      .get('[data-testid="report-schedule-preview"]')
      .trigger('click')
    api.fetchReportSchedules.mockResolvedValue({ list: [], total: 0 })
    commitTenantContext('tenant-b')
    useUserStore().$patch({ id: 'other', tenantId: 'tenant-b' })
    waiting.resolve({ list: [schedule], total: 1 })
    previewWait.resolve({
      nextRunAt: 'old secret',
      recipients: [{ name: '旧成员' }],
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('实际日报')
    expect(wrapper.text()).not.toContain('旧成员')
    expect(
      wrapper.find('[data-testid="report-schedule-editor"]').exists()
    ).toBe(false)
  })
  it('requires original server allowed actions for retry and leaves actual partial failure visible', async () => {
    const wrapper = page()
    await flushPromises()
    permissions([P.runRead])
    await flushPromises()
    expect(
      wrapper.find('[data-testid="report-schedule-run-retry-run-1"]').exists()
    ).toBe(false)
    expect(wrapper.text()).toContain('部分收件失败')
    expect(wrapper.text()).not.toContain('100%')
    expect(api.commandReportScheduleRun).not.toHaveBeenCalled()
  })
  it('loads nullable recipient facts without exposing hidden business query contents', async () => {
    const wrapper = page()
    await flushPromises()
    await wrapper
      .get('[data-testid="report-schedule-run-inspect-run-1"]')
      .trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="report-schedule-run-detail"]').text()
    ).toContain('本次查询范围当前不可见')
    expect(wrapper.text()).toContain('姓名当前不可见')
    expect(wrapper.text()).toContain('2026-10-13T09:00:20Z')
    expect(
      wrapper
        .find('[data-testid="report-schedule-export-recipient-1"]')
        .exists()
    ).toBe(true)
  })
})
