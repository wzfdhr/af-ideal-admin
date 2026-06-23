import request from '@/api/request'

export type ReportScheduleFrequency = 'daily' | 'weekly' | 'monthly'
export type ReportScheduleStatus = 'enabled' | 'disabled'
export type ReportScheduleExportFormat = 'xlsx' | 'csv' | 'pdf'
export type ReportScheduleRecipientScope = 'role' | 'department' | 'tenant'
export type ReportScheduleAuditAction = 'create' | 'toggle' | 'run'
export type ReportScheduleAuditResult = 'success' | 'failed'

export interface ReportScheduleRecord {
  id: string
  reportId: string
  reportName: string
  frequency: ReportScheduleFrequency
  status: ReportScheduleStatus
  recipientScope: ReportScheduleRecipientScope
  recipientTarget: string
  exportFormat: ReportScheduleExportFormat
  nextRunAt: string
  lastRunAt?: string
  auditLogId: string
  createdAt: string
  updatedAt: string
}

export interface ReportScheduleQuery {
  current: number
  pageSize: number
  status?: ReportScheduleStatus | ''
  frequency?: ReportScheduleFrequency | ''
  keyword?: string
}

export interface ReportSchedulePageResult {
  list: ReportScheduleRecord[]
  total: number
}

export interface CreateReportSchedulePayload {
  reportId: string
  frequency: ReportScheduleFrequency
  recipientScope: ReportScheduleRecipientScope
  recipientTarget: string
  exportFormat: ReportScheduleExportFormat
  enabled: boolean
}

export interface ReportScheduleMutationResult extends ReportScheduleRecord {
  success?: boolean
  reason?: string
}

export interface ReportScheduleToggleResult {
  success: boolean
  id?: string
  status?: ReportScheduleStatus
  auditLogId?: string
  reason?: string
}

export interface ReportScheduleAuditRecord {
  id: string
  scheduleId: string
  reportName: string
  action: ReportScheduleAuditAction
  result: ReportScheduleAuditResult
  operator: string
  createdAt: string
  message: string
}

export interface ReportScheduleAuditQuery {
  scheduleId?: string
  result?: ReportScheduleAuditResult | ''
}

export interface ReportScheduleAuditPageResult {
  list: ReportScheduleAuditRecord[]
  total: number
}

export const fetchReportSchedules = async (params: ReportScheduleQuery) => {
  const response = await request.get<ReportSchedulePageResult>(
    '/report-schedules',
    {
      params,
    }
  )
  return response.data
}

export const createReportSchedule = async (
  payload: CreateReportSchedulePayload
) => {
  const response = await request.post<ReportScheduleMutationResult>(
    '/report-schedules',
    payload
  )
  return response.data
}

export const toggleReportSchedule = async (id: string, enabled: boolean) => {
  const response = await request.post<ReportScheduleToggleResult>(
    `/report-schedules/${id}/toggle`,
    { enabled }
  )
  return response.data
}

export const fetchReportScheduleAudits = async (
  params: ReportScheduleAuditQuery = {}
) => {
  const response = await request.get<ReportScheduleAuditPageResult>(
    '/report-schedule-audits',
    {
      params,
    }
  )
  return response.data
}
