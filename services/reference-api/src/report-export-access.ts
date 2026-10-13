import {
  DomainError,
  REPORT_EXPORT_PERMISSIONS as E,
  REPORTING_PERMISSIONS as P,
  withSelfServicePermissions,
} from '@af-admin/contracts'
import { hasPermission, requirePermission } from '@af-admin/workflow-core'
import { rows, one, contentHash } from './support'
import { locateReportingVersion, requireReportingEnabled } from './reporting'
import {
  scheduleExportGrant,
  assertScheduleRecipient,
  hasScheduleExportGrant,
} from './report-schedules-grants'
import {
  captureReportingSource,
  assertReportingMapping,
  assertReportingFields,
  reportingFieldAvailable,
} from './report-source'
import type {
  ReportingExportSnapshot,
  ReportingExportJob,
  ReportingExportArtifact,
  ReportingExportEvent,
  ReportExportFormat,
  ReportingQueryV1,
  UserRole,
  JsonObject,
} from '@af-admin/contracts'
import type { Actor } from './auth'
import type { Database, FactActor } from './support'
import type { ReportingFieldMap } from './report-source'
import type { ReportExportAuthorizationRow } from './report-query'

export interface ReportExportJobRow {
  tenant_id: string
  id: string
  definition_id: string
  definition_version_id: string
  source_application_id: string
  source_release_id: string
  source_release_version: number
  created_by: string
  report_name: string
  format: ReportExportFormat
  query: ReportingQueryV1
  snapshot: ReportingExportSnapshot
  snapshot_hash: string
  field_bindings: ReportingFieldMap
  authorization_manifest: ReportExportAuthorizationRow[]
  object_key: string
  total_rows: number
  processed_rows: number
  status: ReportingExportJob['status']
  stage: ReportingExportJob['stage']
  revision: number
  attempts: number
  next_attempt_at: Date
  claimed_by: string | null
  lease_until: Date | null
  error_code: string | null
  error_message: string | null
  artifact_id: string | null
  archived_at: Date | null
  retention_until: Date
  created_at: Date
  updated_at: Date
  completed_at: Date | null
}
export interface ReportExportArtifactRow {
  tenant_id: string
  id: string
  job_id: string
  object_key: string
  file_name: string
  mime_type: string
  size: number
  sha256: string
  status: ReportingExportArtifact['status']
  scan_engine: string
  scanned_at: Date
  created_at: Date
  expires_at: Date
  expired_at: Date | null
  purged_at: Date | null
}
export const reportExportFactActor = (
  job: ReportExportJobRow,
  traceId: string
): FactActor => ({
  tenantId: job.tenant_id,
  userId: null,
  name: '报表导出服务',
  traceId,
})
export const reportExportPrincipal = async (
  db: Database,
  tenantId: string,
  userId: string,
  traceId: string
): Promise<Actor> => {
  const selected = await rows<{
    name: string
    department_name: string
    role: UserRole
    permissions: string[]
    session_epoch: number
  }>(
    db,
    "SELECT COALESCE(m.display_name,u.name) AS name,COALESCE(d.department_name,m.department_name) AS department_name,m.role,m.session_epoch,af_effective_permissions(m.tenant_id,m.user_id) AS permissions FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id LEFT JOIN departments d ON d.tenant_id=m.tenant_id AND d.id=m.department_id AND d.deleted_at IS NULL WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled' FOR SHARE OF m,u,t",
    [tenantId, userId]
  )
  if (!selected.length)
    throw new DomainError(
      403,
      'REPORT_EXPORT_ORIGIN_UNAVAILABLE',
      '导出原创建者当前不可用'
    )
  const value = selected[0]
  // Background principal is never passed to session-authorizedTransaction.
  return {
    tenantId,
    userId,
    traceId,
    name: value.name,
    department: value.department_name,
    role: value.role,
    permissions: withSelfServicePermissions(value.permissions),
    sessionEpoch: value.session_epoch,
    sessionHash: '',
  }
}
export const reportExportMetadataScope = async (
  db: Database,
  actor: Actor,
  creator: string,
  permission: string
) => {
  requirePermission(actor.permissions, permission)
  const value = one(
    await rows<{ visible: boolean }>(
      db,
      'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
      [actor.tenantId, actor.userId, permission, creator]
    )
  )
  if (!value.visible) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
export const locateReportExport = async (
  db: Database,
  actor: Actor,
  id: string,
  permission: string,
  lock = false
) => {
  const job = one(
    await rows<ReportExportJobRow>(
      db,
      `SELECT * FROM report_export_jobs WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [actor.tenantId, id]
    )
  )
  try {
    await reportExportMetadataScope(db, actor, job.created_by, permission)
  } catch (error) {
    if (
      !(error instanceof DomainError) ||
      error.status !== 404 ||
      ![E.list, E.download].includes(permission as typeof E.list) ||
      !(await hasScheduleExportGrant(db, actor, job.id))
    )
      throw error
  }
  return job
}

/** Checks captured IDs and captured cells. It never reapplies the current date/status/keyword filter. */
export const assertReportExportSnapshotAccess = async (
  db: Database,
  actor: Actor,
  job: ReportExportJobRow
) => {
  requirePermission(actor.permissions, P.query)
  if (
    job.snapshot.producerVersion !== undefined &&
    job.snapshot.producerVersion !== 1 &&
    job.snapshot.producerVersion !== 2
  )
    throw new DomainError(
      409,
      'REPORT_EXPORT_SNAPSHOT_INVALID',
      '导出快照生产器版本不受支持'
    )
  const { version, definition } = await locateReportingVersion(
    db,
    actor,
    job.definition_version_id
  )
  requireReportingEnabled(definition)
  const snapshotIds = job.snapshot.rows.map((row) => row.id)
  const manifestIds = job.authorization_manifest.map((row) => row.id)
  const keys = job.snapshot.columns.map((column) => column.key)
  const capturedKeys = new Set(
    job.authorization_manifest.flatMap((identity) => identity.allowedFieldKeys)
  )
  const validManifest = job.authorization_manifest.every(
    (identity, index) =>
      identity.id === snapshotIds[index] &&
      typeof identity.applicantId === 'string' &&
      Array.isArray(identity.allowedFieldKeys) &&
      new Set(identity.allowedFieldKeys).size ===
        identity.allowedFieldKeys.length &&
      identity.allowedFieldKeys.every(
        (key) =>
          keys.includes(key) &&
          !job.snapshot.rows[index].hiddenFieldKeys?.includes(key)
      ) &&
      keys.every(
        (key) =>
          identity.allowedFieldKeys.includes(key) ||
          job.snapshot.rows[index].hiddenFieldKeys?.includes(key)
      )
  )
  if (
    contentHash(job.snapshot) !== job.snapshot_hash ||
    job.snapshot.total !== job.total_rows ||
    job.snapshot.rows.length !== job.total_rows ||
    job.authorization_manifest.length !== job.total_rows ||
    new Set(snapshotIds).size !== job.total_rows ||
    new Set(manifestIds).size !== job.total_rows ||
    !validManifest ||
    job.snapshot.definitionId !== job.definition_id ||
    job.snapshot.definitionVersionId !== job.definition_version_id ||
    job.snapshot.definitionVersion !== version.version ||
    job.snapshot.sourceReleaseId !== job.source_release_id ||
    job.snapshot.sourceReleaseVersion !== job.source_release_version ||
    contentHash(job.snapshot.schema) !== contentHash(version.schema_snapshot) ||
    version.source_release_id !== job.source_release_id ||
    version.source_release_version !== job.source_release_version ||
    version.source_application_id !== job.source_application_id
  )
    throw new DomainError(
      409,
      'REPORT_EXPORT_SNAPSHOT_INVALID',
      '导出快照完整性检查失败'
    )
  const source = await captureReportingSource(
    db,
    actor,
    job.source_application_id,
    job.source_release_id
  )
  assertReportingMapping(source, job.field_bindings)
  // Query metadata is exported too: revoked private search/sort capabilities stay denied.
  assertReportingFields(source, actor, [job.query.sort.field])
  if (job.query.keyword)
    assertReportingFields(source, actor, job.query.searchFields)
  const fields = job.snapshot.columns.map((column) => {
    const field = source.fields.find((value) => value.key === column.key)
    if (
      !field ||
      !field.supported ||
      (capturedKeys.has(column.key) && !reportingFieldAvailable(actor, field))
    )
      throw new DomainError(
        403,
        'REPORT_EXPORT_FIELD_FORBIDDEN',
        '导出快照字段当前不可读取'
      )
    return field
  })
  const params: unknown[] = [
    actor.tenantId,
    actor.userId,
    job.source_release_id,
    JSON.stringify(job.authorization_manifest),
  ]
  const bind = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }
  const cellConditions = fields
    .filter((field) => field.permission)
    .map((field) => {
      const key = bind(field.key)
      const permission = bind(field.permission)
      const predicate = field.memberField
        ? `af_member_field_visible($1,$2,${permission},r.applicant_id,${bind(
            field.memberField
          )})`
        : `af_member_scope_visible($1,$2,${permission},r.applicant_id)`
      return `(NOT (captured."allowedFieldKeys" ? ${key}) OR ${predicate})`
    })
  const checked = one(
    await rows<{ allowed: boolean }>(
      db,
      `SELECT NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($4::jsonb) AS captured(id text,"applicantId" text,"allowedFieldKeys" jsonb) LEFT JOIN business_records r ON r.tenant_id=$1 AND r.id=captured.id WHERE r.id IS NULL OR r.application_release_id IS DISTINCT FROM $3 OR r.applicant_id IS DISTINCT FROM captured."applicantId" OR r.record_kind<>'generic' OR NOT af_record_visible($1,$2,r.id)${
        cellConditions.length ? ` OR NOT (${cellConditions.join(' AND ')})` : ''
      }) AS allowed`,
      params
    )
  )
  if (!checked.allowed)
    throw new DomainError(
      403,
      'REPORT_EXPORT_RECORD_FORBIDDEN',
      '导出快照中的记录或字段当前不可读取'
    )
}
export const assertReportExportOrigin = async (
  db: Database,
  job: ReportExportJobRow,
  traceId: string
) => {
  const origin = await reportExportPrincipal(
    db,
    job.tenant_id,
    job.created_by,
    traceId
  )
  requirePermission(origin.permissions, E.create)
  await assertReportExportSnapshotAccess(db, origin, job)
  const grant = await scheduleExportGrant(db, job.tenant_id, job.id)
  if (grant) {
    if (grant.created_by !== origin.userId)
      throw new DomainError(
        409,
        'REPORT_EXPORT_SNAPSHOT_INVALID',
        '定时导出原主体绑定冲突'
      )
    const receiver = await reportExportPrincipal(
      db,
      job.tenant_id,
      grant.recipient_user_id,
      traceId
    )
    await assertScheduleRecipient(db, origin, receiver, grant.schema_snapshot)
    await assertReportExportSnapshotAccess(db, receiver, job)
  }
  return origin
}
export const reportExportArtifact = async (
  db: Database,
  job: ReportExportJobRow
) => {
  const artifacts = await rows<ReportExportArtifactRow>(
    db,
    'SELECT * FROM report_export_artifacts WHERE tenant_id=$1 AND job_id=$2',
    [job.tenant_id, job.id]
  )
  return artifacts[0] || null
}
export const appendReportExportEvent = async (
  db: Database,
  actor: FactActor,
  jobId: string,
  action: string,
  detail: JsonObject = {}
) => {
  await db.query(
    'INSERT INTO report_export_events(tenant_id,id,job_id,action,actor_id,actor_name,detail) VALUES($1,gen_random_uuid()::text,$2,$3,$4,$5,$6)',
    [
      actor.tenantId,
      jobId,
      action,
      actor.userId,
      actor.name,
      JSON.stringify(detail),
    ]
  )
}
export const reportExportDto = async (
  db: Database,
  actor: Actor,
  job: ReportExportJobRow,
  detail = false
): Promise<ReportingExportJob> => {
  let restricted = false
  let originAllowed = false
  try {
    await assertReportExportOrigin(db, job, actor.traceId)
    originAllowed = true
    await assertReportExportSnapshotAccess(db, actor, job)
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    restricted = true
  }
  const artifact = await reportExportArtifact(db, job)
  const live = job.retention_until > new Date()
  const allowedActions: ReportingExportJob['allowedActions'] = []
  const scoped = async (permission: string) =>
    hasPermission(actor.permissions, permission) &&
    one(
      await rows<{ visible: boolean }>(
        db,
        'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
        [actor.tenantId, actor.userId, permission, job.created_by]
      )
    ).visible
  if (
    ['queued', 'processing', 'failed', 'blocked'].includes(job.status) &&
    (await scoped(E.cancel))
  )
    allowedActions.push('cancel')
  if (
    ['failed', 'blocked'].includes(job.status) &&
    job.attempts < 5 &&
    live &&
    originAllowed &&
    (await scoped(E.retry))
  )
    allowedActions.push('retry')
  if (
    job.status !== 'processing' &&
    job.status !== 'queued' &&
    (await scoped(E.archive))
  )
    allowedActions.push(job.archived_at ? 'unarchive' : 'archive')
  if (
    !restricted &&
    live &&
    job.status === 'completed' &&
    artifact?.status === 'ready' &&
    artifact.expires_at > new Date() &&
    ((await scoped(E.download)) ||
      (await hasScheduleExportGrant(db, actor, job.id)))
  )
    allowedActions.push('download')
  const result: ReportingExportJob = {
    id: job.id,
    definitionId: job.definition_id,
    definitionVersionId: job.definition_version_id,
    reportName: job.report_name,
    sourceReleaseId: job.source_release_id,
    sourceReleaseVersion: job.source_release_version,
    format: job.format,
    query: restricted ? null : job.query,
    status: job.status,
    stage: job.stage,
    revision: job.revision,
    createdBy: job.created_by,
    createdAt: job.created_at.toISOString(),
    updatedAt: job.updated_at.toISOString(),
    totalRows: restricted ? null : job.total_rows,
    processedRows: restricted ? null : job.processed_rows,
    attempts: job.attempts,
    nextAttemptAt: job.next_attempt_at.toISOString(),
    leaseUntil: job.lease_until?.toISOString() || null,
    errorCode: job.error_code,
    errorMessage:
      restricted && job.error_message
        ? '导出执行受限，详情仅向当前具有来源数据权限的成员开放'
        : job.error_message,
    archivedAt: job.archived_at?.toISOString() || null,
    restricted,
    allowedActions,
    artifact: artifact
      ? {
          id: artifact.id,
          fileName: artifact.file_name,
          mimeType: artifact.mime_type,
          status: artifact.status,
          size: restricted ? null : artifact.size,
          sha256: restricted ? null : artifact.sha256,
          scanEngine: artifact.scan_engine,
          scannedAt: artifact.scanned_at.toISOString(),
          createdAt: artifact.created_at.toISOString(),
          expiresAt: artifact.expires_at.toISOString(),
          expiredAt: artifact.expired_at?.toISOString() || null,
        }
      : null,
  }
  if (detail)
    result.events = (
      await rows<{
        id: string
        action: string
        actor_id: string | null
        detail: JsonObject
        created_at: Date
      }>(
        db,
        'SELECT * FROM report_export_events WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,id',
        [job.tenant_id, job.id]
      )
    ).map(
      (event): ReportingExportEvent => ({
        id: event.id,
        action: event.action,
        actorId: event.actor_id,
        occurredAt: event.created_at.toISOString(),
        detail: restricted
          ? Object.fromEntries(
              Object.entries(event.detail).filter(([key]) =>
                ['code', 'stage', 'attempt', 'archived'].includes(key)
              )
            )
          : event.detail,
      })
    )
  return result
}
