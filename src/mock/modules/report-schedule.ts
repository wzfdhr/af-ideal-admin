import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  CreateReportSchedulePayload,
  ReportScheduleAuditPageResult,
  ReportScheduleAuditQuery,
  ReportScheduleAuditRecord,
  ReportScheduleFrequency,
  ReportSchedulePageResult,
  ReportScheduleQuery,
  ReportScheduleRecord,
  ReportScheduleStatus,
  ReportScheduleToggleResult,
} from '@/api/report-schedule'
import type { MockParams } from '../types'

export interface ReportScheduleMockStoreOptions {
  now?: () => string
  id?: () => string
}

interface ReportBaseInfo {
  id: string
  name: string
}

const getNow = () => '2026-06-23 10:00:00'

const getDefaultId = () => Mock.Random.guid()

const reportOptions: ReportBaseInfo[] = [
  { id: 'sales-trend', name: '销售趋势报表' },
  { id: 'channel-distribution', name: '渠道分布报表' },
  { id: 'order-detail', name: '订单明细报表' },
]

const frequencyNextRunAt: Record<ReportScheduleFrequency, string> = {
  daily: '2026-06-24 09:00:00',
  weekly: '2026-06-29 09:00:00',
  monthly: '2026-07-01 09:00:00',
}

const seedSchedules = (): ReportScheduleRecord[] => [
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
    auditLogId: 'audit-schedule-sales-weekly-run',
    createdAt: '2026-06-01 09:00:00',
    updatedAt: '2026-06-23 09:00:00',
  },
  {
    id: 'schedule-channel-monthly',
    reportId: 'channel-distribution',
    reportName: '渠道分布报表',
    frequency: 'monthly',
    status: 'disabled',
    recipientScope: 'department',
    recipientTarget: '市场部',
    exportFormat: 'pdf',
    nextRunAt: '2026-07-01 09:00:00',
    auditLogId: 'audit-schedule-channel-monthly-toggle',
    createdAt: '2026-06-05 09:00:00',
    updatedAt: '2026-06-20 09:00:00',
  },
]

const seedAudits = (): ReportScheduleAuditRecord[] => [
  {
    id: 'audit-schedule-sales-weekly-run',
    scheduleId: 'schedule-sales-weekly',
    reportName: '销售趋势报表',
    action: 'run',
    result: 'success',
    operator: 'system',
    createdAt: '2026-06-22 09:00:00',
    message: '定时报表导出完成',
  },
  {
    id: 'audit-schedule-channel-monthly-toggle',
    scheduleId: 'schedule-channel-monthly',
    reportName: '渠道分布报表',
    action: 'toggle',
    result: 'success',
    operator: '系统管理员',
    createdAt: '2026-06-20 09:00:00',
    message: '定时报表已停用',
  },
]

const cloneSchedule = (record: ReportScheduleRecord): ReportScheduleRecord => ({
  ...record,
})

const cloneAudit = (
  record: ReportScheduleAuditRecord
): ReportScheduleAuditRecord => ({
  ...record,
})

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const toScheduleStatus = (value: unknown) => {
  const text = readString(value)
  return text === 'enabled' || text === 'disabled' ? text : ''
}

const toFrequency = (value: unknown) => {
  const text = readString(value)
  return text === 'daily' || text === 'weekly' || text === 'monthly' ? text : ''
}

const toAuditResult = (value: unknown) => {
  const text = readString(value)
  return text === 'success' || text === 'failed' ? text : ''
}

const parseQuery = (url: string): ReportScheduleQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: toPositiveNumber(query.current, 1),
    pageSize: toPositiveNumber(query.pageSize, 20),
    status: toScheduleStatus(query.status),
    frequency: toFrequency(query.frequency),
    keyword: readString(query.keyword) || '',
  }
}

const parseAuditQuery = (url: string): ReportScheduleAuditQuery => {
  const { query } = qs.parseUrl(url)

  return {
    scheduleId: readString(query.scheduleId) || '',
    result: toAuditResult(query.result),
  }
}

const parseJson = <T>(body: string, fallback: T): T => {
  try {
    return JSON.parse(body || '{}') as T
  } catch {
    return fallback
  }
}

const getScheduleIdFromUrl = (url: string) => {
  const match = url.match(/\/api\/report-schedules\/([^/]+)\/toggle$/)
  return decodeURIComponent(match?.[1] || '')
}

const getReportInfo = (reportId: string) =>
  reportOptions.find((item) => item.id === reportId) || reportOptions[2]

const createAudit = (
  audit: Omit<ReportScheduleAuditRecord, 'id' | 'createdAt'>
): ReportScheduleAuditRecord => ({
  ...audit,
  id: `audit-${audit.scheduleId}-${audit.action}`,
  createdAt: getNow(),
})

export const createReportScheduleMockStore = (
  options: ReportScheduleMockStoreOptions = {}
) => {
  const now = options.now || getNow
  const id = options.id || getDefaultId
  let schedules = seedSchedules()
  let audits = seedAudits()

  const pushAudit = (
    audit: Omit<ReportScheduleAuditRecord, 'id' | 'createdAt'>
  ) => {
    const record = {
      ...createAudit(audit),
      createdAt: now(),
    }
    audits = [record, ...audits]
    return record
  }

  const querySchedules = (
    params: ReportScheduleQuery
  ): ReportSchedulePageResult => {
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const filtered = schedules.filter((schedule) => {
      const matchedStatus = params.status
        ? schedule.status === params.status
        : true
      const matchedFrequency = params.frequency
        ? schedule.frequency === params.frequency
        : true
      const matchedKeyword = keyword
        ? `${schedule.reportName}${schedule.recipientTarget}${schedule.exportFormat}`
            .toLowerCase()
            .includes(keyword)
        : true

      return matchedStatus && matchedFrequency && matchedKeyword
    })
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(cloneSchedule),
      total: filtered.length,
    }
  }

  const createSchedule = (
    payload: CreateReportSchedulePayload
  ): ReportScheduleRecord => {
    const report = getReportInfo(payload.reportId)
    const scheduleId = id()
    const timestamp = now()
    const status: ReportScheduleStatus = payload.enabled
      ? 'enabled'
      : 'disabled'
    const auditLogId = `audit-${scheduleId}-create`
    const record: ReportScheduleRecord = {
      id: scheduleId,
      reportId: report.id,
      reportName: report.name,
      frequency: payload.frequency,
      status,
      recipientScope: payload.recipientScope,
      recipientTarget: payload.recipientTarget,
      exportFormat: payload.exportFormat,
      nextRunAt: frequencyNextRunAt[payload.frequency],
      auditLogId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    schedules = [record, ...schedules]
    audits = [
      {
        id: auditLogId,
        scheduleId,
        reportName: report.name,
        action: 'create',
        result: 'success',
        operator: '系统管理员',
        createdAt: timestamp,
        message:
          status === 'enabled' ? '定时报表已创建并启用' : '定时报表已创建',
      },
      ...audits,
    ]

    return cloneSchedule(record)
  }

  const toggleSchedule = (
    scheduleId: string,
    enabled: boolean
  ): ReportScheduleToggleResult => {
    const schedule = schedules.find((item) => item.id === scheduleId)

    if (!schedule) {
      pushAudit({
        scheduleId,
        reportName: '未知报表',
        action: 'toggle',
        result: 'failed',
        operator: '系统管理员',
        message: '定时报表不存在',
      })
      return {
        success: false,
        reason: '定时报表不存在',
      }
    }

    const status: ReportScheduleStatus = enabled ? 'enabled' : 'disabled'
    const auditLogId = `audit-${scheduleId}-toggle`
    const timestamp = now()

    schedules = schedules.map((item) =>
      item.id === scheduleId
        ? {
            ...item,
            status,
            auditLogId,
            updatedAt: timestamp,
          }
        : item
    )
    audits = [
      {
        id: auditLogId,
        scheduleId,
        reportName: schedule.reportName,
        action: 'toggle',
        result: 'success',
        operator: '系统管理员',
        createdAt: timestamp,
        message: status === 'enabled' ? '定时报表已启用' : '定时报表已停用',
      },
      ...audits,
    ]

    return {
      success: true,
      id: scheduleId,
      status,
      auditLogId,
    }
  }

  const queryAudits = (
    params: ReportScheduleAuditQuery = {}
  ): ReportScheduleAuditPageResult => {
    const filtered = audits.filter((audit) => {
      const matchedSchedule = params.scheduleId
        ? audit.scheduleId === params.scheduleId
        : true
      const matchedResult = params.result
        ? audit.result === params.result
        : true

      return matchedSchedule && matchedResult
    })

    return {
      list: filtered.map(cloneAudit),
      total: filtered.length,
    }
  }

  return {
    createSchedule,
    queryAudits,
    querySchedules,
    toggleSchedule,
  }
}

const scheduleStore = createReportScheduleMockStore()

const setupReportScheduleMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/report-schedules(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            scheduleStore.querySchedules(parseQuery(params.url))
          )
        }
      )

      Mock.mock(
        new RegExp('/api/report-schedules$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            scheduleStore.createSchedule(
              parseJson<CreateReportSchedulePayload>(params.body, {
                reportId: 'order-detail',
                frequency: 'daily',
                recipientScope: 'department',
                recipientTarget: '运营部',
                exportFormat: 'xlsx',
                enabled: true,
              })
            )
          )
        }
      )

      Mock.mock(
        new RegExp('/api/report-schedules/[^/]+/toggle$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const body = parseJson<{ enabled?: boolean }>(params.body, {
            enabled: true,
          })

          return responseWrap(
            scheduleStore.toggleSchedule(
              getScheduleIdFromUrl(params.url),
              body.enabled !== false
            )
          )
        }
      )

      Mock.mock(
        new RegExp('/api/report-schedule-audits(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            scheduleStore.queryAudits(parseAuditQuery(params.url))
          )
        }
      )
    },
  })
}

export default setupReportScheduleMock
