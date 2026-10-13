import { randomBytes, randomUUID } from 'node:crypto'
import {
  DomainError,
  REPORT_EXPORT_PERMISSIONS as E,
  REPORTING_PERMISSIONS as P,
  parseReportExportCreate,
  parseReportExportCommand,
  parseReportExportArchive,
  record,
  onlyKeys,
  text,
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
  rows,
  one,
  audit,
  contentHash,
  pageQuery,
  sequential,
  noFault,
} from './support'
import { locateReportingVersion, requireReportingEnabled } from './reporting'
import { captureReportingExportSnapshot } from './report-query'
import {
  reportExportCapabilities,
  reportExportStore,
} from './report-export-jobs'
import {
  locateReportExport,
  reportExportDto,
  appendReportExportEvent,
  assertReportExportOrigin,
  assertReportExportSnapshotAccess,
  reportExportArtifact,
} from './report-export-access'
import { fileDigest } from './file-storage'
import { hasScheduleExportGrant } from './report-schedules-grants'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { ReportExportRuntime } from './report-export-jobs'
import type { ReportExportJobRow } from './report-export-access'
import type {
  ReportingExportJob,
  ReportExportCreate,
} from '@af-admin/contracts'

/** Trusted scheduler reuse only; no HTTP caller can supply a recipient or captured rows. */
export const createReportExportPlan = async (
  db: Database,
  current: Actor,
  input: ReportExportCreate,
  secondaryActor?: Actor
) => {
  requirePermission(current.permissions, E.create)
  requirePermission(current.permissions, P.query)
  const { definition, version } = await locateReportingVersion(
    db,
    current,
    input.definitionVersionId
  )
  requireReportingEnabled(definition)
  const captured = await captureReportingExportSnapshot(
    db,
    current,
    {
      definitionId: definition.id,
      definitionVersionId: version.id,
      definitionVersion: version.version,
      schema: version.schema_snapshot,
      sourceReleaseId: version.source_release_id,
      sourceReleaseVersion: version.source_release_version,
      fieldMap: version.field_bindings,
    },
    input.query,
    secondaryActor
  )
  const id = randomUUID()
  await db.query(
    'INSERT INTO report_export_jobs(tenant_id,id,definition_id,definition_version_id,source_application_id,source_release_id,source_release_version,created_by,report_name,format,query,snapshot,snapshot_hash,field_bindings,authorization_manifest,object_key,total_rows) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
    [
      current.tenantId,
      id,
      definition.id,
      version.id,
      version.source_application_id,
      version.source_release_id,
      version.source_release_version,
      current.userId,
      version.schema_snapshot.name,
      input.format,
      JSON.stringify(captured.snapshot.query),
      JSON.stringify(captured.snapshot),
      contentHash(captured.snapshot),
      JSON.stringify(version.field_bindings),
      JSON.stringify(captured.manifest),
      randomBytes(32).toString('hex'),
      captured.snapshot.total,
    ]
  )
  await appendReportExportEvent(db, current, id, 'created', {
    total: captured.snapshot.total,
    format: input.format,
    definitionVersionId: version.id,
  })
  await audit(
    db,
    current,
    'report-export',
    'report-export.created',
    'report-export',
    id,
    'success',
    {
      total: captured.snapshot.total,
      format: input.format,
      definitionVersionId: version.id,
      snapshotHash: contentHash(captured.snapshot),
    }
  )
  return { id }
}

const allPermissions = Object.values(E)
const statuses = [
  'queued',
  'processing',
  'completed',
  'failed',
  'blocked',
  'cancelled',
  'infected',
]
const accessible = async (db: Database, actor: Actor, id: string) => {
  const job = one(
    await rows<ReportExportJobRow>(
      db,
      'SELECT * FROM report_export_jobs WHERE tenant_id=$1 AND id=$2',
      [actor.tenantId, id]
    )
  )
  const permissions = allPermissions.filter((code) =>
    hasPermission(actor.permissions, code)
  )
  if (!permissions.length) requirePermission(actor.permissions, E.list)
  const visible = one(
    await rows<{ visible: boolean }>(
      db,
      'SELECT EXISTS(SELECT 1 FROM unnest($4::text[]) code WHERE af_historical_member_scope_visible($1,$2,code,$3)) AS visible',
      [actor.tenantId, actor.userId, job.created_by, permissions]
    )
  )
  if (!visible.visible && !(await hasScheduleExportGrant(db, actor, job.id)))
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  return job
}
const closed = (job: ReportExportJobRow) => {
  if (job.retention_until <= new Date())
    throw new DomainError(
      410,
      'REPORT_EXPORT_EXPIRED',
      '导出保留期已结束，不能恢复制品'
    )
}
// eslint-disable-next-line import/prefer-default-export
export const registerReportExportRoutes = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault,
  runtime: ReportExportRuntime = {}
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  const idOf = (params: unknown) => text(record(params).id, 'id', 100)
  server.get('/api/reporting/exports/capabilities', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (_db, current) => {
        if (
          !allPermissions.some((code) =>
            hasPermission(current.permissions, code)
          )
        )
          requirePermission(current.permissions, E.create)
        return ok(await reportExportCapabilities(runtime), request.id)
      }
    )
  })
  server.post('/api/reporting/exports', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseReportExportCreate(request.body)
    const result = await idempotent<{ id: string }>(
      pool,
      actor,
      E.create,
      'report-export.create',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        requirePermission(current.permissions, P.query)
        const { definition } = await locateReportingVersion(
          db,
          current,
          input.definitionVersionId
        )
        requireReportingEnabled(definition)
        const capability = (
          await reportExportCapabilities(runtime)
        ).formats.find((value) => value.format === input.format)
        if (!capability?.available)
          throw new DomainError(
            503,
            'REPORT_EXPORT_FORMAT_UNAVAILABLE',
            capability?.reason || '导出格式当前不可用'
          )
        const { id } = await createReportExportPlan(db, current, input)
        fault('report-export.create.before-commit')
        return { id }
      },
      false,
      '',
      async (db, current, saved) => {
        requirePermission(current.permissions, P.query)
        const job = await locateReportExport(db, current, saved.id, E.create)
        return { id: job.id }
      }
    )
    return authorizedTransaction(pool, actor, E.create, async (db, current) =>
      ok(
        await reportExportDto(
          db,
          current,
          await locateReportExport(db, current, result.id, E.create),
          true
        ),
        request.id
      )
    )
  })
  server.get('/api/reporting/exports', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, E.list, async (db, current) => {
      const query = record(request.query)
      onlyKeys(query, ['current', 'pageSize', 'keyword', 'status', 'archived'])
      const page = pageQuery({
        ...query,
        pageSize: query.pageSize === undefined ? 20 : query.pageSize,
      })
      const status =
        query.status === undefined || query.status === ''
          ? ''
          : text(query.status, 'status', 30)
      if (status && !statuses.includes(status))
        throw new DomainError(
          422,
          'REPORT_EXPORT_STATUS_INVALID',
          '导出任务状态无效'
        )
      const archived =
        query.archived === undefined
          ? 'active'
          : text(query.archived, 'archived', 20)
      if (!['active', 'archived', 'all'].includes(archived))
        throw new DomainError(
          422,
          'REPORT_EXPORT_ARCHIVE_FILTER_INVALID',
          '归档筛选无效'
        )
      const params = [
        current.tenantId,
        current.userId,
        E.list,
        `%${page.keyword.replace(/[!%_]/g, '!$&')}%`,
        status,
        archived,
      ]
      const filter =
        "WHERE tenant_id=$1 AND (af_historical_member_scope_visible($1,$2,$3,created_by) OR af_report_schedule_grant_visible($1,$2,id)) AND report_name ILIKE $4 ESCAPE '!' AND ($5='' OR status=$5) AND ($6='all' OR ($6='active' AND archived_at IS NULL) OR ($6='archived' AND archived_at IS NOT NULL))"
      const total = one(
        await rows<{ total: string }>(
          db,
          `SELECT count(*) AS total FROM report_export_jobs ${filter}`,
          params
        )
      )
      const jobs = await rows<ReportExportJobRow>(
        db,
        `SELECT * FROM report_export_jobs ${filter} ORDER BY created_at DESC,id LIMIT $7 OFFSET $8`,
        [...params, page.pageSize, page.offset]
      )
      const list: ReportingExportJob[] = []
      await sequential(jobs, async (job) => {
        list.push(await reportExportDto(db, current, job))
      })
      return ok(
        {
          list,
          total: Number(total.total),
          current: page.current,
          pageSize: page.pageSize,
        },
        request.id
      )
    })
  })
  server.get('/api/reporting/exports/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, undefined, async (db, current) =>
      ok(
        await reportExportDto(
          db,
          current,
          await accessible(db, current, idOf(request.params)),
          true
        ),
        request.id
      )
    )
  })
  ;(['cancel', 'retry', 'archive'] as const).forEach((command) => {
    server.post(`/api/reporting/exports/:id/${command}`, async (request) => {
      const actor = await authenticate(pool, request)
      const id = idOf(request.params)
      const input: { expectedRevision: number; archived?: boolean } =
        command === 'archive'
          ? parseReportExportArchive(request.body)
          : parseReportExportCommand(request.body)
      const permission = E[command]
      const result = await idempotent(
        pool,
        actor,
        permission,
        `report-export.${command}`,
        scalarHeader(request, 'idempotency-key'),
        { id, ...input },
        async (db, current) => {
          const job = await locateReportExport(
            db,
            current,
            id,
            permission,
            true
          )
          assertRevision(job.revision, input.expectedRevision)
          if (command === 'cancel') {
            if (
              ![
                'queued',
                'processing',
                'failed',
                'blocked',
                'cancelled',
              ].includes(job.status)
            )
              throw new DomainError(
                409,
                'REPORT_EXPORT_CANCEL_CLOSED',
                '已完成或隔离的导出不能取消'
              )
            if (job.status !== 'cancelled')
              await db.query(
                "UPDATE report_export_jobs SET status='cancelled',stage='stopped',claimed_by=NULL,lease_until=NULL,error_code=NULL,error_message=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
                [current.tenantId, id]
              )
          } else if (command === 'retry') {
            closed(job)
            if (
              !['failed', 'blocked'].includes(job.status) ||
              job.attempts >= 5
            )
              throw new DomainError(
                409,
                'REPORT_EXPORT_RETRY_CLOSED',
                '任务不可重试或已达到5次上限'
              )
            await assertReportExportOrigin(db, job, current.traceId)
            await db.query(
              "UPDATE report_export_jobs SET status='queued',stage='queued',claimed_by=NULL,lease_until=NULL,error_code=NULL,error_message=NULL,next_attempt_at=now(),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
              [current.tenantId, id]
            )
          } else {
            if (['queued', 'processing'].includes(job.status))
              throw new DomainError(
                409,
                'REPORT_EXPORT_ARCHIVE_CLOSED',
                '执行中的导出任务不能归档'
              )
            closed(job)
            const artifact = await reportExportArtifact(db, job)
            if (
              artifact &&
              (artifact.status === 'expired' ||
                artifact.expires_at <= new Date())
            )
              throw new DomainError(
                410,
                'REPORT_EXPORT_EXPIRED',
                '导出制品已过期，不能恢复'
              )
            const archived = input.archived === true
            if (archived !== !!job.archived_at) {
              await db.query(
                "UPDATE report_export_jobs SET archived_at=CASE WHEN $3 THEN now() ELSE NULL END,retention_until=created_at+CASE WHEN $3 THEN interval '365 days' ELSE interval '7 days' END,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
                [current.tenantId, id, archived]
              )
              await db.query(
                "UPDATE report_export_artifacts SET expires_at=(SELECT retention_until FROM report_export_jobs WHERE tenant_id=$1 AND id=$2) WHERE tenant_id=$1 AND job_id=$2 AND status<>'expired'",
                [current.tenantId, id]
              )
            }
          }
          await appendReportExportEvent(
            db,
            current,
            id,
            command,
            command === 'archive' ? { archived: input.archived === true } : {}
          )
          await audit(
            db,
            current,
            'report-export',
            `report-export.${command}`,
            'report-export',
            id,
            'success',
            command === 'archive' ? { archived: input.archived === true } : {}
          )
          fault(`report-export.${command}.before-commit`)
          return { id }
        },
        false,
        '',
        async (db, current, saved) => {
          await locateReportExport(db, current, saved.id, permission)
          return { id: saved.id }
        }
      )
      return authorizedTransaction(
        pool,
        actor,
        permission,
        async (db, current) =>
          ok(
            await reportExportDto(
              db,
              current,
              await locateReportExport(db, current, result.id, permission),
              true
            ),
            request.id
          )
      )
    })
  })
  server.get('/api/reporting/exports/:id/content', async (request, reply) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), [])
    const downloaded = await authorizedTransaction(
      pool,
      actor,
      E.download,
      async (db, current) => {
        const job = await locateReportExport(
          db,
          current,
          idOf(request.params),
          E.download
        )
        closed(job)
        await assertReportExportOrigin(db, job, current.traceId)
        await assertReportExportSnapshotAccess(db, current, job)
        const artifact = await reportExportArtifact(db, job)
        if (
          artifact?.status === 'expired' ||
          (artifact?.expires_at && artifact.expires_at <= new Date())
        )
          throw new DomainError(
            410,
            'REPORT_EXPORT_EXPIRED',
            '导出制品保留期已结束'
          )
        if (
          job.status !== 'completed' ||
          !artifact ||
          artifact.status !== 'ready'
        )
          throw new DomainError(
            409,
            'REPORT_EXPORT_NOT_READY',
            '导出尚未生成并通过真实扫描'
          )
        const bytes = await reportExportStore(runtime).get(artifact.object_key)
        if (
          bytes.length !== artifact.size ||
          fileDigest(bytes) !== artifact.sha256
        )
          throw new DomainError(
            503,
            'REPORT_EXPORT_INTEGRITY_FAILED',
            '导出制品完整性检查失败'
          )
        await audit(
          db,
          current,
          'report-export',
          'report-export.download',
          'report-export',
          job.id,
          'success',
          { sha256: artifact.sha256, size: artifact.size }
        )
        return { bytes, artifact }
      }
    )
    return reply
      .header('content-type', downloaded.artifact.mime_type)
      .header('content-length', downloaded.bytes.length)
      .header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(
          downloaded.artifact.file_name
        )}`
      )
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .send(downloaded.bytes)
  })
}
