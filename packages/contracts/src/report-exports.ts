import { onlyKeys, record, text, positiveInteger, invalid } from './schemas'
import { parseReportingQuery } from './reporting'
import type { Json } from './schemas'
import type {
  ReportingDefinitionV1,
  ReportingQueryV1,
  ReportingVisibleField,
} from './reporting'

export const REPORT_EXPORT_PERMISSIONS = {
  list: 'report:export:list',
  create: 'report:export:create',
  cancel: 'report:export:cancel',
  retry: 'report:export:retry',
  archive: 'report:export:archive',
  download: 'report:export:download',
} as const
export const REPORT_EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const
type ExportOption<T extends readonly string[]> = T[number]
export type ReportExportFormat = ExportOption<typeof REPORT_EXPORT_FORMATS>
export const REPORT_EXPORT_MAX_ROWS = 2000
export const REPORT_EXPORT_MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
export const REPORT_EXPORT_MAX_FILE_BYTES = 10 * 1024 * 1024
export const REPORT_EXPORT_ACTIVE_RETENTION_DAYS = 7
export const REPORT_EXPORT_ARCHIVE_RETENTION_DAYS = 365
export const REPORT_EXPORT_PRODUCER_VERSION = 2

export interface ReportExportCreate {
  definitionVersionId: string
  query: ReportingQueryV1
  format: ReportExportFormat
}
export const parseReportExportCreate = (input: unknown): ReportExportCreate => {
  const body = record(input)
  onlyKeys(body, ['definitionVersionId', 'query', 'format'])
  if (!REPORT_EXPORT_FORMATS.includes(body.format as ReportExportFormat))
    invalid('format', '导出格式必须来自登记目录')
  return {
    definitionVersionId: text(
      body.definitionVersionId,
      'definitionVersionId',
      100
    ),
    query: parseReportingQuery(body.query),
    format: body.format as ReportExportFormat,
  }
}
export const parseReportExportCommand = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, ['expectedRevision'])
  return { expectedRevision: positiveInteger(body.expectedRevision) }
}
export const parseReportExportArchive = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, ['archived', 'expectedRevision'])
  if (typeof body.archived !== 'boolean')
    invalid('archived', '归档状态必须明确为布尔值')
  return {
    archived: body.archived as boolean,
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}

/** Trusted server capture; clients never supply rows, counts, scan or completion facts. */
export interface ReportingExportSnapshot {
  version: 1
  /** Absent in original plans; their rendering recipe remains version 1. */
  producerVersion?: 1 | 2
  definitionId: string
  definitionVersionId: string
  definitionVersion: number
  schema: ReportingDefinitionV1
  sourceReleaseId: string
  sourceReleaseVersion: number
  policyVersion: 1
  query: ReportingQueryV1
  queriedAt: string
  dataCutoffAt: string
  columns: ReportingVisibleField[]
  rows: {
    id: string
    values: Record<string, Json>
    hiddenFieldKeys?: string[]
  }[]
  total: number
}
export interface ReportingExportCapability {
  format: ReportExportFormat
  available: boolean
  reason: string | null
}
export type ReportingExportStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'infected'
export type ReportingExportStage =
  | 'queued'
  | 'rendering'
  | 'scanning'
  | 'completed'
  | 'stopped'
export interface ReportingExportArtifact {
  id: string
  fileName: string
  mimeType: string
  status: 'ready' | 'quarantined' | 'expired'
  size: number | null
  sha256: string | null
  scanEngine: string
  scannedAt: string
  createdAt: string
  expiresAt: string
  expiredAt: string | null
}
export interface ReportingExportEvent {
  id: string
  action: string
  actorId: string | null
  occurredAt: string
  detail: Record<string, Json>
}
export interface ReportingExportJob {
  id: string
  definitionVersionId: string
  definitionId: string
  reportName: string
  sourceReleaseId: string
  sourceReleaseVersion: number
  format: ReportExportFormat
  query: ReportingQueryV1 | null
  status: ReportingExportStatus
  stage: ReportingExportStage
  revision: number
  createdBy: string
  createdAt: string
  updatedAt: string
  totalRows: number | null
  processedRows: number | null
  attempts: number
  nextAttemptAt: string
  leaseUntil: string | null
  errorCode: string | null
  errorMessage: string | null
  archivedAt: string | null
  restricted: boolean
  allowedActions: ('cancel' | 'retry' | 'archive' | 'unarchive' | 'download')[]
  artifact: ReportingExportArtifact | null
  events?: ReportingExportEvent[]
}
