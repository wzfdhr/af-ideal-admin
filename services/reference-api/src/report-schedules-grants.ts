import {
  DomainError,
  REPORT_SCHEDULE_PERMISSIONS as S,
  REPORT_EXPORT_PERMISSIONS as E,
  REPORTING_PERMISSIONS as P,
  parseReportScheduleDefinition,
} from '@af-admin/contracts'
import { requirePermission } from '@af-admin/workflow-core'
import { rows, one } from './support'
import type { Actor } from './auth'
import type { Database } from './support'
import type { ReportScheduleDefinitionV1 } from '@af-admin/contracts'

export const scheduleExportGrant = async (
  db: Database,
  tenantId: string,
  jobId: string
) => {
  const grants = await rows<{
    recipient_user_id: string
    run_id: string
    recipient_fact_id: string
    created_by: string
    schema_snapshot: ReportScheduleDefinitionV1
  }>(
    db,
    'SELECT g.*,r.created_by,v.schema_snapshot FROM report_export_recipient_grants g JOIN report_schedule_runs r ON r.tenant_id=g.tenant_id AND r.id=g.run_id JOIN report_schedule_versions v ON v.tenant_id=r.tenant_id AND v.id=r.rule_version_id WHERE g.tenant_id=$1 AND g.job_id=$2',
    [tenantId, jobId]
  )
  return grants[0] || null
}
export const assertScheduleRecipient = async (
  db: Database,
  origin: Actor,
  recipient: Actor,
  schema: ReportScheduleDefinitionV1
) => {
  parseReportScheduleDefinition(schema)
  requirePermission(origin.permissions, S.create)
  requirePermission(origin.permissions, E.create)
  requirePermission(origin.permissions, P.query)
  requirePermission(recipient.permissions, P.query)
  requirePermission(recipient.permissions, E.list)
  requirePermission(recipient.permissions, E.download)
  if (origin.tenantId !== recipient.tenantId)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  let target = ''
  if (schema.recipients.kind === 'role') target = schema.recipients.roleId
  if (schema.recipients.kind === 'department')
    target = schema.recipients.departmentId
  const selected = one(
    await rows<{ allowed: boolean }>(
      db,
      "SELECT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled' AND af_member_scope_visible($1,$3,$4,m.user_id) AND ($5='tenant' OR ($5='role' AND EXISTS(SELECT 1 FROM member_roles mr JOIN roles role ON role.tenant_id=mr.tenant_id AND role.id=mr.role_id WHERE mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id AND role.id=$6 AND role.status='enabled' AND role.deleted_at IS NULL)) OR ($5='department' AND m.department_id=$6 AND EXISTS(SELECT 1 FROM departments d WHERE d.tenant_id=m.tenant_id AND d.id=m.department_id AND d.status='enabled' AND d.deleted_at IS NULL)))) AS allowed",
      [
        origin.tenantId,
        recipient.userId,
        origin.userId,
        S.create,
        schema.recipients.kind,
        target,
      ]
    )
  )
  if (!selected.allowed)
    throw new DomainError(
      403,
      'REPORT_SCHEDULE_RECIPIENT_INELIGIBLE',
      '收件人当前不属于原主体的授权接收范围'
    )
}
export const hasScheduleExportGrant = async (
  db: Database,
  actor: Actor,
  jobId: string
) =>
  one(
    await rows<{ visible: boolean }>(
      db,
      'SELECT af_report_schedule_grant_visible($1,$2,$3) AS visible',
      [actor.tenantId, actor.userId, jobId]
    )
  ).visible
