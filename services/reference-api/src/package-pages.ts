import { randomUUID } from 'node:crypto'
import {
  DomainError,
  PACKAGE_PERMISSIONS as P,
  LOW_CODE_PERMISSIONS as L,
  FORM_DATA_SOURCE_PERMISSIONS as F,
  DICTIONARY_PERMISSIONS as D,
  parseLowCodePage,
  parseForm,
  parseWorkflow,
  record,
  onlyKeys,
  text,
  positiveInteger,
} from '@af-admin/contracts'
import { assertRevision, requirePermission } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  sequential,
  audit,
  contentHash,
  authorizedTransaction,
  idempotent,
} from './support'
import { readRelease } from './application'
import { captureLowCodeSources, createLowCodeSource } from './low-code-sources'
import {
  readLowCodePage,
  assertLowCodeConfigurationScope,
} from './low-code-pages'
import type { ApplicationPackage, LowCodePageV2 } from '@af-admin/contracts'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

interface PendingSet {
  id: string
  application_id: string
  package_hash: string
  pages: NonNullable<ApplicationPackage['pages']>
  page_sources: NonNullable<ApplicationPackage['pageSources']>
  dictionary_bindings: Record<string, string>
  status: 'pending' | 'bound'
  revision: number
  created_by: string
  application_release_id: string | null
  reference_map: Record<string, string>
}
const normalizedBusinessDefinition = (form: unknown, workflow: unknown) =>
  contentHash({ form: parseForm(form), workflow: parseWorkflow(workflow) })
export const exportPackagePages = async (
  db: Database,
  actor: Actor,
  applicationId: string,
  businessReleaseId: string | null,
  pageIds: string[],
  dictionarySlots: NonNullable<ApplicationPackage['sources']>,
  originalDictionaryIds: string[]
) => {
  requirePermission(actor.permissions, L.list)
  requirePermission(actor.permissions, L.sourceList)
  if (!businessReleaseId)
    throw new DomainError(
      409,
      'PACKAGE_PAGE_RELEASE_REQUIRED',
      '导出页面需要已发布业务版本'
    )
  const rootRelease = await readRelease(db, actor.tenantId, businessReleaseId)
  const pageSources: NonNullable<ApplicationPackage['pageSources']> = []
  const pages: NonNullable<ApplicationPackage['pages']> = []
  const seenSources = new Map<string, string>()
  const forbiddenIds: string[] = []
  await sequential(pageIds, async (pageId) => {
    const page = await readLowCodePage(db, actor, pageId, 'read')
    await assertLowCodeConfigurationScope(db, actor, L.list, page.created_by)
    if (page.status !== 'enabled' || !page.active_release_id)
      throw new DomainError(
        409,
        'PACKAGE_PAGE_UNPUBLISHED',
        '选择的页面未发布或已归档'
      )
    const release = one(
      await rows<{
        schema_snapshot: LowCodePageV2
        source_snapshots: {
          id: string
          kind: string
          resourceId: string
          name: string
        }[]
      }>(
        db,
        'SELECT * FROM low_code_releases WHERE tenant_id=$1 AND page_id=$2 AND id=$3',
        [actor.tenantId, pageId, page.active_release_id]
      )
    )
    const schema = parseLowCodePage(release.schema_snapshot)
    const map = new Map<string, string>()
    await sequential(schema.sources, async (sourceId) => {
      const snapshot = one(
        release.source_snapshots.filter((source) => source.id === sourceId)
      )
      const live = one(
        await rows<{
          kind: string
          application_release_id: string | null
          dictionary_source_id: string | null
          status: string
          created_by: string
        }>(
          db,
          'SELECT * FROM low_code_sources WHERE tenant_id=$1 AND id=$2 FOR SHARE',
          [actor.tenantId, sourceId]
        )
      )
      await assertLowCodeConfigurationScope(
        db,
        actor,
        L.sourceList,
        live.created_by
      )
      if (
        live.status !== 'enabled' ||
        live.kind !== snapshot.kind ||
        (live.application_release_id || live.dictionary_source_id) !==
          snapshot.resourceId
      )
        throw new DomainError(
          409,
          'PACKAGE_SOURCE_UNAVAILABLE',
          '选择页面的来源已停用或不一致'
        )
      let binding: string
      if (snapshot.kind === 'application-records') {
        const pinned = await readRelease(
          db,
          actor.tenantId,
          snapshot.resourceId
        )
        if (pinned.applicationId !== applicationId)
          throw new DomainError(
            422,
            'PACKAGE_PAGE_EXTERNAL_APPLICATION',
            '页面引用其他应用，请显式移除或单独导出依赖'
          )
        if (
          normalizedBusinessDefinition(
            pinned.formSnapshot,
            pinned.workflowSnapshot
          ) !==
          normalizedBusinessDefinition(
            rootRelease.formSnapshot,
            rootRelease.workflowSnapshot
          )
        )
          throw new DomainError(
            409,
            'PACKAGE_PAGE_RELEASE_MISMATCH',
            '页面固定业务版本与应用导出版本不等价，请选择一致版本'
          )
        binding = 'application'
      } else {
        requirePermission(actor.permissions, F.read)
        requirePermission(actor.permissions, D.read)
        const registry = one(
          await rows<{ status: string; name: string }>(
            db,
            "SELECT s.name,s.status FROM form_data_sources s JOIN dictionaries d ON d.tenant_id=s.tenant_id AND d.id=s.dictionary_id WHERE s.tenant_id=$1 AND s.id=$2 AND d.status='enabled' AND d.deleted_at IS NULL FOR SHARE OF s,d",
            [actor.tenantId, snapshot.resourceId]
          )
        )
        if (registry.status !== 'enabled')
          throw new DomainError(
            409,
            'PACKAGE_SOURCE_UNAVAILABLE',
            '页面字典来源已停用'
          )
        let index = originalDictionaryIds.indexOf(snapshot.resourceId)
        if (index < 0) {
          index = originalDictionaryIds.length
          originalDictionaryIds.push(snapshot.resourceId)
          dictionarySlots.push({
            key: `source-${index + 1}`,
            name: registry.name,
            kind: 'dictionary',
          })
        }
        binding = dictionarySlots[index].key
      }
      let key = seenSources.get(sourceId)
      if (!key) {
        key = `page-source-${pageSources.length + 1}`
        seenSources.set(sourceId, key)
        pageSources.push({
          key,
          name: snapshot.name,
          kind: snapshot.kind as
            | 'application-records'
            | 'registered-dictionary',
          binding,
        })
      }
      map.set(sourceId, key)
      forbiddenIds.push(sourceId, snapshot.resourceId)
    })
    const portable: LowCodePageV2 = {
      ...schema,
      sources: schema.sources.map((source) => map.get(source) as string),
      materials: schema.materials.map((material) => ({
        ...material,
        sourceId: map.get(material.sourceId) as string,
      })),
    }
    pages.push({
      key: `page-${pages.length + 1}`,
      name: page.name,
      schema: parseLowCodePage(portable),
    })
    forbiddenIds.push(pageId, page.active_release_id)
  })
  return { pages, pageSources, forbiddenIds }
}
export const validatePackageDictionaryBindings = async (
  db: Database,
  actor: Actor,
  slots: NonNullable<ApplicationPackage['sources']>,
  bindings: Record<string, string>
) => {
  await sequential(slots, async (slot) => {
    requirePermission(actor.permissions, F.list)
    requirePermission(actor.permissions, F.read)
    requirePermission(actor.permissions, D.read)
    const id = bindings[slot.key]
    const rowsFound = await rows<{ status: string }>(
      db,
      "SELECT s.status FROM form_data_sources s JOIN dictionaries d ON d.tenant_id=s.tenant_id AND d.id=s.dictionary_id WHERE s.tenant_id=$1 AND s.id=$2 AND d.status='enabled' AND d.deleted_at IS NULL FOR SHARE OF s,d",
      [actor.tenantId, id]
    )
    if (!rowsFound.length || rowsFound[0].status !== 'enabled')
      throw new DomainError(404, 'NOT_FOUND', '目标来源不可访问')
  })
}
export const stagePackagePages = async (
  db: Database,
  actor: Actor,
  applicationId: string,
  pkg: ApplicationPackage,
  dictionaryBindings: Record<string, string>
) => {
  if (pkg.version !== 3) return undefined
  requirePermission(actor.permissions, L.create)
  requirePermission(actor.permissions, L.sourceCreate)
  requirePermission(actor.permissions, L.sourceList)
  await validatePackageDictionaryBindings(
    db,
    actor,
    pkg.sources || [],
    dictionaryBindings
  )
  const id = randomUUID()
  await db.query(
    'INSERT INTO application_package_page_sets(tenant_id,id,application_id,package_hash,pages,page_sources,dictionary_bindings,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      actor.tenantId,
      id,
      applicationId,
      pkg.checksum,
      JSON.stringify(pkg.pages),
      JSON.stringify(pkg.pageSources),
      JSON.stringify(dictionaryBindings),
      actor.userId,
    ]
  )
  await audit(
    db,
    actor,
    'application',
    'package.pages-staged',
    'application-package-pages',
    id,
    'success',
    { applicationId, pageCount: pkg.pages?.length || 0 }
  )
  return {
    id,
    status: 'pending' as const,
    revision: 1,
    pageCount: pkg.pages?.length || 0,
  }
}
const readSet = async (db: Database, actor: Actor, id: string, lock = false) =>
  one(
    await rows<PendingSet>(
      db,
      `SELECT * FROM application_package_page_sets WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [actor.tenantId, id]
    )
  )
const requireSetScope = async (db: Database, actor: Actor, set: PendingSet) =>
  assertLowCodeConfigurationScope(db, actor, P.import, set.created_by)
export const registerPackagePages = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector
) => {
  server.get('/api/application-center/:id/package-pages', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(pool, actor, P.import, async (db, current) => {
      const sets = await rows<PendingSet>(
        db,
        'SELECT * FROM application_package_page_sets WHERE tenant_id=$1 AND application_id=$2 AND af_historical_member_scope_visible($1,$3,$4,created_by) ORDER BY created_at,id',
        [current.tenantId, id, current.userId, P.import]
      )
      return {
        code: 20000,
        data: sets.map((set) => ({
          id: set.id,
          status: set.status,
          revision: set.revision,
          pageCount: set.pages.length,
          names: set.pages.map((page) => page.name),
          referenceMap: set.reference_map,
          applicationReleaseId: set.application_release_id,
        })),
      }
    })
  })
  server.get('/api/application-center/:id/export-pages', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(pool, actor, P.export, async (db, current) => {
      requirePermission(current.permissions, L.list)
      const pages = await rows<{ id: string; name: string; revision: number }>(
        db,
        "SELECT DISTINCT p.id,p.name,p.revision FROM low_code_pages p JOIN low_code_releases pr ON pr.tenant_id=p.tenant_id AND pr.page_id=p.id AND pr.id=p.active_release_id JOIN low_code_release_sources ps ON ps.tenant_id=pr.tenant_id AND ps.release_id=pr.id JOIN low_code_sources s ON s.tenant_id=ps.tenant_id AND s.id=ps.source_id JOIN application_releases a ON a.tenant_id=s.tenant_id AND a.id=s.application_release_id WHERE p.tenant_id=$1 AND a.application_id=$2 AND p.status='enabled' AND af_historical_member_scope_visible($1,$3,$4,p.created_by) ORDER BY p.name,p.id",
        [current.tenantId, id, current.userId, L.list]
      )
      return { code: 20000, data: pages }
    })
  })
  server.post('/api/application-package-pages/:id/bind', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision', 'applicationReleaseId'])
    const input = {
      expectedRevision: positiveInteger(body.expectedRevision),
      applicationReleaseId: text(
        body.applicationReleaseId,
        'applicationReleaseId',
        100
      ),
    }
    const result = await idempotent(
      pool,
      actor,
      P.import,
      `package:pages-bind:${id}`,
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        requirePermission(current.permissions, L.create)
        requirePermission(current.permissions, L.sourceCreate)
        requirePermission(current.permissions, L.sourceList)
        requirePermission(current.permissions, 'application:configure')
        const located = await readSet(db, current, id)
        const app = one(
          await rows<{ active_release_id: string | null; status: string }>(
            db,
            'SELECT active_release_id,status FROM applications WHERE tenant_id=$1 AND id=$2 FOR SHARE',
            [current.tenantId, located.application_id]
          )
        )
        const set = await readSet(db, current, id, true)
        await requireSetScope(db, current, set)
        assertRevision(set.revision, input.expectedRevision)
        if (set.status !== 'pending')
          throw new DomainError(
            409,
            'PACKAGE_PAGES_ALREADY_BOUND',
            '页面已完成一次重绑'
          )
        if (
          app.status !== 'enabled' ||
          app.active_release_id !== input.applicationReleaseId
        )
          throw new DomainError(
            409,
            'PACKAGE_PAGE_TARGET_RELEASE_CHANGED',
            '请先发布目标业务并选择当前实际版本'
          )
        const release = await readRelease(
          db,
          current.tenantId,
          input.applicationReleaseId
        )
        if (release.applicationId !== set.application_id)
          throw new DomainError(404, 'NOT_FOUND', '资源不存在')
        await validatePackageDictionaryBindings(
          db,
          current,
          Object.keys(set.dictionary_bindings).map((key) => ({
            key,
            name: key,
            kind: 'dictionary' as const,
          })),
          set.dictionary_bindings
        )
        const sourceMap: Record<string, string> = {}
        const pageMap: Record<string, string> = {}
        await sequential(set.page_sources, async (slot) => {
          const resourceId =
            slot.kind === 'application-records'
              ? release.id
              : set.dictionary_bindings[slot.binding]
          if (!resourceId)
            throw new DomainError(
              422,
              'PACKAGE_BINDINGS_INVALID',
              '字典来源映射缺失'
            )
          const source = await createLowCodeSource(db, current, {
            code: `pkg-${randomUUID().slice(0, 12)}`,
            name: slot.name,
            kind: slot.kind,
            resourceId,
            status: 'enabled',
          })
          sourceMap[slot.key] = source.id
        })
        await sequential(set.pages, async (definition) => {
          const original = parseLowCodePage(definition.schema)
          const schema = parseLowCodePage({
            ...original,
            sources: original.sources.map((source) => sourceMap[source]),
            materials: original.materials.map((material) => ({
              ...material,
              sourceId: sourceMap[material.sourceId],
            })),
          })
          await captureLowCodeSources(db, current, schema)
          const pageId = randomUUID()
          await db.query(
            'INSERT INTO low_code_pages(tenant_id,id,name,schema,created_by) VALUES($1,$2,$3,$4,$5)',
            [
              current.tenantId,
              pageId,
              definition.name,
              JSON.stringify(schema),
              current.userId,
            ]
          )
          await db.query(
            'INSERT INTO application_package_page_bindings(tenant_id,set_id,page_key,page_id) VALUES($1,$2,$3,$4)',
            [current.tenantId, id, definition.key, pageId]
          )
          pageMap[definition.key] = pageId
        })
        fault('package:pages-created')
        await db.query(
          "UPDATE application_package_page_sets SET status='bound',revision=revision+1,reference_map=$3,application_release_id=$4,bound_at=now() WHERE tenant_id=$1 AND id=$2",
          [
            current.tenantId,
            id,
            JSON.stringify({ ...sourceMap, ...pageMap }),
            release.id,
          ]
        )
        await audit(
          db,
          current,
          'application',
          'package.pages-bound',
          'application-package-pages',
          id,
          'success',
          {
            applicationId: set.application_id,
            applicationReleaseId: release.id,
            pageCount: set.pages.length,
          }
        )
        return {
          id,
          status: 'bound',
          revision: set.revision + 1,
          referenceMap: { ...sourceMap, ...pageMap },
          pages: Object.entries(pageMap).map(([key, pageId]) => ({
            key,
            id: pageId,
          })),
        }
      },
      false,
      '',
      async (db, current, response) => {
        const set = await readSet(db, current, id)
        await requireSetScope(db, current, set)
        requirePermission(current.permissions, L.create)
        requirePermission(current.permissions, L.sourceCreate)
        requirePermission(current.permissions, L.sourceList)
        requirePermission(current.permissions, 'application:configure')
        await validatePackageDictionaryBindings(
          db,
          current,
          Object.keys(set.dictionary_bindings).map((key) => ({
            key,
            name: key,
            kind: 'dictionary' as const,
          })),
          set.dictionary_bindings
        )
        return response
      }
    )
    return { code: 20000, data: result }
  })
}
export default registerPackagePages
