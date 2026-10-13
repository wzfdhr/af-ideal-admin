import {
  DomainError,
  parseReportingDefinition,
  parseReportingQuery,
  REPORT_EXPORT_MAX_ROWS,
  REPORT_EXPORT_MAX_SNAPSHOT_BYTES,
  REPORT_EXPORT_PRODUCER_VERSION,
} from '@af-admin/contracts'
import { rows, one } from './support'
import {
  captureReportingSource,
  assertReportingFields,
  assertReportingMapping,
  reportingCatalogue,
  reportingFieldAvailable,
  reportingFieldKey,
} from './report-source'
import type {
  ReportingDefinitionV1,
  ReportingQueryResultV1,
  ReportingVisibleField,
  ReportingExportSnapshot,
} from '@af-admin/contracts'
import type { ReportingFieldBinding, ReportingFieldMap } from './report-source'
import type { Actor } from './auth'
import type { Database } from './support'

export interface ReportingQueryContext {
  definitionId: string
  definitionVersion: number
  schema: ReportingDefinitionV1
  sourceReleaseId: string
  sourceReleaseVersion: number
  fieldMap: ReportingFieldMap
}
const metadataSql: Record<string, string> = {
  id: 'r.id',
  status: 'r.status',
  revision: 'r.revision',
  applicationReleaseId: 'r.application_release_id',
  applicantId: 'r.applicant_id',
  applicantName: 'r.applicant_name',
  departmentSnapshot: 'r.department_snapshot',
  createdAt: 'r.created_at',
  updatedAt: 'r.updated_at',
}
const visibleDto = (field: ReportingFieldBinding): ReportingVisibleField => ({
  reference: field.reference,
  key: field.key,
  label: field.label,
  valueType: field.valueType,
  searchable: field.searchable,
  sortable: field.sortable,
})

export interface ReportExportAuthorizationRow {
  id: string
  applicantId: string
  allowedFieldKeys: string[]
}
const runReportingVersion = async (
  db: Database,
  actor: Actor,
  context: ReportingQueryContext,
  input: unknown,
  exporting = false,
  secondaryActor: Actor | undefined = undefined
): Promise<{
  result: ReportingQueryResultV1
  manifest: ReportExportAuthorizationRow[]
}> => {
  const schema = parseReportingDefinition(context.schema)
  const query = parseReportingQuery(input, schema)
  const source = await captureReportingSource(
    db,
    actor,
    schema.source.applicationId,
    context.sourceReleaseId
  )
  if (secondaryActor) {
    if (secondaryActor.tenantId !== actor.tenantId)
      throw new DomainError(404, 'NOT_FOUND', '资源不存在')
    await captureReportingSource(
      db,
      secondaryActor,
      schema.source.applicationId,
      context.sourceReleaseId
    )
  }
  if (source.release.releaseVersion !== context.sourceReleaseVersion)
    throw new DomainError(
      409,
      'REPORT_SOURCE_VERSION_CONFLICT',
      '固定来源发布版发生冲突'
    )
  assertReportingMapping(source, context.fieldMap)
  const configured = assertReportingFields(source, actor, schema.fields, false)
  const fields = configured.filter(
    (field) =>
      reportingFieldAvailable(actor, field) &&
      (!secondaryActor || reportingFieldAvailable(secondaryActor, field))
  )
  const sort = assertReportingFields(source, actor, [query.sort.field])[0]
  const searches = assertReportingFields(source, actor, query.searchFields)
  if (secondaryActor) {
    assertReportingFields(source, secondaryActor, [query.sort.field])
    assertReportingFields(source, secondaryActor, query.searchFields)
  }
  if (!sort.sortable || searches.some((field) => !field.searchable))
    throw new DomainError(
      422,
      'REPORT_FIELD_CAPABILITY_INVALID',
      '字段不支持当前搜索或排序操作'
    )
  const catalogue = reportingCatalogue(source, actor)
  const hiddenFields = configured
    .filter(
      (field) =>
        !reportingFieldAvailable(actor, field) ||
        (!!secondaryActor && !reportingFieldAvailable(secondaryActor, field))
    )
    .map((field) => ({
      reference: field.reference,
      reason: 'permission-denied' as const,
    }))
  const parameters: unknown[] = [
    actor.tenantId,
    actor.userId,
    context.sourceReleaseId,
    query.timeZone,
    query.dateRange.from,
    query.dateRange.to,
    query.statuses,
  ]
  const bind = (value: unknown) => {
    parameters.push(value)
    return `$${parameters.length}`
  }
  const secondaryUser = secondaryActor ? bind(secondaryActor.userId) : ''
  const columns = new Map<
    string,
    {
      alias: string
      raw: string
      allowed: string
      field: ReportingFieldBinding
    }
  >()
  fields.forEach((field, index) => {
    let raw: string
    if (field.reference.kind === 'metadata') {
      raw =
        field.reference.id === 'releaseVersion'
          ? `${bind(context.sourceReleaseVersion)}::integer`
          : metadataSql[field.reference.id]
      if (!raw)
        throw new DomainError(
          422,
          'REPORT_FIELD_UNSUPPORTED',
          '元字段未登记SQL投影'
        )
    } else {
      const uid = bind(field.rawUid)
      const json = `r.fields -> ${uid}::text`
      const value = `r.fields ->> ${uid}::text`
      if (field.valueType === 'integer')
        raw = `CASE WHEN jsonb_typeof(${json})='number' AND ${value} ~ '^[0-9]{1,9}$' THEN (${value})::numeric ELSE NULL END`
      else if (field.valueType === 'decimal')
        raw = `CASE WHEN jsonb_typeof(${json})='string' AND ${value} ~ '^[0-9]{1,10}([.][0-9]{1,2})?$' THEN ${value} ELSE NULL END`
      else
        raw = `CASE WHEN jsonb_typeof(${json})='string' THEN ${value} ELSE NULL END`
    }
    let allowed = 'true'
    if (field.permission) {
      const permission = bind(field.permission)
      allowed = field.memberField
        ? `af_member_field_visible($1,$2,${permission},r.applicant_id,${bind(
            field.memberField
          )})`
        : `af_member_scope_visible($1,$2,${permission},r.applicant_id)`
      if (secondaryActor)
        allowed = `(${allowed} AND ${
          field.memberField
            ? `af_member_field_visible($1,${secondaryUser},${permission},r.applicant_id,${bind(
                field.memberField
              )})`
            : `af_member_scope_visible($1,${secondaryUser},${permission},r.applicant_id)`
        })`
    }
    columns.set(reportingFieldKey(field.reference), {
      alias: `v${index}`,
      raw,
      allowed,
      field,
    })
  })
  const sortColumn = columns.get(reportingFieldKey(sort.reference))
  if (!sortColumn)
    throw new DomainError(403, 'REPORT_FIELD_FORBIDDEN', '排序字段当前不可见')
  const projections = Array.from(columns.values()).map(
    (column) =>
      `CASE WHEN ${column.allowed} THEN ${column.raw} ELSE NULL END AS ${column.alias}`
  )
  const hiddenKeys = Array.from(columns.values()).map(
    (column) =>
      `CASE WHEN NOT (${column.allowed}) THEN ${bind(
        column.field.key
      )}::text ELSE NULL END`
  )
  const hiddenExpression = hiddenKeys.length
    ? `array_remove(ARRAY[${hiddenKeys.join(',')}],NULL)`
    : 'ARRAY[]::text[]'
  const escapedKeyword = query.keyword.replace(/[!%_]/g, '!$&')
  const keywordParameter = query.keyword ? bind(`%${escapedKeyword}%`) : ''
  const searchSql = searches.map((field) => {
    const column = columns.get(reportingFieldKey(field.reference))
    if (!column)
      throw new DomainError(403, 'REPORT_FIELD_FORBIDDEN', '搜索字段当前不可见')
    return `COALESCE(${column.alias}::text,'') ILIKE ${keywordParameter} ESCAPE '!'`
  })
  const predicate = query.keyword ? `(${searchSql.join(' OR ')})` : 'true'
  const limit = bind(exporting ? REPORT_EXPORT_MAX_ROWS + 1 : query.pageSize)
  const preflightParameters = exporting ? [...parameters] : []
  const values = Array.from(columns.values()).flatMap((column) => [
    `${bind(column.field.key)}::text`,
    `to_jsonb(${column.alias})`,
  ])
  const valuesSql = values.length
    ? `jsonb_build_object(${values.join(',')})`
    : "'{}'::jsonb"
  const offset = bind(exporting ? 0 : (query.current - 1) * query.pageSize)
  const direction = query.sort.direction === 'asc' ? 'ASC' : 'DESC'
  const sortExpression =
    sort.valueType === 'decimal'
      ? `(${sortColumn.alias})::numeric`
      : sortColumn.alias
  const authorizedSql = `SELECT r.id,r.applicant_id,r.status,r.created_at${
    projections.length ? `,${projections.join(',')}` : ''
  },${hiddenExpression} AS hidden_field_keys
    FROM business_records r WHERE r.tenant_id=$1 AND r.application_release_id=$3 AND r.record_kind='generic'
      AND af_record_visible($1,$2,r.id)
      ${secondaryActor ? `AND af_record_visible($1,${secondaryUser},r.id)` : ''}
      AND r.created_at >= ($5::date::timestamp AT TIME ZONE $4)
      AND r.created_at < (($6::date+1)::timestamp AT TIME ZONE $4)
      AND (cardinality($7::text[])=0 OR r.status=ANY($7::text[]))`
  const sql = `WITH authorized AS MATERIALIZED (${authorizedSql}),
  matching AS MATERIALIZED (SELECT * FROM authorized WHERE ${predicate}),
  page AS (SELECT id,applicant_id,${valuesSql} AS values,hidden_field_keys,row_number() OVER(ORDER BY ${sortExpression} ${direction} NULLS LAST,id ASC) AS position FROM matching ORDER BY ${sortExpression} ${direction} NULLS LAST,id ASC LIMIT ${limit} OFFSET ${offset}),
  daily AS (SELECT to_char(created_at AT TIME ZONE $4,'YYYY-MM-DD') AS day,count(*) AS total FROM matching GROUP BY day),
  statuses AS (SELECT status,count(*) AS total FROM matching GROUP BY status)
  SELECT statement_timestamp() AS queried_at,statement_timestamp() AS data_cutoff_at,
    (SELECT count(*) FROM matching) AS total,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'values',values,'hiddenFieldKeys',hidden_field_keys) ORDER BY position) FROM page),'[]'::jsonb) AS rows,
    ${
      exporting
        ? "COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'applicantId',applicant_id) ORDER BY position) FROM page),'[]'::jsonb)"
        : "'[]'::jsonb"
    } AS manifest,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('date',day,'count',total) ORDER BY day) FROM daily),'[]'::jsonb) AS trend,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('status',status,'count',total) ORDER BY status) FROM statuses),'[]'::jsonb) AS distribution,
    COALESCE((SELECT array_agg(DISTINCT denied.field_key) FROM matching CROSS JOIN LATERAL unnest(hidden_field_keys) AS denied(field_key)),ARRAY[]::text[]) AS suppressed_keys`
  await db.query(
    exporting
      ? "SET LOCAL statement_timeout='15000ms'"
      : "SET LOCAL statement_timeout='5000ms'"
  )
  if (exporting) {
    // Reject an over-limit set before sorting and serializing its full snapshot.
    // The full query keeps the same bound check in case rows change after this statement.
    const bounded = one(
      await rows<{ total: string }>(
        db,
        `WITH authorized AS (${authorizedSql})
        SELECT count(*) AS total FROM (
          SELECT 1 FROM authorized WHERE ${predicate} LIMIT ${limit}
        ) bounded`,
        preflightParameters
      )
    )
    if (Number(bounded.total) > REPORT_EXPORT_MAX_ROWS)
      throw new DomainError(
        422,
        'REPORT_EXPORT_TOO_MANY_ROWS',
        `导出最多支持${REPORT_EXPORT_MAX_ROWS}条匹配记录，请缩小筛选范围`
      )
  }
  const result = one(
    await rows<{
      queried_at: Date
      data_cutoff_at: Date
      total: string
      rows: ReportingQueryResultV1['rows']
      trend: ReportingQueryResultV1['trend']
      distribution: ReportingQueryResultV1['distribution']
      suppressed_keys: string[]
      manifest: { id: string; applicantId: string }[]
    }>(db, sql, parameters)
  )
  const output: ReportingQueryResultV1 = {
    version: 1,
    definitionId: context.definitionId,
    definitionVersion: context.definitionVersion,
    source: catalogue.source,
    sourceReleaseId: context.sourceReleaseId,
    sourceReleaseVersion: context.sourceReleaseVersion,
    policyVersion: 1,
    kind: schema.kind,
    metric: 'count',
    factTime: 'createdAt',
    timeZone: query.timeZone,
    dateRange: query.dateRange,
    queriedAt: result.queried_at.toISOString(),
    dataCutoffAt: result.data_cutoff_at.toISOString(),
    scope: 'current-authorized-records',
    releaseScope: 'fixed-published-source',
    visibleFields: fields.map(visibleDto),
    hiddenFields: [
      ...hiddenFields,
      ...fields
        .filter((field) => result.suppressed_keys.includes(field.key))
        .map((field) => ({
          reference: field.reference,
          reason: 'scope-denied' as const,
        })),
    ],
    current: query.current,
    pageSize: query.pageSize,
    total: Number(result.total),
    rows: result.rows,
    trend: result.trend,
    distribution: result.distribution,
  }
  return {
    result: output,
    manifest: result.manifest.map((identity) => ({
      ...identity,
      allowedFieldKeys: fields
        .map((field) => field.key)
        .filter(
          (key) =>
            !output.rows
              .find((row) => row.id === identity.id)
              ?.hiddenFieldKeys?.includes(key)
        ),
    })),
  }
}

export const queryReportingVersion = async (
  db: Database,
  actor: Actor,
  context: ReportingQueryContext,
  input: unknown
): Promise<ReportingQueryResultV1> =>
  (await runReportingVersion(db, actor, context, input)).result

/** Server-only capture: the HTTP query parser never accepts a larger page or client facts. */
export const captureReportingExportSnapshot = async (
  db: Database,
  actor: Actor,
  context: ReportingQueryContext & { definitionVersionId: string },
  input: unknown,
  secondaryActor?: Actor
) => {
  const query = parseReportingQuery(input, context.schema)
  const { result, manifest } = await runReportingVersion(
    db,
    actor,
    context,
    query,
    true,
    secondaryActor
  )
  if (!result.visibleFields.length)
    throw new DomainError(
      403,
      'REPORT_EXPORT_FIELD_FORBIDDEN',
      '当前双方没有可输出的批准字段'
    )
  if (
    result.total > REPORT_EXPORT_MAX_ROWS ||
    result.rows.length > REPORT_EXPORT_MAX_ROWS
  )
    throw new DomainError(
      422,
      'REPORT_EXPORT_TOO_MANY_ROWS',
      `导出最多支持${REPORT_EXPORT_MAX_ROWS}条匹配记录，请缩小筛选范围`
    )
  if (result.total !== result.rows.length)
    throw new DomainError(
      409,
      'REPORT_EXPORT_CAPTURE_INCOMPLETE',
      '导出数据快照不完整'
    )
  const snapshot: ReportingExportSnapshot = {
    version: 1,
    producerVersion: REPORT_EXPORT_PRODUCER_VERSION,
    definitionId: context.definitionId,
    definitionVersionId: context.definitionVersionId,
    definitionVersion: context.definitionVersion,
    schema: context.schema,
    sourceReleaseId: context.sourceReleaseId,
    sourceReleaseVersion: context.sourceReleaseVersion,
    policyVersion: 1,
    query,
    queriedAt: result.queriedAt,
    dataCutoffAt: result.dataCutoffAt,
    columns: result.visibleFields,
    rows: result.rows,
    total: result.total,
  }
  const size = one(
    await rows<{ bytes: number }>(
      db,
      'SELECT octet_length($1::jsonb::text)+octet_length($2::jsonb::text) AS bytes',
      [JSON.stringify(snapshot), JSON.stringify(manifest)]
    )
  )
  if (size.bytes > REPORT_EXPORT_MAX_SNAPSHOT_BYTES)
    throw new DomainError(
      422,
      'REPORT_EXPORT_SNAPSHOT_TOO_LARGE',
      '导出数据快照超过2MiB，请缩小筛选范围'
    )
  return { snapshot, manifest }
}
