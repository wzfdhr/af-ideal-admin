import { randomUUID } from 'node:crypto'
import {
  DomainError,
  AUDIT_EXPORT_PERMISSIONS as P,
  parseAuditExportCreate,
  parseAuditExportCommand,
  parseAuditExportArchive,
  record,
  text,
  onlyKeys,
} from '@af-admin/contracts'
import {
  hasPermission,
  requirePermission,
  assertRevision,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  authorizedTransaction,
  idempotent,
  one,
  rows,
  contentCanonical,
  contentHash,
  pageQuery,
  noFault,
  sequential,
} from './support'
import { captureAuditEvents } from './audit-query'
import {
  locateAuditExport,
  auditExportDto,
  assertAuditExportOrigin,
  assertAuditExportSnapshotAccess,
  auditExportArtifact,
  appendAuditExportEvent,
} from './audit-export-access'
import { auditExportCapabilities, auditExportStore } from './audit-export-jobs'
import { fileDigest } from './file-storage'
import type { AuditExportJobV1 } from '@af-admin/contracts'
import type { AuditExportJobRow } from './audit-export-access'
import type { Database, FaultInjector } from './support'
import type { Actor } from './auth'
import type { FileRuntime } from './files'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

type ExportDateKey =
  | 'created_at'
  | 'updated_at'
  | 'next_attempt_at'
  | 'retention_until'
  | 'lease_until'
  | 'expired_at'
  | 'archived_at'
  | 'completed_at'
type ExportJsonRow = Omit<AuditExportJobRow, ExportDateKey> &
  Record<ExportDateKey, string | null>
const hydrateExportRow = (row: ExportJsonRow): AuditExportJobRow => ({
  ...row,
  created_at: new Date(row.created_at as string),
  updated_at: new Date(row.updated_at as string),
  next_attempt_at: new Date(row.next_attempt_at as string),
  retention_until: new Date(row.retention_until as string),
  lease_until: row.lease_until ? new Date(row.lease_until) : null,
  expired_at: row.expired_at ? new Date(row.expired_at) : null,
  archived_at: row.archived_at ? new Date(row.archived_at) : null,
  completed_at: row.completed_at ? new Date(row.completed_at) : null,
})
const metadataPermissions = Object.values(P)
const metadataPermission = async (db: Database, actor: Actor, id: string) => {
  if (
    !metadataPermissions.some((code) => hasPermission(actor.permissions, code))
  )
    requirePermission(actor.permissions, P.list)
  const row = one(
    await rows<AuditExportJobRow>(
      db,
      'SELECT * FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2 FOR SHARE',
      [actor.tenantId, id]
    )
  )
  const allowed = metadataPermissions.filter((code) =>
    hasPermission(actor.permissions, code)
  )
  const selected = (
    await rows<{ code: string }>(
      db,
      'SELECT code FROM unnest($3::text[]) WITH ORDINALITY p(code,ordinal) WHERE af_historical_member_scope_visible($1,$2,code,$4) ORDER BY ordinal LIMIT 1',
      [actor.tenantId, actor.userId, allowed, row.created_by]
    )
  )[0]
  if (selected) return { row, code: selected.code }
  throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
const alive = async (db: Database, job: AuditExportJobRow) => {
  if (
    job.expired_at ||
    !one(
      await rows<{ live: boolean }>(
        db,
        'SELECT retention_until>clock_timestamp() AS live FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2',
        [job.tenant_id, job.id]
      )
    ).live
  )
    throw new DomainError(
      409,
      'AUDIT_EXPORT_EXPIRED',
      '审计导出已过期且不能恢复'
    )
}
// Named API registration follows the existing server module convention.
// eslint-disable-next-line import/prefer-default-export
export const registerAuditExports = (
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
  server.get('/api/audit/export-capabilities', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), [])
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (_db, current) => {
        if (
          !metadataPermissions.some((code) =>
            hasPermission(current.permissions, code)
          )
        )
          requirePermission(current.permissions, P.create)
        return ok(await auditExportCapabilities(files), request.id)
      }
    )
  })
  server.post('/api/audit/exports', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseAuditExportCreate(request.body)
    const result = await idempotent<{ id: string; details?: unknown }>(
      pool,
      actor,
      P.create,
      'audit-export.create',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const available = (await auditExportCapabilities(files)).formats.find(
          (item) => item.format === input.format
        )
        if (!available?.available)
          throw new DomainError(
            503,
            'AUDIT_EXPORT_UNAVAILABLE',
            '审计导出生成、存储或扫描当前不可用'
          )
        const snapshot = await captureAuditEvents(db, current, input.query)
        const id = randomUUID()
        await db.query(
          'INSERT INTO audit_export_jobs(tenant_id,id,created_by,created_name,format,query,snapshot,snapshot_canonical,snapshot_hash,event_ids,object_key,total_rows) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [
            current.tenantId,
            id,
            current.userId,
            current.name,
            input.format,
            JSON.stringify(input.query),
            JSON.stringify(snapshot),
            contentCanonical(snapshot),
            contentHash(snapshot),
            snapshot.rows.map((row) => row.id),
            contentHash([
              'audit-export-object-v1',
              current.tenantId,
              id,
              randomUUID(),
            ]),
            snapshot.total,
          ]
        )
        await appendAuditExportEvent(db, current, id, 'created')
        fault('audit-export.create.before-commit')
        return { id }
      },
      false,
      '',
      async (db, current, saved) => {
        const job = await locateAuditExport(db, current, saved.id, P.create)
        await assertAuditExportOrigin(db, job, current.traceId)
        await assertAuditExportSnapshotAccess(db, current, job)
        return {
          ...saved,
          details: await auditExportDto(db, current, job, P.create, true),
        }
      }
    )
    return ok(result.details, request.id)
  })
  server.get('/api/audit/exports', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, P.list, async (db, current) => {
      const query = record(request.query)
      onlyKeys(query, ['current', 'pageSize', 'status', 'archived'])
      const page = pageQuery(query)
      const status =
        query.status === undefined || query.status === ''
          ? ''
          : text(query.status, 'status', 30)
      if (
        status &&
        ![
          'queued',
          'processing',
          'completed',
          'failed',
          'blocked',
          'cancelled',
          'infected',
          'expired',
        ].includes(status)
      )
        throw new DomainError(422, 'VALIDATION_ERROR', '导出状态无效')
      const archived =
        query.archived === undefined
          ? 'all'
          : text(query.archived, 'archived', 20)
      if (!['all', 'active', 'archived'].includes(archived))
        throw new DomainError(422, 'VALIDATION_ERROR', '归档筛选无效')
      const filter =
        "tenant_id=$1 AND af_historical_member_scope_visible($1,$2,$3,created_by) AND ($4='' OR status=$4) AND ($5='all' OR ($5='active' AND archived_at IS NULL) OR ($5='archived' AND archived_at IS NOT NULL))"
      const values = [
        current.tenantId,
        current.userId,
        P.list,
        status,
        archived,
      ]
      const selected = one(
        await rows<{ n: string; items: ExportJsonRow[] }>(
          db,
          `WITH matching AS MATERIALIZED (SELECT tenant_id,id,created_at FROM audit_export_jobs WHERE ${filter}), selected AS (SELECT tenant_id,id FROM matching ORDER BY created_at DESC,id LIMIT $6 OFFSET $7), page AS (SELECT jobs.* FROM selected JOIN audit_export_jobs jobs USING(tenant_id,id))
         SELECT (SELECT count(*) FROM matching)::text AS n,COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id) FROM page),'[]'::jsonb) AS items`,
          [...values, page.pageSize, page.offset]
        )
      )
      await fault('audit-export.list.after-query')
      const found = selected.items.map(hydrateExportRow)
      const list: AuditExportJobV1[] = []
      await sequential(found, async (job) => {
        list.push(await auditExportDto(db, current, job, P.list))
      })
      return ok(
        {
          version: 1,
          source: 'server',
          projectionVersion: 1,
          list,
          total: Number(selected.n),
          current: page.current,
          pageSize: page.pageSize,
        },
        request.id
      )
    })
  })
  server.get('/api/audit/exports/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        const { row, code } = await metadataPermission(
          db,
          current,
          idOf(request.params)
        )
        return ok(
          await auditExportDto(db, current, row, code, true),
          request.id
        )
      }
    )
  })
  ;(['cancel', 'retry', 'archive'] as const).forEach((command) =>
    server.post(`/api/audit/exports/:id/${command}`, async (request) => {
      const actor = await authenticate(pool, request)
      const id = idOf(request.params)
      const input =
        command === 'archive'
          ? parseAuditExportArchive(request.body)
          : parseAuditExportCommand(request.body)
      const permission = P[command]
      const result = await idempotent<{ id: string; details?: unknown }>(
        pool,
        actor,
        permission,
        `audit-export.${command}:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (db, current) => {
          const job = await locateAuditExport(db, current, id, permission, true)
          assertRevision(job.revision, input.expectedRevision)
          await alive(db, job)
          if (command === 'cancel') {
            if (
              !['queued', 'processing', 'failed', 'blocked'].includes(
                job.status
              )
            )
              throw new DomainError(
                409,
                'AUDIT_EXPORT_STATE_CONFLICT',
                '当前审计导出状态不能取消'
              )
            await db.query(
              "UPDATE audit_export_jobs SET status='cancelled',stage='stopped',claimed_by=NULL,lease_until=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
              [current.tenantId, id]
            )
          } else if (command === 'retry') {
            if (
              !['failed', 'blocked'].includes(job.status) ||
              job.attempts >= 5
            )
              throw new DomainError(
                409,
                'AUDIT_EXPORT_STATE_CONFLICT',
                '当前审计导出状态或尝试次数不能重试'
              )
            await assertAuditExportOrigin(db, job, current.traceId)
            await assertAuditExportSnapshotAccess(db, current, job)
            await db.query(
              "UPDATE audit_export_jobs SET status='queued',stage='queued',claimed_by=NULL,lease_until=NULL,next_attempt_at=clock_timestamp(),error_code=NULL,error_message=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
              [current.tenantId, id]
            )
          } else {
            const { archived } = parseAuditExportArchive(input)
            const retention = one(
              await rows<{ live: boolean }>(
                db,
                "SELECT created_at+($3::integer*interval '1 day')>clock_timestamp() AS live FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2",
                [current.tenantId, id, archived ? 365 : 7]
              )
            )
            if (!retention.live)
              throw new DomainError(
                409,
                'AUDIT_EXPORT_RETENTION_ELAPSED',
                '切换后的保留期已结束，不能恢复或延长已过期制品'
              )
            await db.query(
              "UPDATE audit_export_jobs SET archived_at=CASE WHEN $3 THEN COALESCE(archived_at,clock_timestamp()) ELSE NULL END,retention_until=created_at+($4::integer*interval '1 day'),revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
              [current.tenantId, id, archived, archived ? 365 : 7]
            )
            await db.query(
              "UPDATE audit_export_artifacts a SET expires_at=j.retention_until FROM audit_export_jobs j WHERE a.tenant_id=$1 AND a.job_id=$2 AND j.tenant_id=a.tenant_id AND j.id=a.job_id AND a.status<>'expired'",
              [current.tenantId, id]
            )
          }
          await appendAuditExportEvent(
            db,
            current,
            id,
            command,
            command === 'archive'
              ? { archived: parseAuditExportArchive(input).archived }
              : {}
          )
          fault(`audit-export.${command}.before-commit`)
          return { id }
        },
        false,
        '',
        async (db, current, saved) => ({
          ...saved,
          details: await auditExportDto(
            db,
            current,
            await locateAuditExport(db, current, saved.id, permission),
            permission,
            true
          ),
        })
      )
      return ok(result.details, request.id)
    })
  )
  server.get('/api/audit/exports/:id/download', async (request, reply) => {
    const actor = await authenticate(pool, request)
    const result = await authorizedTransaction(
      pool,
      actor,
      P.download,
      async (db, current) => {
        const job = await locateAuditExport(
          db,
          current,
          idOf(request.params),
          P.download,
          true
        )
        await alive(db, job)
        await assertAuditExportOrigin(db, job, current.traceId)
        await assertAuditExportSnapshotAccess(db, current, job)
        const artifact = await auditExportArtifact(db, job)
        if (
          job.status !== 'completed' ||
          !artifact ||
          artifact.status !== 'ready' ||
          artifact.expired_at ||
          !artifact.scan_engine.startsWith('ClamAV ')
        )
          throw new DomainError(
            409,
            'AUDIT_EXPORT_NOT_READY',
            '审计导出制品尚不可下载'
          )
        if (
          !/^[A-Za-z0-9_.-]{1,120}$/.test(artifact.file_name) ||
          artifact.mime_type !==
            {
              csv: 'text/csv; charset=utf-8',
              xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              pdf: 'application/pdf',
            }[job.format]
        )
          throw new DomainError(
            409,
            'AUDIT_EXPORT_ARTIFACT_INVALID',
            '审计制品元信息完整性校验失败'
          )
        const bytes = await auditExportStore(files).get(artifact.object_key)
        if (
          bytes.length !== artifact.size ||
          fileDigest(bytes) !== artifact.sha256
        )
          throw new DomainError(
            409,
            'AUDIT_EXPORT_ARTIFACT_INVALID',
            '审计制品字节完整性校验失败'
          )
        await alive(db, job)
        await appendAuditExportEvent(db, current, job.id, 'download')
        return { bytes, artifact }
      }
    )
    reply
      .header('Cache-Control', 'no-store')
      .header('Content-Type', result.artifact.mime_type)
      .header(
        'Content-Disposition',
        `attachment; filename="${result.artifact.file_name}"`
      )
      .header('X-Content-Type-Options', 'nosniff')
    return reply.send(result.bytes)
  })
}
