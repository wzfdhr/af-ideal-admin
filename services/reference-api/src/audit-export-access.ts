import { randomUUID } from 'node:crypto'
import {
  DomainError,
  AUDIT_EXPORT_PERMISSIONS as P,
  AUDIT_PERMISSIONS,
  withSelfServicePermissions,
  parseAuditQuery,
} from '@af-admin/contracts'
import { requirePermission, hasPermission } from '@af-admin/workflow-core'
import {
  rows,
  one,
  contentHash,
  contentCanonical,
  audit,
  sequential,
} from './support'
import {
  recheckAuditEventIds,
  assertAuditIdentityQueryAccess,
} from './audit-query'
import type { Actor } from './auth'
import type { Database, FactActor } from './support'
import type {
  AuditExportSnapshotV1,
  AuditExportJobV1,
  AuditExportArtifactV1,
  AuditExportEventV1,
  AuditExportStatus,
  AuditExportStage,
  AuditQueryV1,
  UserRole,
} from '@af-admin/contracts'

export interface AuditExportJobRow {
  tenant_id: string
  id: string
  created_by: string
  created_name: string
  format: 'csv' | 'xlsx' | 'pdf'
  query: AuditQueryV1
  snapshot: AuditExportSnapshotV1
  snapshot_canonical: string
  snapshot_hash: string
  event_ids: string[]
  object_key: string
  total_rows: number
  processed_rows: number
  status: AuditExportStatus
  stage: AuditExportStage
  revision: number
  attempts: number
  claimed_by: string | null
  lease_until: Date | null
  next_attempt_at: Date
  error_code: string | null
  error_message: string | null
  artifact_id: string | null
  archived_at: Date | null
  retention_until: Date
  expired_at: Date | null
  created_at: Date
  updated_at: Date
  completed_at: Date | null
}
export interface AuditExportArtifactRow {
  id: string
  tenant_id: string
  job_id: string
  object_key: string
  file_name: string
  mime_type: string
  size: number
  sha256: string
  status: 'ready' | 'quarantined' | 'expired'
  scan_engine: string
  scanned_at: Date
  created_at: Date
  expires_at: Date
  expired_at: Date | null
  purged_at: Date | null
}
export const auditExportPrincipal = async (
  db: Database,
  tenantId: string,
  userId: string,
  traceId: string
): Promise<Actor> => {
  const value = (
    await rows<{
      name: string
      department_name: string
      role: UserRole
      session_epoch: number
      permissions: string[]
    }>(
      db,
      "SELECT COALESCE(m.display_name,u.name) AS name,m.department_name,m.role,m.session_epoch,af_effective_permissions(m.tenant_id,m.user_id) AS permissions FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled' FOR SHARE OF m,u,t",
      [tenantId, userId]
    )
  )[0]
  if (!value)
    throw new DomainError(
      403,
      'AUDIT_EXPORT_ORIGIN_UNAVAILABLE',
      '审计导出创建者当前不可用'
    )
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
export const auditExportScope = async (
  db: Database,
  actor: Actor,
  owner: string,
  permission: string
) => {
  requirePermission(actor.permissions, permission)
  if (
    !one(
      await rows<{ visible: boolean }>(
        db,
        'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
        [actor.tenantId, actor.userId, permission, owner]
      )
    ).visible
  )
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
export const locateAuditExport = async (
  db: Database,
  actor: Actor,
  id: string,
  permission: string,
  lock = false
) => {
  const job = one(
    await rows<AuditExportJobRow>(
      db,
      `SELECT * FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ' FOR SHARE'
      }`,
      [actor.tenantId, id]
    )
  )
  await auditExportScope(db, actor, job.created_by, permission)
  return job
}
export const auditExportFactActor = (
  job: Pick<AuditExportJobRow, 'tenant_id'>,
  traceId: string
): FactActor => ({
  tenantId: job.tenant_id,
  userId: null,
  name: '审计导出服务',
  traceId,
})
export const appendAuditExportEvent = async (
  db: Database,
  actor: FactActor,
  id: string,
  action: string,
  detail: Record<string, string | number | boolean | null> = {},
  failed = false
) => {
  await db.query(
    'INSERT INTO audit_export_events(tenant_id,id,job_id,action,actor_id,actor_name,trace_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      actor.tenantId,
      randomUUID(),
      id,
      action,
      actor.userId,
      actor.name,
      actor.traceId,
      JSON.stringify(detail),
    ]
  )
  await audit(
    db,
    actor,
    'audit-export',
    `audit-export.${action}`,
    'audit-export',
    id,
    failed ? 'failure' : 'success',
    detail
  )
}
export const assertAuditExportIntegrity = (job: AuditExportJobRow) => {
  const { snapshot } = job
  if (
    !snapshot ||
    snapshot.version !== 1 ||
    snapshot.producerVersion !== 1 ||
    snapshot.projectionVersion !== 1 ||
    snapshot.source !== 'server' ||
    !Array.isArray(snapshot.rows) ||
    !Array.isArray(job.event_ids) ||
    contentHash(parseAuditQuery(job.query)) !== contentHash(job.query) ||
    contentCanonical(snapshot) !== job.snapshot_canonical ||
    contentHash(snapshot) !== job.snapshot_hash ||
    snapshot.total !== job.total_rows ||
    contentHash(snapshot.query) !== contentHash(job.query) ||
    contentHash(snapshot.rows.map((row) => row.id)) !==
      contentHash(job.event_ids) ||
    new Set(job.event_ids).size !== job.event_ids.length
  )
    throw new DomainError(
      409,
      'AUDIT_EXPORT_SNAPSHOT_INVALID',
      '审计导出快照完整性校验失败'
    )
}
/** Recheck only captured IDs/cells, independent of later matching facts or changed UI filters. */
export const assertAuditExportSnapshotAccess = async (
  db: Database,
  actor: Actor,
  job: AuditExportJobRow
) => {
  if (actor.tenantId !== job.tenant_id)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  requirePermission(actor.permissions, AUDIT_PERMISSIONS.read)
  assertAuditExportIntegrity(job)
  await assertAuditIdentityQueryAccess(db, actor, job.query, job.created_by)
  const current = await recheckAuditEventIds(
    db,
    actor,
    job.event_ids,
    job.query.timeZone
  )
  const byId = new Map(current.list.map((row) => [row.id, row]))
  if (current.total !== job.total_rows || byId.size !== job.total_rows)
    throw new DomainError(
      403,
      'AUDIT_EXPORT_SCOPE_CHANGED',
      '当前审计范围不再覆盖捕获事实'
    )
  job.snapshot.rows.forEach((captured) => {
    const visible = byId.get(captured.id)
    if (!visible)
      throw new DomainError(
        403,
        'AUDIT_EXPORT_SCOPE_CHANGED',
        '当前审计范围不再覆盖捕获事实'
      )
    const oldOperator = captured.operator
    const newOperator = visible.operator
    const oldTarget = captured.target
    const newTarget = visible.target
    const fixed = (row: typeof captured) => ({
      id: row.id,
      source: row.source,
      projectionVersion: row.projectionVersion,
      module: row.module,
      action: row.action,
      eventType: row.eventType,
      result: row.result,
      traceId: row.traceId,
      occurredAt: row.occurredAt,
      detail: row.detail,
    })
    const oldFact = fixed(captured)
    const newFact = fixed(visible)
    if (
      contentHash(oldFact) !== contentHash(newFact) ||
      oldTarget.type !== newTarget.type ||
      (oldTarget.id !== null && oldTarget.id !== newTarget.id)
    )
      throw new DomainError(
        403,
        'AUDIT_EXPORT_PROJECTION_CHANGED',
        '当前审计投影不再覆盖捕获事实'
      )
    ;(['id', 'name', 'role'] as const).forEach((key) => {
      if (
        oldOperator[key] !== undefined &&
        oldOperator[key] !== null &&
        oldOperator[key] !== newOperator[key]
      )
        throw new DomainError(
          403,
          'AUDIT_EXPORT_FIELD_CHANGED',
          '当前审计字段权限不再覆盖已捕获字段'
        )
    })
  })
}
export const assertAuditExportOrigin = async (
  db: Database,
  job: AuditExportJobRow,
  traceId: string
) => {
  const origin = await auditExportPrincipal(
    db,
    job.tenant_id,
    job.created_by,
    traceId
  )
  await auditExportScope(db, origin, job.created_by, P.create)
  await assertAuditExportSnapshotAccess(db, origin, job)
  return origin
}
export const auditExportArtifact = async (
  db: Database,
  job: AuditExportJobRow
) =>
  job.artifact_id
    ? one(
        await rows<AuditExportArtifactRow>(
          db,
          'SELECT * FROM audit_export_artifacts WHERE tenant_id=$1 AND job_id=$2 AND id=$3',
          [job.tenant_id, job.id, job.artifact_id]
        )
      )
    : null
const actorProjection = async (
  db: Database,
  actor: Actor,
  userId: string | null,
  name: string,
  permission: string
) => {
  const shown = userId
    ? one(
        await rows<{ id: boolean; name: boolean }>(
          db,
          "SELECT af_member_field_visible($1,$2,$3,$4,'username') AS id,af_member_field_visible($1,$2,$3,$4,'name') AS name",
          [actor.tenantId, actor.userId, permission, userId]
        )
      )
    : { id: false, name: false }
  const visibleFields: ('operator.id' | 'operator.name')[] = []
  const hiddenFields: ('operator.id' | 'operator.name')[] = []
  ;(['id', 'name'] as const).forEach((key) =>
    (shown[key] ? visibleFields : hiddenFields).push(`operator.${key}`)
  )
  return {
    operator: { id: shown.id ? userId : null, name: shown.name ? name : null },
    visibleFields,
    hiddenFields,
  }
}
const eventDetail = (
  input: AuditExportEventV1['detail']
): AuditExportEventV1['detail'] => {
  const detail: {
    code?: string
    stage?: AuditExportStage
    attempt?: number
    archived?: boolean
  } = {}
  if (
    typeof input.code === 'string' &&
    /^[A-Z][A-Z0-9_]{0,99}$/.test(input.code)
  )
    detail.code = input.code
  if (
    input.stage &&
    [
      'queued',
      'capturing',
      'rendering',
      'scanning',
      'completed',
      'stopped',
    ].includes(input.stage)
  )
    detail.stage = input.stage
  if (
    typeof input.attempt === 'number' &&
    Number.isSafeInteger(input.attempt) &&
    input.attempt >= 0 &&
    input.attempt <= 5
  )
    detail.attempt = input.attempt
  if (typeof input.archived === 'boolean') detail.archived = input.archived
  return detail
}
export const auditExportDto = async (
  db: Database,
  actor: Actor,
  job: AuditExportJobRow,
  permission: string,
  detail = false
): Promise<AuditExportJobV1> => {
  let restricted = false
  try {
    await assertAuditExportOrigin(db, job, actor.traceId)
    await assertAuditExportSnapshotAccess(db, actor, job)
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    restricted = true
  }
  const now = one(
    await rows<{ time: Date }>(db, 'SELECT clock_timestamp() AS time')
  ).time
  const alive = !job.expired_at && job.retention_until > now
  const allowedActions: AuditExportJobV1['allowedActions'][number][] = []
  const can = async (code: string) =>
    hasPermission(actor.permissions, code) &&
    one(
      await rows<{ visible: boolean }>(
        db,
        'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
        [actor.tenantId, actor.userId, code, job.created_by]
      )
    ).visible
  if (alive) {
    if (
      ['queued', 'processing', 'failed', 'blocked'].includes(job.status) &&
      (await can(P.cancel))
    )
      allowedActions.push('cancel')
    if (
      !restricted &&
      ['failed', 'blocked'].includes(job.status) &&
      job.attempts < 5 &&
      (await can(P.retry))
    )
      allowedActions.push('retry')
    if (await can(P.archive))
      allowedActions.push(job.archived_at ? 'unarchive' : 'archive')
    if (!restricted && job.status === 'completed' && (await can(P.download)))
      allowedActions.push('download')
  }
  let artifact: AuditExportArtifactV1 | null = null
  if (!restricted) {
    const stored = await auditExportArtifact(db, job)
    if (stored)
      artifact = {
        id: stored.id,
        jobId: job.id,
        format: job.format,
        fileName: stored.file_name,
        mimeType: stored.mime_type,
        status: stored.status,
        size: stored.size,
        sha256: stored.sha256,
        scanEngine: stored.scan_engine,
        scannedAt: stored.scanned_at.toISOString(),
        createdAt: stored.created_at.toISOString(),
        expiresAt: stored.expires_at.toISOString(),
        expiredAt: stored.expired_at?.toISOString() || null,
      }
  }
  let events: AuditExportEventV1[] | undefined
  if (detail) {
    events = []
    await sequential(
      await rows<{
        id: string
        action: string
        actor_id: string | null
        actor_name: string
        trace_id: string
        detail: AuditExportEventV1['detail']
        created_at: Date
      }>(
        db,
        'SELECT * FROM audit_export_events WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,id',
        [job.tenant_id, job.id]
      ),
      async (row) => {
        events?.push({
          id: row.id,
          jobId: job.id,
          source: 'server',
          projectionVersion: 1,
          action: row.action,
          occurredAt: row.created_at.toISOString(),
          traceId: row.trace_id,
          ...(await actorProjection(
            db,
            actor,
            row.actor_id,
            row.actor_name,
            permission
          )),
          detail: restricted ? {} : eventDetail(row.detail),
        })
      }
    )
  }
  return {
    version: 1,
    id: job.id,
    source: 'server',
    producerVersion: 1,
    projectionVersion: 1,
    format: job.format,
    query: restricted ? null : job.query,
    status: job.status,
    stage: job.stage,
    revision: job.revision,
    ...(await actorProjection(
      db,
      actor,
      job.created_by,
      job.created_name,
      permission
    )),
    createdAt: job.created_at.toISOString(),
    updatedAt: job.updated_at.toISOString(),
    queriedAt: restricted ? null : job.snapshot.queriedAt,
    dataCutoffAt: restricted ? null : job.snapshot.dataCutoffAt,
    totalRows: restricted ? null : job.total_rows,
    processedRows: restricted ? null : job.processed_rows,
    attempts: job.attempts,
    nextAttemptAt: job.next_attempt_at.toISOString(),
    leaseUntil: job.lease_until?.toISOString() || null,
    errorCode: job.error_code,
    errorMessage: job.error_message,
    archivedAt: job.archived_at?.toISOString() || null,
    retentionUntil: job.retention_until.toISOString(),
    expiredAt: job.expired_at?.toISOString() || null,
    restricted,
    allowedActions,
    artifact,
    ...(events ? { events } : {}),
  }
}
