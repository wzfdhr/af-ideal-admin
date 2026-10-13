import {
  AUDIT_PERMISSIONS,
  AUDIT_PROJECTION_VERSION,
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_EXPORT_MAX_SNAPSHOT_BYTES,
  DomainError,
  parseAuditQuery,
} from '@af-admin/contracts'
import { requirePermission } from '@af-admin/workflow-core'
import { one, rows, contentCanonical } from './support'
import { auditPolicyRows, projectAuditDetail } from './audit-policy'
import type {
  AuditQueryV1,
  AuditEventPageV1,
  AuditEventRecordV1,
  AuditActorField,
  AuditEventType,
  AuditResult,
  AuditExportSnapshotV1,
} from '@af-admin/contracts'
import type { Database } from './support'
import type { Actor } from './auth'

interface ProjectedRow {
  id: string
  module: string
  action: string
  event_type: AuditEventType
  projected_result: AuditResult
  operator_id: string | null
  operator_name: string | null
  target_type: string
  visible_target_id: string | null
  trace_id: string
  created_at: string
  selected_detail: unknown
}
const dto = (row: ProjectedRow): AuditEventRecordV1 => {
  const visibleFields: AuditActorField[] = []
  const hiddenFields: AuditActorField[] = []
  ;(['operator.id', 'operator.name'] as const).forEach((field) => {
    const shown =
      field === 'operator.id'
        ? row.operator_id !== null
        : row.operator_name !== null
    ;(shown ? visibleFields : hiddenFields).push(field)
  })
  return {
    id: row.id,
    source: 'server',
    projectionVersion: AUDIT_PROJECTION_VERSION,
    module: row.module,
    action: row.action,
    eventType: row.event_type,
    result: row.projected_result,
    operator: { id: row.operator_id, name: row.operator_name },
    target: { type: row.target_type, id: row.visible_target_id },
    traceId: row.trace_id,
    occurredAt: new Date(row.created_at).toISOString(),
    detail: projectAuditDetail(row.module, row.action, row.selected_detail),
    visibleFields,
    hiddenFields,
  }
}

/** Actor/field projection, filtering, total and page share the same PostgreSQL statement snapshot. */
const runAuditQuery = async (
  db: Database,
  actor: Actor,
  query: AuditQueryV1,
  internal?: { eventIds?: readonly string[]; capture: boolean }
): Promise<AuditEventPageV1> => {
  const result = one(
    await rows<{ queried_at: Date; total: string; items: ProjectedRow[] }>(
      db,
      `
    WITH policy AS (SELECT * FROM jsonb_to_recordset($12::jsonb) AS p(module text,action text,"eventType" text,"detailKeys" text[],failure boolean,"ownerKind" text)),
    scoped AS MATERIALIZED (
      SELECT e.*,p."eventType",p."detailKeys",p.failure
      FROM audit_events e LEFT JOIN policy p ON p.module=e.module AND p.action=e.action
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(*)=1 THEN min(owner_id) END AS owner_id FROM (
          SELECT r.created_by AS owner_id FROM report_schedule_runs r WHERE p."ownerKind"='schedule' AND e.target_type='report-schedule' AND r.tenant_id=e.tenant_id AND r.id=e.target_id
          UNION ALL SELECT s.created_by FROM report_schedules s WHERE p."ownerKind"='schedule' AND e.target_type='report-schedule' AND s.tenant_id=e.tenant_id AND s.id=e.target_id
          UNION ALL SELECT j.created_by FROM report_export_jobs j WHERE p."ownerKind"='export' AND e.target_type='report-export' AND j.tenant_id=e.tenant_id AND j.id=e.target_id
          UNION ALL SELECT j.created_by FROM audit_export_jobs j WHERE p."ownerKind"='audit-export' AND e.target_type='audit-export' AND j.tenant_id=e.tenant_id AND j.id=e.target_id
          UNION ALL SELECT m.user_id FROM memberships m WHERE p."ownerKind"='membership' AND e.target_type='membership' AND m.tenant_id=e.tenant_id AND m.user_id=e.target_id
          UNION ALL SELECT j.created_by FROM message_recipients r JOIN message_send_jobs j ON j.tenant_id=r.tenant_id AND j.id=r.job_id WHERE p."ownerKind"='message' AND e.target_type='message-recipient' AND r.tenant_id=e.tenant_id AND r.id=e.target_id
          UNION ALL SELECT r.applicant_id FROM workflow_timers t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id JOIN business_records r ON r.tenant_id=i.tenant_id AND r.id=i.request_id WHERE p."ownerKind"='timer' AND e.target_type='workflow-timer' AND t.tenant_id=e.tenant_id AND t.id=e.target_id
        ) owners
      ) background ON e.actor_id IS NULL
      WHERE e.tenant_id=$1 AND af_historical_member_scope_visible($1,$2,'audit:read',COALESCE(e.actor_id,background.owner_id))
        AND ($16::text[] IS NULL OR e.id=ANY($16::text[]))
        AND ($3='' OR e.module=$3) AND ($4='' OR e.trace_id=$4)
        AND (NULLIF($8,'')::date IS NULL OR e.created_at >= (NULLIF($8,'')::date::timestamp AT TIME ZONE $10))
        AND (NULLIF($9,'')::date IS NULL OR e.created_at < ((NULLIF($9,'')::date+1)::timestamp AT TIME ZONE $10))
    ), projected AS MATERIALIZED (
      SELECT e.id,e.module,e.action,e.target_type,e.trace_id,e.created_at,
        COALESCE(e."eventType",'operation') AS event_type,CASE WHEN e.failure THEN 'failure' ELSE e.result END AS projected_result,
        CASE WHEN e.actor_id IS NOT NULL AND af_member_field_visible($1,$2,'audit:read',e.actor_id,'username') THEN e.actor_id ELSE NULL END AS operator_id,
        CASE WHEN e.actor_id IS NOT NULL AND af_member_field_visible($1,$2,'audit:read',e.actor_id,'name') THEN e.actor_name ELSE NULL END AS operator_name,
        CASE WHEN e.target_type IN ('user','membership','session') AND NOT af_member_field_visible($1,$2,'audit:read',e.target_id,'username') THEN NULL ELSE e.target_id END AS visible_target_id,
        COALESCE((SELECT jsonb_object_agg(key,e.detail->key) FROM unnest(COALESCE(e."detailKeys",ARRAY[]::text[])) key
          WHERE e.detail ? key AND (key NOT IN ('requestId','instanceId') OR
            EXISTS(SELECT 1 FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id
              WHERE e.module='workflow' AND e.target_type='workflow-task' AND t.tenant_id=e.tenant_id AND t.id=e.target_id AND e.detail->>key=CASE key WHEN 'requestId' THEN i.request_id ELSE i.id END)
            OR EXISTS(SELECT 1 FROM workflow_instances i WHERE e.module='business' AND e.target_type='business-record' AND i.tenant_id=e.tenant_id AND i.request_id=e.target_id AND key='instanceId' AND e.detail->>key=i.id)
            OR EXISTS(SELECT 1 FROM workflow_timers t WHERE e.module='workflow' AND e.target_type='workflow-timer' AND t.tenant_id=e.tenant_id AND t.id=e.target_id AND key='instanceId' AND e.detail->>key=t.instance_id)
          )), '{}'::jsonb) AS selected_detail
      FROM scoped e
    ), matching AS MATERIALIZED (
      SELECT * FROM projected WHERE ($5='' OR visible_target_id=$5 OR selected_detail->>'requestId'=$5 OR selected_detail->>'instanceId'=$5)
      AND ($6='' OR projected_result=$6) AND ($7='' OR event_type=$7)
      AND ($11='' OR operator_name ILIKE $13 ESCAPE '!')
    ), page AS (SELECT * FROM matching ORDER BY created_at DESC,id LIMIT $14 OFFSET $15)
    SELECT statement_timestamp() AS queried_at,(SELECT count(*) FROM matching) AS total,
      COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id) FROM page),'[]'::jsonb) AS items`,
      [
        actor.tenantId,
        actor.userId,
        query.module,
        query.traceId,
        query.targetId,
        query.result,
        query.eventType,
        query.from,
        query.to,
        query.timeZone,
        query.operatorName,
        JSON.stringify(auditPolicyRows),
        `%${query.operatorName.replace(/[!%_]/g, '!$&')}%`,
        internal?.capture ? AUDIT_EXPORT_MAX_ROWS + 1 : query.pageSize,
        internal?.capture ? 0 : (query.current - 1) * query.pageSize,
        internal?.eventIds || null,
      ]
    )
  )
  return {
    version: 1,
    source: 'server',
    projectionVersion: AUDIT_PROJECTION_VERSION,
    query,
    queriedAt: result.queried_at.toISOString(),
    current: query.current,
    pageSize: query.pageSize,
    total: Number(result.total),
    list: result.items.map(dto),
  }
}
export const auditReadPermission = AUDIT_PERMISSIONS.read

/** The HTTP reader retains its original bounded paging; capture options are server-only. */
export const queryAuditEvents = (
  db: Database,
  actor: Actor,
  query: AuditQueryV1
) => runAuditQuery(db, actor, query)
/** Identity-filter text is metadata of the immutable capture principal, even when no facts matched. */
export const assertAuditIdentityQueryAccess = async (
  db: Database,
  actor: Actor,
  query: AuditQueryV1,
  capturePrincipalId = actor.userId
) => {
  requirePermission(actor.permissions, AUDIT_PERMISSIONS.read)
  if (
    query.operatorName &&
    !one(
      await rows<{ visible: boolean }>(
        db,
        "SELECT af_member_field_visible($1,$2,'audit:read',$3,'name') AS visible",
        [actor.tenantId, actor.userId, capturePrincipalId]
      )
    ).visible
  )
    throw new DomainError(
      403,
      'AUDIT_EXPORT_QUERY_METADATA_FORBIDDEN',
      '当前无审计查询身份元信息读取权限'
    )
}
export const captureAuditEvents = async (
  db: Database,
  actor: Actor,
  input: AuditQueryV1
): Promise<AuditExportSnapshotV1> => {
  requirePermission(actor.permissions, AUDIT_PERMISSIONS.read)
  const query = parseAuditQuery(input)
  await assertAuditIdentityQueryAccess(db, actor, query)
  const result = await runAuditQuery(db, actor, query, { capture: true })
  if (result.total > AUDIT_EXPORT_MAX_ROWS)
    throw new DomainError(
      422,
      'AUDIT_EXPORT_TOO_MANY_ROWS',
      '完整审计导出最多2000条，请缩小筛选范围'
    )
  if (result.total !== result.list.length)
    throw new DomainError(
      409,
      'AUDIT_EXPORT_CAPTURE_INCOMPLETE',
      '审计事实捕获不完整'
    )
  const snapshot: AuditExportSnapshotV1 = {
    version: 1,
    producerVersion: 1,
    projectionVersion: 1,
    source: 'server',
    query,
    queriedAt: result.queriedAt,
    dataCutoffAt: result.queriedAt,
    rows: result.list,
    total: result.total,
  }
  if (
    Buffer.byteLength(contentCanonical(snapshot), 'utf8') >
    AUDIT_EXPORT_MAX_SNAPSHOT_BYTES
  )
    throw new DomainError(
      422,
      'AUDIT_EXPORT_SNAPSHOT_TOO_LARGE',
      '审计导出快照超过2MiB'
    )
  return snapshot
}
export const recheckAuditEventIds = async (
  db: Database,
  actor: Actor,
  ids: readonly string[],
  timeZone: string
) => {
  requirePermission(actor.permissions, AUDIT_PERMISSIONS.read)
  if (
    !Array.isArray(ids) ||
    ids.length > AUDIT_EXPORT_MAX_ROWS ||
    new Set(ids).size !== ids.length ||
    ids.some(
      (id) =>
        typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(id)
    )
  )
    throw new DomainError(
      422,
      'AUDIT_EXPORT_MANIFEST_INVALID',
      '审计事实标识清单无效'
    )
  return runAuditQuery(db, actor, parseAuditQuery({ timeZone }), {
    capture: true,
    eventIds: ids,
  })
}
