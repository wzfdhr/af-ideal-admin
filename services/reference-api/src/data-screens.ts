import { randomUUID } from 'node:crypto'
import {
  DomainError,
  DATA_SCREEN_PERMISSIONS as P,
  parseCreateDataScreen,
  parseUpdateDataScreen,
  parsePublishDataScreen,
  parseRollbackDataScreen,
  parseToggleDataScreen,
  parseArchiveDataScreen,
  parseRunDataScreen,
  parsePreviewDataScreen,
  record,
  onlyKeys,
  text,
} from '@af-admin/contracts'
import {
  assertRevision,
  hasPermission,
  requirePermission,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  authorizedTransaction,
  idempotent,
  audit,
  contentHash,
  contentCanonical,
  pageQuery,
  noFault,
  sequential,
} from './support'
import {
  validateDataScreenSources,
  runDataScreenSources,
} from './data-screens-query'
import { dataScreenTemplates } from './data-screens-templates'
import { locateReportingVersion } from './reporting'
import type {
  DataScreenDefinitionV1,
  DataScreenDetails,
  DataScreenPublishedVersion,
  DataScreenSourceBindingSnapshot,
  DataScreenAllowedAction,
} from '@af-admin/contracts'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

interface ScreenRow {
  tenant_id: string
  id: string
  draft_schema: DataScreenDefinitionV1
  revision: number
  draft_revision: number
  enabled: boolean
  archived: boolean
  active_release_id: string | null
  created_by: string
  created_at: Date
  updated_at: Date
}
interface ReleaseRow {
  id: string
  definition_id: string
  version: number
  schema_snapshot: DataScreenDefinitionV1
  source_bindings: DataScreenSourceBindingSnapshot[]
  content_canonical: string
  content_hash: string
  published_by: string
  published_at: Date
}
const governance = [
  P.list,
  P.create,
  P.update,
  P.publish,
  P.rollback,
  P.toggle,
  P.archive,
]
const scope = async (
  db: Database,
  actor: Actor,
  creator: string,
  code: string
) =>
  hasPermission(actor.permissions, code) &&
  one(
    await rows<{ visible: boolean }>(
      db,
      'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
      [actor.tenantId, actor.userId, code, creator]
    )
  ).visible
const locate = async (
  db: Database,
  actor: Actor,
  id: string,
  code?: string,
  lock = false
) => {
  const row = one(
    await rows<ScreenRow>(
      db,
      `SELECT * FROM data_screen_definitions WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ' FOR SHARE'
      }`,
      [actor.tenantId, id]
    )
  )
  let visible = false
  await sequential(
    code ? [code] : [...governance, P.run],
    async (permission) => {
      if (await scope(db, actor, row.created_by, permission)) visible = true
    }
  )
  if (!visible) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  return row
}
export const assertDataScreenReleaseIntegrity = (
  row: ReleaseRow
): ReleaseRow => {
  const payload = {
    snapshot: row.schema_snapshot,
    sourceBindings: row.source_bindings,
  }
  if (
    contentCanonical(payload) !== row.content_canonical ||
    contentHash(payload) !== row.content_hash
  )
    throw new DomainError(409, 'SCREEN_RELEASE_CORRUPT', '大屏发布快照校验失败')
  return row
}
const release = async (
  db: Database,
  tenantId: string,
  id: string,
  releaseId: string
) =>
  assertDataScreenReleaseIntegrity(
    one(
      await rows<ReleaseRow>(
        db,
        'SELECT * FROM data_screen_releases WHERE tenant_id=$1 AND definition_id=$2 AND id=$3',
        [tenantId, id, releaseId]
      )
    )
  )
const releaseDto = (row: ReleaseRow): DataScreenPublishedVersion => {
  assertDataScreenReleaseIntegrity(row)
  return {
    id: row.id,
    dataScreenId: row.definition_id,
    version: row.version,
    snapshot: row.schema_snapshot,
    contentHash: row.content_hash,
    sourceBindings: row.source_bindings,
    publishedBy: row.published_by,
    publishedAt: row.published_at.toISOString(),
  }
}
const dto = async (
  db: Database,
  actor: Actor,
  row: ScreenRow
): Promise<DataScreenDetails> => {
  let governing = false
  await sequential(governance, async (code) => {
    if (await scope(db, actor, row.created_by, code)) governing = true
  })
  const canRun = await scope(db, actor, row.created_by, P.run)
  if (
    !governing &&
    (!canRun || row.archived || !row.enabled || !row.active_release_id)
  )
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  const versions = await rows<ReleaseRow>(
    db,
    `SELECT * FROM data_screen_releases WHERE tenant_id=$1 AND definition_id=$2${
      governing ? '' : ' AND id=$3'
    } ORDER BY version DESC`,
    governing
      ? [row.tenant_id, row.id]
      : [row.tenant_id, row.id, row.active_release_id]
  )
  const actions: DataScreenAllowedAction[] = []
  if (!row.archived) {
    await sequential(
      ['update', 'publish', 'rollback', 'toggle', 'archive'] as const,
      async (action) => {
        if (await scope(db, actor, row.created_by, P[action]))
          actions.push(action)
      }
    )
    if (canRun && row.enabled && row.active_release_id) actions.push('run')
  }
  return {
    id: row.id,
    draft: governing ? row.draft_schema : one(versions).schema_snapshot,
    revision: row.revision,
    enabled: row.enabled,
    archived: row.archived,
    activeReleaseId: row.active_release_id,
    versions: versions.map(releaseDto),
    allowedActions: actions,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}
const event = async (
  db: Database,
  actor: Actor,
  id: string,
  action: string,
  detail: Record<string, string | number | boolean | null> = {}
) => {
  await db.query(
    'INSERT INTO data_screen_events(tenant_id,id,definition_id,action,actor_id,actor_name,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      actor.tenantId,
      randomUUID(),
      id,
      action,
      actor.userId,
      actor.name,
      JSON.stringify(detail),
    ]
  )
  await audit(
    db,
    actor,
    'data-screen',
    `data-screen.${action}`,
    'data-screen',
    id,
    'success',
    detail
  )
}
const assertDraftReferences = async (
  db: Database,
  actor: Actor,
  draft: DataScreenDefinitionV1
) => {
  await sequential(draft.sources, async (source) => {
    await locateReportingVersion(db, actor, source.reportDefinitionVersionId)
  })
}
const mutable = (row: ScreenRow, revision: number) => {
  if (row.archived)
    throw new DomainError(409, 'SCREEN_ARCHIVED', '归档大屏只允许读取历史')
  assertRevision(row.revision, revision)
}

// Named registration entry matches the other API modules.
// eslint-disable-next-line import/prefer-default-export
export const registerDataScreens = (
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
  server.get('/api/data-screens/templates', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (_db, current) => {
        if (
          ![...governance, P.run].some((code) =>
            hasPermission(current.permissions, code)
          )
        )
          requirePermission(current.permissions, P.list)
        onlyKeys(record(request.query), [])
        return ok(dataScreenTemplates, request.id)
      }
    )
  })
  server.get('/api/data-screens/definitions', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        if (
          ![P.list, P.run].some((code) =>
            hasPermission(current.permissions, code)
          )
        )
          requirePermission(current.permissions, P.list)
        const query = record(request.query)
        onlyKeys(query, ['current', 'pageSize', 'keyword'])
        if (query.keyword !== undefined && typeof query.keyword !== 'string')
          throw new DomainError(422, 'VALIDATION_ERROR', '关键词必须为文本')
        const page = pageQuery(query)
        const filter = `tenant_id=$1 AND ((af_historical_member_scope_visible($1,$2,$3,created_by)) OR (enabled AND NOT archived AND active_release_id IS NOT NULL AND af_historical_member_scope_visible($1,$2,$4,created_by)))
       AND (CASE WHEN af_historical_member_scope_visible($1,$2,$3,created_by) THEN draft_schema->>'title' ELSE (SELECT schema_snapshot->>'title' FROM data_screen_releases v WHERE v.tenant_id=data_screen_definitions.tenant_id AND v.id=active_release_id) END) ILIKE $5 ESCAPE '!'`
        const parameters = [
          current.tenantId,
          current.userId,
          P.list,
          P.run,
          `%${page.keyword.replace(/[!%_]/g, '!$&')}%`,
        ]
        const total = one(
          await rows<{ total: string }>(
            db,
            `SELECT count(*) AS total FROM data_screen_definitions WHERE ${filter}`,
            parameters
          )
        )
        const found = await rows<ScreenRow>(
          db,
          `SELECT * FROM data_screen_definitions WHERE ${filter} ORDER BY updated_at DESC,id LIMIT $6 OFFSET $7`,
          [...parameters, page.pageSize, page.offset]
        )
        const list: DataScreenDetails[] = []
        await sequential(found, async (row) => {
          list.push(await dto(db, current, row))
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
  server.get('/api/data-screens/definitions/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, undefined, async (db, current) =>
      ok(
        await dto(db, current, await locate(db, current, idOf(request.params))),
        request.id
      )
    )
  })
  server.post('/api/data-screens/definitions', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseCreateDataScreen(request.body)
    const result = await idempotent<{
      id: string
      details?: DataScreenDetails
    }>(
      pool,
      actor,
      P.create,
      'data-screen.create',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        await assertDraftReferences(db, current, input.draft)
        const id = randomUUID()
        await db.query(
          'INSERT INTO data_screen_definitions(tenant_id,id,draft_schema,created_by) VALUES($1,$2,$3,$4)',
          [current.tenantId, id, JSON.stringify(input.draft), current.userId]
        )
        await event(db, current, id, 'created')
        fault('data-screen:created')
        return { id }
      },
      false,
      '',
      async (db, current, identity) => ({
        ...identity,
        details: await dto(
          db,
          current,
          await locate(db, current, identity.id, P.create)
        ),
      })
    )
    return ok(result.details, request.id)
  })
  server.post('/api/data-screens/definitions/:id/copy', async (request) => {
    const actor = await authenticate(pool, request)
    const originalId = idOf(request.params)
    const input = parseCreateDataScreen(request.body)
    const result = await idempotent<{
      id: string
      details?: DataScreenDetails
    }>(
      pool,
      actor,
      P.create,
      `data-screen.copy:${originalId}`,
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const original = await locate(db, current, originalId)
        const visible = await dto(db, current, original)
        if (contentHash(visible.draft) !== contentHash(input.draft))
          throw new DomainError(
            409,
            'SCREEN_COPY_CONFLICT',
            '原稿已变化，请重新读取后复制'
          )
        await assertDraftReferences(db, current, input.draft)
        const id = randomUUID()
        await db.query(
          'INSERT INTO data_screen_definitions(tenant_id,id,draft_schema,created_by) VALUES($1,$2,$3,$4)',
          [current.tenantId, id, JSON.stringify(input.draft), current.userId]
        )
        await event(db, current, id, 'copied', { originalId })
        fault('data-screen:copied')
        return { id }
      },
      false,
      '',
      async (db, current, identity) => {
        await dto(db, current, await locate(db, current, originalId))
        return {
          ...identity,
          details: await dto(
            db,
            current,
            await locate(db, current, identity.id, P.create)
          ),
        }
      }
    )
    return ok(result.details, request.id)
  })
  const commands = {
    update: {
      method: 'PUT' as const,
      suffix: '',
      permission: P.update,
      parse: parseUpdateDataScreen,
    },
    publish: {
      method: 'POST' as const,
      suffix: '/publish',
      permission: P.publish,
      parse: parsePublishDataScreen,
    },
    rollback: {
      method: 'POST' as const,
      suffix: '/rollback',
      permission: P.rollback,
      parse: parseRollbackDataScreen,
    },
    toggle: {
      method: 'POST' as const,
      suffix: '/toggle',
      permission: P.toggle,
      parse: parseToggleDataScreen,
    },
    archive: {
      method: 'POST' as const,
      suffix: '/archive',
      permission: P.archive,
      parse: parseArchiveDataScreen,
    },
  }
  Object.entries(commands).forEach(([action, command]) =>
    server.route({
      method: command.method,
      url: `/api/data-screens/definitions/:id${command.suffix}`,
      handler: async (request) => {
        const actor = await authenticate(pool, request)
        const id = idOf(request.params)
        const input = command.parse(request.body)
        const result = await idempotent<{
          id: string
          details?: DataScreenDetails
        }>(
          pool,
          actor,
          command.permission,
          `data-screen.${action}:${id}`,
          scalarHeader(request, 'idempotency-key'),
          input,
          async (db, current) => {
            const row = await locate(db, current, id, command.permission, true)
            mutable(row, input.expectedRevision)
            let eventAction = 'updated'
            const detail: Record<string, string | number | boolean | null> = {}
            if (action === 'update') {
              const update = parseUpdateDataScreen(input)
              await assertDraftReferences(db, current, update.draft)
              await db.query(
                'UPDATE data_screen_definitions SET draft_schema=$3,draft_revision=draft_revision+1,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',
                [current.tenantId, id, JSON.stringify(update.draft)]
              )
            } else if (action === 'publish') {
              const checked = await validateDataScreenSources(
                db,
                current,
                row.draft_schema
              )
              const releaseId = randomUUID()
              const { version } = one(
                await rows<{ version: number }>(
                  db,
                  'SELECT COALESCE(max(version),0)+1 AS version FROM data_screen_releases WHERE tenant_id=$1 AND definition_id=$2',
                  [current.tenantId, id]
                )
              )
              await db.query(
                'INSERT INTO data_screen_releases(tenant_id,id,definition_id,version,draft_revision,schema_snapshot,source_bindings,content_canonical,content_hash,published_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                [
                  current.tenantId,
                  releaseId,
                  id,
                  version,
                  row.draft_revision,
                  JSON.stringify(checked.schema),
                  JSON.stringify(checked.bindings),
                  contentCanonical({
                    snapshot: checked.schema,
                    sourceBindings: checked.bindings,
                  }),
                  contentHash({
                    snapshot: checked.schema,
                    sourceBindings: checked.bindings,
                  }),
                  current.userId,
                ]
              )
              await db.query(
                'UPDATE data_screen_definitions SET active_release_id=$3,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',
                [current.tenantId, id, releaseId]
              )
              eventAction = 'published'
              detail.releaseId = releaseId
              detail.version = version
            } else if (action === 'rollback') {
              const rollback = parseRollbackDataScreen(input)
              const previous = await release(
                db,
                current.tenantId,
                id,
                rollback.releaseId
              )
              const checked = await validateDataScreenSources(
                db,
                current,
                previous.schema_snapshot
              )
              if (
                contentHash(checked.bindings) !==
                contentHash(previous.source_bindings)
              )
                throw new DomainError(
                  409,
                  'SCREEN_SOURCE_CONFLICT',
                  '历史来源绑定不一致'
                )
              await db.query(
                'UPDATE data_screen_definitions SET active_release_id=$3,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',
                [current.tenantId, id, previous.id]
              )
              eventAction = 'rolled-back'
              detail.releaseId = previous.id
            } else if (action === 'toggle') {
              const toggle = parseToggleDataScreen(input)
              await db.query(
                'UPDATE data_screen_definitions SET enabled=$3,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',
                [current.tenantId, id, toggle.enabled]
              )
              eventAction = 'toggled'
              detail.enabled = toggle.enabled
            } else {
              await db.query(
                'UPDATE data_screen_definitions SET archived=true,enabled=false,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',
                [current.tenantId, id]
              )
              eventAction = 'archived'
            }
            await event(db, current, id, eventAction, detail)
            fault(`data-screen:${eventAction}`)
            return { id }
          },
          false,
          '',
          async (db, current, identity) => ({
            ...identity,
            details: await dto(
              db,
              current,
              await locate(db, current, identity.id, command.permission)
            ),
          })
        )
        return ok(result.details, request.id)
      },
    })
  )
  server.post('/api/data-screens/preview', async (request) => {
    const actor = await authenticate(pool, request)
    const { draft } = parsePreviewDataScreen(request.body)
    return authorizedTransaction(pool, actor, P.run, async (db, current) =>
      ok(
        {
          version: 1,
          dataScreenId: 'preview',
          releaseId: 'preview',
          releaseVersion: 0,
          sources: await runDataScreenSources(db, current, draft),
        },
        request.id
      )
    )
  })
  server.post('/api/data-screens/definitions/:id/run', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseRunDataScreen(request.body)
    return authorizedTransaction(pool, actor, P.run, async (db, current) => {
      const row = await locate(db, current, idOf(request.params), P.run)
      if (row.archived || !row.enabled)
        throw new DomainError(409, 'SCREEN_DISABLED', '大屏已停用或归档')
      if (row.active_release_id !== input.releaseId)
        throw new DomainError(
          409,
          'SCREEN_RELEASE_STALE',
          '活动发布版已变化，请重新读取'
        )
      const fixed = await release(db, current.tenantId, row.id, input.releaseId)
      return ok(
        {
          version: 1,
          dataScreenId: row.id,
          releaseId: fixed.id,
          releaseVersion: fixed.version,
          sources: await runDataScreenSources(
            db,
            current,
            fixed.schema_snapshot,
            fixed.source_bindings
          ),
        },
        request.id
      )
    })
  })
}
