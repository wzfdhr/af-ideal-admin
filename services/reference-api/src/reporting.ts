import { randomUUID } from 'node:crypto'
import {
  DomainError,
  REPORTING_PERMISSIONS as P,
  parseReportingDefinition,
  record,
  onlyKeys,
  text,
  positiveInteger,
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
  audit,
  contentHash,
  pageQuery,
  sequential,
  noFault,
} from './support'
import {
  captureReportingSource,
  reportingCatalogue,
  reportingFieldMap,
  assertReportingFields,
  assertReportingMapping,
} from './report-source'
import { queryReportingVersion } from './report-query'
import type {
  ReportingDefinitionV1,
  ReportingDefinitionRecord,
  ReportingDefinitionVersion,
  ReportingSourceCatalogue,
} from '@af-admin/contracts'
import type { ReportingFieldMap } from './report-source'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

interface DefinitionRow {
  tenant_id: string
  id: string
  draft_schema: ReportingDefinitionV1
  revision: number
  draft_revision: number
  enabled: boolean
  active_version_id: string | null
  created_by: string
  updated_at: Date
}
interface VersionRow {
  tenant_id: string
  id: string
  definition_id: string
  version: number
  draft_revision: number
  schema_snapshot: ReportingDefinitionV1
  source_application_id: string
  source_release_id: string
  source_release_version: number
  field_bindings: ReportingFieldMap
  content_hash: string
  published_by: string
  published_at: Date
}
const governance = [P.list, P.create, P.update, P.publish, P.disable]
const versionDto = (row: VersionRow): ReportingDefinitionVersion => ({
  id: row.id,
  definitionId: row.definition_id,
  version: row.version,
  schema: row.schema_snapshot,
  sourceReleaseId: row.source_release_id,
  sourceReleaseVersion: row.source_release_version,
  contentHash: row.content_hash,
  publishedBy: row.published_by,
  publishedAt: row.published_at.toISOString(),
})
const metadataScope = async (
  db: Database,
  actor: Actor,
  creator: string,
  permissions: string[]
) => {
  const allowed = permissions.filter((permission) =>
    hasPermission(actor.permissions, permission)
  )
  if (!allowed.length) requirePermission(actor.permissions, permissions[0])
  const scope = one(
    await rows<{ visible: boolean }>(
      db,
      'SELECT EXISTS(SELECT 1 FROM unnest($4::text[]) code WHERE af_historical_member_scope_visible($1,$2,code,$3)) AS visible',
      [actor.tenantId, actor.userId, creator, allowed]
    )
  )
  if (!scope.visible) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
const locateDefinition = async (
  db: Database,
  actor: Actor,
  id: string,
  permission?: string,
  lock = false
) => {
  const row = one(
    await rows<DefinitionRow>(
      db,
      `SELECT * FROM report_definitions WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [actor.tenantId, id]
    )
  )
  await metadataScope(
    db,
    actor,
    row.created_by,
    permission ? [permission] : governance
  )
  return row
}
const definitionDto = async (
  db: Database,
  row: DefinitionRow,
  detail = false
): Promise<ReportingDefinitionRecord> => {
  const versions = await rows<VersionRow>(
    db,
    'SELECT * FROM report_definition_versions WHERE tenant_id=$1 AND definition_id=$2 ORDER BY version DESC',
    [row.tenant_id, row.id]
  )
  const current = versions.find(
    (version) => version.id === row.active_version_id
  )
  return {
    id: row.id,
    schema: row.draft_schema,
    revision: row.revision,
    enabled: row.enabled,
    activeVersionId: row.active_version_id,
    createdBy: row.created_by,
    updatedAt: row.updated_at.toISOString(),
    draftChanged: !!current && current.draft_revision !== row.draft_revision,
    ...(detail ? { versions: versions.map(versionDto) } : {}),
  }
}
const locateVersion = async (db: Database, actor: Actor, id: string) => {
  const version = one(
    await rows<VersionRow>(
      db,
      'SELECT * FROM report_definition_versions WHERE tenant_id=$1 AND id=$2',
      [actor.tenantId, id]
    )
  )
  const definition = one(
    await rows<DefinitionRow>(
      db,
      'SELECT * FROM report_definitions WHERE tenant_id=$1 AND id=$2 FOR SHARE',
      [actor.tenantId, version.definition_id]
    )
  )
  return { version, definition }
}
const requireEnabled = (row: DefinitionRow) => {
  if (!row.enabled)
    throw new DomainError(409, 'REPORT_DISABLED', '报表已停用，当前不能查询')
}
const sourcePermissions = [P.query, P.create, P.update, P.publish, P.list]

export const registerReporting = (
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
  const response = async (
    db: Database,
    actor: Actor,
    permission: string,
    id: string
  ) =>
    definitionDto(db, await locateDefinition(db, actor, id, permission), true)
  server.get('/api/reporting/sources', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        if (
          !sourcePermissions.some((permission) =>
            hasPermission(current.permissions, permission)
          )
        )
          requirePermission(current.permissions, P.query)
        const query = record(request.query)
        onlyKeys(query, ['current', 'pageSize', 'keyword', 'applicationId'])
        if (query.keyword !== undefined && typeof query.keyword !== 'string')
          throw new DomainError(
            422,
            'REPORT_SOURCE_QUERY_INVALID',
            '来源关键词必须为文本'
          )
        const page = pageQuery({
          ...query,
          pageSize: query.pageSize === undefined ? 20 : query.pageSize,
        })
        const applicationId =
          query.applicationId === undefined || query.applicationId === ''
            ? ''
            : text(query.applicationId, 'applicationId', 100)
        const keyword = page.keyword.replace(/[!%_]/g, '!$&')
        const selected = one(
          await rows<{ total: string; apps: { id: string }[] }>(
            db,
            "WITH visible AS MATERIALIZED (SELECT a.id,a.name FROM applications a WHERE a.tenant_id=$1 AND a.business_kind='generic' AND a.status='enabled' AND a.active_release_id IS NOT NULL AND ($3::boolean OR EXISTS(SELECT 1 FROM business_records r JOIN application_releases ar ON ar.tenant_id=r.tenant_id AND ar.id=r.application_release_id WHERE r.tenant_id=$1 AND ar.application_id=a.id AND r.application_release_id=a.active_release_id AND r.record_kind='generic' AND af_record_visible($1,$2,r.id))) AND a.name ILIKE $4 ESCAPE '!' AND ($5='' OR a.id=$5)), selected AS (SELECT id,name FROM visible ORDER BY name,id LIMIT $6 OFFSET $7) SELECT (SELECT count(*) FROM visible) AS total,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id) ORDER BY name,id) FROM selected),'[]'::jsonb) AS apps",
            [
              current.tenantId,
              current.userId,
              hasPermission(current.permissions, 'business:read:self'),
              `%${keyword}%`,
              applicationId,
              page.pageSize,
              page.offset,
            ]
          )
        )
        const catalogue: ReportingSourceCatalogue[] = []
        await sequential(selected.apps, async (app) => {
          catalogue.push(
            reportingCatalogue(
              await captureReportingSource(db, current, app.id),
              current
            )
          )
        })
        return ok(
          {
            list: catalogue,
            total: Number(selected.total),
            current: page.current,
            pageSize: page.pageSize,
          },
          request.id
        )
      }
    )
  })
  server.get('/api/reporting/definitions', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, P.list, async (db, current) => {
      const page = pageQuery(request.query)
      const query = record(request.query)
      const params = [
        current.tenantId,
        current.userId,
        P.list,
        `%${page.keyword}%`,
        typeof query.kind === 'string' ? query.kind : '',
      ]
      const filter =
        "WHERE tenant_id=$1 AND af_historical_member_scope_visible($1,$2,$3,created_by) AND (draft_schema->>'name') ILIKE $4 AND ($5='' OR draft_schema->>'kind'=$5)"
      const total = one(
        await rows<{ total: string }>(
          db,
          `SELECT count(*) AS total FROM report_definitions ${filter}`,
          params
        )
      )
      const found = await rows<DefinitionRow>(
        db,
        `SELECT * FROM report_definitions ${filter} ORDER BY updated_at DESC,id LIMIT $6 OFFSET $7`,
        [...params, page.pageSize, page.offset]
      )
      const list: ReportingDefinitionRecord[] = []
      await sequential(found, async (row) => {
        list.push(await definitionDto(db, row))
      })
      return ok({ list, total: Number(total.total) }, request.id)
    })
  })
  server.get('/api/reporting/definitions/published', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, P.query, async (db, current) => {
      const page = pageQuery(request.query)
      const from =
        "FROM report_definition_versions v JOIN report_definitions d ON d.tenant_id=v.tenant_id AND d.id=v.definition_id WHERE v.tenant_id=$1 AND d.enabled AND (v.schema_snapshot->>'name') ILIKE $2"
      const params = [current.tenantId, `%${page.keyword}%`]
      const total = one(
        await rows<{ total: string }>(
          db,
          `SELECT count(*) AS total ${from}`,
          params
        )
      )
      const found = await rows<VersionRow>(
        db,
        `SELECT v.* ${from} ORDER BY v.published_at DESC,v.id LIMIT $3 OFFSET $4`,
        [...params, page.pageSize, page.offset]
      )
      return ok(
        { list: found.map(versionDto), total: Number(total.total) },
        request.id
      )
    })
  })
  server.get('/api/reporting/definitions/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, undefined, async (db, current) =>
      ok(
        await definitionDto(
          db,
          await locateDefinition(db, current, idOf(request.params)),
          true
        ),
        request.id
      )
    )
  })
  server.post('/api/reporting/definitions', async (request) => {
    const actor = await authenticate(pool, request)
    const body = record(request.body)
    onlyKeys(body, ['schema'])
    const schema = parseReportingDefinition(body.schema)
    return ok(
      await idempotent(
        pool,
        actor,
        P.create,
        'reporting.create',
        scalarHeader(request, 'idempotency-key'),
        schema,
        async (db, current) => {
          const source = await captureReportingSource(
            db,
            current,
            schema.source.applicationId
          )
          assertReportingFields(source, current, schema.fields)
          const id = randomUUID()
          await db.query(
            'INSERT INTO report_definitions(tenant_id,id,draft_schema,created_by) VALUES($1,$2,$3,$4)',
            [current.tenantId, id, JSON.stringify(schema), current.userId]
          )
          await audit(
            db,
            current,
            'report',
            'definition.create',
            'report-definition',
            id,
            'success',
            { sourceApplicationId: source.applicationId }
          )
          fault('reporting:created')
          return response(db, current, P.create, id)
        },
        true,
        '',
        (db, current, previous) => response(db, current, P.create, previous.id)
      ),
      request.id
    )
  })
  server.put('/api/reporting/definitions/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const body = record(request.body)
    onlyKeys(body, ['schema', 'expectedRevision'])
    const schema = parseReportingDefinition(body.schema)
    const expectedRevision = positiveInteger(body.expectedRevision)
    return ok(
      await idempotent(
        pool,
        actor,
        P.update,
        `reporting.update:${id}`,
        scalarHeader(request, 'idempotency-key'),
        { schema, expectedRevision },
        async (db, current) => {
          const old = await locateDefinition(db, current, id, P.update, true)
          assertRevision(old.revision, expectedRevision)
          const source = await captureReportingSource(
            db,
            current,
            schema.source.applicationId
          )
          assertReportingFields(source, current, schema.fields)
          await db.query(
            'UPDATE report_definitions SET draft_schema=$3,draft_revision=draft_revision+1,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id, JSON.stringify(schema)]
          )
          await audit(
            db,
            current,
            'report',
            'definition.update',
            'report-definition',
            id
          )
          fault('reporting:updated')
          return response(db, current, P.update, id)
        },
        true,
        '',
        (db, current, previous) => response(db, current, P.update, previous.id)
      ),
      request.id
    )
  })
  server.post('/api/reporting/definitions/:id/publish', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const expectedRevision = positiveInteger(body.expectedRevision)
    return ok(
      await idempotent(
        pool,
        actor,
        P.publish,
        `reporting.publish:${id}`,
        scalarHeader(request, 'idempotency-key'),
        { expectedRevision },
        async (db, current) => {
          const old = await locateDefinition(db, current, id, P.publish, true)
          assertRevision(old.revision, expectedRevision)
          requireEnabled(old)
          const schema = parseReportingDefinition(old.draft_schema)
          const previous = old.active_version_id
            ? one(
                await rows<VersionRow>(
                  db,
                  'SELECT * FROM report_definition_versions WHERE tenant_id=$1 AND id=$2',
                  [current.tenantId, old.active_version_id]
                )
              )
            : undefined
          if (previous?.draft_revision === old.draft_revision)
            throw new DomainError(
              409,
              'REPORT_DRAFT_UNCHANGED',
              '当前草稿已发布，请先保存修改'
            )
          const source = await captureReportingSource(
            db,
            current,
            schema.source.applicationId
          )
          assertReportingFields(source, current, schema.fields)
          const bindings = reportingFieldMap(source)
          const versionId = randomUUID()
          await db.query(
            'INSERT INTO report_definition_versions(tenant_id,id,definition_id,version,draft_revision,schema_snapshot,source_application_id,source_release_id,source_release_version,field_bindings,content_hash,published_by) SELECT $1,$2,$3,COALESCE(max(version),0)+1,$4,$5,$6,$7,$8,$9,$10,$11 FROM report_definition_versions WHERE tenant_id=$1 AND definition_id=$3',
            [
              current.tenantId,
              versionId,
              id,
              old.draft_revision,
              JSON.stringify(schema),
              source.applicationId,
              source.release.id,
              source.release.releaseVersion,
              JSON.stringify(bindings),
              contentHash({
                schema,
                sourceReleaseId: source.release.id,
                bindings,
              }),
              current.userId,
            ]
          )
          await db.query(
            'UPDATE report_definitions SET active_version_id=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id, versionId]
          )
          await audit(
            db,
            current,
            'report',
            'definition.publish',
            'report-definition',
            id,
            'success',
            {
              versionId,
              sourceReleaseId: source.release.id,
              sourceReleaseVersion: source.release.releaseVersion,
            }
          )
          fault('reporting:published')
          return response(db, current, P.publish, id)
        },
        true,
        '',
        (db, current, previous) => response(db, current, P.publish, previous.id)
      ),
      request.id
    )
  })
  server.post('/api/reporting/definitions/:id/enabled', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision', 'enabled'])
    const expectedRevision = positiveInteger(body.expectedRevision)
    if (typeof body.enabled !== 'boolean')
      throw new DomainError(422, 'REPORT_ENABLED_INVALID', '启用状态无效')
    const input = { expectedRevision, enabled: body.enabled }
    return ok(
      await idempotent(
        pool,
        actor,
        P.disable,
        `reporting.enabled:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (db, current) => {
          const old = await locateDefinition(db, current, id, P.disable, true)
          assertRevision(old.revision, expectedRevision)
          await db.query(
            'UPDATE report_definitions SET enabled=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id, input.enabled]
          )
          await audit(
            db,
            current,
            'report',
            input.enabled ? 'definition.enable' : 'definition.disable',
            'report-definition',
            id
          )
          return response(db, current, P.disable, id)
        },
        true,
        '',
        (db, current, previous) => response(db, current, P.disable, previous.id)
      ),
      request.id
    )
  })
  server.get('/api/reporting/versions/:id/catalogue', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        const { version, definition } = await locateVersion(
          db,
          current,
          idOf(request.params)
        )
        if (hasPermission(current.permissions, P.query))
          requireEnabled(definition)
        else await metadataScope(db, current, definition.created_by, governance)
        const source = await captureReportingSource(
          db,
          current,
          version.source_application_id,
          version.source_release_id
        )
        assertReportingMapping(source, version.field_bindings)
        return ok(reportingCatalogue(source, current), request.id)
      }
    )
  })
  server.post('/api/reporting/versions/:id/query', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const body = record(request.body)
    onlyKeys(body, ['query'])
    return authorizedTransaction(pool, actor, P.query, async (db, current) => {
      const { version, definition } = await locateVersion(db, current, id)
      requireEnabled(definition)
      const result = await queryReportingVersion(
        db,
        current,
        {
          definitionId: version.definition_id,
          definitionVersion: version.version,
          schema: version.schema_snapshot,
          sourceReleaseId: version.source_release_id,
          sourceReleaseVersion: version.source_release_version,
          fieldMap: version.field_bindings,
        },
        body.query
      )
      await audit(
        db,
        current,
        'report',
        'query',
        'report-definition-version',
        id,
        'success',
        { total: result.total, sourceReleaseId: version.source_release_id }
      )
      return ok(result, request.id)
    })
  })
}
export default registerReporting
