import {
  DomainError,
  REPORTING_PERMISSIONS,
  parseReportingDefinition,
  parseReportingQuery,
  parsePublishableDataScreenDefinition,
} from '@af-admin/contracts'
import { requirePermission } from '@af-admin/workflow-core'
import { one, rows, contentHash, sequential } from './support'
import { locateReportingVersion, requireReportingEnabled } from './reporting'
import { queryReportingVersion } from './report-query'
import {
  captureReportingSource,
  assertReportingFields,
  assertReportingMapping,
  reportingFieldKey,
  reportingFieldAvailable,
} from './report-source'
import type {
  DataScreenDefinitionV1,
  DataScreenSourceV1,
  DataScreenSourceBindingSnapshot,
  DataScreenSourceRunResultV1,
  DataScreenRunErrorCode,
} from '@af-admin/contracts'
import type { Database } from './support'
import type { Actor } from './auth'

/** Only server clock and the fixed report's timezone determine the date window. */
export const dataScreenQuery = async (
  db: Database,
  actor: Actor,
  screen: DataScreenDefinitionV1,
  input: DataScreenSourceV1,
  strict = false
) => {
  requirePermission(actor.permissions, REPORTING_PERMISSIONS.query)
  const { version, definition } = await locateReportingVersion(
    db,
    actor,
    input.reportDefinitionVersionId
  )
  requireReportingEnabled(definition)
  const report = parseReportingDefinition(version.schema_snapshot)
  const source = await captureReportingSource(
    db,
    actor,
    version.source_application_id,
    version.source_release_id
  )
  assertReportingMapping(source, version.field_bindings)
  if (source.release.releaseVersion !== version.source_release_version)
    throw new DomainError(409, 'SCREEN_SOURCE_CONFLICT', '固定来源版本不一致')
  const configured = assertReportingFields(source, actor, report.fields, strict)
  const selected = new Set(report.fields.map(reportingFieldKey))
  const widgets = screen.widgets.filter(
    (widget) => widget.sourceKey === input.sourceKey
  )
  widgets.forEach((widget) => {
    const { view } = widget.props
    const required = view === 'coordinates' ? 'detail' : view
    if (
      (required !== 'count' && report.kind !== required) ||
      (widget.kind === 'metric' &&
        widget.props.showTrend &&
        report.kind !== 'trend')
    )
      throw new DomainError(
        422,
        'SCREEN_VIEW_INCOMPATIBLE',
        '控件视图与固定报表类型不兼容'
      )
    const references = []
    if (widget.kind === 'table') references.push(...widget.props.columns)
    if (widget.kind === 'map')
      references.push(widget.props.longitudeField, widget.props.latitudeField)
    if (references.some((field) => !selected.has(reportingFieldKey(field))))
      throw new DomainError(
        422,
        'SCREEN_FIELD_UNSELECTED',
        '控件字段必须属于固定报表所选字段'
      )
    const fields = assertReportingFields(source, actor, references, strict)
    if (widget.kind === 'map') {
      const axes = ['longitude', 'latitude'] as const
      if (
        fields.some((field, index) =>
          field.valueType === 'coordinate'
            ? field.coordinateAxis !== axes[index]
            : !['integer', 'decimal'].includes(field.valueType)
        )
      )
        throw new DomainError(
          422,
          'SCREEN_COORDINATE_TYPE_INVALID',
          '经纬度必须绑定正确坐标轴或已批准的数值字段'
        )
    }
  })
  const sortable = configured.filter(
    (field) => field.sortable && reportingFieldAvailable(actor, field)
  )
  const sort =
    ['createdAt', 'id', 'status']
      .map((id) =>
        sortable.find(
          (field) =>
            field.reference.kind === 'metadata' && field.reference.id === id
        )
      )
      .find(Boolean) || sortable[0]
  if (!sort)
    throw new DomainError(
      403,
      'REPORT_FIELD_FORBIDDEN',
      '当前没有可使用的批准排序字段'
    )
  const range = one(
    await rows<{ from: string; to: string }>(
      db,
      `WITH today AS (SELECT (statement_timestamp() AT TIME ZONE $1)::date AS day)
     SELECT to_char(CASE $2 WHEN 'today' THEN day WHEN 'last-7-days' THEN day-6 WHEN 'current-month' THEN date_trunc('month',day)::date ELSE (date_trunc('month',day)-interval '1 month')::date END,'YYYY-MM-DD') AS "from",
     to_char(CASE $2 WHEN 'previous-month' THEN date_trunc('month',day)::date-1 ELSE day END,'YYYY-MM-DD') AS "to" FROM today`,
      [report.timeZone, input.dateWindow]
    )
  )
  const query = parseReportingQuery(
    {
      version: 1,
      timeZone: report.timeZone,
      dateRange: range,
      statuses: input.statuses,
      keyword: '',
      searchFields: [],
      sort: { field: sort.reference, direction: 'desc' },
      current: 1,
      pageSize: 100,
    },
    report
  )
  const binding: DataScreenSourceBindingSnapshot = {
    sourceKey: input.sourceKey,
    reportDefinitionId: version.definition_id,
    reportDefinitionVersionId: version.id,
    reportDefinitionVersion: version.version,
    sourceReleaseId: source.release.id,
    sourceReleaseVersion: source.release.releaseVersion,
    reportContentHash: version.content_hash,
    sourceContentHash: source.release.contentHash,
  }
  return { version, query, binding }
}

export const validateDataScreenSources = async (
  db: Database,
  actor: Actor,
  input: unknown
) => {
  const schema = parsePublishableDataScreenDefinition(input)
  const bindings: DataScreenSourceBindingSnapshot[] = []
  await sequential(schema.sources, async (source) => {
    bindings.push(
      (await dataScreenQuery(db, actor, schema, source, true)).binding
    )
  })
  return { schema, bindings }
}

const errorCode = (error: unknown): DataScreenRunErrorCode => {
  if (error instanceof DomainError) {
    if (error.status === 403 || error.status === 401) return 'permission-denied'
    if (
      error.businessCode === 'REPORT_DISABLED' ||
      error.businessCode === 'REPORT_SOURCE_UNAVAILABLE'
    )
      return 'source-disabled'
    if (error.status === 404) return 'source-unavailable'
    return 'query-failed'
  }
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(String(error.code))
  )
    return 'network-error'
  return 'query-failed'
}

export const runDataScreenSources = async (
  db: Database,
  actor: Actor,
  schema: DataScreenDefinitionV1,
  bindings?: DataScreenSourceBindingSnapshot[]
) => {
  const results: DataScreenSourceRunResultV1[] = []
  await sequential(schema.sources, async (source) => {
    // SQL cancellation/errors abort a PG transaction unless rolled back to a savepoint.
    await db.query('SAVEPOINT data_screen_source')
    try {
      const checked = await dataScreenQuery(db, actor, schema, source)
      if (
        bindings &&
        contentHash(
          bindings.find((binding) => binding.sourceKey === source.sourceKey) ||
            null
        ) !== contentHash(checked.binding)
      )
        throw new DomainError(
          409,
          'SCREEN_SOURCE_CONFLICT',
          '固定来源绑定不一致'
        )
      const result = await queryReportingVersion(
        db,
        actor,
        {
          definitionId: checked.version.definition_id,
          definitionVersion: checked.version.version,
          schema: checked.version.schema_snapshot,
          sourceReleaseId: checked.version.source_release_id,
          sourceReleaseVersion: checked.version.source_release_version,
          fieldMap: checked.version.field_bindings,
        },
        checked.query
      )
      results.push({
        sourceKey: source.sourceKey,
        reportDefinitionVersionId: source.reportDefinitionVersionId,
        actualQuery: checked.query,
        status: result.total ? 'ready' : 'empty',
        errorCode: null,
        queriedAt: result.queriedAt,
        dataCutoffAt: result.dataCutoffAt,
        result,
      })
      await db.query('RELEASE SAVEPOINT data_screen_source')
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT data_screen_source')
      await db.query('RELEASE SAVEPOINT data_screen_source')
      const now = one(
        await rows<{ time: Date }>(db, 'SELECT clock_timestamp() AS time')
      ).time
      results.push({
        sourceKey: source.sourceKey,
        reportDefinitionVersionId: source.reportDefinitionVersionId,
        actualQuery: null,
        status: 'error',
        errorCode: errorCode(error),
        queriedAt: now.toISOString(),
        dataCutoffAt: null,
        result: null,
      })
    }
  })
  return results
}
