import request from './request'
import type {
  AuditExportCapabilityV1,
  AuditExportCreateV1,
  AuditExportJobPageV1,
  AuditExportJobV1,
  AuditExportStatus,
} from '@af-admin/contracts'

export interface AuditExportCapabilitiesV1 {
  readonly formats: readonly AuditExportCapabilityV1[]
}

export interface AuditExportListQueryV1 {
  current: number
  pageSize: number
  status?: AuditExportStatus | ''
  archived?: 'all' | 'active' | 'archived'
}

const base = '/audit/exports'
const jobPath = (id: string) => `${base}/${encodeURIComponent(id)}`
const commandHeaders = (key: string) => ({
  headers: { 'Idempotency-Key': key },
})

export const fetchAuditExportCapabilities = async () =>
  (await request.get<AuditExportCapabilitiesV1>('/audit/export-capabilities'))
    .data

export const fetchAuditExports = async (params: AuditExportListQueryV1) =>
  (await request.get<AuditExportJobPageV1>(base, { params })).data

export const getAuditExport = async (id: string) =>
  (await request.get<AuditExportJobV1>(jobPath(id))).data

export const createAuditExport = async (
  input: AuditExportCreateV1,
  key: string
) =>
  (await request.post<AuditExportJobV1>(base, input, commandHeaders(key))).data

export const commandAuditExport = async (
  job: AuditExportJobV1,
  action: 'cancel' | 'retry',
  key: string
) =>
  (
    await request.post<AuditExportJobV1>(
      `${jobPath(job.id)}/${action}`,
      { version: 1, expectedRevision: job.revision },
      commandHeaders(key)
    )
  ).data

export const archiveAuditExport = async (
  job: AuditExportJobV1,
  archived: boolean,
  key: string
) =>
  (
    await request.post<AuditExportJobV1>(
      `${jobPath(job.id)}/archive`,
      { version: 1, expectedRevision: job.revision, archived },
      commandHeaders(key)
    )
  ).data

export const downloadAuditExport = async (id: string) => {
  const response = await request.get<ArrayBuffer>(`${jobPath(id)}/download`, {
    responseType: 'arraybuffer',
  })
  const mimeType = String(response.headers['content-type'] || '')
  const contentDisposition = String(
    response.headers['content-disposition'] || ''
  )
  return {
    blob: new Blob([response.data], { type: mimeType }),
    mimeType,
    contentDisposition,
  }
}
