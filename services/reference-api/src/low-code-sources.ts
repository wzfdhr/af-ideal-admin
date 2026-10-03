import { randomUUID } from 'node:crypto'
import {
  DomainError,
  LOW_CODE_PERMISSIONS as P,
  FORM_DATA_SOURCE_PERMISSIONS,
  DICTIONARY_PERMISSIONS,
  record,
  text,
  parseLowCodeSource,
  parseLowCodePage,
} from '@af-admin/contracts'
import {
  requirePermission,
  hasPermission,
  assertRevision,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  authorizedTransaction,
  idempotent,
  audit,
  pageQuery,
  sequential,
} from './support'
import { readRelease } from './application'
import { requireFormSourceRead } from './form-source-bindings'
import type {
  LowCodeSource,
  LowCodePageV2,
  LowCodeMaterialV2,
  LowCodeSourceInput,
} from '@af-admin/contracts'
import type { Actor } from './auth'
import type { Database } from './support'
import type { Pool, PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'

export interface LowCodeSourceRow {
  created_by: string
  id: string
  code: string
  name: string
  kind: LowCodeSourceInput['kind']
  application_release_id: string | null
  dictionary_source_id: string | null
  status: LowCodeSourceInput['status']
  revision: number
  updated_at: Date
}
export interface LowCodeSourceSnapshot {
  id: string
  code: string
  name: string
  kind: LowCodeSourceInput['kind']
  resourceId: string
  revision: number
}
export const sourceSnapshot = (
  row: LowCodeSourceRow
): LowCodeSourceSnapshot => ({
  id: row.id,
  code: row.code,
  name: row.name,
  kind: row.kind,
  resourceId: (row.application_release_id ||
    row.dictionary_source_id) as string,
  revision: row.revision,
})
const sourceDto = (row: LowCodeSourceRow): LowCodeSource => ({
  ...sourceSnapshot(row),
  status: row.status,
  updatedAt: row.updated_at.toISOString(),
})
export const readLowCodeSource = async (
  db: Database,
  tenant: string,
  id: string,
  lock = false
) =>
  one(
    await rows<LowCodeSourceRow>(
      db,
      `SELECT * FROM low_code_sources WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR SHARE' : ''
      }`,
      [tenant, id]
    )
  )
export const validateSourceBinding = async (
  db: Database,
  actor: Actor,
  input: LowCodeSourceInput
) => {
  if (input.kind === 'application-records') {
    if (
      !hasPermission(actor.permissions, 'application:configure') &&
      !hasPermission(actor.permissions, 'business:read:self')
    )
      requirePermission(actor.permissions, 'application:configure')
    const release = await readRelease(db, actor.tenantId, input.resourceId)
    const app = one(
      await rows<{ business_kind: string; status: string }>(
        db,
        'SELECT business_kind,status FROM applications WHERE tenant_id=$1 AND id=$2 FOR SHARE',
        [actor.tenantId, release.applicationId]
      )
    )
    if (app.business_kind !== 'generic')
      throw new DomainError(
        422,
        'LOW_CODE_SOURCE_KIND_INVALID',
        '该来源不是通用业务应用'
      )
    if (app.status !== 'enabled')
      throw new DomainError(409, 'APPLICATION_ARCHIVED', '来源应用已归档')
  } else {
    requirePermission(actor.permissions, FORM_DATA_SOURCE_PERMISSIONS.list)
    const registry = one(
      await rows<{ status: string }>(
        db,
        'SELECT status FROM form_data_sources WHERE tenant_id=$1 AND id=$2 FOR SHARE',
        [actor.tenantId, input.resourceId]
      )
    )
    if (registry.status !== 'enabled')
      throw new DomainError(
        409,
        'LOW_CODE_SOURCE_UNAVAILABLE',
        '登记字典来源已停用'
      )
  }
}
export const availableSource = async (
  db: Database,
  actor: Actor,
  snapshot: LowCodeSourceSnapshot
) => {
  const live = await readLowCodeSource(db, actor.tenantId, snapshot.id, true)
  if (
    live.status !== 'enabled' ||
    live.kind !== snapshot.kind ||
    (live.application_release_id || live.dictionary_source_id) !==
      snapshot.resourceId
  )
    throw new DomainError(
      409,
      'LOW_CODE_SOURCE_UNAVAILABLE',
      '来源停用或绑定发生冲突'
    )
  if (snapshot.kind === 'application-records') {
    const release = await readRelease(db, actor.tenantId, snapshot.resourceId)
    const app = one(
      await rows<{ status: string }>(
        db,
        'SELECT status FROM applications WHERE tenant_id=$1 AND id=$2 FOR SHARE',
        [actor.tenantId, release.applicationId]
      )
    )
    if (app.status !== 'enabled')
      throw new DomainError(409, 'APPLICATION_ARCHIVED', '来源应用已归档')
  } else {
    const values = await rows<{ status: string }>(
      db,
      "SELECT s.status FROM form_data_sources s JOIN dictionaries d ON d.tenant_id=s.tenant_id AND d.id=s.dictionary_id WHERE s.tenant_id=$1 AND s.id=$2 AND d.status='enabled' AND d.deleted_at IS NULL FOR SHARE OF s,d",
      [actor.tenantId, snapshot.resourceId]
    )
    if (!values.length || values[0].status !== 'enabled')
      throw new DomainError(
        409,
        'LOW_CODE_SOURCE_UNAVAILABLE',
        '字典或来源已停用'
      )
  }
  return live
}
export const sourceColumns = async (
  db: Database,
  actor: Actor,
  snapshot: LowCodeSourceSnapshot
) => {
  if (snapshot.kind === 'registered-dictionary')
    return [
      { key: 'label', title: '名称' },
      { key: 'value', title: '值' },
    ]
  const release = await readRelease(db, actor.tenantId, snapshot.resourceId)
  return [
    { key: 'id', title: '记录标识' },
    { key: 'status', title: '状态' },
    { key: 'revision', title: '版本' },
    { key: 'releaseVersion', title: '业务发布版' },
    { key: 'createdAt', title: '创建时间' },
    ...release.formSnapshot.widgetsConfig.map((field) => ({
      key: `field:${field.uid}`,
      title: String(field.config.label || field.name),
    })),
  ]
}
export const captureLowCodeSources = async (
  db: Database,
  actor: Actor,
  schemaInput: unknown
) => {
  requirePermission(actor.permissions, P.sourceList)
  const schema = parseLowCodePage(schemaInput)
  const snapshots: LowCodeSourceSnapshot[] = []
  await sequential(schema.sources, async (id) => {
    const source = await readLowCodeSource(db, actor.tenantId, id, true)
    const visible = one(
      await rows<{ visible: boolean }>(
        db,
        'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
        [actor.tenantId, actor.userId, P.sourceList, source.created_by]
      )
    )
    if (!visible.visible) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
    if (source.status !== 'enabled')
      throw new DomainError(
        409,
        'LOW_CODE_SOURCE_UNAVAILABLE',
        '页面引用停用来源'
      )
    await validateSourceBinding(db, actor, {
      ...sourceSnapshot(source),
      status: source.status,
    })
    snapshots.push(sourceSnapshot(source))
  })
  const permissions = [
    schema.permissionCode,
    ...schema.materials.map((material) => material.permissionCode),
    ...schema.actions.map((action) => action.permissionCode),
  ].filter((value): value is string => !!value)
  await sequential(permissions, async (code) => {
    if (
      code === '*' ||
      !(
        await rows(
          db,
          "SELECT code FROM permission_definitions WHERE code=$1 AND status='enabled'",
          [code]
        )
      ).length
    )
      throw new DomainError(
        422,
        'LOW_CODE_PERMISSION_INVALID',
        '页面引用未登记权限'
      )
  })
  await sequential(schema.materials, async (material) => {
    const source = one(
      snapshots.filter((snapshot) => snapshot.id === material.sourceId)
    )
    if (material.type === 'ProForm' && source.kind !== 'application-records')
      throw new DomainError(
        422,
        'LOW_CODE_MATERIAL_SOURCE_INVALID',
        '业务表单需要应用记录来源'
      )
    if (material.type === 'ChartCard' && source.kind !== 'application-records')
      throw new DomainError(
        422,
        'LOW_CODE_MATERIAL_SOURCE_INVALID',
        '该来源没有登记趋势/分布口径'
      )
    const columns = await sourceColumns(db, actor, source)
    if (
      material.columns?.some(
        (column) => !columns.some((available) => available.key === column)
      )
    )
      throw new DomainError(
        422,
        'LOW_CODE_COLUMN_INVALID',
        '列不属于已登记来源'
      )
  })
  return { schema, snapshots }
}
export const requireMaterialAccess = (
  actor: Actor,
  schema: LowCodePageV2,
  material: LowCodeMaterialV2
) => {
  if (schema.permissionCode)
    requirePermission(actor.permissions, schema.permissionCode)
  if (material.permissionCode)
    requirePermission(actor.permissions, material.permissionCode)
}
export const sourceForm = async (
  db: Database,
  actor: Actor,
  snapshot: LowCodeSourceSnapshot
) => {
  if (snapshot.kind !== 'application-records')
    throw new DomainError(
      422,
      'LOW_CODE_SOURCE_KIND_INVALID',
      '该来源不提供业务表单'
    )
  requirePermission(actor.permissions, 'business:read:self')
  await availableSource(db, actor, snapshot)
  const release = await readRelease(db, actor.tenantId, snapshot.resourceId)
  requireFormSourceRead(actor, release.formSnapshot)
  return release
}
export const queryLowCodeSource = async (
  db: Database,
  actor: Actor,
  snapshot: LowCodeSourceSnapshot,
  params: { current: number; pageSize: number; keyword: string; status: string }
) => {
  await availableSource(db, actor, snapshot)
  await db.query("SET LOCAL statement_timeout='5000ms'")
  const columns = await sourceColumns(db, actor, snapshot)
  if (snapshot.kind === 'registered-dictionary') {
    requirePermission(actor.permissions, FORM_DATA_SOURCE_PERMISSIONS.read)
    requirePermission(actor.permissions, DICTIONARY_PERMISSIONS.read)
    const source = one(
      await rows<{ dictionary_id: string }>(
        db,
        'SELECT dictionary_id FROM form_data_sources WHERE tenant_id=$1 AND id=$2',
        [actor.tenantId, snapshot.resourceId]
      )
    )
    const list = await rows<{
      label: string
      value: string | number | boolean
    }>(
      db,
      'SELECT label,value FROM dictionary_items WHERE tenant_id=$1 AND dictionary_id=$2 AND NOT disabled AND label ILIKE $3 ORDER BY ordinal LIMIT $4 OFFSET $5',
      [
        actor.tenantId,
        source.dictionary_id,
        `%${params.keyword}%`,
        params.pageSize,
        (params.current - 1) * params.pageSize,
      ]
    )
    const count = one(
      await rows<{ total: string }>(
        db,
        'SELECT count(*) AS total FROM dictionary_items WHERE tenant_id=$1 AND dictionary_id=$2 AND NOT disabled AND label ILIKE $3',
        [actor.tenantId, source.dictionary_id, `%${params.keyword}%`]
      )
    )
    return {
      columns,
      list: list.map((row, index) => ({
        ...row,
        id: `${params.current}-${index}`,
      })),
      total: Number(count.total),
      distribution: [],
      trend: [],
      refreshedAt: new Date().toISOString(),
    }
  }
  requirePermission(actor.permissions, 'business:read:self')
  const release = await readRelease(db, actor.tenantId, snapshot.resourceId)
  const base =
    "FROM business_records r JOIN application_releases a ON a.tenant_id=r.tenant_id AND a.id=r.application_release_id WHERE r.tenant_id=$1 AND r.applicant_id=$2 AND r.record_kind='generic' AND a.application_id=$3 AND ($4='' OR r.status=$4) AND r.fields::text ILIKE $5"
  const values = [
    actor.tenantId,
    actor.userId,
    release.applicationId,
    params.status,
    `%${params.keyword}%`,
  ]
  const count = one(
    await rows<{ total: string }>(
      db,
      `SELECT count(*) AS total ${base}`,
      values
    )
  )
  const records = await rows<{
    id: string
    fields: Record<string, unknown>
    status: string
    revision: number
    application_release_id: string
    release_version: number
    created_at: Date
  }>(
    db,
    `SELECT r.*,a.release_version ${base} ORDER BY r.created_at DESC,r.id LIMIT $6 OFFSET $7`,
    [...values, params.pageSize, (params.current - 1) * params.pageSize]
  )
  const distribution = await rows<{ status: string; total: string }>(
    db,
    `SELECT r.status,count(*) AS total ${base} GROUP BY r.status ORDER BY r.status`,
    values
  )
  const trend = await rows<{ day: string; total: string }>(
    db,
    `SELECT to_char(r.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,count(*) AS total ${base} GROUP BY day ORDER BY day DESC LIMIT 366`,
    values
  )
  return {
    columns,
    list: records.map((row) =>
      Object.fromEntries([
        ...Object.entries(row.fields).map(([key, value]) => [
          `field:${key}`,
          value,
        ]),
        ['id', row.id],
        ['status', row.status],
        ['revision', row.revision],
        ['applicationReleaseId', row.application_release_id],
        ['releaseVersion', row.release_version],
        ['createdAt', row.created_at.toISOString()],
      ])
    ),
    total: Number(count.total),
    distribution: distribution.map((item) => ({
      name: item.status,
      value: Number(item.total),
    })),
    trend: trend
      .reverse()
      .map((item) => ({ day: item.day, value: Number(item.total) })),
    refreshedAt: new Date().toISOString(),
  }
}
export const createLowCodeSource = async (
  db: Database,
  actor: Actor,
  input: LowCodeSourceInput
) => {
  await validateSourceBinding(db, actor, input)
  const id = randomUUID()
  await db.query(
    'INSERT INTO low_code_sources(tenant_id,id,code,name,kind,application_release_id,dictionary_source_id,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      actor.tenantId,
      id,
      input.code,
      input.name,
      input.kind,
      input.kind === 'application-records' ? input.resourceId : null,
      input.kind === 'registered-dictionary' ? input.resourceId : null,
      input.status,
      actor.userId,
    ]
  )
  await audit(db, actor, 'low-code', 'source.create', 'low-code-source', id)
  return sourceDto(await readLowCodeSource(db, actor.tenantId, id))
}
const idempotentSourceCommand = <T extends { id: string }>(
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
      const source = await readLowCodeSource(db, current.tenantId, response.id)
      const visible = one(
        await rows<{ visible: boolean }>(
          db,
          'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
          [current.tenantId, current.userId, permission, source.created_by]
        )
      )
      if (!visible.visible)
        throw new DomainError(404, 'NOT_FOUND', '资源不存在')
      return response
    }
  )

export const registerLowCodeSources = (server: FastifyInstance, pool: Pool) => {
  server.get('/api/low-code/sources', async (request) => {
    const actor = await authenticate(pool, request)
    const page = pageQuery(request.query)
    return authorizedTransaction(
      pool,
      actor,
      P.sourceList,
      async (db, current) => {
        const count = one(
          await rows<{ total: string }>(
            db,
            'SELECT count(*) AS total FROM low_code_sources WHERE tenant_id=$1 AND name ILIKE $2 AND af_historical_member_scope_visible($1,$3,$4,created_by)',
            [
              current.tenantId,
              `%${page.keyword}%`,
              current.userId,
              P.sourceList,
            ]
          )
        )
        const list = await rows<LowCodeSourceRow>(
          db,
          'SELECT * FROM low_code_sources WHERE tenant_id=$1 AND name ILIKE $2 AND af_historical_member_scope_visible($1,$3,$4,created_by) ORDER BY updated_at DESC,id LIMIT $5 OFFSET $6',
          [
            current.tenantId,
            `%${page.keyword}%`,
            current.userId,
            P.sourceList,
            page.pageSize,
            page.offset,
          ]
        )
        return {
          code: 20000,
          data: { list: list.map(sourceDto), total: Number(count.total) },
        }
      }
    )
  })
  server.post('/api/low-code/sources', async (request) => {
    const actor = await authenticate(pool, request)
    const body = parseLowCodeSource(request.body)
    return {
      code: 20000,
      data: await idempotentSourceCommand(
        pool,
        actor,
        P.sourceCreate,
        'low-code:source-create',
        scalarHeader(request, 'idempotency-key'),
        body,
        (db, current) => createLowCodeSource(db, current, body)
      ),
    }
  })
  server.put('/api/low-code/sources/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = parseLowCodeSource(request.body, true)
    const result = await idempotentSourceCommand(
      pool,
      actor,
      P.sourceUpdate,
      `low-code:source-update:${id}`,
      scalarHeader(request, 'idempotency-key'),
      body,
      async (db, current) => {
        const old = one(
          await rows<LowCodeSourceRow>(
            db,
            'SELECT * FROM low_code_sources WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [current.tenantId, id]
          )
        )
        const visible = one(
          await rows<{ visible: boolean }>(
            db,
            'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
            [current.tenantId, current.userId, P.sourceUpdate, old.created_by]
          )
        )
        if (!visible.visible)
          throw new DomainError(404, 'NOT_FOUND', '资源不存在')
        assertRevision(old.revision, body.expectedRevision as number)
        if (
          old.kind !== body.kind ||
          (old.application_release_id || old.dictionary_source_id) !==
            body.resourceId ||
          old.code !== body.code
        )
          throw new DomainError(
            422,
            'LOW_CODE_SOURCE_BINDING_IMMUTABLE',
            '来源绑定不能重定向，请登记新来源'
          )
        await db.query(
          'UPDATE low_code_sources SET name=$3,status=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [current.tenantId, id, body.name, body.status]
        )
        await audit(
          db,
          current,
          'low-code',
          'source.update',
          'low-code-source',
          id
        )
        return sourceDto(await readLowCodeSource(db, current.tenantId, id))
      }
    )
    return { code: 20000, data: result }
  })
}
export default registerLowCodeSources
