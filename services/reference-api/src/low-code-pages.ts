import { randomUUID } from 'node:crypto'
import {
  DomainError,
  LOW_CODE_PERMISSIONS as P,
  parseLowCodePage,
  parseLowCodeRollout,
  createBusinessLowCodePage,
  record,
  onlyKeys,
  text,
  positiveInteger,
} from '@af-admin/contracts'
import { assertRevision, requirePermission } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import { digest } from './security'
import {
  rows,
  one,
  pageQuery,
  authorizedTransaction,
  idempotent,
  audit,
  contentHash,
  sequential,
} from './support'
import {
  captureLowCodeSources,
  createLowCodeSource,
  availableSource,
} from './low-code-sources'
import type { LowCodeSourceSnapshot } from './low-code-sources'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { LowCodePageV2 } from '@af-admin/contracts'
import type { Pool, PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'

export interface LowCodePageRow {
  created_by: string
  id: string
  name: string
  schema: LowCodePageV2
  revision: number
  status: 'enabled' | 'archived'
  active_release_id: string | null
  rollout_release_id: string | null
  rollout_percent: number
  updated_at: Date
}
export interface LowCodeReleaseRow {
  id: string
  page_id: string
  release_version: number
  schema_snapshot: LowCodePageV2
  source_snapshots: LowCodeSourceSnapshot[]
  content_hash: string
  published_at: Date
}
export const assertLowCodeConfigurationScope = async (
  db: Database,
  actor: Actor,
  permission: string,
  owner: string
) => {
  const scope = one(
    await rows<{ visible: boolean }>(
      db,
      'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
      [actor.tenantId, actor.userId, permission, owner]
    )
  )
  if (!scope.visible) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
export const readLowCodePage = async (
  db: Database,
  actor: Actor,
  id: string,
  lock: 'read' | 'write' | false = false
): Promise<LowCodePageRow> => {
  let suffix = ''
  if (lock === 'read') suffix = ' FOR SHARE'
  if (lock === 'write') suffix = ' FOR UPDATE'
  return one(
    await rows<LowCodePageRow>(
      db,
      `SELECT * FROM low_code_pages WHERE tenant_id=$1 AND id=$2${suffix}`,
      [actor.tenantId, id]
    )
  )
}
export const readLowCodeRelease = async (
  db: Database,
  actor: Actor,
  pageId: string,
  id: string
) =>
  one(
    await rows<LowCodeReleaseRow>(
      db,
      'SELECT * FROM low_code_releases WHERE tenant_id=$1 AND page_id=$2 AND id=$3',
      [actor.tenantId, pageId, id]
    )
  )
export const pageDto = (page: LowCodePageRow) => ({
  id: page.id,
  name: page.name,
  schema: page.schema,
  revision: page.revision,
  status: page.status,
  activeReleaseId: page.active_release_id,
  rolloutReleaseId: page.rollout_release_id,
  rolloutPercent: page.rollout_percent,
  updatedAt: page.updated_at.toISOString(),
})
export const pageReleaseDto = (release: LowCodeReleaseRow) => ({
  id: release.id,
  pageId: release.page_id,
  releaseVersion: release.release_version,
  schema: release.schema_snapshot,
  contentHash: release.content_hash,
  publishedAt: release.published_at.toISOString(),
})
export const selectedPageReleaseId = (page: LowCodePageRow, userId: string) => {
  if (!page.active_release_id)
    throw new DomainError(409, 'LOW_CODE_PAGE_UNPUBLISHED', '页面尚未发布')
  const bucket = parseInt(digest(`${page.id}:${userId}`).slice(0, 8), 16) % 100
  return page.rollout_release_id && bucket < page.rollout_percent
    ? page.rollout_release_id
    : page.active_release_id
}
export const authorizeLowCodeRuntime = async (
  db: Database,
  actor: Actor,
  pageId: string,
  releaseId?: string
) => {
  requirePermission(actor.permissions, P.run)
  const page = await readLowCodePage(db, actor, pageId, 'read')
  if (page.status !== 'enabled')
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  const selected = selectedPageReleaseId(page, actor.userId)
  if (releaseId && selected !== releaseId)
    throw new DomainError(
      409,
      'LOW_CODE_RELEASE_CHANGED',
      '页面运行版本已变化，请保留输入并重新加载'
    )
  const release = await readLowCodeRelease(db, actor, pageId, selected)
  const schema = parseLowCodePage(release.schema_snapshot)
  if (schema.permissionCode)
    requirePermission(actor.permissions, schema.permissionCode)
  return { page, release, schema, snapshots: release.source_snapshots }
}
const idempotentPageCommand = <T extends { id: string; pageId?: string }>(
  pool: Pool,
  actor: Actor,
  permission: string,
  operation: string,
  key: string | undefined,
  payload: unknown,
  run: (db: PoolClient, current: Actor) => Promise<T>
) =>
  idempotent(
    pool,
    actor,
    permission,
    operation,
    key,
    payload,
    run,
    false,
    '',
    async (db, current, response) => {
      const page = await readLowCodePage(
        db,
        current,
        response.pageId || response.id
      )
      await assertLowCodeConfigurationScope(
        db,
        current,
        permission,
        page.created_by
      )
      return response
    }
  )

export const registerLowCodePages = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector
) => {
  server.get('/api/low-code/pages', async (request) => {
    const actor = await authenticate(pool, request)
    const page = pageQuery(request.query)
    return authorizedTransaction(pool, actor, P.list, async (db, current) => {
      const params = [
        current.tenantId,
        `%${page.keyword}%`,
        current.userId,
        P.list,
      ]
      const count = one(
        await rows<{ total: string }>(
          db,
          'SELECT count(*) AS total FROM low_code_pages WHERE tenant_id=$1 AND name ILIKE $2 AND af_historical_member_scope_visible($1,$3,$4,created_by)',
          params
        )
      )
      const list = await rows<LowCodePageRow>(
        db,
        'SELECT * FROM low_code_pages WHERE tenant_id=$1 AND name ILIKE $2 AND af_historical_member_scope_visible($1,$3,$4,created_by) ORDER BY updated_at DESC,id LIMIT $5 OFFSET $6',
        [...params, page.pageSize, page.offset]
      )
      return {
        code: 20000,
        data: { list: list.map(pageDto), total: Number(count.total) },
      }
    })
  })
  server.get('/api/low-code/pages/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(pool, actor, P.list, async (db, current) => {
      const page = await readLowCodePage(db, current, id)
      await assertLowCodeConfigurationScope(
        db,
        current,
        P.list,
        page.created_by
      )
      const releases = await rows<LowCodeReleaseRow>(
        db,
        'SELECT * FROM low_code_releases WHERE tenant_id=$1 AND page_id=$2 ORDER BY release_version DESC',
        [current.tenantId, id]
      )
      return {
        code: 20000,
        data: { ...pageDto(page), releases: releases.map(pageReleaseDto) },
      }
    })
  })
  server.post('/api/low-code/pages', async (request) => {
    const actor = await authenticate(pool, request)
    const body = record(request.body)
    onlyKeys(body, ['name', 'schema'])
    const input = {
      name: text(body.name, 'name', 100),
      schema: parseLowCodePage(body.schema),
    }
    const result = await idempotentPageCommand(
      pool,
      actor,
      P.create,
      'low-code:page-create',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        await captureLowCodeSources(db, current, input.schema)
        const id = randomUUID()
        await db.query(
          'INSERT INTO low_code_pages(tenant_id,id,name,schema,created_by) VALUES($1,$2,$3,$4,$5)',
          [
            current.tenantId,
            id,
            input.name,
            JSON.stringify(input.schema),
            current.userId,
          ]
        )
        await audit(db, current, 'low-code', 'page.create', 'low-code-page', id)
        return pageDto(await readLowCodePage(db, current, id))
      }
    )
    return { code: 20000, data: result }
  })
  server.post('/api/low-code/pages/from-application', async (request) => {
    const actor = await authenticate(pool, request)
    const body = record(request.body)
    onlyKeys(body, ['name', 'applicationReleaseId'])
    const input = {
      name: text(body.name, 'name', 100),
      applicationReleaseId: text(
        body.applicationReleaseId,
        'applicationReleaseId',
        100
      ),
    }
    const result = await idempotentPageCommand(
      pool,
      actor,
      P.create,
      'low-code:page-generate',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        requirePermission(current.permissions, P.sourceCreate)
        const source = await createLowCodeSource(db, current, {
          code: `source-${randomUUID().slice(0, 8)}`,
          name: `${input.name}来源`,
          kind: 'application-records',
          resourceId: input.applicationReleaseId,
          status: 'enabled',
        })
        const schema = createBusinessLowCodePage(source.id, input.name)
        const id = randomUUID()
        await captureLowCodeSources(db, current, schema)
        await db.query(
          'INSERT INTO low_code_pages(tenant_id,id,name,schema,created_by) VALUES($1,$2,$3,$4,$5)',
          [
            current.tenantId,
            id,
            input.name,
            JSON.stringify(schema),
            current.userId,
          ]
        )
        await audit(
          db,
          current,
          'low-code',
          'page.generate',
          'low-code-page',
          id
        )
        return pageDto(await readLowCodePage(db, current, id))
      }
    )
    return { code: 20000, data: result }
  })
  server.put('/api/low-code/pages/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['name', 'schema', 'expectedRevision'])
    const input = {
      name: text(body.name, 'name', 100),
      schema: parseLowCodePage(body.schema),
      expectedRevision: positiveInteger(body.expectedRevision),
    }
    const result = await idempotentPageCommand(
      pool,
      actor,
      P.update,
      `low-code:page-save:${id}`,
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const page = await readLowCodePage(db, current, id, 'write')
        await assertLowCodeConfigurationScope(
          db,
          current,
          P.update,
          page.created_by
        )
        assertRevision(page.revision, input.expectedRevision)
        if (page.status !== 'enabled')
          throw new DomainError(409, 'LOW_CODE_PAGE_ARCHIVED', '页面已归档')
        await captureLowCodeSources(db, current, input.schema)
        await db.query(
          'UPDATE low_code_pages SET name=$3,schema=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [current.tenantId, id, input.name, JSON.stringify(input.schema)]
        )
        await audit(db, current, 'low-code', 'page.save', 'low-code-page', id)
        return pageDto(await readLowCodePage(db, current, id))
      }
    )
    return { code: 20000, data: result }
  })
  server.post('/api/low-code/pages/:id/publish', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const input = { expectedRevision: positiveInteger(body.expectedRevision) }
    const result = await idempotentPageCommand(
      pool,
      actor,
      P.publish,
      `low-code:page-publish:${id}`,
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const page = await readLowCodePage(db, current, id, 'write')
        await assertLowCodeConfigurationScope(
          db,
          current,
          P.publish,
          page.created_by
        )
        assertRevision(page.revision, input.expectedRevision)
        if (page.status !== 'enabled')
          throw new DomainError(409, 'LOW_CODE_PAGE_ARCHIVED', '页面已归档')
        const captured = await captureLowCodeSources(db, current, page.schema)
        const count = one(
          await rows<{ version: string }>(
            db,
            'SELECT COALESCE(max(release_version),0)+1 AS version FROM low_code_releases WHERE tenant_id=$1 AND page_id=$2',
            [current.tenantId, id]
          )
        )
        const releaseId = randomUUID()
        const hash = contentHash(captured)
        await db.query(
          'INSERT INTO low_code_releases(tenant_id,id,page_id,release_version,schema_snapshot,source_snapshots,content_hash,published_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            current.tenantId,
            releaseId,
            id,
            Number(count.version),
            JSON.stringify(captured.schema),
            JSON.stringify(captured.snapshots),
            hash,
            current.userId,
          ]
        )
        await sequential(captured.snapshots, async (source) =>
          db
            .query(
              'INSERT INTO low_code_release_sources(tenant_id,release_id,source_id) VALUES($1,$2,$3)',
              [current.tenantId, releaseId, source.id]
            )
            .then(() => undefined)
        )
        await db.query(
          'UPDATE low_code_pages SET active_release_id=$3,rollout_release_id=NULL,rollout_percent=0,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [current.tenantId, id, releaseId]
        )
        fault('low-code:release-stored')
        await audit(
          db,
          current,
          'low-code',
          'page.publish',
          'low-code-page',
          id,
          'success',
          { releaseId }
        )
        return {
          ...pageReleaseDto(
            await readLowCodeRelease(db, current, id, releaseId)
          ),
          pageRevision: page.revision + 1,
        }
      }
    )
    return { code: 20000, data: result }
  })
  server.post('/api/low-code/pages/:id/rollout', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const input = parseLowCodeRollout(request.body)
    const result = await idempotentPageCommand(
      pool,
      actor,
      P.rollback,
      `low-code:page-rollout:${id}`,
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const page = await readLowCodePage(db, current, id, 'write')
        await assertLowCodeConfigurationScope(
          db,
          current,
          P.rollback,
          page.created_by
        )
        assertRevision(page.revision, input.expectedRevision)
        if (page.status !== 'enabled')
          throw new DomainError(409, 'LOW_CODE_PAGE_ARCHIVED', '页面已归档')
        const selected = await readLowCodeRelease(
          db,
          current,
          id,
          input.releaseId
        )
        await sequential(selected.source_snapshots, (source) =>
          availableSource(db, current, source).then(() => undefined)
        )
        if (input.rolloutReleaseId) {
          const alternate = await readLowCodeRelease(
            db,
            current,
            id,
            input.rolloutReleaseId
          )
          await sequential(alternate.source_snapshots, (source) =>
            availableSource(db, current, source).then(() => undefined)
          )
        }
        await db.query(
          'UPDATE low_code_pages SET active_release_id=$3,rollout_release_id=$4,rollout_percent=$5,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [
            current.tenantId,
            id,
            input.releaseId,
            input.rolloutReleaseId,
            input.percent,
          ]
        )
        await audit(
          db,
          current,
          'low-code',
          'page.rollout',
          'low-code-page',
          id,
          'success',
          { releaseId: input.releaseId, percent: input.percent }
        )
        return pageDto(await readLowCodePage(db, current, id))
      }
    )
    return { code: 20000, data: result }
  })
  server.post('/api/low-code/pages/:id/status', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision', 'status'])
    if (!['enabled', 'archived'].includes(String(body.status)))
      throw new DomainError(422, 'VALIDATION_ERROR', '页面状态无效')
    const input = {
      expectedRevision: positiveInteger(body.expectedRevision),
      status: body.status as string,
    }
    const result = await idempotentPageCommand(
      pool,
      actor,
      P.archive,
      `low-code:page-status:${id}`,
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        const page = await readLowCodePage(db, current, id, 'write')
        await assertLowCodeConfigurationScope(
          db,
          current,
          P.archive,
          page.created_by
        )
        assertRevision(page.revision, input.expectedRevision)
        await db.query(
          'UPDATE low_code_pages SET status=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [current.tenantId, id, input.status]
        )
        await audit(db, current, 'low-code', 'page.status', 'low-code-page', id)
        return pageDto(await readLowCodePage(db, current, id))
      }
    )
    return { code: 20000, data: result }
  })
}
export default registerLowCodePages
