import { randomUUID } from 'node:crypto'
import {
  DomainError,
  AUDIT_ACTOR_FIELDS,
  parseAuditRetentionPolicyUpdate,
  parseAuditArchiveRunCreate,
  parseAuditArchiveRunCommand,
  record,
  onlyKeys,
  text,
} from '@af-admin/contracts'
import { requirePermission, assertRevision } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  authorizedTransaction,
  idempotent,
  rows,
  one,
  audit,
  contentCanonical,
  contentHash,
  sequential,
  pageQuery,
  noFault,
} from './support'
import {
  captureAuditArchiveCandidates,
  assertAuditIdentityQueryAccess,
  recheckAuditEventIds,
} from './audit-query'
import { auditExportScope } from './audit-export-access'
import { auditExportCapabilities, auditExportStore } from './audit-export-jobs'
import { fileDigest } from './file-storage'
import type { Actor } from './auth'
import type { Database, FaultInjector, FactActor } from './support'
import type { FileRuntime } from './files'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type {
  AuditArchiveRunCreateV1,
  AuditArchiveCandidateManifestV1,
  AuditArchiveCandidateV1,
  AuditArchiveBatchSnapshotV1,
  AuditArchiveRunV1,
  AuditArchiveRunStatus,
  AuditExportFormat,
  AuditQueryV1,
  AuditActorField,
  AuditEventRecordV1,
  AuditRetentionPolicyV1,
  AuditArchiveBatchV1,
  AuditExportArtifactV1,
} from '@af-admin/contracts'

export const ARCHIVE_MANAGE = 'audit:retention:manage'
export const ARCHIVE_REQUIRED = [
  ARCHIVE_MANAGE,
  'audit:read',
  'audit:export:create',
  'audit:export:archive',
] as const
export interface ArchiveRunRow {
  tenant_id: string
  id: string
  executor_id: string
  trigger: 'manual' | 'policy'
  policy_revision: number | null
  occurrence_date: string | null
  occurrence_zone: string | null
  occurrence_boundary: Date | null
  query: AuditQueryV1
  format: AuditExportFormat
  queried_at: Date
  data_cutoff_at: Date
  manifest_canonical: string
  manifest_hash: string
  candidate_total: number
  status: AuditArchiveRunStatus
  revision: number
  attempts: number
  next_attempt_at: Date
  claimed_by: string | null
  lease_until: Date | null
  error_code: string | null
  created_at: Date
  updated_at: Date
  completed_at: Date | null
}
export interface ArchiveBatchRow {
  tenant_id: string
  id: string
  run_id: string
  ordinal: number
  first_ordinal: number
  last_ordinal: number
  snapshot: AuditArchiveBatchSnapshotV1 | null
  snapshot_canonical: string | null
  snapshot_hash: string | null
  object_key: string
  status: AuditArchiveBatchV1['status']
  revision: number
  attempts: number
  next_attempt_at: Date
  claimed_by: string | null
  lease_until: Date | null
  error_code: string | null
  created_at: Date
  completed_at: Date | null
  retention_until: Date
  bytes_purged_at: Date | null
}
const denied = () =>
  new DomainError(
    403,
    'AUDIT_ARCHIVE_CURRENT_ACCESS_REQUIRED',
    '当前权限不再完整覆盖归档候选事实或字段'
  )
export const assertArchivePermissions = (actor: Actor) =>
  ARCHIVE_REQUIRED.forEach((permission) =>
    requirePermission(actor.permissions, permission)
  )
export const archiveManifest = (
  run: ArchiveRunRow
): AuditArchiveCandidateManifestV1 => {
  let manifest: AuditArchiveCandidateManifestV1
  try {
    manifest = JSON.parse(run.manifest_canonical)
  } catch {
    throw new DomainError(409, 'AUDIT_ARCHIVE_CORRUPT', '归档候选摘要无效')
  }
  if (
    contentCanonical(manifest) !== run.manifest_canonical ||
    contentHash(manifest) !== run.manifest_hash ||
    manifest.runId !== run.id ||
    manifest.total !== run.candidate_total ||
    manifest.candidates.length !== manifest.total ||
    contentHash(manifest.query) !== contentHash(run.query)
  )
    throw new DomainError(409, 'AUDIT_ARCHIVE_CORRUPT', '归档候选摘要无效')
  return manifest
}
export const archiveEvent = async (
  db: Database,
  actor: FactActor,
  runId: string,
  action: string,
  batchId: string | null = null,
  detail: { code?: string; attempt?: number; ordinal?: number } = {},
  failed = false
) => {
  await db.query(
    'INSERT INTO audit_archive_events(tenant_id,id,run_id,batch_id,action,actor_id,trace_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      actor.tenantId,
      randomUUID(),
      runId,
      batchId,
      action,
      actor.userId,
      actor.traceId,
      JSON.stringify(detail),
    ]
  )
  await audit(
    db,
    actor,
    'audit-retention',
    action,
    'audit-archive-run',
    runId,
    failed ? 'failure' : 'success',
    detail
  )
}
export const locateArchiveRun = async (
  db: Database,
  actor: Actor,
  id: string,
  lock = false
) => {
  const run = one(
    await rows<ArchiveRunRow>(
      db,
      `SELECT *,to_char(occurrence_date,'YYYY-MM-DD') AS occurrence_date FROM audit_archive_runs WHERE tenant_id=$1 AND id=$2 ${
        lock ? 'FOR UPDATE' : 'FOR SHARE'
      }`,
      [actor.tenantId, id]
    )
  )
  await auditExportScope(db, actor, run.executor_id, ARCHIVE_MANAGE)
  return run
}
/** Recheck original IDs, never rerun mutable query matching or borrow the executor's authority. */
export const archiveCandidateRows = async (
  db: Database,
  actor: Actor,
  run: ArchiveRunRow,
  candidates: readonly AuditArchiveCandidateV1[]
): Promise<AuditEventRecordV1[]> => {
  assertArchivePermissions(actor)
  await auditExportScope(db, actor, run.executor_id, ARCHIVE_MANAGE)
  await auditExportScope(db, actor, run.executor_id, 'audit:export:create')
  await auditExportScope(db, actor, run.executor_id, 'audit:export:archive')
  await assertAuditIdentityQueryAccess(db, actor, run.query, run.executor_id)
  if (candidates.length > 2000)
    throw new DomainError(
      422,
      'AUDIT_ARCHIVE_BATCH_INVALID',
      '单批候选超过2000'
    )
  const page = await recheckAuditEventIds(
    db,
    actor,
    candidates.map((candidate) => candidate.eventId),
    run.query.timeZone
  )
  const map = new Map(page.list.map((row) => [row.id, row]))
  if (map.size !== candidates.length || page.total !== candidates.length)
    throw denied()
  return candidates.map((candidate) => {
    const row = map.get(candidate.eventId)
    if (
      !row ||
      row.occurredAt !== candidate.occurredAt ||
      candidate.requiredVisibleFields.some(
        (field) => !row.visibleFields.includes(field)
      ) ||
      (candidate.targetIdVisible && row.target.id === null)
    )
      throw denied()
    const visible = [...candidate.requiredVisibleFields]
    const operator = {
      id: visible.includes('operator.id') ? row.operator.id : null,
      name: visible.includes('operator.name') ? row.operator.name : null,
      ...(Object.hasOwn(row.operator, 'role')
        ? { role: visible.includes('operator.role') ? row.operator.role : null }
        : {}),
    }
    return {
      ...row,
      operator,
      target: {
        ...row.target,
        id: candidate.targetIdVisible ? row.target.id : null,
      },
      visibleFields: visible,
      // A role that the fact DTO never recorded is absent, not a hidden value.
      // Retain the authoritative DTO partition while masking newly granted cells.
      hiddenFields: [...row.visibleFields, ...row.hiddenFields].filter(
        (field) => !visible.includes(field)
      ),
    }
  })
}
export const assertArchiveAccess = async (
  db: Database,
  actor: Actor,
  run: ArchiveRunRow
) => {
  assertArchivePermissions(actor)
  await auditExportScope(db, actor, run.executor_id, ARCHIVE_MANAGE)
  await auditExportScope(db, actor, run.executor_id, 'audit:export:create')
  await auditExportScope(db, actor, run.executor_id, 'audit:export:archive')
  await assertAuditIdentityQueryAccess(db, actor, run.query, run.executor_id)
  const manifest = archiveManifest(run)
  await sequential(
    Array.from(
      { length: Math.ceil(manifest.total / 2000) },
      (_, index) => index
    ),
    async (index) => {
      await archiveCandidateRows(
        db,
        actor,
        run,
        manifest.candidates.slice(index * 2000, (index + 1) * 2000)
      )
    }
  )
  return manifest
}
export const createArchiveBatch = async (
  db: Database,
  run: ArchiveRunRow,
  first: number,
  last: number
) => {
  const id = randomUUID()
  await db.query(
    'INSERT INTO audit_archive_batches(tenant_id,id,run_id,ordinal,first_ordinal,last_ordinal,object_key) VALUES($1,$2,$3,$4,$4,$5,$6)',
    [
      run.tenant_id,
      id,
      run.id,
      first,
      last,
      contentHash(['audit-archive', run.tenant_id, run.id, id]),
    ]
  )
}
export const captureArchiveRun = async (
  db: Database,
  actor: Actor,
  input: AuditArchiveRunCreateV1,
  occurrence?: {
    policyRevision: number
    localDate: string
    timeZone: string
    boundaryAt: string
  }
) => {
  assertArchivePermissions(actor)
  const captured = await captureAuditArchiveCandidates(db, actor, input.query)
  const id = randomUUID()
  const manifest: AuditArchiveCandidateManifestV1 = {
    version: 1,
    source: 'server',
    projectionVersion: 1,
    runId: id,
    query: captured.query,
    queriedAt: captured.queriedAt,
    dataCutoffAt: captured.dataCutoffAt,
    total: captured.total,
    candidates: captured.candidates,
  }
  const run = one(
    await rows<ArchiveRunRow>(
      db,
      'INSERT INTO audit_archive_runs(tenant_id,id,executor_id,trigger,policy_revision,occurrence_date,occurrence_zone,occurrence_boundary,query,format,queried_at,data_cutoff_at,manifest_canonical,manifest_hash,candidate_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
      [
        actor.tenantId,
        id,
        actor.userId,
        occurrence ? 'policy' : 'manual',
        occurrence?.policyRevision ?? null,
        occurrence?.localDate ?? null,
        occurrence?.timeZone ?? null,
        occurrence?.boundaryAt ?? null,
        JSON.stringify(captured.query),
        input.format,
        captured.queriedAt,
        captured.dataCutoffAt,
        contentCanonical(manifest),
        contentHash(manifest),
        captured.total,
      ]
    )
  )
  // One set insertion retains the complete manifest, not its first UI page.
  await db.query(
    `INSERT INTO audit_archive_candidates(tenant_id,run_id,event_id,ordinal,occurred_at,required_visible_fields,target_id_visible)
 SELECT $1,$2,c->>'eventId',(c->>'ordinal')::int,(c->>'occurredAt')::timestamptz,ARRAY(SELECT jsonb_array_elements_text(c->'requiredVisibleFields')),(c->>'targetIdVisible')::boolean FROM jsonb_array_elements($3::jsonb) c`,
    [actor.tenantId, id, JSON.stringify(captured.candidates)]
  )
  await sequential(
    Array.from(
      { length: Math.ceil(captured.total / 2000) },
      (_, index) => index
    ),
    async (index) =>
      createArchiveBatch(
        db,
        run,
        index * 2000 + 1,
        Math.min((index + 1) * 2000, captured.total)
      )
  )
  await archiveEvent(db, actor, id, 'run.created')
  if (!captured.total) {
    await db.query(
      "UPDATE audit_archive_runs SET status='completed',completed_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND id=$2",
      [actor.tenantId, id]
    )
    await archiveEvent(db, actor, id, 'run.completed')
  }
  return id
}
export const assertArchiveBatchIntegrity = (
  run: ArchiveRunRow,
  batch: ArchiveBatchRow
) => {
  const value = batch.snapshot
  const manifest = archiveManifest(run)
  if (
    !value ||
    batch.snapshot_canonical !== contentCanonical(value) ||
    batch.snapshot_hash !== contentHash(value) ||
    value.runId !== run.id ||
    value.kind !== 'archive-batch' ||
    value.producerVersion !== 2 ||
    value.ordinal !== batch.ordinal ||
    value.candidateTotal !== run.candidate_total ||
    value.candidateRange.firstOrdinal !== batch.first_ordinal ||
    value.candidateRange.lastOrdinal !== batch.last_ordinal ||
    contentHash(value.snapshot.query) !== contentHash(run.query) ||
    value.snapshot.queriedAt !== manifest.queriedAt ||
    value.snapshot.dataCutoffAt !== manifest.dataCutoffAt ||
    contentHash(value.snapshot.rows.map((row) => row.id)) !==
      contentHash(
        manifest.candidates
          .slice(batch.first_ordinal - 1, batch.last_ordinal)
          .map((candidate) => candidate.eventId)
      )
  )
    throw new DomainError(409, 'AUDIT_ARCHIVE_CORRUPT', '归档批次摘要无效')
  return value
}
const archiveArtifactDto = async (
  db: Database,
  run: ArchiveRunRow,
  batchId: string
): Promise<AuditExportArtifactV1 | null> => {
  const item = (
    await rows<{
      id: string
      batch_id: string
      file_name: string
      mime_type: string
      status: 'ready' | 'quarantined' | 'expired'
      size: number
      sha256: string
      scan_engine: string
      scanned_at: Date
      created_at: Date
      expires_at: Date
      expired_at: Date | null
    }>(
      db,
      "SELECT a.*,CASE WHEN expires_at<=clock_timestamp() THEN 'expired' ELSE status END AS status FROM audit_archive_artifacts a WHERE tenant_id=$1 AND batch_id=$2",
      [run.tenant_id, batchId]
    )
  )[0]
  if (!item) return null
  return {
    id: item.id,
    jobId: batchId,
    format: run.format,
    fileName: item.file_name,
    mimeType: item.mime_type,
    status: item.status,
    size: item.size,
    sha256: item.sha256,
    scanEngine: item.scan_engine,
    scannedAt: item.scanned_at.toISOString(),
    createdAt: item.created_at.toISOString(),
    expiresAt: item.expires_at.toISOString(),
    expiredAt: item.expired_at?.toISOString() ?? null,
  }
}
const archiveTimestamp = (value: Date | string) => new Date(value).toISOString()
/** Caller must pass the run after the shared current-access gate. */
const archiveBatchDto = async (
  db: Database,
  run: ArchiveRunRow,
  item: ArchiveBatchRow
): Promise<AuditArchiveBatchV1> => {
  if (item.tenant_id !== run.tenant_id || item.run_id !== run.id)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  if (item.snapshot) assertArchiveBatchIntegrity(run, item)
  return {
    version: 1,
    kind: 'archive-batch',
    source: 'server',
    producerVersion: 2,
    projectionVersion: 1,
    id: item.id,
    runId: run.id,
    ordinal: item.ordinal,
    candidateRange: {
      firstOrdinal: item.first_ordinal,
      lastOrdinal: item.last_ordinal,
    },
    candidateTotal: run.candidate_total,
    status: item.status,
    revision: item.revision,
    jobId: item.id,
    snapshotHash: item.snapshot_hash,
    artifact: await archiveArtifactDto(db, run, item.id),
    attempts: item.attempts,
    nextAttemptAt: archiveTimestamp(item.next_attempt_at),
    leaseUntil: item.lease_until ? archiveTimestamp(item.lease_until) : null,
    errorCode: item.error_code,
    errorMessage: item.error_code ? '归档批次暂停或失败' : null,
    createdAt: archiveTimestamp(item.created_at),
    completedAt: item.completed_at ? archiveTimestamp(item.completed_at) : null,
    restricted: false,
  }
}
const actorProjection = async (db: Database, viewer: Actor, owner: string) => {
  const current = one(
    await rows<{ id: string | null; name: string | null }>(
      db,
      "SELECT CASE WHEN af_member_field_visible($1,$2,'audit:read',$3,'username') THEN $3 ELSE NULL END AS id,CASE WHEN af_member_field_visible($1,$2,'audit:read',$3,'name') THEN COALESCE(m.display_name,u.name) ELSE NULL END AS name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$3",
      [viewer.tenantId, viewer.userId, owner]
    )
  )
  const visible: AuditActorField[] = []
  if (current.id !== null) visible.push('operator.id')
  if (current.name !== null) visible.push('operator.name')
  return {
    operator: current,
    visibleFields: visible,
    hiddenFields: AUDIT_ACTOR_FIELDS.filter(
      (field) => !visible.includes(field)
    ),
  }
}
const archiveReservationExpired = async (db: Database, run: ArchiveRunRow) =>
  run.error_code === 'AUDIT_ARCHIVE_EXPIRED' ||
  one(
    await rows<{ expired: boolean }>(
      db,
      "SELECT EXISTS(SELECT 1 FROM audit_archive_batches WHERE tenant_id=$1 AND run_id=$2 AND status<>'completed' AND (bytes_purged_at IS NOT NULL OR retention_until<=clock_timestamp())) AS expired",
      [run.tenant_id, run.id]
    )
  ).expired
const archiveRetryExhausted = async (db: Database, run: ArchiveRunRow) =>
  run.attempts >= 5 ||
  run.error_code === 'AUDIT_ARCHIVE_ATTEMPTS_EXHAUSTED' ||
  one(
    await rows<{ exhausted: boolean }>(
      db,
      "SELECT EXISTS(SELECT 1 FROM audit_archive_batches WHERE tenant_id=$1 AND run_id=$2 AND status<>'completed' AND attempts>=5) AS exhausted",
      [run.tenant_id, run.id]
    )
  ).exhausted
const archiveRunActions = async (
  db: Database,
  run: ArchiveRunRow
): Promise<('cancel' | 'retry')[]> => {
  if (['queued', 'processing'].includes(run.status)) return ['cancel']
  if (
    ['failed', 'blocked'].includes(run.status) &&
    run.error_code !== 'AUDIT_ARCHIVE_INFECTED' &&
    !(await archiveReservationExpired(db, run)) &&
    !(await archiveRetryExhausted(db, run))
  )
    return ['retry']
  return []
}
export const archiveRunDto = async (
  db: Database,
  actor: Actor,
  run: ArchiveRunRow
): Promise<AuditArchiveRunV1> => {
  let restricted = false
  try {
    await assertArchiveAccess(db, actor, run)
  } catch (error) {
    if (!(error instanceof DomainError) || error.status === 409) throw error
    restricted = true
  }
  const projected = restricted
    ? {
        operator: { id: null, name: null },
        visibleFields: [],
        hiddenFields: [...AUDIT_ACTOR_FIELDS],
      }
    : await actorProjection(db, actor, run.executor_id)
  const coverage = restricted
    ? null
    : one(
        await rows<{ covered: number; batches: number; completed: number }>(
          db,
          "SELECT (SELECT count(*)::int FROM audit_archive_candidates c JOIN audit_archive_memberships m ON m.tenant_id=c.tenant_id AND m.event_id=c.event_id WHERE c.tenant_id=$1 AND c.run_id=$2) AS covered,(SELECT count(*)::int FROM audit_archive_batches WHERE tenant_id=$1 AND run_id=$2) AS batches,(SELECT count(*)::int FROM audit_archive_batches WHERE tenant_id=$1 AND run_id=$2 AND status='completed') AS completed",
          [actor.tenantId, run.id]
        )
      )
  return {
    version: 1,
    id: run.id,
    source: 'server',
    projectionVersion: 1,
    trigger: run.trigger,
    policyRevision: run.policy_revision,
    occurrence:
      !restricted && run.occurrence_date
        ? {
            localDate: String(run.occurrence_date),
            timeZone: run.occurrence_zone as string,
            boundaryAt: (run.occurrence_boundary as Date).toISOString(),
          }
        : null,
    executor: projected.operator,
    executorVisibleFields: projected.visibleFields,
    executorHiddenFields: projected.hiddenFields,
    query: restricted ? null : run.query,
    format: run.format,
    status: run.status,
    revision: run.revision,
    queriedAt: restricted ? null : run.queried_at.toISOString(),
    dataCutoffAt: restricted ? null : run.data_cutoff_at.toISOString(),
    candidateHash: restricted ? null : run.manifest_hash,
    coverage: {
      candidateTotal: restricted ? null : run.candidate_total,
      coveredTotal: coverage?.covered ?? null,
      remainingTotal: coverage ? run.candidate_total - coverage.covered : null,
      batchTotal: coverage?.batches ?? null,
      completedBatchTotal: coverage?.completed ?? null,
    },
    attempts: run.attempts,
    nextAttemptAt: run.next_attempt_at.toISOString(),
    leaseUntil: run.lease_until?.toISOString() ?? null,
    errorCode: run.error_code,
    errorMessage: run.error_code
      ? '归档暂停或失败；恢复当前权限与基础服务后重试'
      : null,
    createdAt: run.created_at.toISOString(),
    updatedAt: run.updated_at.toISOString(),
    completedAt: run.completed_at?.toISOString() ?? null,
    restricted,
    allowedActions: restricted ? [] : await archiveRunActions(db, run),
  }
}
const policyDto = async (
  db: Database,
  actor: Actor
): Promise<AuditRetentionPolicyV1> => {
  requirePermission(actor.permissions, ARCHIVE_MANAGE)
  const value = (
    await rows<{
      revision: number
      enabled: boolean
      hot_days: number
      time_zone: string
      executor_id: string | null
      updated_at: Date | null
      next_run_at: Date | null
      last_run_id: string | null
    }>(db, 'SELECT * FROM audit_retention_policies WHERE tenant_id=$1', [
      actor.tenantId,
    ])
  )[0]
  const projection = value?.executor_id
    ? await actorProjection(db, actor, value.executor_id)
    : {
        operator: null,
        visibleFields: [],
        hiddenFields: [...AUDIT_ACTOR_FIELDS],
      }
  return {
    version: 1,
    source: 'server',
    revision: value?.revision ?? 1,
    enabled: value?.enabled ?? false,
    hotDays: value?.hot_days ?? 90,
    timeZone: value?.time_zone ?? 'Asia/Shanghai',
    executor: projection.operator,
    executorVisibleFields: projection.visibleFields,
    executorHiddenFields: projection.hiddenFields,
    updatedAt: value?.updated_at?.toISOString() ?? null,
    nextRunAt: value?.next_run_at?.toISOString() ?? null,
    lastRunId: value?.last_run_id ?? null,
    allowedActions: ['update'],
  }
}
export const registerAuditRetention = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault,
  files: FileRuntime = {}
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  const idOf = (params: unknown) => text(record(params).id, 'id', 100)
  server.get('/api/audit/retention-policy', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), [])
    return authorizedTransaction(
      pool,
      actor,
      ARCHIVE_MANAGE,
      async (db, current) => ok(await policyDto(db, current), request.id)
    )
  })
  server.put('/api/audit/retention-policy', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseAuditRetentionPolicyUpdate(request.body)
    const result = await idempotent(
      pool,
      actor,
      ARCHIVE_MANAGE,
      'audit-retention.policy',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        assertArchivePermissions(current)
        await db.query(
          'INSERT INTO audit_retention_policies(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',
          [current.tenantId]
        )
        const policy = one(
          await rows<{ revision: number }>(
            db,
            'SELECT revision FROM audit_retention_policies WHERE tenant_id=$1 FOR UPDATE',
            [current.tenantId]
          )
        )
        assertRevision(policy.revision, input.expectedRevision)
        await db.query(
          'UPDATE audit_retention_policies SET revision=revision+1,enabled=$2,hot_days=$3,time_zone=$4,executor_id=$5,updated_at=clock_timestamp(),next_run_at=CASE WHEN $2 THEN ((clock_timestamp() AT TIME ZONE $4)::date+1)::timestamp AT TIME ZONE $4 ELSE NULL END WHERE tenant_id=$1',
          [
            current.tenantId,
            input.enabled,
            input.hotDays,
            input.timeZone,
            current.userId,
          ]
        )
        await audit(
          db,
          current,
          'audit-retention',
          'policy.updated',
          'tenant',
          current.tenantId
        )
        fault('audit-retention.policy.before-commit')
        return { updated: true }
      },
      true,
      '',
      async (db, current) => {
        assertArchivePermissions(current)
        return { ...(await policyDto(db, current)), updated: true }
      }
    )
    return ok(result, request.id)
  })
  server.post('/api/audit/archive-runs', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseAuditArchiveRunCreate(request.body)
    const result = await idempotent<{
      id: string
      details?: AuditArchiveRunV1
    }>(
      pool,
      actor,
      ARCHIVE_MANAGE,
      'audit-archive.create',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const capability = (await auditExportCapabilities(files)).formats.find(
          (item) => item.format === input.format
        )
        if (!capability?.available)
          throw new DomainError(
            503,
            'AUDIT_ARCHIVE_UNAVAILABLE',
            '归档生成、存储或真实扫描当前不可用'
          )
        const id = await captureArchiveRun(db, current, input)
        fault('audit-archive.create.before-commit')
        return { id }
      },
      false,
      '',
      async (db, current, response) => {
        const run = await locateArchiveRun(db, current, response.id)
        return { id: run.id, details: await archiveRunDto(db, current, run) }
      }
    )
    return ok(result.details, request.id)
  })
  server.get('/api/audit/archive-runs', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), ['current', 'pageSize'])
    const page = pageQuery(request.query)
    return authorizedTransaction(
      pool,
      actor,
      ARCHIVE_MANAGE,
      async (db, current) => {
        const found = one(
          await rows<{ ids: string[]; total: number }>(
            db,
            'WITH matching AS MATERIALIZED (SELECT id,created_at FROM audit_archive_runs WHERE tenant_id=$1 AND af_historical_member_scope_visible($1,$2,$3,executor_id)),page AS(SELECT id FROM matching ORDER BY created_at DESC,id LIMIT $4 OFFSET $5) SELECT (SELECT count(*)::int FROM matching) AS total,COALESCE((SELECT array_agg(id) FROM page),ARRAY[]::text[]) AS ids',
            [
              current.tenantId,
              current.userId,
              ARCHIVE_MANAGE,
              page.pageSize,
              page.offset,
            ]
          )
        )
        const list: AuditArchiveRunV1[] = []
        await sequential(found.ids, async (id) => {
          list.push(
            await archiveRunDto(
              db,
              current,
              await locateArchiveRun(db, current, id)
            )
          )
        })
        return ok(
          {
            version: 1,
            source: 'server',
            projectionVersion: 1,
            list,
            total: found.total,
            current: page.current,
            pageSize: page.pageSize,
          },
          request.id
        )
      }
    )
  })
  server.get('/api/audit/archive-runs/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      ARCHIVE_MANAGE,
      async (db, current) =>
        ok(
          await archiveRunDto(
            db,
            current,
            await locateArchiveRun(db, current, idOf(request.params))
          ),
          request.id
        )
    )
  })
  ;(['cancel', 'retry'] as const).forEach((command) =>
    server.post(`/api/audit/archive-runs/:id/${command}`, async (request) => {
      const actor = await authenticate(pool, request)
      const id = idOf(request.params)
      const input = parseAuditArchiveRunCommand(request.body)
      const result = await idempotent<{
        id: string
        details?: AuditArchiveRunV1
      }>(
        pool,
        actor,
        ARCHIVE_MANAGE,
        `audit-archive.${command}`,
        scalarHeader(request, 'idempotency-key'),
        { id, ...input },
        async (db, current) => {
          const run = await locateArchiveRun(db, current, id, true)
          await assertArchiveAccess(db, current, run)
          assertRevision(run.revision, input.expectedRevision)
          if (
            !(
              command === 'cancel'
                ? ['queued', 'processing']
                : ['failed', 'blocked']
            ).includes(run.status)
          )
            throw new DomainError(
              409,
              'AUDIT_ARCHIVE_STATE_CONFLICT',
              '当前归档运行不能执行该操作'
            )
          if (command === 'retry' && (await archiveReservationExpired(db, run)))
            throw new DomainError(
              409,
              'AUDIT_ARCHIVE_EXPIRED',
              '归档批次保留期限已结束，不能恢复'
            )
          if (
            command === 'retry' &&
            run.error_code === 'AUDIT_ARCHIVE_INFECTED'
          )
            throw new DomainError(
              409,
              'AUDIT_ARCHIVE_INFECTED',
              '受感染的归档批次不能恢复或复用'
            )
          if (command === 'retry' && (await archiveRetryExhausted(db, run)))
            throw new DomainError(
              409,
              'AUDIT_ARCHIVE_ATTEMPTS_EXHAUSTED',
              '归档重试次数已用尽'
            )
          await db.query(
            'UPDATE audit_archive_runs SET status=$3,revision=revision+1,claimed_by=NULL,lease_until=NULL,error_code=NULL,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',
            [
              current.tenantId,
              id,
              command === 'cancel' ? 'cancelled' : 'queued',
            ]
          )
          await db.query(
            "UPDATE audit_archive_batches SET status=$3,revision=revision+1,claimed_by=NULL,lease_until=NULL,error_code=NULL,next_attempt_at=clock_timestamp() WHERE tenant_id=$1 AND run_id=$2 AND status NOT IN('completed','cancelled','infected')",
            [
              current.tenantId,
              id,
              command === 'cancel' ? 'cancelled' : 'queued',
            ]
          )
          await archiveEvent(db, current, id, `run.${command}`)
          fault(`audit-archive.${command}.before-commit`)
          return { id }
        },
        false,
        '',
        async (db, current, response) => ({
          id: response.id,
          details: await archiveRunDto(
            db,
            current,
            await locateArchiveRun(db, current, response.id)
          ),
        })
      )
      return ok(result.details, request.id)
    })
  )
  server.get('/api/audit/archive-runs/:id/batches', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), ['current', 'pageSize'])
    const page = pageQuery(request.query)
    return authorizedTransaction(
      pool,
      actor,
      ARCHIVE_MANAGE,
      async (db, current) => {
        const run = await locateArchiveRun(db, current, idOf(request.params))
        await assertArchiveAccess(db, current, run)
        const found = one(
          await rows<{ list: ArchiveBatchRow[]; total: number }>(
            db,
            "WITH matching AS MATERIALIZED(SELECT * FROM audit_archive_batches WHERE tenant_id=$1 AND run_id=$2),page AS(SELECT * FROM matching ORDER BY first_ordinal LIMIT $3 OFFSET $4) SELECT (SELECT count(*)::int FROM matching) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb) AS list",
            [current.tenantId, run.id, page.pageSize, page.offset]
          )
        )
        const list = await Promise.all(
          found.list.map((item) => archiveBatchDto(db, run, item))
        )
        return ok(
          {
            version: 1,
            source: 'server',
            projectionVersion: 1,
            list,
            total: found.total,
            current: page.current,
            pageSize: page.pageSize,
          },
          request.id
        )
      }
    )
  })
  server.get(
    '/api/audit/archive-runs/:id/batches/:batchId',
    async (request) => {
      const actor = await authenticate(pool, request)
      onlyKeys(record(request.query), [])
      const params = record(request.params)
      const id = idOf(params)
      const batchId = text(params.batchId, 'batchId', 100)
      return authorizedTransaction(
        pool,
        actor,
        ARCHIVE_MANAGE,
        async (db, current) => {
          const run = await locateArchiveRun(db, current, id)
          await assertArchiveAccess(db, current, run)
          const batch = one(
            await rows<ArchiveBatchRow>(
              db,
              'SELECT * FROM audit_archive_batches WHERE tenant_id=$1 AND run_id=$2 AND id=$3 FOR SHARE',
              [current.tenantId, run.id, batchId]
            )
          )
          return ok(await archiveBatchDto(db, run, batch), request.id)
        }
      )
    }
  )
  server.get('/api/audit/archive-runs/:id/events', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), ['current', 'pageSize'])
    const page = pageQuery(request.query)
    return authorizedTransaction(
      pool,
      actor,
      ARCHIVE_MANAGE,
      async (db, current) => {
        const run = await locateArchiveRun(db, current, idOf(request.params))
        await assertArchiveAccess(db, current, run)
        const selected = one(
          await rows<{
            total: number
            list: {
              id: string
              batch_id: string | null
              action: string
              actor_id: string | null
              trace_id: string
              detail: { code?: string; attempt?: number; ordinal?: number }
              created_at: string
            }[]
          }>(
            db,
            "WITH matching AS MATERIALIZED(SELECT * FROM audit_archive_events WHERE tenant_id=$1 AND run_id=$2),page AS(SELECT * FROM matching ORDER BY created_at DESC,id LIMIT $3 OFFSET $4) SELECT (SELECT count(*)::int FROM matching) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb) AS list",
            [current.tenantId, run.id, page.pageSize, page.offset]
          )
        )
        const list = await Promise.all(
          selected.list.map(async (item) => {
            const actorFields = item.actor_id
              ? await actorProjection(db, current, item.actor_id)
              : {
                  operator: { id: null, name: null },
                  visibleFields: [],
                  hiddenFields: [...AUDIT_ACTOR_FIELDS],
                }
            return {
              version: 1,
              projectionVersion: 1,
              id: item.id,
              runId: run.id,
              batchId: item.batch_id,
              source: 'server',
              action: item.action,
              ...actorFields,
              occurredAt: new Date(item.created_at).toISOString(),
              traceId: item.trace_id,
              detail: item.detail,
            }
          })
        )
        return ok(
          {
            version: 1,
            source: 'server',
            projectionVersion: 1,
            list,
            total: selected.total,
            current: page.current,
            pageSize: page.pageSize,
          },
          request.id
        )
      }
    )
  })
  server.get(
    '/api/audit/archive-runs/:id/batches/:batchId/download',
    async (request, reply) => {
      const actor = await authenticate(pool, request)
      const params = record(request.params)
      const result = await authorizedTransaction(
        pool,
        actor,
        ARCHIVE_MANAGE,
        async (db, current) => {
          requirePermission(current.permissions, 'audit:export:download')
          const run = await locateArchiveRun(db, current, idOf(params))
          await assertArchiveAccess(db, current, run)
          await auditExportScope(
            db,
            current,
            run.executor_id,
            'audit:export:download'
          )
          const batch = one(
            await rows<ArchiveBatchRow>(
              db,
              'SELECT * FROM audit_archive_batches WHERE tenant_id=$1 AND run_id=$2 AND id=$3 FOR SHARE',
              [current.tenantId, run.id, text(params.batchId, 'batchId', 100)]
            )
          )
          const snapshot = assertArchiveBatchIntegrity(run, batch)
          const records = await archiveCandidateRows(
            db,
            current,
            run,
            archiveManifest(run).candidates.slice(
              batch.first_ordinal - 1,
              batch.last_ordinal
            )
          )
          if (contentHash(records) !== contentHash(snapshot.snapshot.rows))
            throw denied()
          const artifact = one(
            await rows<{
              object_key: string
              file_name: string
              mime_type: string
              sha256: string
              size: number
            }>(
              db,
              "SELECT a.* FROM audit_archive_artifacts a JOIN audit_archive_batches b ON b.tenant_id=a.tenant_id AND b.id=a.batch_id WHERE a.tenant_id=$1 AND b.run_id=$2 AND b.id=$3 AND b.status='completed' AND a.status='ready' AND a.expires_at>clock_timestamp() FOR SHARE OF a,b",
              [current.tenantId, run.id, text(params.batchId, 'batchId', 100)]
            )
          )
          const bytes = await auditExportStore(files).get(artifact.object_key)
          if (
            bytes.length !== artifact.size ||
            fileDigest(bytes) !== artifact.sha256
          )
            throw new DomainError(
              503,
              'AUDIT_ARCHIVE_STORAGE_MISMATCH',
              '归档制品字节校验未通过'
            )
          await archiveEvent(
            db,
            current,
            run.id,
            'artifact.downloaded',
            text(params.batchId, 'batchId', 100)
          )
          return { bytes, artifact }
        }
      )
      reply
        .header('Content-Type', result.artifact.mime_type)
        .header(
          'Content-Disposition',
          `attachment; filename="${result.artifact.file_name}"`
        )
        .header('Cache-Control', 'no-store')
        .header('Content-Length', result.bytes.length)
        .header('X-Content-SHA256', result.artifact.sha256)
      return reply.send(result.bytes)
    }
  )
}
