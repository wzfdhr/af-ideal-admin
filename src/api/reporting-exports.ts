import request from './request'
import type {
  ReportExportCreate,
  ReportingExportCapability,
  ReportingExportJob,
  ReportingExportStatus,
} from '@af-admin/contracts'

export interface ReportExportListQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: ReportingExportStatus | ''
  archived?: 'all' | 'active' | 'archived'
}
export interface ReportExportPage {
  list: ReportingExportJob[]
  total: number
  current: number
  pageSize: number
}
export interface ReportExportCapabilities {
  formats: ReportingExportCapability[]
}
const base = '/reporting/exports'
const jobPath = (id: string) => `${base}/${encodeURIComponent(id)}`
const commandHeaders = (key: string) => ({
  headers: { 'Idempotency-Key': key },
})
export const fetchReportExportCapabilities = async () =>
  (await request.get<ReportExportCapabilities>(`${base}/capabilities`)).data
export const fetchReportExports = async (params: ReportExportListQuery) =>
  (await request.get<ReportExportPage>(base, { params })).data
export const getReportExport = async (id: string) =>
  (await request.get<ReportingExportJob>(jobPath(id))).data
export const createReportExport = async (
  input: ReportExportCreate,
  key: string
) =>
  (await request.post<ReportingExportJob>(base, input, commandHeaders(key)))
    .data
export const commandReportExport = async (
  job: ReportingExportJob,
  action: 'cancel' | 'retry',
  key: string
) =>
  (
    await request.post<ReportingExportJob>(
      `${jobPath(job.id)}/${action}`,
      { expectedRevision: job.revision },
      commandHeaders(key)
    )
  ).data
export const archiveReportExport = async (
  job: ReportingExportJob,
  archived: boolean,
  key: string
) =>
  (
    await request.post<ReportingExportJob>(
      `${jobPath(job.id)}/archive`,
      { archived, expectedRevision: job.revision },
      commandHeaders(key)
    )
  ).data
export const downloadReportExport = async (id: string) => {
  // The shared client decodes JSON errors for arraybuffer responses and keeps
  // authentication and tenant cancellation on this byte request.
  const response = await request.get<ArrayBuffer>(`${jobPath(id)}/content`, {
    responseType: 'arraybuffer',
  })
  const mimeType = String(response.headers['content-type'] || '')
  return { blob: new Blob([response.data], { type: mimeType }), mimeType }
}
