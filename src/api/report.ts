import request from '@/api/request'

export type ReportType = 'trend' | 'distribution' | 'detail'
export type ReportExportStatus =
  | 'created'
  | 'in-progress'
  | 'completed'
  | 'failed'

export interface ReportField {
  key: string
  label: string
  permissionCode: string
  visible?: boolean
}

export interface ReportRecord {
  id: string
  name: string
  type: ReportType
  permissionCode: string
  fields: ReportField[]
  createdAt: string
  updatedAt: string
  description?: string
}

export interface ReportQuery {
  current: number
  pageSize: number
  keyword?: string
  type?: ReportType
}

export interface ReportPageResult {
  list: ReportRecord[]
  total: number
}

export interface ReportDataQuery {
  keyword?: string
  dateRange?: string[]
}

export interface ReportSeriesPoint {
  time?: string
  name?: string
  value: number
}

export interface ReportDataResult {
  type: ReportType
  columns: ReportField[]
  rows: Record<string, unknown>[]
  trend: ReportSeriesPoint[]
  distribution: ReportSeriesPoint[]
  total: number
}

export interface ReportExportTask {
  id: string
  reportId: string
  reportName: string
  status: ReportExportStatus
  params: ReportDataQuery
  createdAt: string
  finishedAt?: string
  downloadUrl?: string
  errorMessage?: string
}

export interface ReportExportTaskQuery {
  reportId?: string
}

export interface ReportExportTaskResult {
  list: ReportExportTask[]
  total: number
}

export interface CreateReportExportTaskPayload {
  reportId: string
  params: ReportDataQuery
  scenario?: ReportExportStatus
}

export const fetchReports = async (params: ReportQuery) => {
  const response = await request.get<ReportPageResult>('/reports', {
    params,
  })
  return response.data
}

export const getReportDetail = async (id: string) => {
  const response = await request.get<ReportRecord>(`/reports/${id}`)
  return response.data
}

export const fetchReportData = async (id: string, params: ReportDataQuery) => {
  const response = await request.post<ReportDataResult>(
    `/reports/${id}/data`,
    params
  )
  return response.data
}

export const createReportExportTask = async (
  payload: CreateReportExportTaskPayload
) => {
  const response = await request.post<ReportExportTask>(
    '/report-export-tasks',
    payload
  )
  return response.data
}

export const fetchReportExportTasks = async (
  params: ReportExportTaskQuery = {}
) => {
  const response = await request.get<ReportExportTaskResult>(
    '/report-export-tasks',
    {
      params,
    }
  )
  return response.data
}
