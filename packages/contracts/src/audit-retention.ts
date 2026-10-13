import { invalid, onlyKeys, positiveInteger, record } from './schemas'
import { parseAuditQuery } from './audit'
import { parseReportingTimeZone } from './reporting'
import {
  AUDIT_EXPORT_FORMATS,
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_EXPORT_MAX_SNAPSHOT_BYTES,
  AUDIT_EXPORT_MAX_FILE_BYTES,
} from './audit-governance'
import type {
  AuditActorField,
  AuditEventRecordV1,
  AuditOperatorV1,
  AuditQueryV1,
} from './audit'
import type {
  AuditExportArtifactV1,
  AuditExportFormat,
  AuditExportSnapshotV1,
} from './audit-governance'

export const AUDIT_RETENTION_VERSION = 1 as const
export const AUDIT_RETENTION_MIN_HOT_DAYS = 1
export const AUDIT_RETENTION_MAX_HOT_DAYS = 3650
export const AUDIT_ARCHIVE_RUN_VERSION = 1 as const
export const AUDIT_QUERY_V2_VERSION = 2 as const
export const AUDIT_ARCHIVE_BATCH_PRODUCER_VERSION = 2 as const
export const AUDIT_ARCHIVE_BATCH_MAX_ROWS = AUDIT_EXPORT_MAX_ROWS
export const AUDIT_ARCHIVE_BATCH_MAX_SNAPSHOT_BYTES =
  AUDIT_EXPORT_MAX_SNAPSHOT_BYTES
export const AUDIT_ARCHIVE_BATCH_MAX_FILE_BYTES = AUDIT_EXPORT_MAX_FILE_BYTES
/** Server resource bound; exceeding it rejects the whole capture without deleting or truncating facts. */
export const AUDIT_ARCHIVE_MAX_CANDIDATES = 100000
export const AUDIT_ARCHIVE_MAX_ATTEMPTS = 5
export const AUDIT_ARCHIVE_STATES = ['all', 'hot', 'archived'] as const
export const AUDIT_ARCHIVE_RUN_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'blocked',
  'cancelled',
] as const
export const AUDIT_ARCHIVE_BATCH_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'blocked',
  'cancelled',
  'infected',
] as const

type AuditRetentionOption<T extends readonly string[]> = T[number]
export type AuditArchiveState = AuditRetentionOption<
  typeof AUDIT_ARCHIVE_STATES
>
export type AuditArchiveRunStatus = AuditRetentionOption<
  typeof AUDIT_ARCHIVE_RUN_STATUSES
>
export type AuditArchiveBatchStatus = AuditRetentionOption<
  typeof AUDIT_ARCHIVE_BATCH_STATUSES
>

const auditQueryKeys = [
  'version',
  'current',
  'pageSize',
  'module',
  'eventType',
  'result',
  'operatorName',
  'targetId',
  'traceId',
  'from',
  'to',
  'timeZone',
]
const exactObject = (input: unknown, keys: string[], field = 'body') => {
  const body = record(input, field)
  const prototype = Object.getPrototypeOf(body)
  if (prototype !== Object.prototype && prototype !== null)
    invalid(field, '必须为明确的数据对象')
  Reflect.ownKeys(body).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(body, key)
    if (
      typeof key !== 'string' ||
      !keys.includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      invalid(field, '不接受未知字段、符号、隐藏属性或访问器')
  })
  onlyKeys(body, keys)
  return body
}
const versionOne = (body: Record<string, unknown>) => {
  if (body.version !== undefined && body.version !== 1)
    invalid('version', '该审计治理命令仅支持v1')
}
const boolean = (input: unknown, field: string): boolean => {
  if (typeof input !== 'boolean') invalid(field, '必须明确为布尔值')
  return input as boolean
}

export interface AuditRetentionPolicyUpdateV1 {
  version: 1
  expectedRevision: number
  enabled: boolean
  hotDays: number
  timeZone: string
}
/** The current authenticated command actor becomes executor; a client cannot select or restore another principal. */
export const parseAuditRetentionPolicyUpdate = (
  input: unknown
): AuditRetentionPolicyUpdateV1 => {
  const body = exactObject(input, [
    'version',
    'expectedRevision',
    'enabled',
    'hotDays',
    'timeZone',
  ])
  versionOne(body)
  if (
    typeof body.hotDays !== 'number' ||
    !Number.isSafeInteger(body.hotDays) ||
    body.hotDays < AUDIT_RETENTION_MIN_HOT_DAYS ||
    body.hotDays > AUDIT_RETENTION_MAX_HOT_DAYS
  )
    invalid('hotDays', '热数据天数必须为1至3650的整数')
  return {
    version: 1,
    expectedRevision: positiveInteger(body.expectedRevision),
    enabled: boolean(body.enabled, 'enabled'),
    hotDays: body.hotDays as number,
    timeZone: parseReportingTimeZone(body.timeZone),
  }
}

export interface AuditQueryV2 extends Omit<AuditQueryV1, 'version'> {
  version: 2
  /** Omission stays omitted. Backends may interpret it as all, but must not rewrite historical v1 query bytes. */
  archiveState?: AuditArchiveState
}
export const parseAuditQueryV2 = (input: unknown): AuditQueryV2 => {
  const body = exactObject(input, [...auditQueryKeys, 'archiveState'], 'query')
  if (body.version !== 2 && body.version !== '2')
    invalid('version', '归档状态检索必须明确使用查询v2')
  const suppliedState = Object.prototype.hasOwnProperty.call(
    body,
    'archiveState'
  )
  if (
    suppliedState &&
    (typeof body.archiveState !== 'string' ||
      !AUDIT_ARCHIVE_STATES.includes(body.archiveState as AuditArchiveState))
  )
    invalid('archiveState', '归档筛选仅支持all、hot或archived')
  const v1Input = Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== 'archiveState')
  )
  const parsed = parseAuditQuery({ ...v1Input, version: 1 })
  return {
    ...parsed,
    version: 2,
    ...(suppliedState
      ? { archiveState: body.archiveState as AuditArchiveState }
      : {}),
  }
}
export interface AuditEventPageV2 {
  readonly version: 2
  readonly source: 'server'
  readonly projectionVersion: 1
  readonly query: Readonly<AuditQueryV2>
  readonly queriedAt: string
  readonly list: readonly AuditEventRecordV1[]
  readonly total: number
  readonly current: number
  readonly pageSize: number
}

export interface AuditArchiveRunCreateV1 {
  version: 1
  query: AuditQueryV1
  format: AuditExportFormat
}
/** Creates a logical archive run, not a client-selected batch or a physical purge. */
export const parseAuditArchiveRunCreate = (
  input: unknown
): AuditArchiveRunCreateV1 => {
  const body = exactObject(input, ['version', 'query', 'format'])
  versionOne(body)
  if (
    typeof body.format !== 'string' ||
    !AUDIT_EXPORT_FORMATS.includes(body.format as AuditExportFormat)
  )
    invalid('format', '归档格式仅支持csv、xlsx或pdf')
  const query = exactObject(body.query, auditQueryKeys, 'query')
  return {
    version: 1,
    query: parseAuditQuery(query),
    format: body.format as AuditExportFormat,
  }
}
export interface AuditArchiveRunCommandV1 {
  version: 1
  expectedRevision: number
}
export const parseAuditArchiveRunCommand = (
  input: unknown
): AuditArchiveRunCommandV1 => {
  const body = exactObject(input, ['version', 'expectedRevision'])
  versionOne(body)
  return {
    version: 1,
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}
export const parseAuditArchiveRunCancel = parseAuditArchiveRunCommand
export const parseAuditArchiveRunRetry = parseAuditArchiveRunCommand

/** Operational logical archival only. Hot days never specify deletion of the original audit rows. */
export interface AuditRetentionPolicyV1 {
  readonly version: 1
  readonly source: 'server'
  readonly revision: number
  readonly enabled: boolean
  readonly hotDays: number
  readonly timeZone: string
  readonly executor: AuditOperatorV1 | null
  readonly executorVisibleFields: readonly AuditActorField[]
  readonly executorHiddenFields: readonly AuditActorField[]
  readonly updatedAt: string | null
  readonly nextRunAt: string | null
  readonly lastRunId: string | null
  readonly allowedActions: readonly 'update'[]
}
/** Stable one-based ordinals in the entire captured candidate list, not mutable HTTP page offsets. */
export interface AuditArchiveCandidateV1 {
  readonly eventId: string
  readonly ordinal: number
  readonly occurredAt: string
  readonly requiredVisibleFields: readonly AuditActorField[]
  readonly targetIdVisible: boolean
}
/** Internal trusted server capture; never accepted from client command bodies. */
export interface AuditArchiveCandidateManifestV1 {
  readonly version: 1
  readonly source: 'server'
  readonly projectionVersion: 1
  readonly runId: string
  readonly query: Readonly<AuditQueryV1>
  readonly queriedAt: string
  readonly dataCutoffAt: string
  readonly total: number
  readonly candidates: readonly AuditArchiveCandidateV1[]
}
export interface AuditArchiveCoverageV1 {
  /** Null means current authority does not permit disclosure, never an invented zero. */
  readonly candidateTotal: number | null
  readonly coveredTotal: number | null
  readonly remainingTotal: number | null
  readonly batchTotal: number | null
  readonly completedBatchTotal: number | null
}
export interface AuditArchiveOccurrenceV1 {
  readonly localDate: string
  readonly timeZone: string
  readonly boundaryAt: string
}
export interface AuditArchiveRunV1 {
  readonly version: 1
  readonly id: string
  readonly source: 'server'
  readonly projectionVersion: 1
  readonly trigger: 'manual' | 'policy'
  readonly policyRevision: number | null
  readonly occurrence: AuditArchiveOccurrenceV1 | null
  readonly executor: AuditOperatorV1
  readonly executorVisibleFields: readonly AuditActorField[]
  readonly executorHiddenFields: readonly AuditActorField[]
  readonly query: Readonly<AuditQueryV1> | null
  readonly format: AuditExportFormat
  readonly status: AuditArchiveRunStatus
  readonly revision: number
  readonly queriedAt: string | null
  readonly dataCutoffAt: string | null
  readonly candidateHash: string | null
  readonly coverage: AuditArchiveCoverageV1
  readonly attempts: number
  readonly nextAttemptAt: string
  readonly leaseUntil: string | null
  readonly errorCode: string | null
  readonly errorMessage: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly completedAt: string | null
  readonly restricted: boolean
  readonly allowedActions: readonly ('cancel' | 'retry')[]
}
export interface AuditArchiveCandidateRangeV1 {
  /** Nonempty one-based inclusive bounds; an empty candidate run needs no batch. */
  readonly firstOrdinal: number
  readonly lastOrdinal: number
}
/**
 * A distinct producer recipe must display batch/run coverage. The nested payload
 * supplies bounded immutable facts only; it must not be rendered as an ordinary
 * complete-query v1 export or silently change the producer-1 format recipe.
 */
export interface AuditArchiveBatchSnapshotV1 {
  readonly version: 1
  readonly kind: 'archive-batch'
  readonly producerVersion: 2
  readonly projectionVersion: 1
  readonly source: 'server'
  readonly runId: string
  readonly ordinal: number
  readonly candidateTotal: number
  readonly candidateRange: AuditArchiveCandidateRangeV1
  readonly snapshot: AuditExportSnapshotV1
}
export interface AuditArchiveBatchV1 {
  readonly version: 1
  readonly kind: 'archive-batch'
  readonly source: 'server'
  readonly producerVersion: 2
  readonly projectionVersion: 1
  readonly id: string
  readonly runId: string
  readonly ordinal: number
  readonly candidateRange: AuditArchiveCandidateRangeV1 | null
  readonly candidateTotal: number | null
  readonly status: AuditArchiveBatchStatus
  readonly revision: number
  readonly jobId: string | null
  readonly snapshotHash: string | null
  readonly artifact: AuditExportArtifactV1 | null
  readonly attempts: number
  readonly nextAttemptAt: string
  readonly leaseUntil: string | null
  readonly errorCode: string | null
  readonly errorMessage: string | null
  readonly createdAt: string
  readonly completedAt: string | null
  readonly restricted: boolean
}
export interface AuditArchiveEventV1 {
  readonly version: 1
  readonly projectionVersion: 1
  readonly id: string
  readonly runId: string
  readonly batchId: string | null
  readonly source: 'server'
  readonly action: string
  readonly operator: AuditOperatorV1
  readonly visibleFields: readonly AuditActorField[]
  readonly hiddenFields: readonly AuditActorField[]
  readonly occurredAt: string
  readonly traceId: string
  readonly detail: Readonly<{
    code?: string
    attempt?: number
    ordinal?: number
  }>
}
export interface AuditArchiveRunPageV1 {
  readonly version: 1
  readonly projectionVersion: 1
  readonly source: 'server'
  readonly list: readonly AuditArchiveRunV1[]
  readonly total: number
  readonly current: number
  readonly pageSize: number
}
