import { randomUUID } from 'node:crypto'
import {
  DomainError,
  REPORT_SCHEDULE_PERMISSIONS as S,
  REPORT_EXPORT_PERMISSIONS as E,
  REPORT_SCHEDULE_MAX_RECIPIENTS,
  parseReportScheduleCreate,
  parseReportScheduleUpdate,
  parseReportScheduleToggle,
  parseReportScheduleCommand,
  parseReportScheduleDefinition,
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
  rows,
  one,
  authorizedTransaction,
  idempotent,
  contentHash,
  pageQuery,
  sequential,
  noFault,
  audit,
} from './support'
import { nextReportScheduleOccurrence } from './report-schedule-calendar'
import {
  locateSchedule,
  scheduleScope,
  scheduleOrigin,
  validateScheduleSource,
  previewSchedule,
  scheduleVersion,
  scheduleDto,
  runDto,
  scheduleEvent,
} from './report-schedules-access'
import {
  assertReportExportOrigin,
  reportExportPrincipal,
  appendReportExportEvent,
} from './report-export-access'
import { assertScheduleRecipient } from './report-schedules-grants'
import { captureReportingSource, assertReportingFields } from './report-source'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import type {
  ReportScheduleDefinitionV1,
  ReportSchedule,
  ReportScheduleRun,
} from '@af-admin/contracts'
import type {
  ScheduleRow,
  ScheduleRunRow,
  ScheduleRecipientRow,
} from './report-schedules-access'
import type { ReportExportJobRow } from './report-export-access'

const gov = [S.list, S.create, S.update, S.toggle]
const governed = async (
  db: Database,
  actor: Actor,
  id: string,
  codes: string[] = gov
) => {
  const row = one(
    await rows<ScheduleRow>(
      db,
      'SELECT * FROM report_schedules WHERE tenant_id=$1 AND id=$2',
      [actor.tenantId, id]
    )
  )
  const held = codes.filter((code) => hasPermission(actor.permissions, code))
  if (!held.length) requirePermission(actor.permissions, codes[0])
  if (
    !one(
      await rows<{ visible: boolean }>(
        db,
        'SELECT EXISTS(SELECT 1 FROM unnest($4::text[]) code WHERE af_historical_member_scope_visible($1,$2,code,$3)) AS visible',
        [actor.tenantId, actor.userId, row.created_by, held]
      )
    ).visible
  )
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  return { row, code: held[0] }
}
const bindVersion = async (
  db: Database,
  actor: Actor,
  scheduleId: string,
  schema: ReportScheduleDefinitionV1
) => {
  const next = one(
    await rows<{ version: number }>(
      db,
      'SELECT COALESCE(max(version),0)+1 AS version FROM report_schedule_versions WHERE tenant_id=$1 AND schedule_id=$2',
      [actor.tenantId, scheduleId]
    )
  )
  const id = randomUUID()
  await db.query(
    'INSERT INTO report_schedule_versions(tenant_id,id,schedule_id,version,schema_snapshot,definition_version_id,content_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      actor.tenantId,
      id,
      scheduleId,
      next.version,
      JSON.stringify(schema),
      schema.definitionVersionId,
      contentHash(schema),
      actor.userId,
    ]
  )
  return { id, version: next.version }
}
const openPeriod = async (
  db: Database,
  tenantId: string,
  scheduleId: string,
  versionId: string,
  originId: string,
  schema: ReportScheduleDefinitionV1,
  startedAt: Date,
  id = randomUUID()
) => {
  const cursor = nextReportScheduleOccurrence(schema.timing, startedAt)
  await db.query(
    'INSERT INTO report_schedule_periods(tenant_id,id,schedule_id,rule_version_id,origin_id,started_at,cursor_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [tenantId, id, scheduleId, versionId, originId, startedAt, cursor]
  )
  return id
}
const closePeriod = async (db: Database, row: ScheduleRow, closedAt: Date) => {
  if (row.active_period_id)
    await db.query(
      'UPDATE report_schedule_periods SET closed_at=COALESCE(closed_at,$3),revision=revision+1 WHERE tenant_id=$1 AND id=$2',
      [row.tenant_id, row.active_period_id, closedAt]
    )
}
// eslint-disable-next-line import/prefer-default-export
export const registerReportSchedules = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  const idOf = (params: unknown) => text(record(params).id, 'id', 100)
  server.get('/api/reporting/schedules/recipient-options', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        const input = record(request.query)
        onlyKeys(input, ['purpose', 'scheduleId'])
        const purpose =
          input.purpose === undefined
            ? 'create'
            : text(input.purpose, 'purpose', 20)
        if (!['create', 'update'].includes(purpose))
          throw new DomainError(
            422,
            'REPORT_SCHEDULE_PURPOSE_INVALID',
            '目录用途无效'
          )
        let origin = current
        if (purpose === 'update') {
          const id = text(input.scheduleId, 'scheduleId', 100)
          const row = await locateSchedule(db, current, id, S.update)
          origin = await scheduleOrigin(
            db,
            current.tenantId,
            row.created_by,
            current.traceId
          )
        } else {
          requirePermission(current.permissions, S.create)
          origin = await scheduleOrigin(
            db,
            current.tenantId,
            current.userId,
            current.traceId
          )
        }
        const condition =
          "m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND af_member_scope_visible($1,$2,$3,m.user_id) AND (af_effective_permissions(m.tenant_id,m.user_id) ? 'report:query' OR af_effective_permissions(m.tenant_id,m.user_id) ? '*') AND (af_effective_permissions(m.tenant_id,m.user_id) ? 'report:export:list' OR af_effective_permissions(m.tenant_id,m.user_id) ? '*') AND (af_effective_permissions(m.tenant_id,m.user_id) ? 'report:export:download' OR af_effective_permissions(m.tenant_id,m.user_id) ? '*')"
        const roles = await rows<{
          id: string
          name: string
          eligibleRecipientCount: number
        }>(
          db,
          `SELECT role.id,role.role_name AS name,(SELECT count(DISTINCT m.user_id)::int FROM member_roles mr JOIN memberships m ON m.tenant_id=mr.tenant_id AND m.user_id=mr.user_id JOIN users u ON u.id=m.user_id WHERE mr.tenant_id=role.tenant_id AND mr.role_id=role.id AND ${condition}) AS "eligibleRecipientCount" FROM roles role WHERE role.tenant_id=$1 AND role.status='enabled' AND role.deleted_at IS NULL ORDER BY role.role_name,role.id`,
          [current.tenantId, origin.userId, S.create]
        )
        const departments = await rows<{
          id: string
          name: string
          eligibleRecipientCount: number
        }>(
          db,
          `SELECT d.id,d.department_name AS name,(SELECT count(*)::int FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.department_id=d.id AND ${condition}) AS "eligibleRecipientCount" FROM departments d WHERE d.tenant_id=$1 AND d.status='enabled' AND d.deleted_at IS NULL ORDER BY d.department_name,d.id`,
          [current.tenantId, origin.userId, S.create]
        )
        return ok(
          { roles, departments, maxRecipients: REPORT_SCHEDULE_MAX_RECIPIENTS },
          request.id
        )
      }
    )
  })
  server.post('/api/reporting/schedules/preview', async (request) => {
    const actor = await authenticate(pool, request)
    const input = record(request.body)
    onlyKeys(input, ['schema', 'scheduleId'])
    const schema = parseReportScheduleDefinition(input.schema)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        let origin = current
        let displayCode: string = S.create
        if (input.scheduleId) {
          const target = await governed(
            db,
            current,
            text(input.scheduleId, 'scheduleId', 100),
            [S.update, S.toggle]
          )
          origin = await scheduleOrigin(
            db,
            current.tenantId,
            target.row.created_by,
            current.traceId
          )
          displayCode = target.code
        } else
          origin = await scheduleOrigin(
            db,
            current.tenantId,
            current.userId,
            current.traceId
          )
        return ok(
          await previewSchedule(db, current, origin, schema, displayCode),
          request.id
        )
      }
    )
  })
  server.post('/api/reporting/schedules/:id/preview', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.body || {}), [])
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        const target = await governed(db, current, idOf(request.params), [
          S.update,
          S.toggle,
        ])
        const version = await scheduleVersion(
          db,
          current.tenantId,
          target.row.active_version_id
        )
        const origin = await scheduleOrigin(
          db,
          current.tenantId,
          target.row.created_by,
          current.traceId
        )
        return ok(
          await previewSchedule(
            db,
            current,
            origin,
            version.schema_snapshot,
            target.code
          ),
          request.id
        )
      }
    )
  })
  server.get('/api/reporting/schedules', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, S.list, async (db, current) => {
      const query = record(request.query)
      onlyKeys(query, ['current', 'pageSize', 'keyword', 'status', 'frequency'])
      const page = pageQuery({
        ...query,
        pageSize: query.pageSize === undefined ? 20 : query.pageSize,
      })
      const status = query.status === undefined ? '' : String(query.status)
      const frequency =
        query.frequency === undefined ? '' : String(query.frequency)
      if (
        !['', 'enabled', 'disabled'].includes(status) ||
        !['', 'daily', 'weekly', 'monthly'].includes(frequency)
      )
        throw new DomainError(
          422,
          'REPORT_SCHEDULE_FILTER_INVALID',
          '规则筛选无效'
        )
      const params = [
        current.tenantId,
        current.userId,
        S.list,
        `%${page.keyword.replace(/[!%_]/g, '!$&')}%`,
        status,
        frequency,
      ]
      const filter =
        "FROM report_schedules s JOIN report_schedule_versions v ON v.tenant_id=s.tenant_id AND v.id=s.active_version_id WHERE s.tenant_id=$1 AND af_historical_member_scope_visible($1,$2,$3,s.created_by) AND v.schema_snapshot->>'name' ILIKE $4 ESCAPE '!' AND ($5='' OR s.enabled=($5='enabled')) AND ($6='' OR v.schema_snapshot->'timing'->>'frequency'=$6)"
      const total = one(
        await rows<{ total: string }>(
          db,
          `SELECT count(*) AS total ${filter}`,
          params
        )
      )
      const found = await rows<ScheduleRow>(
        db,
        `SELECT s.* ${filter} ORDER BY s.updated_at DESC,s.id LIMIT $7 OFFSET $8`,
        [...params, page.pageSize, page.offset]
      )
      const list: ReportSchedule[] = []
      await sequential(found, async (row) => {
        list.push(await scheduleDto(db, current, row))
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
  server.post('/api/reporting/schedules', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseReportScheduleCreate(request.body)
    const result = await idempotent<{ id: string }>(
      pool,
      actor,
      S.create,
      'report-schedule.create',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const origin = await scheduleOrigin(
          db,
          current.tenantId,
          current.userId,
          current.traceId
        )
        await scheduleScope(db, current, current.userId, S.create)
        await validateScheduleSource(db, origin, input.schema)
        const id = randomUUID()
        const versionId = randomUUID()
        const periodId = input.enabled ? randomUUID() : null
        const { time } = one(
          await rows<{ time: Date }>(db, 'SELECT clock_timestamp() AS time')
        )
        await db.query(
          'INSERT INTO report_schedules(tenant_id,id,enabled,active_version_id,active_period_id,created_by) VALUES($1,$2,$3,$4,$5,$6)',
          [
            current.tenantId,
            id,
            input.enabled,
            versionId,
            periodId,
            current.userId,
          ]
        )
        await db.query(
          'INSERT INTO report_schedule_versions(tenant_id,id,schedule_id,version,schema_snapshot,definition_version_id,content_hash,created_by) VALUES($1,$2,$3,1,$4,$5,$6,$7)',
          [
            current.tenantId,
            versionId,
            id,
            JSON.stringify(input.schema),
            input.schema.definitionVersionId,
            contentHash(input.schema),
            current.userId,
          ]
        )
        if (periodId)
          await openPeriod(
            db,
            current.tenantId,
            id,
            versionId,
            current.userId,
            input.schema,
            time,
            periodId
          )
        await scheduleEvent(db, current, id, 'created', {
          enabled: input.enabled,
        })
        fault('report-schedule.create.before-commit')
        return { id }
      },
      true,
      '',
      async (db, current, saved) => {
        await locateSchedule(db, current, saved.id, S.create)
        return saved
      }
    )
    return authorizedTransaction(pool, actor, S.create, async (db, current) =>
      ok(
        await scheduleDto(
          db,
          current,
          await locateSchedule(db, current, result.id, S.create),
          true
        ),
        request.id
      )
    )
  })
  server.get('/api/reporting/schedules/runs', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      S.runRead,
      async (db, current) => {
        const query = record(request.query)
        onlyKeys(query, [
          'current',
          'pageSize',
          'keyword',
          'status',
          'scheduleId',
        ])
        const page = pageQuery({
          ...query,
          pageSize: query.pageSize === undefined ? 20 : query.pageSize,
        })
        const status = query.status === undefined ? '' : String(query.status)
        const scheduleId =
          query.scheduleId === undefined ? '' : String(query.scheduleId)
        if (
          ![
            '',
            'queued',
            'processing',
            'waiting-exports',
            'completed',
            'partial-failed',
            'failed',
            'blocked',
            'cancelled',
          ].includes(status)
        )
          throw new DomainError(
            422,
            'REPORT_SCHEDULE_RUN_FILTER_INVALID',
            '运行筛选无效'
          )
        const params = [
          current.tenantId,
          current.userId,
          S.runRead,
          `%${page.keyword.replace(/[!%_]/g, '!$&')}%`,
          status,
          scheduleId,
        ]
        const filter =
          "FROM report_schedule_runs r JOIN report_schedule_versions v ON v.tenant_id=r.tenant_id AND v.id=r.rule_version_id WHERE r.tenant_id=$1 AND af_historical_member_scope_visible($1,$2,$3,r.created_by) AND v.schema_snapshot->>'name' ILIKE $4 ESCAPE '!' AND ($5='' OR r.status=$5) AND ($6='' OR r.schedule_id=$6)"
        const total = one(
          await rows<{ total: string }>(
            db,
            `SELECT count(*) AS total ${filter}`,
            params
          )
        )
        const found = await rows<ScheduleRunRow>(
          db,
          `SELECT r.* ${filter} ORDER BY r.slot_at DESC,r.id LIMIT $7 OFFSET $8`,
          [...params, page.pageSize, page.offset]
        )
        const list: ReportScheduleRun[] = []
        await sequential(found, async (row) => {
          list.push(await runDto(db, current, row))
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
      }
    )
  })
  server.get('/api/reporting/schedules/runs/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      S.runRead,
      async (db, current) => {
        const run = one(
          await rows<ScheduleRunRow>(
            db,
            'SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, idOf(request.params)]
          )
        )
        await scheduleScope(db, current, run.created_by, S.runRead)
        return ok(await runDto(db, current, run, true), request.id)
      }
    )
  })
  server.get('/api/reporting/schedules/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, undefined, async (db, current) =>
      ok(
        await scheduleDto(
          db,
          current,
          (
            await governed(db, current, idOf(request.params))
          ).row,
          true
        ),
        request.id
      )
    )
  })
  server.put('/api/reporting/schedules/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const input = parseReportScheduleUpdate(request.body)
    const result = await idempotent(
      pool,
      actor,
      S.update,
      `report-schedule.update:${id}`,
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const row = await locateSchedule(db, current, id, S.update, true)
        assertRevision(row.revision, input.expectedRevision)
        const origin = await scheduleOrigin(
          db,
          current.tenantId,
          row.created_by,
          current.traceId
        )
        await validateScheduleSource(db, origin, input.schema)
        const { time } = one(
          await rows<{ time: Date }>(db, 'SELECT clock_timestamp() AS time')
        )
        await closePeriod(db, row, time)
        const version = await bindVersion(db, current, id, input.schema)
        const periodId = row.enabled
          ? await openPeriod(
              db,
              row.tenant_id,
              row.id,
              version.id,
              row.created_by,
              input.schema,
              time
            )
          : null
        await db.query(
          'UPDATE report_schedules SET active_version_id=$3,active_period_id=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [current.tenantId, id, version.id, periodId]
        )
        await scheduleEvent(db, current, id, 'version.updated', {
          version: version.version,
        })
        fault('report-schedule.update.before-commit')
        return { id }
      },
      true,
      '',
      async (db, current, saved) => {
        await locateSchedule(db, current, saved.id, S.update)
        return saved
      }
    )
    return authorizedTransaction(pool, actor, S.update, async (db, current) =>
      ok(
        await scheduleDto(
          db,
          current,
          await locateSchedule(db, current, result.id, S.update),
          true
        ),
        request.id
      )
    )
  })
  server.post('/api/reporting/schedules/:id/enabled', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const input = parseReportScheduleToggle(request.body)
    const result = await idempotent(
      pool,
      actor,
      S.toggle,
      `report-schedule.toggle:${id}`,
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const row = await locateSchedule(db, current, id, S.toggle, true)
        assertRevision(row.revision, input.expectedRevision)
        if (row.enabled !== input.enabled) {
          const { time } = one(
            await rows<{ time: Date }>(db, 'SELECT clock_timestamp() AS time')
          )
          const rule = await scheduleVersion(
            db,
            row.tenant_id,
            row.active_version_id
          )
          let periodId = null
          if (input.enabled) {
            const origin = await scheduleOrigin(
              db,
              row.tenant_id,
              row.created_by,
              current.traceId
            )
            await validateScheduleSource(db, origin, rule.schema_snapshot)
            periodId = await openPeriod(
              db,
              row.tenant_id,
              row.id,
              rule.id,
              row.created_by,
              rule.schema_snapshot,
              time
            )
          } else await closePeriod(db, row, time)
          await db.query(
            'UPDATE report_schedules SET enabled=$3,active_period_id=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id, input.enabled, periodId]
          )
          await scheduleEvent(
            db,
            current,
            id,
            input.enabled ? 'enabled' : 'disabled',
            {}
          )
        }
        fault('report-schedule.toggle.before-commit')
        return { id }
      },
      true,
      '',
      async (db, current, saved) => {
        await locateSchedule(db, current, saved.id, S.toggle)
        return saved
      }
    )
    return authorizedTransaction(pool, actor, S.toggle, async (db, current) =>
      ok(
        await scheduleDto(
          db,
          current,
          await locateSchedule(db, current, result.id, S.toggle),
          true
        ),
        request.id
      )
    )
  })
  ;(['retry', 'cancel'] as const).forEach((command) =>
    server.post(
      `/api/reporting/schedules/runs/:id/${command}`,
      async (request) => {
        const actor = await authenticate(pool, request)
        const id = idOf(request.params)
        const input = parseReportScheduleCommand(request.body)
        const permission = command === 'retry' ? S.retry : S.cancel
        const result = await idempotent(
          pool,
          actor,
          permission,
          `report-schedule.run.${command}:${id}`,
          scalarHeader(request, 'idempotency-key'),
          input,
          async (db, current) => {
            const run = one(
              await rows<ScheduleRunRow>(
                db,
                'SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
                [current.tenantId, id]
              )
            )
            await scheduleScope(db, current, run.created_by, permission)
            assertRevision(run.revision, input.expectedRevision)
            if (['completed', 'cancelled'].includes(run.status))
              throw new DomainError(
                409,
                'REPORT_SCHEDULE_RUN_CLOSED',
                '已完成或取消运行不可重试或取消'
              )
            const recipients = await rows<ScheduleRecipientRow>(
              db,
              'SELECT * FROM report_schedule_run_recipients WHERE tenant_id=$1 AND run_id=$2 ORDER BY id FOR UPDATE',
              [current.tenantId, id]
            )
            if (command === 'cancel') {
              await scheduleScope(db, current, run.created_by, E.cancel)
              await sequential(
                recipients.filter((r) => r.status !== 'completed'),
                async (r) => {
                  if (r.export_job_id) {
                    const changed = await db.query(
                      "UPDATE report_export_jobs SET status='cancelled',stage='stopped',claimed_by=NULL,lease_until=NULL,error_code=NULL,error_message=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status IN('queued','processing','failed','blocked') RETURNING id",
                      [current.tenantId, r.export_job_id]
                    )
                    if (changed.rowCount) {
                      await appendReportExportEvent(
                        db,
                        current,
                        r.export_job_id,
                        'cancel',
                        { scheduleRunId: run.id }
                      )
                      await audit(
                        db,
                        current,
                        'report-export',
                        'report-export.cancel',
                        'report-export',
                        r.export_job_id,
                        'success',
                        { scheduleRunId: run.id }
                      )
                    }
                  }
                  if (r.status !== 'cancelled') {
                    await db.query(
                      "UPDATE report_schedule_run_recipients SET status='cancelled',claimed_by=NULL,lease_until=NULL,revision=revision+1 WHERE tenant_id=$1 AND id=$2",
                      [current.tenantId, r.id]
                    )
                    await scheduleEvent(
                      db,
                      current,
                      run.schedule_id,
                      'recipient.cancelled',
                      {},
                      run.id,
                      r.id
                    )
                  }
                }
              )
              await db.query(
                "UPDATE report_schedule_runs SET status='cancelled',cancelled_at=now(),claimed_by=NULL,lease_until=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
                [current.tenantId, id]
              )
            } else {
              if (!['failed', 'blocked', 'partial-failed'].includes(run.status))
                throw new DomainError(
                  409,
                  'REPORT_SCHEDULE_RETRY_CLOSED',
                  '仅失败或部分失败运行可重试'
                )
              const origin = await scheduleOrigin(
                db,
                current.tenantId,
                run.created_by,
                current.traceId
              )
              const rule = await scheduleVersion(
                db,
                current.tenantId,
                run.rule_version_id
              )
              await validateScheduleSource(db, origin, rule.schema_snapshot)
              if (!run.recipients_resolved_at && run.attempts >= 5)
                throw new DomainError(
                  409,
                  'REPORT_SCHEDULE_RETRY_EXHAUSTED',
                  '集合解析已达到5次上限'
                )
              if (run.recipients_resolved_at) {
                const retryable = recipients.filter(
                  (r) =>
                    ['failed', 'blocked', 'skipped'].includes(r.status) &&
                    r.attempts < 5
                )
                if (!retryable.length)
                  throw new DomainError(
                    409,
                    'REPORT_SCHEDULE_RETRY_EXHAUSTED',
                    '没有可重试固定收件事实'
                  )
                let retried = 0
                await sequential(retryable, async (r) => {
                  await db.query('SAVEPOINT recipient_retry')
                  try {
                    const receiver = await reportExportPrincipal(
                      db,
                      current.tenantId,
                      r.user_id,
                      current.traceId
                    )
                    await assertScheduleRecipient(
                      db,
                      origin,
                      receiver,
                      rule.schema_snapshot
                    )
                    const checked = await validateScheduleSource(
                      db,
                      origin,
                      rule.schema_snapshot
                    )
                    await captureReportingSource(
                      db,
                      receiver,
                      checked.version.source_application_id,
                      checked.version.source_release_id
                    )
                    if (run.query)
                      assertReportingFields(checked.source, receiver, [
                        run.query.sort.field,
                      ])
                    if (r.export_job_id) {
                      const job = one(
                        await rows<ReportExportJobRow>(
                          db,
                          'SELECT * FROM report_export_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
                          [current.tenantId, r.export_job_id]
                        )
                      )
                      await assertReportExportOrigin(db, job, current.traceId)
                      if (
                        ['infected', 'cancelled'].includes(job.status) ||
                        job.retention_until <= new Date()
                      )
                        throw new DomainError(
                          409,
                          'REPORT_SCHEDULE_RETRY_EXHAUSTED',
                          '子制品不可重试'
                        )
                      if (['failed', 'blocked'].includes(job.status)) {
                        if (job.attempts >= 5)
                          throw new DomainError(
                            409,
                            'REPORT_SCHEDULE_RETRY_EXHAUSTED',
                            '子制品达到5次上限'
                          )
                        await db.query(
                          "UPDATE report_export_jobs SET status='queued',stage='queued',claimed_by=NULL,lease_until=NULL,error_code=NULL,error_message=NULL,next_attempt_at=now(),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
                          [current.tenantId, job.id]
                        )
                        await appendReportExportEvent(
                          db,
                          current,
                          job.id,
                          'retry',
                          { scheduleRunId: run.id }
                        )
                        await audit(
                          db,
                          current,
                          'report-export',
                          'report-export.retry',
                          'report-export',
                          job.id,
                          'success',
                          { scheduleRunId: run.id }
                        )
                      }
                    }
                    await db.query(
                      "UPDATE report_schedule_run_recipients SET status='queued',claimed_by=NULL,lease_until=NULL,error_code=NULL,error_message=NULL,next_attempt_at=now(),revision=revision+1 WHERE tenant_id=$1 AND id=$2",
                      [current.tenantId, r.id]
                    )
                    await scheduleEvent(
                      db,
                      current,
                      run.schedule_id,
                      'recipient.retry',
                      {},
                      run.id,
                      r.id
                    )
                    retried += 1
                  } catch (error) {
                    await db.query('ROLLBACK TO SAVEPOINT recipient_retry')
                    if (!(error instanceof DomainError)) throw error
                    await scheduleEvent(
                      db,
                      current,
                      run.schedule_id,
                      'recipient.retry-skipped',
                      { code: error.businessCode },
                      run.id,
                      r.id
                    )
                  }
                })
                if (!retried)
                  throw new DomainError(
                    409,
                    'REPORT_SCHEDULE_RETRY_EXHAUSTED',
                    '固定收件集合中没有当前合格的可重试成员'
                  )
              }
              await db.query(
                'UPDATE report_schedule_runs SET status=$3,claimed_by=NULL,lease_until=NULL,error_code=NULL,error_message=NULL,next_attempt_at=now(),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
                [
                  current.tenantId,
                  id,
                  run.recipients_resolved_at ? 'waiting-exports' : 'queued',
                ]
              )
            }
            await scheduleEvent(
              db,
              current,
              run.schedule_id,
              `run.${command}`,
              {},
              id
            )
            fault(`report-schedule.${command}.before-commit`)
            return { id }
          },
          true,
          '',
          async (db, current, saved) => {
            const run = one(
              await rows<ScheduleRunRow>(
                db,
                'SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND id=$2',
                [current.tenantId, saved.id]
              )
            )
            await scheduleScope(db, current, run.created_by, permission)
            return saved
          }
        )
        return authorizedTransaction(
          pool,
          actor,
          permission,
          async (db, current) =>
            ok(
              await runDto(
                db,
                current,
                one(
                  await rows<ScheduleRunRow>(
                    db,
                    'SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND id=$2',
                    [current.tenantId, result.id]
                  )
                ),
                true
              ),
              request.id
            )
        )
      }
    )
  )
}
