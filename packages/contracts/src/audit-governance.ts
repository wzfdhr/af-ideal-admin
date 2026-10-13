import { invalid, onlyKeys, positiveInteger, record } from './schemas'
import { parseAuditQuery } from './audit'
import type {
  AuditActorField,
  AuditEventRecordV1,
  AuditOperatorV1,
  AuditQueryV1,
} from './audit'

export const AUDIT_EXPORT_VERSION = 1 as const
export const AUDIT_EXPORT_PRODUCER_VERSION = 1 as const
export const AUDIT_EXPORT_PROJECTION_VERSION = 1 as const
export const AUDIT_EXPORT_PERMISSIONS = {
  list: 'audit:export:list',
  create: 'audit:export:create',
  cancel: 'audit:export:cancel',
  retry: 'audit:export:retry',
  archive: 'audit:export:archive',
  download: 'audit:export:download',
} as const
export const AUDIT_RETENTION_PERMISSIONS = {
  manage: 'audit:retention:manage',
} as const
export const AUDIT_EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const
export const AUDIT_EXPORT_MAX_ROWS = 2000
export const AUDIT_EXPORT_MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
export const AUDIT_EXPORT_MAX_FILE_BYTES = 10 * 1024 * 1024
/** Operational artifact defaults only; these do not prescribe retention or deletion of audit event rows. */
export const AUDIT_EXPORT_ACTIVE_RETENTION_DAYS = 7
export const AUDIT_EXPORT_ARCHIVE_RETENTION_DAYS = 365
export const AUDIT_EXPORT_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'blocked',
  'cancelled',
  'infected',
  'expired',
] as const
export const AUDIT_EXPORT_STAGES = [
  'queued',
  'capturing',
  'rendering',
  'scanning',
  'completed',
  'stopped',
] as const
export const AUDIT_EXPORT_ARTIFACT_STATUSES = [
  'ready',
  'quarantined',
  'expired',
] as const
export const AUDIT_EXPORT_ALLOWED_ACTIONS = [
  'cancel',
  'retry',
  'archive',
  'unarchive',
  'download',
] as const

type AuditExportOption<T extends readonly string[]> = T[number]
export type AuditExportFormat = AuditExportOption<typeof AUDIT_EXPORT_FORMATS>
export type AuditExportStatus = AuditExportOption<typeof AUDIT_EXPORT_STATUSES>
export type AuditExportStage = AuditExportOption<typeof AUDIT_EXPORT_STAGES>
export type AuditExportArtifactStatus = AuditExportOption<
  typeof AUDIT_EXPORT_ARTIFACT_STATUSES
>
export type AuditExportAllowedAction = AuditExportOption<
  typeof AUDIT_EXPORT_ALLOWED_ACTIONS
>

const commandObject = (input: unknown, allowed: string[]) => {
  const body = record(input)
  const prototype = Object.getPrototypeOf(body)
  if (prototype !== Object.prototype && prototype !== null)
    invalid('body', '审计导出命令必须为明确的数据对象')
  Reflect.ownKeys(body).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(body, key)
    if (
      typeof key !== 'string' ||
      !allowed.includes(key) ||
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    )
      invalid('body', '审计导出命令不接受未知字段、符号、隐藏属性或访问器')
  })
  onlyKeys(body, allowed)
  if (body.version !== undefined && body.version !== AUDIT_EXPORT_VERSION)
    invalid('version', '审计导出命令仅支持v1')
  return body
}

/**
 * Reuses the actual audit filter. Current/pageSize describe the originating UI
 * query, never permission to capture only one page. The server must capture the
 * complete authorized matching set, enforce the row/byte limits, and reject an
 * oversized or incomplete capture rather than silently truncate it.
 */
export const parseAuditExportQuery = (input: unknown): AuditQueryV1 =>
  parseAuditQuery(input)
export interface AuditExportCreateV1 {
  version: 1
  query: AuditQueryV1
  format: AuditExportFormat
}
export const parseAuditExportCreate = (input: unknown): AuditExportCreateV1 => {
  const body = commandObject(input, ['version', 'query', 'format'])
  if (
    typeof body.format !== 'string' ||
    !AUDIT_EXPORT_FORMATS.includes(body.format as AuditExportFormat)
  )
    invalid('format', '导出格式必须为csv、xlsx或pdf')
  return {
    version: AUDIT_EXPORT_VERSION,
    query: parseAuditExportQuery(body.query),
    format: body.format as AuditExportFormat,
  }
}
export interface AuditExportRevisionCommandV1 {
  version: 1
  expectedRevision: number
}
export interface AuditExportArchiveCommandV1
  extends AuditExportRevisionCommandV1 {
  archived: boolean
}
export const parseAuditExportCommand = (
  input: unknown
): AuditExportRevisionCommandV1 => {
  const body = commandObject(input, ['version', 'expectedRevision'])
  return {
    version: AUDIT_EXPORT_VERSION,
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}
export const parseAuditExportCancel = parseAuditExportCommand
export const parseAuditExportRetry = parseAuditExportCommand
export const parseAuditExportArchive = (
  input: unknown
): AuditExportArchiveCommandV1 => {
  const body = commandObject(input, ['version', 'expectedRevision', 'archived'])
  if (typeof body.archived !== 'boolean')
    invalid('archived', '归档状态必须明确为布尔值')
  return {
    version: AUDIT_EXPORT_VERSION,
    expectedRevision: positiveInteger(body.expectedRevision),
    archived: body.archived as boolean,
  }
}

/**
 * Trusted server capture only. There is intentionally no client snapshot parser.
 * Each row carries its captured current actor-field projection; current access
 * must be revalidated independently before revealing metadata or artifact bytes.
 * Row count and serialized UTF-8 size are computed and bounded by the server.
 */
export interface AuditExportSnapshotV1 {
  readonly version: 1
  readonly producerVersion: 1
  readonly projectionVersion: 1
  readonly source: 'server'
  readonly query: Readonly<AuditQueryV1>
  readonly queriedAt: string
  readonly dataCutoffAt: string
  readonly rows: readonly AuditEventRecordV1[]
  readonly total: number
}
export interface AuditExportCapabilityV1 {
  readonly format: AuditExportFormat
  readonly available: boolean
  readonly reason: string | null
}
export interface AuditExportActorProjectionV1 {
  /** The original actor with the viewer's current masking, never a borrowed publisher identity. */
  readonly operator: AuditOperatorV1
  readonly visibleFields: readonly AuditActorField[]
  readonly hiddenFields: readonly AuditActorField[]
}
export interface AuditExportArtifactV1 {
  readonly id: string
  readonly jobId: string
  readonly format: AuditExportFormat
  readonly fileName: string
  readonly mimeType: string
  readonly status: AuditExportArtifactStatus
  readonly size: number | null
  readonly sha256: string | null
  readonly scanEngine: string | null
  readonly scannedAt: string | null
  readonly createdAt: string
  readonly expiresAt: string
  readonly expiredAt: string | null
}
export interface AuditExportEventV1 extends AuditExportActorProjectionV1 {
  readonly id: string
  readonly jobId: string
  readonly source: 'server'
  readonly projectionVersion: 1
  readonly action: string
  readonly occurredAt: string
  readonly traceId: string
  /** Registered operational fields only, without freeform failure text or snapshot rows. */
  readonly detail: Readonly<{
    code?: string
    stage?: AuditExportStage
    attempt?: number
    archived?: boolean
  }>
}
export interface AuditExportJobV1 extends AuditExportActorProjectionV1 {
  readonly version: 1
  readonly id: string
  readonly source: 'server'
  readonly producerVersion: 1
  readonly projectionVersion: 1
  readonly format: AuditExportFormat
  readonly query: Readonly<AuditQueryV1> | null
  readonly status: AuditExportStatus
  readonly stage: AuditExportStage
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly queriedAt: string | null
  readonly dataCutoffAt: string | null
  readonly totalRows: number | null
  readonly processedRows: number | null
  readonly attempts: number
  readonly nextAttemptAt: string
  readonly leaseUntil: string | null
  readonly errorCode: string | null
  /** A bounded registered public message, not raw renderer, database or scanner error text. */
  readonly errorMessage: string | null
  readonly archivedAt: string | null
  readonly retentionUntil: string
  readonly expiredAt: string | null
  readonly restricted: boolean
  readonly allowedActions: readonly AuditExportAllowedAction[]
  readonly artifact: AuditExportArtifactV1 | null
  readonly events?: readonly AuditExportEventV1[]
}
export interface AuditExportJobPageV1 {
  readonly version: 1
  readonly source: 'server'
  readonly projectionVersion: 1
  readonly list: readonly AuditExportJobV1[]
  readonly total: number
  readonly current: number
  readonly pageSize: number
}
