import request from './request'
import type {
  AuditArchiveBatchV1,
  AuditArchiveEventV1,
  AuditArchiveRunCommandV1,
  AuditArchiveRunCreateV1,
  AuditArchiveRunPageV1,
  AuditArchiveRunV1,
  AuditExportCapabilityV1,
  AuditRetentionPolicyUpdateV1,
  AuditRetentionPolicyV1,
} from '@af-admin/contracts'

export interface AuditArchiveCapabilitiesV1 {
  readonly formats: readonly AuditExportCapabilityV1[]
}

export interface AuditArchiveRunListQueryV1 {
  current: number
  pageSize: number
}

export interface AuditArchiveBatchPageV1 {
  readonly version: 1
  readonly source: 'server'
  readonly projectionVersion: 1
  readonly list: readonly AuditArchiveBatchV1[]
  readonly total: number
  readonly current: number
  readonly pageSize: number
}

export interface AuditArchiveEventPageV1 {
  readonly version: 1
  readonly source: 'server'
  readonly projectionVersion: 1
  readonly list: readonly AuditArchiveEventV1[]
  readonly total: number
  readonly current: number
  readonly pageSize: number
}

const policyPath = '/audit/retention-policy'
const runBase = '/audit/archive-runs'
const runPath = (id: string) => `${runBase}/${encodeURIComponent(id)}`
const commandHeaders = (key: string) => ({
  headers: { 'Idempotency-Key': key },
})

export const fetchAuditArchiveCapabilities = async () =>
  (await request.get<AuditArchiveCapabilitiesV1>('/audit/export-capabilities'))
    .data

export const fetchAuditRetentionPolicy = async () =>
  (await request.get<AuditRetentionPolicyV1>(policyPath)).data

export const updateAuditRetentionPolicy = async (
  input: AuditRetentionPolicyUpdateV1,
  key: string
) =>
  (
    await request.put<AuditRetentionPolicyV1>(
      policyPath,
      input,
      commandHeaders(key)
    )
  ).data

export const fetchAuditArchiveRuns = async (
  params: AuditArchiveRunListQueryV1
) => (await request.get<AuditArchiveRunPageV1>(runBase, { params })).data

export const getAuditArchiveRun = async (id: string) =>
  (await request.get<AuditArchiveRunV1>(runPath(id))).data

export const createAuditArchiveRun = async (
  input: AuditArchiveRunCreateV1,
  key: string
) =>
  (await request.post<AuditArchiveRunV1>(runBase, input, commandHeaders(key)))
    .data

export const commandAuditArchiveRun = async (
  run: AuditArchiveRunV1,
  action: 'cancel' | 'retry',
  key: string
) => {
  const input: AuditArchiveRunCommandV1 = {
    version: 1,
    expectedRevision: run.revision,
  }
  return (
    await request.post<AuditArchiveRunV1>(
      `${runPath(run.id)}/${action}`,
      input,
      commandHeaders(key)
    )
  ).data
}

export const fetchAuditArchiveBatches = async (
  runId: string,
  params: AuditArchiveRunListQueryV1
) =>
  (
    await request.get<AuditArchiveBatchPageV1>(`${runPath(runId)}/batches`, {
      params,
    })
  ).data

export const getAuditArchiveBatch = async (runId: string, batchId: string) =>
  (
    await request.get<AuditArchiveBatchV1>(
      `${runPath(runId)}/batches/${encodeURIComponent(batchId)}`
    )
  ).data

export const fetchAuditArchiveEvents = async (
  runId: string,
  params: AuditArchiveRunListQueryV1
) =>
  (
    await request.get<AuditArchiveEventPageV1>(`${runPath(runId)}/events`, {
      params,
    })
  ).data

export const downloadAuditArchiveBatch = async (
  runId: string,
  batchId: string
) => {
  const response = await request.get<ArrayBuffer>(
    `${runPath(runId)}/batches/${encodeURIComponent(batchId)}/download`,
    { responseType: 'arraybuffer' }
  )
  const mimeType = String(response.headers['content-type'] || '')
  const contentDisposition = String(
    response.headers['content-disposition'] || ''
  )
  return {
    blob: new Blob([response.data], { type: mimeType }),
    mimeType,
    contentDisposition,
    sha256: String(response.headers['x-content-sha256'] || ''),
    size: String(response.headers['content-length'] || ''),
  }
}
