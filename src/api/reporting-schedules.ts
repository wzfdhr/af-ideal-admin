import request from './request'
import type {
  ReportSchedule,
  ReportScheduleDefinitionV1,
  ReportScheduleRun,
  ReportScheduleRunStatus,
  ReportScheduleRecipientOptions,
  ReportSchedulePreview,
} from '@af-admin/contracts'

export interface ReportSchedulePage<T> {
  list: T[]
  total: number
  current: number
  pageSize: number
}
export interface ReportScheduleListQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: '' | 'enabled' | 'disabled'
  frequency?: '' | 'daily' | 'weekly' | 'monthly'
}
export interface ReportScheduleRunQuery {
  current: number
  pageSize: number
  keyword?: string
  scheduleId?: string
  status?: ReportScheduleRunStatus | ''
}
export type {
  ReportScheduleRecipientOptions,
  ReportSchedulePreview,
} from '@af-admin/contracts'
const base = '/reporting/schedules'
const path = (id: string) => encodeURIComponent(id)
const commandHeaders = (key: string) => ({
  headers: { 'Idempotency-Key': key },
})
export const fetchReportSchedules = async (params: ReportScheduleListQuery) =>
  (await request.get<ReportSchedulePage<ReportSchedule>>(base, { params })).data
export const getReportSchedule = async (id: string) =>
  (await request.get<ReportSchedule>(`${base}/${path(id)}`)).data
export const saveReportSchedule = async (
  schema: ReportScheduleDefinitionV1,
  enabled: boolean,
  key: string,
  schedule?: ReportSchedule
) =>
  (schedule
    ? await request.put<ReportSchedule>(
        `${base}/${path(schedule.id)}`,
        { schema, expectedRevision: schedule.revision },
        commandHeaders(key)
      )
    : await request.post<ReportSchedule>(
        base,
        { schema, enabled },
        commandHeaders(key)
      )
  ).data
export const setReportScheduleEnabled = async (
  schedule: ReportSchedule,
  enabled: boolean,
  key: string
) =>
  (
    await request.post<ReportSchedule>(
      `${base}/${path(schedule.id)}/enabled`,
      { enabled, expectedRevision: schedule.revision },
      commandHeaders(key)
    )
  ).data
export const fetchReportScheduleRecipientOptions = async (
  purpose?: 'create' | 'update',
  scheduleId?: string
) =>
  (
    await request.get<ReportScheduleRecipientOptions>(
      `${base}/recipient-options`,
      {
        params: {
          purpose: purpose || 'create',
          ...(scheduleId ? { scheduleId } : {}),
        },
      }
    )
  ).data
export const previewReportSchedule = async (
  schema: ReportScheduleDefinitionV1,
  scheduleId?: string
) =>
  (
    await request.post<ReportSchedulePreview>(`${base}/preview`, {
      schema,
      ...(scheduleId ? { scheduleId } : {}),
    })
  ).data
export const fetchReportScheduleRuns = async (params: ReportScheduleRunQuery) =>
  (
    await request.get<ReportSchedulePage<ReportScheduleRun>>(`${base}/runs`, {
      params,
    })
  ).data
export const getReportScheduleRun = async (id: string) =>
  (await request.get<ReportScheduleRun>(`${base}/runs/${path(id)}`)).data
export const commandReportScheduleRun = async (
  run: ReportScheduleRun,
  action: 'retry' | 'cancel',
  key: string
) =>
  (
    await request.post<ReportScheduleRun>(
      `${base}/runs/${path(run.id)}/${action}`,
      { expectedRevision: run.revision },
      commandHeaders(key)
    )
  ).data
