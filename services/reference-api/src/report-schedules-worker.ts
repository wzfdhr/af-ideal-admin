import { randomUUID } from 'node:crypto'
import {
  DomainError,
  REPORT_SCHEDULE_PERMISSIONS as S,
} from '@af-admin/contracts'
import { hasPermission } from '@af-admin/workflow-core'
import { transaction } from './database'
import { reportExportStore } from './report-export-jobs'
import { rows, one, sequential, noFault } from './support'
import { createReportExportPlan } from './report-exports'
import {
  assertReportExportOrigin,
  assertReportExportSnapshotAccess,
  reportExportPrincipal,
  reportExportArtifact,
} from './report-export-access'
import { assertScheduleRecipient } from './report-schedules-grants'
import { nextReportScheduleOccurrence } from './report-schedule-calendar'
import {
  scheduleVersion,
  scheduleOrigin,
  validateScheduleSource,
  resolveScheduleRecipients,
  scheduleQuery,
  scheduleEvent,
  scheduleFactActor,
} from './report-schedules-access'
import type { Pool, PoolClient } from 'pg'
import type { FaultInjector, Database } from './support'
import type { ReportExportRuntime } from './report-export-jobs'
import type { ReportExportJobRow } from './report-export-access'
import type {
  SchedulePeriodRow,
  ScheduleRunRow,
  ScheduleRecipientRow,
} from './report-schedules-access'

export const REPORT_SCHEDULE_MAINTENANCE_SCOPE_VERSION = 1

// This internal maintenance bound is never parsed from an HTTP request.
export interface ReportScheduleWorkerScope {
  readonly tenantId: string
  readonly scheduleIds: readonly string[]
}
const maintenanceScope = (value: ReportScheduleWorkerScope | undefined) => {
  if (value === undefined) return undefined
  const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !['tenantId', 'scheduleIds'].includes(key)
    ) ||
    typeof value.tenantId !== 'string' ||
    !identifier.test(value.tenantId) ||
    !Array.isArray(value.scheduleIds) ||
    value.scheduleIds.length < 1 ||
    value.scheduleIds.length > 200 ||
    value.scheduleIds.some(
      (id) => typeof id !== 'string' || !identifier.test(id)
    ) ||
    new Set(value.scheduleIds).size !== value.scheduleIds.length
  )
    throw new Error('Invalid report schedule maintenance scope')
  return Object.freeze({
    tenantId: value.tenantId,
    scheduleIds: Object.freeze([...value.scheduleIds]),
  })
}
const inMaintenanceScope = (
  scope: ReportScheduleWorkerScope | undefined,
  row: { tenant_id: string; schedule_id: string }
) =>
  !scope ||
  (row.tenant_id === scope.tenantId &&
    scope.scheduleIds.includes(row.schedule_id))
const tenantGate = (db: Database, tenantId: string) =>
  db.query('SELECT id FROM tenants WHERE id=$1 FOR SHARE', [tenantId])
const safeFailure = (error: unknown) => ({
  code:
    error instanceof DomainError
      ? error.businessCode
      : 'REPORT_SCHEDULE_EXECUTION_FAILED',
  message:
    error instanceof DomainError
      ? error.message
      : '定时报表执行失败，未产生完成事实',
  blocked:
    error instanceof DomainError &&
    (error.status === 403 ||
      error.status === 404 ||
      ['REPORT_DISABLED', 'REPORT_SOURCE_UNAVAILABLE'].includes(
        error.businessCode
      )),
  permanent: error instanceof DomainError && error.status === 422,
})
export const refreshScheduleRun = async (db: Database, run: ScheduleRunRow) => {
  if (
    ['completed', 'cancelled'].includes(run.status) ||
    !run.recipients_resolved_at
  )
    return
  const facts = await rows<ScheduleRecipientRow>(
    db,
    'SELECT * FROM report_schedule_run_recipients WHERE tenant_id=$1 AND run_id=$2',
    [run.tenant_id, run.id]
  )
  let { status } = run
  if (
    facts.some((r) =>
      ['queued', 'processing', 'waiting-export'].includes(r.status)
    )
  )
    status = 'waiting-exports'
  else if (facts.length && facts.every((r) => r.status === 'completed'))
    status = 'completed'
  else if (facts.some((r) => r.status === 'completed'))
    status = 'partial-failed'
  else if (facts.length && facts.every((r) => r.status === 'blocked'))
    status = 'blocked'
  else status = 'failed'
  if (status !== run.status) {
    await db.query(
      'UPDATE report_schedule_runs SET status=$3,claimed_by=NULL,lease_until=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
      [run.tenant_id, run.id, status]
    )
    await scheduleEvent(
      db,
      scheduleFactActor(run.tenant_id, randomUUID()),
      run.schedule_id,
      `run.${status}`,
      { status },
      run.id
    )
  }
}
const resolveRun = async (db: PoolClient, run: ScheduleRunRow) => {
  const rule = await scheduleVersion(db, run.tenant_id, run.rule_version_id)
  const origin = await scheduleOrigin(
    db,
    run.tenant_id,
    run.created_by,
    randomUUID()
  )
  await validateScheduleSource(db, origin, rule.schema_snapshot)
  const collection = await resolveScheduleRecipients(
    db,
    origin,
    rule.schema_snapshot
  )
  await sequential(collection.eligible, async (receiver) => {
    await db.query(
      'INSERT INTO report_schedule_run_recipients(tenant_id,id,run_id,user_id,notification_outbox_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,run_id,user_id) DO NOTHING',
      [run.tenant_id, randomUUID(), run.id, receiver.user_id, randomUUID()]
    )
  })
  await db.query(
    'UPDATE report_schedule_runs SET recipients_resolved_at=now(),status=$3,attempts=GREATEST(attempts,1),claimed_by=NULL,lease_until=NULL,error_code=$4,error_message=$5,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
    [
      run.tenant_id,
      run.id,
      collection.eligible.length ? 'waiting-exports' : 'failed',
      collection.eligible.length ? null : 'REPORT_SCHEDULE_NO_RECIPIENTS',
      collection.eligible.length
        ? null
        : '当前授权范围没有合格收件人，集合已固定为空',
    ]
  )
  await scheduleEvent(
    db,
    scheduleFactActor(run.tenant_id, randomUUID()),
    run.schedule_id,
    'recipients.fixed',
    { total: collection.eligible.length, unavailable: collection.unavailable },
    run.id
  )
}
const materialize = async (
  pool: Pool,
  fault: FaultInjector,
  batchSize: number,
  scope: ReportScheduleWorkerScope | undefined
) => {
  const candidates = await rows<{ tenant_id: string; id: string }>(
    pool,
    'SELECT tenant_id,id FROM report_schedule_periods WHERE cursor_at<=clock_timestamp() AND (closed_at IS NULL OR cursor_at<=closed_at) AND ($2::text IS NULL OR (tenant_id=$2 AND schedule_id=ANY($3::text[]))) ORDER BY cursor_at,id LIMIT $1',
    [batchSize, scope?.tenantId ?? null, scope?.scheduleIds ?? null]
  )
  let total = 0
  await sequential(candidates, async (candidate) => {
    const changed = await transaction(pool, async (db) => {
      await tenantGate(db, candidate.tenant_id)
      const periods = await rows<SchedulePeriodRow>(
        db,
        'SELECT * FROM report_schedule_periods WHERE tenant_id=$1 AND id=$2 AND cursor_at<=clock_timestamp() AND (closed_at IS NULL OR cursor_at<=closed_at) FOR UPDATE SKIP LOCKED',
        [candidate.tenant_id, candidate.id]
      )
      if (!periods.length) return false
      const period = periods[0]
      if (!inMaintenanceScope(scope, period)) return false
      const rule = await scheduleVersion(
        db,
        period.tenant_id,
        period.rule_version_id
      )
      const slot = period.cursor_at as Date
      const existing = await rows<ScheduleRunRow>(
        db,
        'SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND period_id=$2 AND slot_at=$3',
        [period.tenant_id, period.id, slot]
      )
      if (!existing.length) {
        let query = null
        let queryError: unknown
        try {
          query = await scheduleQuery(
            db,
            period.tenant_id,
            rule.schema_snapshot,
            slot
          )
        } catch (error) {
          queryError = error
        }
        const run = one(
          await rows<ScheduleRunRow>(
            db,
            'INSERT INTO report_schedule_runs(tenant_id,id,schedule_id,period_id,rule_version_id,slot_at,query,created_by,alert_outbox_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [
              period.tenant_id,
              randomUUID(),
              period.schedule_id,
              period.id,
              rule.id,
              slot,
              query ? JSON.stringify(query) : null,
              period.origin_id,
              randomUUID(),
            ]
          )
        )
        await scheduleEvent(
          db,
          scheduleFactActor(period.tenant_id, randomUUID()),
          period.schedule_id,
          'run.materialized',
          { slotAt: slot.toISOString() },
          run.id
        )
        await db.query('SAVEPOINT recipient_resolution')
        try {
          if (queryError) throw queryError
          await resolveRun(db, run)
        } catch (error) {
          await db.query('ROLLBACK TO SAVEPOINT recipient_resolution')
          const failure = safeFailure(error)
          await db.query(
            'UPDATE report_schedule_runs SET status=$3,attempts=1,error_code=$4,error_message=$5,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [
              period.tenant_id,
              run.id,
              failure.blocked ? 'blocked' : 'failed',
              failure.code,
              failure.message.slice(0, 300),
            ]
          )
          await scheduleEvent(
            db,
            scheduleFactActor(period.tenant_id, randomUUID()),
            period.schedule_id,
            'run.resolve-failed',
            { code: failure.code },
            run.id
          )
        }
      }
      let next: Date | null = null
      try {
        next = nextReportScheduleOccurrence(rule.schema_snapshot.timing, slot)
      } catch (error) {
        if (!(error instanceof DomainError)) throw error
      }
      if (period.closed_at && next && next > period.closed_at) next = null
      fault('report-schedule.materialize.before-advance')
      await db.query(
        'UPDATE report_schedule_periods SET cursor_at=$3,exhausted_at=CASE WHEN $3::timestamptz IS NULL THEN now() ELSE exhausted_at END,revision=revision+1 WHERE tenant_id=$1 AND id=$2',
        [period.tenant_id, period.id, next]
      )
      return true
    })
    if (changed) {
      total += 1
      fault('report-schedule.materialize.after-commit')
    }
  })
  return total
}
const resolveQueuedRuns = async (
  pool: Pool,
  fault: FaultInjector,
  batchSize: number,
  scope: ReportScheduleWorkerScope | undefined
) => {
  const candidates = await rows<{ tenant_id: string; id: string }>(
    pool,
    "SELECT tenant_id,id FROM report_schedule_runs WHERE recipients_resolved_at IS NULL AND ((status='queued' AND next_attempt_at<=now()) OR (status='processing' AND lease_until<=now())) AND ($2::text IS NULL OR (tenant_id=$2 AND schedule_id=ANY($3::text[]))) ORDER BY created_at,id LIMIT $1",
    [batchSize, scope?.tenantId ?? null, scope?.scheduleIds ?? null]
  )
  let total = 0
  await sequential(candidates, async (candidate) => {
    const claim = randomUUID()
    const run = await transaction(pool, async (db) => {
      await tenantGate(db, candidate.tenant_id)
      const selected = await rows<ScheduleRunRow>(
        db,
        "SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND id=$2 AND recipients_resolved_at IS NULL AND ((status='queued' AND next_attempt_at<=now()) OR (status='processing' AND lease_until<=now())) FOR UPDATE SKIP LOCKED",
        [candidate.tenant_id, candidate.id]
      )
      if (!selected.length) return null
      const value = selected[0]
      if (!inMaintenanceScope(scope, value)) return null
      if (value.attempts >= 5) {
        await db.query(
          "UPDATE report_schedule_runs SET status='failed',claimed_by=NULL,lease_until=NULL,error_code='REPORT_SCHEDULE_ATTEMPTS_EXHAUSTED',error_message='接收集合解析达到5次上限',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [value.tenant_id, value.id]
        )
        await scheduleEvent(
          db,
          scheduleFactActor(value.tenant_id, claim),
          value.schedule_id,
          'run.attempts-exhausted',
          {},
          value.id
        )
        return null
      }
      return one(
        await rows<ScheduleRunRow>(
          db,
          "UPDATE report_schedule_runs SET status='processing',attempts=attempts+1,claimed_by=$3,lease_until=now()+interval '90 seconds',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
          [value.tenant_id, value.id, claim]
        )
      )
    })
    if (!run) return
    total += 1
    fault('report-schedule.run.after-claim')
    await transaction(pool, async (db) => {
      await tenantGate(db, run.tenant_id)
      const selected = await rows<ScheduleRunRow>(
        db,
        "SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND id=$2 AND status='processing' AND claimed_by=$3 AND lease_until>now() FOR UPDATE",
        [run.tenant_id, run.id, claim]
      )
      if (!selected.length || !inMaintenanceScope(scope, selected[0])) return
      await db.query('SAVEPOINT run_resolution')
      try {
        fault('report-schedule.run.before-resolve')
        if (!run.query)
          throw new DomainError(
            422,
            'REPORT_SCHEDULE_QUERY_INVALID',
            '固定运行数据窗不可用'
          )
        await resolveRun(db, selected[0])
        fault('report-schedule.run.before-commit')
      } catch (error) {
        await db.query('ROLLBACK TO SAVEPOINT run_resolution')
        const failure = safeFailure(error)
        const terminal =
          failure.blocked || failure.permanent || run.attempts >= 5
        const terminalStatus = failure.blocked ? 'blocked' : 'failed'
        await db.query(
          "UPDATE report_schedule_runs SET status=$4,claimed_by=NULL,lease_until=NULL,error_code=$5,error_message=$6,next_attempt_at=now()+($7*interval '1 second'),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3",
          [
            run.tenant_id,
            run.id,
            claim,
            terminal ? terminalStatus : 'queued',
            failure.code,
            failure.message.slice(0, 300),
            Math.min(300, 5 * 2 ** run.attempts),
          ]
        )
        await scheduleEvent(
          db,
          scheduleFactActor(run.tenant_id, claim),
          run.schedule_id,
          'run.resolve-failed',
          { code: failure.code },
          run.id
        )
      }
    })
  })
  return total
}
const processRecipient = async (
  pool: Pool,
  tenantId: string,
  id: string,
  fault: FaultInjector,
  runtime: ReportExportRuntime,
  scope: ReportScheduleWorkerScope | undefined
) => {
  const claim = randomUUID()
  const claimed = await transaction(pool, async (db) => {
    await tenantGate(db, tenantId)
    const hint = (
      await rows<ScheduleRecipientRow>(
        db,
        'SELECT * FROM report_schedule_run_recipients WHERE tenant_id=$1 AND id=$2',
        [tenantId, id]
      )
    )[0]
    if (!hint) return null
    const run = one(
      await rows<ScheduleRunRow>(
        db,
        'SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [tenantId, hint.run_id]
      )
    )
    if (run.status === 'cancelled' || !inMaintenanceScope(scope, run))
      return null
    const recipients = await rows<ScheduleRecipientRow>(
      db,
      "SELECT * FROM report_schedule_run_recipients WHERE tenant_id=$1 AND id=$2 AND ((status='queued' AND next_attempt_at<=now()) OR status='waiting-export' OR (status='processing' AND lease_until<=now())) FOR UPDATE SKIP LOCKED",
      [tenantId, id]
    )
    if (!recipients.length) return null
    const recipient = recipients[0]
    if (recipient.status === 'waiting-export')
      return { run, recipient, waiting: true, claim: '' }
    if (recipient.attempts >= 5) {
      await db.query(
        "UPDATE report_schedule_run_recipients SET status='failed',claimed_by=NULL,lease_until=NULL,error_code='REPORT_SCHEDULE_ATTEMPTS_EXHAUSTED',error_message='逐收件执行达到5次上限',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [tenantId, id]
      )
      await scheduleEvent(
        db,
        scheduleFactActor(tenantId, claim),
        run.schedule_id,
        'recipient.attempts-exhausted',
        {},
        run.id,
        id
      )
      await refreshScheduleRun(db, run)
      return null
    }
    const updated = one(
      await rows<ScheduleRecipientRow>(
        db,
        "UPDATE report_schedule_run_recipients SET status='processing',attempts=attempts+1,claimed_by=$3,lease_until=now()+interval '90 seconds',revision=revision+1 WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [tenantId, id, claim]
      )
    )
    return { run, recipient: updated, waiting: false, claim }
  })
  if (!claimed) return false
  if (!claimed.waiting) fault('report-schedule.recipient.after-claim')
  await transaction(pool, async (db) => {
    await tenantGate(db, tenantId)
    const run = one(
      await rows<ScheduleRunRow>(
        db,
        'SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [tenantId, claimed.run.id]
      )
    )
    const recipient = one(
      await rows<ScheduleRecipientRow>(
        db,
        'SELECT * FROM report_schedule_run_recipients WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [tenantId, id]
      )
    )
    if (
      run.status === 'cancelled' ||
      !inMaintenanceScope(scope, run) ||
      (claimed.waiting
        ? recipient.status !== 'waiting-export'
        : recipient.status !== 'processing' ||
          recipient.claimed_by !== claim ||
          !recipient.lease_until ||
          recipient.lease_until <= new Date())
    )
      return
    await db.query('SAVEPOINT recipient_effect')
    try {
      const rule = await scheduleVersion(db, tenantId, run.rule_version_id)
      const origin = await scheduleOrigin(db, tenantId, run.created_by, claim)
      const receiver = await reportExportPrincipal(
        db,
        tenantId,
        recipient.user_id,
        claim
      )
      await assertScheduleRecipient(db, origin, receiver, rule.schema_snapshot)
      let jobId = recipient.export_job_id
      if (!jobId) {
        reportExportStore(runtime)
        if (!run.query)
          throw new DomainError(
            422,
            'REPORT_SCHEDULE_QUERY_INVALID',
            '固定运行查询不可用'
          )
        const plan = await createReportExportPlan(
          db,
          origin,
          {
            definitionVersionId: rule.schema_snapshot.definitionVersionId,
            query: run.query,
            format: rule.schema_snapshot.format,
          },
          receiver
        )
        jobId = plan.id
        await db.query(
          'UPDATE report_schedule_run_recipients SET export_job_id=$3 WHERE tenant_id=$1 AND id=$2',
          [tenantId, id, jobId]
        )
        await db.query(
          'INSERT INTO report_export_recipient_grants(tenant_id,job_id,run_id,recipient_fact_id,recipient_user_id) VALUES($1,$2,$3,$4,$5)',
          [tenantId, jobId, run.id, id, recipient.user_id]
        )
        fault('report-schedule.recipient.after-plan')
        await scheduleEvent(
          db,
          scheduleFactActor(tenantId, claim),
          run.schedule_id,
          'recipient.plan-created',
          { exportJobId: jobId },
          run.id,
          id
        )
      }
      const job = one(
        await rows<ReportExportJobRow>(
          db,
          'SELECT * FROM report_export_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [tenantId, jobId]
        )
      )
      if (['failed', 'blocked', 'infected', 'cancelled'].includes(job.status))
        throw new DomainError(
          job.status === 'blocked' ? 403 : 409,
          job.error_code || 'REPORT_SCHEDULE_CHILD_FAILED',
          '收件文件未生成或未获准，保留实际导出事实'
        )
      if (job.status === 'completed') {
        await assertReportExportOrigin(db, job, claim)
        await assertReportExportSnapshotAccess(db, receiver, job)
        const artifact = await reportExportArtifact(db, job)
        if (
          !artifact ||
          artifact.status !== 'ready' ||
          artifact.expires_at <= new Date() ||
          job.retention_until <= new Date()
        )
          throw new DomainError(
            410,
            'REPORT_EXPORT_EXPIRED',
            '扫描制品已过期或不可用'
          )
        const payload = {
          source: 'report-schedule',
          reportExportJobId: job.id,
          scheduleRunId: run.id,
          title: '定时报表文件已生成',
          content: '请打开报表中心查看当前授权范围内的文件',
          category: 'notice',
          link: `/visualization/reportCenter?exportJobId=${encodeURIComponent(
            job.id
          )}`,
        }
        await db.query(
          "INSERT INTO outbox(tenant_id,id,recipient_id,payload,status,attempts) VALUES($1,$2,$3,$4,'sent',1) ON CONFLICT(tenant_id,id) DO NOTHING",
          [
            tenantId,
            recipient.notification_outbox_id,
            recipient.user_id,
            JSON.stringify(payload),
          ]
        )
        const notification = one(
          await rows<{ id: string }>(
            db,
            'INSERT INTO notifications(tenant_id,id,event_id,recipient_id,title,content,category,link) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,event_id,recipient_id) DO UPDATE SET event_id=EXCLUDED.event_id RETURNING id',
            [
              tenantId,
              randomUUID(),
              recipient.notification_outbox_id,
              recipient.user_id,
              payload.title,
              payload.content,
              payload.category,
              payload.link,
            ]
          )
        )
        await db.query(
          "UPDATE report_schedule_run_recipients SET status='completed',notification_id=$3,notified_at=now(),claimed_by=NULL,lease_until=NULL,error_code=NULL,error_message=NULL,revision=revision+1 WHERE tenant_id=$1 AND id=$2",
          [tenantId, id, notification.id]
        )
        await scheduleEvent(
          db,
          scheduleFactActor(tenantId, claim),
          run.schedule_id,
          'recipient.completed',
          { exportJobId: job.id },
          run.id,
          id
        )
        fault('report-schedule.recipient.after-notify')
      } else
        await db.query(
          "UPDATE report_schedule_run_recipients SET status='waiting-export',claimed_by=NULL,lease_until=NULL,revision=revision+1 WHERE tenant_id=$1 AND id=$2",
          [tenantId, id]
        )
      fault('report-schedule.recipient.before-commit')
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT recipient_effect')
      const failure = safeFailure(error)
      const terminal =
        claimed.waiting ||
        failure.blocked ||
        failure.permanent ||
        recipient.attempts >= 5
      const terminalStatus = failure.blocked ? 'blocked' : 'failed'
      await db.query(
        "UPDATE report_schedule_run_recipients SET status=$3,claimed_by=NULL,lease_until=NULL,error_code=$4,error_message=$5,next_attempt_at=now()+($6*interval '1 second'),revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [
          tenantId,
          id,
          terminal ? terminalStatus : 'queued',
          failure.code,
          failure.message.slice(0, 300),
          Math.min(300, 5 * 2 ** recipient.attempts),
        ]
      )
      await scheduleEvent(
        db,
        scheduleFactActor(tenantId, claim),
        run.schedule_id,
        'recipient.failed',
        { code: failure.code },
        run.id,
        id
      )
    }
    await refreshScheduleRun(db, run)
  })
  fault('report-schedule.recipient.after-commit')
  return true
}
const failureAlerts = async (
  pool: Pool,
  batchSize: number,
  scope: ReportScheduleWorkerScope | undefined
) => {
  const candidates = await rows<ScheduleRunRow>(
    pool,
    "SELECT run.* FROM report_schedule_runs run JOIN memberships m ON m.tenant_id=run.tenant_id AND m.user_id=run.created_by JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE run.status IN('failed','blocked','partial-failed') AND run.alert_notified_at IS NULL AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled' AND (af_effective_permissions(m.tenant_id,m.user_id) ? 'report:schedule:run:read' OR af_effective_permissions(m.tenant_id,m.user_id) ? '*') AND af_historical_member_scope_visible(m.tenant_id,m.user_id,'report:schedule:run:read',run.created_by) AND ($2::text IS NULL OR (run.tenant_id=$2 AND run.schedule_id=ANY($3::text[]))) ORDER BY run.created_at,run.id LIMIT $1",
    [batchSize, scope?.tenantId ?? null, scope?.scheduleIds ?? null]
  )
  await sequential(candidates, async (hint) =>
    transaction(pool, async (db) => {
      await tenantGate(db, hint.tenant_id)
      const run = one(
        await rows<ScheduleRunRow>(
          db,
          'SELECT * FROM report_schedule_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [hint.tenant_id, hint.id]
        )
      )
      if (
        !inMaintenanceScope(scope, run) ||
        run.alert_notified_at ||
        !['failed', 'blocked', 'partial-failed'].includes(run.status)
      )
        return
      let recipient
      try {
        recipient = await reportExportPrincipal(
          db,
          run.tenant_id,
          run.created_by,
          randomUUID()
        )
      } catch (error) {
        if (error instanceof DomainError) return
        throw error
      }
      if (
        !hasPermission(recipient.permissions, S.runRead) ||
        !one(
          await rows<{ visible: boolean }>(
            db,
            'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
            [run.tenant_id, recipient.userId, S.runRead, run.created_by]
          )
        ).visible
      )
        return
      const payload = {
        source: 'report-schedule-alert',
        scheduleRunId: run.id,
        title: '定时报表执行受限',
        content: '请打开运行详情查看失败或部分失败事实',
        category: 'alert',
        link: `/visualization/reportSchedules?runId=${encodeURIComponent(
          run.id
        )}`,
      }
      await db.query(
        "INSERT INTO outbox(tenant_id,id,recipient_id,payload,status,attempts) VALUES($1,$2,$3,$4,'sent',1) ON CONFLICT(tenant_id,id) DO NOTHING",
        [
          run.tenant_id,
          run.alert_outbox_id,
          recipient.userId,
          JSON.stringify(payload),
        ]
      )
      await db.query(
        'INSERT INTO notifications(tenant_id,id,event_id,recipient_id,title,content,category,link) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,event_id,recipient_id) DO NOTHING',
        [
          run.tenant_id,
          randomUUID(),
          run.alert_outbox_id,
          recipient.userId,
          payload.title,
          payload.content,
          payload.category,
          payload.link,
        ]
      )
      await db.query(
        'UPDATE report_schedule_runs SET alert_notified_at=now() WHERE tenant_id=$1 AND id=$2',
        [run.tenant_id, run.id]
      )
      await scheduleEvent(
        db,
        scheduleFactActor(run.tenant_id, randomUUID()),
        run.schedule_id,
        'run.alert-persisted',
        {},
        run.id
      )
    })
  )
}
export const processReportSchedules = async (
  pool: Pool,
  runtime: ReportExportRuntime = {},
  fault: FaultInjector = noFault,
  batchSize = 10,
  requestedScope: ReportScheduleWorkerScope | undefined = undefined
): Promise<number> => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error('Invalid report schedule batch size')
  const scope = maintenanceScope(requestedScope)
  if (scope) {
    const actual = one(
      await rows<{ total: number }>(
        pool,
        'SELECT count(*)::int AS total FROM report_schedules WHERE tenant_id=$1 AND id=ANY($2::text[])',
        [scope.tenantId, scope.scheduleIds]
      )
    )
    if (actual.total !== scope.scheduleIds.length)
      throw new Error(
        'Maintenance scope must reference existing schedules in the specified tenant'
      )
  }
  let total = await materialize(pool, fault, batchSize, scope)
  total += await resolveQueuedRuns(pool, fault, batchSize, scope)
  const recipients = await rows<{ tenant_id: string; id: string }>(
    pool,
    "SELECT recipient.tenant_id,recipient.id FROM report_schedule_run_recipients recipient JOIN report_schedule_runs run ON run.tenant_id=recipient.tenant_id AND run.id=recipient.run_id WHERE ((recipient.status='queued' AND recipient.next_attempt_at<=now()) OR recipient.status='waiting-export' OR (recipient.status='processing' AND recipient.lease_until<=now())) AND ($2::text IS NULL OR (run.tenant_id=$2 AND run.schedule_id=ANY($3::text[]))) ORDER BY CASE WHEN recipient.status='waiting-export' THEN 1 ELSE 0 END,recipient.next_attempt_at,recipient.id LIMIT $1",
    [batchSize, scope?.tenantId ?? null, scope?.scheduleIds ?? null]
  )
  await sequential(recipients, async (r) => {
    if (await processRecipient(pool, r.tenant_id, r.id, fault, runtime, scope))
      total += 1
  })
  await failureAlerts(pool, batchSize, scope)
  return total
}
export const startReportScheduleWorker = (
  pool: Pool,
  runtime: ReportExportRuntime = {}
) => {
  let closed = false
  let pending: Promise<unknown> | undefined
  const tick = () => {
    if (closed || pending) return
    pending = processReportSchedules(pool, runtime)
      .catch(() => undefined)
      .finally(() => {
        pending = undefined
      })
  }
  const timer = setInterval(tick, 1000)
  timer.unref()
  tick()
  return async () => {
    closed = true
    clearInterval(timer)
    await pending
  }
}
