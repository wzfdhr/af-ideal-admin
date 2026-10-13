import { randomUUID } from 'node:crypto'
import {
  DomainError,
  REPORT_SCHEDULE_PERMISSIONS as S,
  REPORT_EXPORT_PERMISSIONS as E,
  REPORTING_PERMISSIONS as P,
  REPORT_SCHEDULE_MAX_RECIPIENTS,
  parseReportScheduleDefinition,
  parseReportingDefinition,
  parseReportingQuery,
} from '@af-admin/contracts'
import { hasPermission, requirePermission } from '@af-admin/workflow-core'
import { rows, one, audit, sequential } from './support'
import { reportExportPrincipal } from './report-export-access'
import { locateReportingVersion, requireReportingEnabled } from './reporting'
import {
  captureReportingSource,
  assertReportingFields,
  reportingFieldAvailable,
} from './report-source'
import { assertScheduleRecipient } from './report-schedules-grants'
import {
  nextReportScheduleOccurrence,
  reportScheduleDateRange,
} from './report-schedule-calendar'
import type { Actor } from './auth'
import type { Database, FactActor } from './support'
import type {
  ReportScheduleDefinitionV1,
  ReportSchedule,
  ReportScheduleRun,
  ReportingQueryV1,
  ReportScheduleRunRecipient,
  ReportScheduleVersion,
} from '@af-admin/contracts'

export interface ScheduleRow {
  tenant_id: string
  id: string
  revision: number
  enabled: boolean
  active_version_id: string
  active_period_id: string | null
  created_by: string
  created_at: Date
  updated_at: Date
}
export interface ScheduleVersionRow {
  tenant_id: string
  id: string
  schedule_id: string
  version: number
  definition_version_id: string
  schema_snapshot: ReportScheduleDefinitionV1
  content_hash: string
  created_by: string
  created_at: Date
}
export interface SchedulePeriodRow {
  tenant_id: string
  id: string
  schedule_id: string
  rule_version_id: string
  origin_id: string
  started_at: Date
  closed_at: Date | null
  cursor_at: Date | null
  revision: number
  exhausted_at: Date | null
}
export interface ScheduleRunRow {
  tenant_id: string
  id: string
  schedule_id: string
  period_id: string
  rule_version_id: string
  slot_at: Date
  query: ReportingQueryV1 | null
  status: ReportScheduleRun['status']
  revision: number
  created_by: string
  recipients_resolved_at: Date | null
  attempts: number
  next_attempt_at: Date
  claimed_by: string | null
  lease_until: Date | null
  error_code: string | null
  error_message: string | null
  alert_outbox_id: string
  alert_notified_at: Date | null
  cancelled_at: Date | null
  created_at: Date
  updated_at: Date
}
export interface ScheduleRecipientRow {
  tenant_id: string
  id: string
  run_id: string
  user_id: string
  status: ReportScheduleRunRecipient['status']
  revision: number
  attempts: number
  next_attempt_at: Date
  claimed_by: string | null
  lease_until: Date | null
  error_code: string | null
  error_message: string | null
  export_job_id: string | null
  notification_outbox_id: string
  notification_id: string | null
  notified_at: Date | null
}
export const scheduleFactActor = (
  tenantId: string,
  traceId: string
): FactActor => ({ tenantId, userId: null, name: '定时报表服务', traceId })
export const scheduleEvent = async (
  db: Database,
  actor: FactActor,
  scheduleId: string,
  action: string,
  detail: Record<string, string | number | boolean | null> = {},
  runId: string | null = null,
  recipientId: string | null = null
) => {
  await db.query(
    'INSERT INTO report_schedule_events(tenant_id,id,schedule_id,run_id,recipient_fact_id,action,actor_id,actor_name,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      actor.tenantId,
      randomUUID(),
      scheduleId,
      runId,
      recipientId,
      action,
      actor.userId,
      actor.name,
      JSON.stringify(detail),
    ]
  )
  await audit(
    db,
    actor,
    'report-schedule',
    `report-schedule.${action}`,
    'report-schedule',
    runId || scheduleId,
    'success',
    detail
  )
}
export const scheduleScope = async (
  db: Database,
  actor: Actor,
  creator: string,
  code: string
) => {
  requirePermission(actor.permissions, code)
  if (
    !one(
      await rows<{ visible: boolean }>(
        db,
        'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
        [actor.tenantId, actor.userId, code, creator]
      )
    ).visible
  )
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
export const locateSchedule = async (
  db: Database,
  actor: Actor,
  id: string,
  code: string,
  lock = false
) => {
  const result = one(
    await rows<ScheduleRow>(
      db,
      `SELECT * FROM report_schedules WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [actor.tenantId, id]
    )
  )
  await scheduleScope(db, actor, result.created_by, code)
  return result
}
export const scheduleVersion = async (
  db: Database,
  tenantId: string,
  id: string
) =>
  one(
    await rows<ScheduleVersionRow>(
      db,
      'SELECT * FROM report_schedule_versions WHERE tenant_id=$1 AND id=$2',
      [tenantId, id]
    )
  )
export const scheduleOrigin = async (
  db: Database,
  tenantId: string,
  userId: string,
  traceId: string
) => {
  const origin = await reportExportPrincipal(db, tenantId, userId, traceId)
  requirePermission(origin.permissions, S.create)
  requirePermission(origin.permissions, E.create)
  requirePermission(origin.permissions, P.query)
  return origin
}
export const scheduleQuery = async (
  db: Database,
  tenantId: string,
  schema: ReportScheduleDefinitionV1,
  slot: Date
): Promise<ReportingQueryV1> => {
  const fixed = one(
    await rows<{
      schema_snapshot: unknown
      field_bindings: Record<string, unknown>
    }>(
      db,
      'SELECT schema_snapshot,field_bindings FROM report_definition_versions WHERE tenant_id=$1 AND id=$2',
      [tenantId, schema.definitionVersionId]
    )
  )
  const report = parseReportingDefinition(fixed.schema_snapshot)
  if (report.timeZone !== schema.timing.timeZone)
    throw new DomainError(
      422,
      'REPORT_SCHEDULE_TIMEZONE_CONFLICT',
      '规则时区必须与固定报表版相同'
    )
  const preferred = ['createdAt', 'id', 'status']
    .map((id) =>
      report.fields.find(
        (field) => field.kind === 'metadata' && field.id === id
      )
    )
    .find(Boolean)
  const sort =
    preferred ||
    report.fields.find(
      (field) => field.kind === 'metadata' || !!fixed.field_bindings[field.id]
    )
  if (!sort)
    throw new DomainError(
      422,
      'REPORT_SCHEDULE_SORT_UNAVAILABLE',
      '批准字段中没有可确定的排序字段'
    )
  return parseReportingQuery(
    {
      version: 1,
      timeZone: report.timeZone,
      dateRange: reportScheduleDateRange(
        schema.timing,
        schema.dataWindow,
        slot
      ),
      statuses: [],
      keyword: '',
      searchFields: [],
      sort: { field: sort, direction: 'desc' },
      current: 1,
      pageSize: 100,
    },
    report
  )
}
export const validateScheduleSource = async (
  db: Database,
  origin: Actor,
  input: unknown
) => {
  const schema = parseReportScheduleDefinition(input)
  const { version, definition } = await locateReportingVersion(
    db,
    origin,
    schema.definitionVersionId
  )
  requireReportingEnabled(definition)
  if (version.schema_snapshot.timeZone !== schema.timing.timeZone)
    throw new DomainError(
      422,
      'REPORT_SCHEDULE_TIMEZONE_CONFLICT',
      '规则时区必须与固定报表版相同'
    )
  const source = await captureReportingSource(
    db,
    origin,
    version.source_application_id,
    version.source_release_id
  )
  const query = await scheduleQuery(
    db,
    origin.tenantId,
    schema,
    nextReportScheduleOccurrence(
      schema.timing,
      one(await rows<{ time: Date }>(db, 'SELECT clock_timestamp() AS time'))
        .time
    )
  )
  assertReportingFields(source, origin, [query.sort.field])
  if (schema.recipients.kind === 'role')
    one(
      await rows(
        db,
        "SELECT id FROM roles WHERE tenant_id=$1 AND id=$2 AND status='enabled' AND deleted_at IS NULL",
        [origin.tenantId, schema.recipients.roleId]
      )
    )
  if (schema.recipients.kind === 'department')
    one(
      await rows(
        db,
        "SELECT id FROM departments WHERE tenant_id=$1 AND id=$2 AND status='enabled' AND deleted_at IS NULL",
        [origin.tenantId, schema.recipients.departmentId]
      )
    )
  return { schema, source, version, query }
}
export const resolveScheduleRecipients = async (
  db: Database,
  origin: Actor,
  schema: ReportScheduleDefinitionV1
) => {
  let target = ''
  if (schema.recipients.kind === 'role') target = schema.recipients.roleId
  if (schema.recipients.kind === 'department')
    target = schema.recipients.departmentId
  const result = await rows<{
    user_id: string
    name: string
    eligible: boolean
  }>(
    db,
    "SELECT m.user_id,COALESCE(m.display_name,u.name) AS name,((af_effective_permissions(m.tenant_id,m.user_id) ? 'report:query' OR af_effective_permissions(m.tenant_id,m.user_id) ? '*') AND (af_effective_permissions(m.tenant_id,m.user_id) ? 'report:export:list' OR af_effective_permissions(m.tenant_id,m.user_id) ? '*') AND (af_effective_permissions(m.tenant_id,m.user_id) ? 'report:export:download' OR af_effective_permissions(m.tenant_id,m.user_id) ? '*')) AS eligible FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND af_member_scope_visible($1,$2,$3,m.user_id) AND ($4='tenant' OR ($4='role' AND EXISTS(SELECT 1 FROM member_roles mr JOIN roles role ON role.tenant_id=mr.tenant_id AND role.id=mr.role_id WHERE mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id AND role.id=$5 AND role.status='enabled' AND role.deleted_at IS NULL)) OR ($4='department' AND m.department_id=$5 AND EXISTS(SELECT 1 FROM departments d WHERE d.tenant_id=m.tenant_id AND d.id=m.department_id AND d.status='enabled' AND d.deleted_at IS NULL))) ORDER BY m.user_id",
    [origin.tenantId, origin.userId, S.create, schema.recipients.kind, target]
  )
  const eligible = result.filter((row) => row.eligible)
  if (eligible.length > REPORT_SCHEDULE_MAX_RECIPIENTS)
    throw new DomainError(
      422,
      'REPORT_SCHEDULE_TOO_MANY_RECIPIENTS',
      '定时报表最多支持200个当前合格收件人'
    )
  return { eligible, unavailable: result.length - eligible.length }
}
export const previewSchedule = async (
  db: Database,
  current: Actor,
  origin: Actor,
  schema: ReportScheduleDefinitionV1,
  displayCode: string
) => {
  const checked = await validateScheduleSource(db, origin, schema)
  const next = nextReportScheduleOccurrence(
    schema.timing,
    one(await rows<{ time: Date }>(db, 'SELECT clock_timestamp() AS time')).time
  )
  const resolved = await resolveScheduleRecipients(db, origin, schema)
  const recipients: { userId: string; name: string | null }[] = []
  let { unavailable } = resolved
  await sequential(resolved.eligible, async (member) => {
    try {
      const receiver = await reportExportPrincipal(
        db,
        origin.tenantId,
        member.user_id,
        current.traceId
      )
      await assertScheduleRecipient(db, origin, receiver, schema)
      await captureReportingSource(
        db,
        receiver,
        checked.version.source_application_id,
        checked.version.source_release_id
      )
      assertReportingFields(checked.source, receiver, [
        checked.query.sort.field,
      ])
      if (
        !assertReportingFields(
          checked.source,
          origin,
          checked.version.schema_snapshot.fields,
          false
        ).some(
          (field) =>
            reportingFieldAvailable(origin, field) &&
            reportingFieldAvailable(receiver, field)
        )
      )
        throw new DomainError(
          403,
          'REPORT_EXPORT_FIELD_FORBIDDEN',
          '双方没有可输出字段'
        )
      const shown = one(
        await rows<{ visible: boolean }>(
          db,
          "SELECT af_member_field_visible($1,$2,$3,$4,'name') AS visible",
          [current.tenantId, current.userId, displayCode, member.user_id]
        )
      ).visible
      recipients.push({
        userId: member.user_id,
        name: shown ? member.name : null,
      })
    } catch (error) {
      if (!(error instanceof DomainError)) throw error
      unavailable += 1
    }
  })
  return {
    nextRunAt: next.toISOString(),
    timeZone: schema.timing.timeZone,
    dateRange: reportScheduleDateRange(schema.timing, schema.dataWindow, next),
    recipientTotal: recipients.length,
    recipients,
    unavailableRecipientCount: unavailable,
    maxRecipients: REPORT_SCHEDULE_MAX_RECIPIENTS,
  }
}
export const scheduleDto = async (
  db: Database,
  actor: Actor,
  row: ScheduleRow,
  detail = false
): Promise<ReportSchedule> => {
  const current = await scheduleVersion(
    db,
    row.tenant_id,
    row.active_version_id
  )
  const period = row.active_period_id
    ? (
        await rows<SchedulePeriodRow>(
          db,
          'SELECT * FROM report_schedule_periods WHERE tenant_id=$1 AND id=$2',
          [row.tenant_id, row.active_period_id]
        )
      )[0]
    : null
  const last = (
    await rows<{ slot_at: Date }>(
      db,
      'SELECT slot_at FROM report_schedule_runs WHERE tenant_id=$1 AND schedule_id=$2 ORDER BY slot_at DESC LIMIT 1',
      [row.tenant_id, row.id]
    )
  )[0]
  const actions: ReportSchedule['allowedActions'] = []
  await sequential([S.update, S.toggle], async (code) => {
    if (
      hasPermission(actor.permissions, code) &&
      one(
        await rows<{ visible: boolean }>(
          db,
          'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
          [actor.tenantId, actor.userId, code, row.created_by]
        )
      ).visible
    )
      actions.push(code === S.update ? 'update' : 'toggle')
  })
  const result: ReportSchedule = {
    id: row.id,
    revision: row.revision,
    enabled: row.enabled,
    schema: current.schema_snapshot,
    activeVersionId: current.id,
    version: current.version,
    nextRunAt: row.enabled ? period?.cursor_at?.toISOString() || null : null,
    lastRunAt: last?.slot_at.toISOString() || null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    allowedActions: actions,
  }
  if (detail)
    result.versions = (
      await rows<ScheduleVersionRow>(
        db,
        'SELECT * FROM report_schedule_versions WHERE tenant_id=$1 AND schedule_id=$2 ORDER BY version DESC',
        [row.tenant_id, row.id]
      )
    ).map(
      (v): ReportScheduleVersion => ({
        id: v.id,
        scheduleId: v.schedule_id,
        version: v.version,
        schema: v.schema_snapshot,
        createdBy: v.created_by,
        createdAt: v.created_at.toISOString(),
      })
    )
  return result
}
export const runDto = async (
  db: Database,
  actor: Actor,
  row: ScheduleRunRow,
  detail = false
): Promise<ReportScheduleRun> => {
  const v = await scheduleVersion(db, row.tenant_id, row.rule_version_id)
  const facts = await rows<ScheduleRecipientRow>(
    db,
    'SELECT * FROM report_schedule_run_recipients WHERE tenant_id=$1 AND run_id=$2 ORDER BY user_id',
    [row.tenant_id, row.id]
  )
  let queryVisible = false
  if (hasPermission(actor.permissions, P.query))
    try {
      const { definition, version } = await locateReportingVersion(
        db,
        actor,
        v.schema_snapshot.definitionVersionId
      )
      requireReportingEnabled(definition)
      const source = await captureReportingSource(
        db,
        actor,
        version.source_application_id,
        version.source_release_id
      )
      if (row.query)
        assertReportingFields(source, actor, [row.query.sort.field])
      queryVisible = true
    } catch (error) {
      if (!(error instanceof DomainError)) throw error
    }
  const actions: ReportScheduleRun['allowedActions'] = []
  const scoped = async (code: string) =>
    hasPermission(actor.permissions, code) &&
    one(
      await rows<{ visible: boolean }>(
        db,
        'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
        [actor.tenantId, actor.userId, code, row.created_by]
      )
    ).visible
  if (
    ['blocked', 'failed', 'partial-failed'].includes(row.status) &&
    (await scoped(S.retry))
  )
    actions.push('retry')
  if (
    !['completed', 'cancelled'].includes(row.status) &&
    (await scoped(S.cancel)) &&
    (await scoped(E.cancel))
  )
    actions.push('cancel')
  const result: ReportScheduleRun = {
    id: row.id,
    scheduleId: row.schedule_id,
    periodId: row.period_id,
    ruleVersionId: row.rule_version_id,
    ruleVersion: v.version,
    slotAt: row.slot_at.toISOString(),
    query: queryVisible ? row.query : null,
    status: row.status,
    revision: row.revision,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at.toISOString(),
    leaseUntil: row.lease_until?.toISOString() || null,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    recipientTotal: facts.length,
    completedRecipients: facts.filter((f) => f.status === 'completed').length,
    failedRecipients: facts.filter((f) => f.status === 'failed').length,
    blockedRecipients: facts.filter((f) => f.status === 'blocked').length,
    skippedRecipients: facts.filter((f) => f.status === 'skipped').length,
    cancelledRecipients: facts.filter((f) => f.status === 'cancelled').length,
    allowedActions: actions,
  }
  if (detail) {
    result.recipients = []
    await sequential(facts, async (f) => {
      const name =
        (
          await rows<{ name: string }>(
            db,
            "SELECT COALESCE(m.display_name,u.name) AS name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND af_member_field_visible($1,$3,$4,m.user_id,'name')",
            [row.tenant_id, f.user_id, actor.userId, S.runRead]
          )
        )[0]?.name || null
      result.recipients?.push({
        id: f.id,
        userId: f.user_id,
        name,
        status: f.status,
        exportJobId: f.export_job_id,
        attempts: f.attempts,
        errorCode: f.error_code,
        errorMessage: f.error_message,
        notifiedAt: f.notified_at?.toISOString() || null,
      })
    })
  }
  return result
}
