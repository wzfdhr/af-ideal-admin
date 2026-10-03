import {
  DomainError,
  LOW_CODE_PERMISSIONS as P,
  parseLowCodePage,
  parseLowCodeRuntimeInput,
  record,
  onlyKeys,
  text,
} from '@af-admin/contracts'
import { requirePermission, hasPermission } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  authorizedTransaction,
  idempotent,
  audit,
  noFault,
  contentHash,
  sequential,
} from './support'
import {
  authorizeLowCodeRuntime,
  readLowCodePage,
  selectedPageReleaseId,
  readLowCodeRelease,
  assertLowCodeConfigurationScope,
} from './low-code-pages'
import {
  captureLowCodeSources,
  availableSource,
  requireMaterialAccess,
  queryLowCodeSource,
  sourceForm,
} from './low-code-sources'
import { visibleRecord } from './record-access'
import { readRelease } from './application'
import {
  createRecordInTransaction,
  saveRecordInTransaction,
  submitRecordInTransaction,
} from './business-records'
import type { LowCodeSourceSnapshot } from './low-code-sources'
import type {
  LowCodePageV2,
  LowCodeActionV2,
  LowCodeMaterialV2,
} from '@af-admin/contracts'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

interface RuntimeContext {
  schema: LowCodePageV2
  snapshots: LowCodeSourceSnapshot[]
  releaseId: string
  releaseVersion: number
  pageRevision: number
  preview: boolean
}
type RuntimeInput = ReturnType<typeof parseLowCodeRuntimeInput>
const context = async (
  db: Database,
  actor: Actor,
  pageId: string,
  releaseId?: string,
  previewSchema?: unknown
): Promise<RuntimeContext> => {
  if (previewSchema !== undefined) {
    requirePermission(actor.permissions, P.update)
    const page = await readLowCodePage(db, actor, pageId, 'read')
    await assertLowCodeConfigurationScope(db, actor, P.update, page.created_by)
    if (page.status !== 'enabled')
      throw new DomainError(409, 'LOW_CODE_PAGE_ARCHIVED', '页面已归档')
    const captured = await captureLowCodeSources(db, actor, previewSchema)
    return {
      ...captured,
      releaseId: `preview-${contentHash(captured.schema)}`,
      releaseVersion: 0,
      pageRevision: page.revision,
      preview: true,
    }
  }
  const selected = await authorizeLowCodeRuntime(db, actor, pageId, releaseId)
  return {
    schema: selected.schema,
    snapshots: selected.snapshots,
    releaseId: selected.release.id,
    releaseVersion: selected.release.release_version,
    pageRevision: selected.page.revision,
    preview: false,
  }
}
const configured = async (
  db: Database,
  actor: Actor,
  ctx: RuntimeContext,
  actionId: string
) => {
  const action = one(
    ctx.schema.actions.filter((value) => value.id === actionId)
  )
  const target = one(
    ctx.schema.materials.filter((value) => value.id === action.targetId)
  )
  requireMaterialAccess(actor, ctx.schema, target)
  if (action.permissionCode)
    requirePermission(actor.permissions, action.permissionCode)
  if (action.originId)
    requireMaterialAccess(
      actor,
      ctx.schema,
      one(ctx.schema.materials.filter((value) => value.id === action.originId))
    )
  const source = one(
    ctx.snapshots.filter((value) => value.id === target.sourceId)
  )
  await availableSource(db, actor, source)
  return { action, target, source }
}
const sourceRecord = async (
  db: Database,
  actor: Actor,
  snapshot: LowCodeSourceSnapshot,
  id: string,
  forEdit = false
) => {
  if (snapshot.kind !== 'application-records')
    throw new DomainError(
      422,
      'LOW_CODE_SOURCE_KIND_INVALID',
      '该来源不提供业务记录'
    )
  requirePermission(actor.permissions, 'business:read:self')
  const row = await visibleRecord(db, actor, id)
  const recordRelease = await readRelease(
    db,
    actor.tenantId,
    row.application_release_id
  )
  const sourceRelease = await readRelease(
    db,
    actor.tenantId,
    snapshot.resourceId
  )
  if (
    row.record_kind !== 'generic' ||
    row.applicant_id !== actor.userId ||
    recordRelease.applicationId !== sourceRelease.applicationId
  )
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  if (forEdit && row.application_release_id !== snapshot.resourceId)
    throw new DomainError(
      409,
      'LOW_CODE_RECORD_VERSION_CONFLICT',
      '该记录使用另一业务发布版，请打开原详情并显式确认迁移'
    )
  return row
}
const allowedAction = (
  actor: Actor,
  schema: LowCodePageV2,
  action: LowCodeActionV2,
  target: LowCodeMaterialV2
) => {
  if (
    action.permissionCode &&
    !hasPermission(actor.permissions, action.permissionCode)
  )
    return false
  if (
    target.permissionCode &&
    !hasPermission(actor.permissions, target.permissionCode)
  )
    return false
  let operation = action.operation || 'read'
  if (action.type === 'openModal')
    operation = action.mode === 'create' ? 'create' : 'save'
  const permissionByOperation: Record<string, string> = {
    create: 'business:create',
    save: 'business:update:self',
    start: 'business:submit',
    read: 'business:read:self',
  }
  const required = permissionByOperation[operation]
  return hasPermission(actor.permissions, required)
}
const runtimeDto = async (db: Database, actor: Actor, ctx: RuntimeContext) => {
  const materials = ctx.schema.materials.filter(
    (material) =>
      !material.permissionCode ||
      hasPermission(actor.permissions, material.permissionCode)
  )
  const actions = ctx.schema.actions.filter((action) => {
    const target = materials.find((material) => material.id === action.targetId)
    return (
      !!target &&
      (!action.originId ||
        materials.some((material) => material.id === action.originId)) &&
      allowedAction(actor, ctx.schema, action, target)
    )
  })
  const dataAvailable: Record<string, boolean> = {}
  const forms: Record<string, unknown> = {}
  const errors: Record<string, string> = {}
  await sequential(
    materials.filter((material) => material.type === 'ProForm'),
    async (material) => {
      try {
        forms[material.id] = (
          await sourceForm(
            db,
            actor,
            one(
              ctx.snapshots.filter((source) => source.id === material.sourceId)
            )
          )
        ).formSnapshot
      } catch (failure) {
        errors[material.id] =
          failure instanceof DomainError
            ? failure.message
            : '业务表单暂时不可用'
      }
    }
  )
  materials
    .filter((material) => material.type !== 'ProForm')
    .forEach((material) => {
      const source = one(
        ctx.snapshots.filter((snapshot) => snapshot.id === material.sourceId)
      )
      const required =
        source.kind === 'application-records'
          ? ['business:read:self']
          : ['form-source:read', 'system:dict:read']
      dataAvailable[material.id] = required.every((permission) =>
        hasPermission(actor.permissions, permission)
      )
      if (!dataAvailable[material.id])
        errors[material.id] = '该来源缺少当前读取权限'
    })
  return {
    schema: { ...ctx.schema, materials, actions },
    releaseId: ctx.releaseId,
    releaseVersion: ctx.releaseVersion,
    pageRevision: ctx.pageRevision,
    preview: ctx.preview,
    forms,
    sourceErrors: errors,
    dataAvailable,
  }
}
const performReadAction = async (
  db: Database,
  actor: Actor,
  ctx: RuntimeContext,
  actionId: string,
  input: RuntimeInput
) => {
  const { action, target, source } = await configured(db, actor, ctx, actionId)
  if (action.type === 'query' || action.type === 'refreshBlock')
    return {
      kind: 'data',
      targetId: target.id,
      data: await queryLowCodeSource(db, actor, source, input.params),
    }
  if (action.type === 'navigate') {
    if (!input.recordId)
      throw new DomainError(422, 'VALIDATION_ERROR', '跳转需要实际选中记录')
    const row = await sourceRecord(db, actor, source, input.recordId)
    return {
      kind: 'navigate',
      targetId: target.id,
      to: `/business/records/${encodeURIComponent(row.id)}`,
    }
  }
  if (action.type === 'openModal') {
    const release = await sourceForm(db, actor, source)
    if (action.mode === 'create') {
      requirePermission(actor.permissions, 'business:create')
      if (input.recordId)
        throw new DomainError(422, 'VALIDATION_ERROR', '新建弹窗不接受旧记录')
      return {
        kind: 'modal',
        targetId: target.id,
        formSnapshot: release.formSnapshot,
        mode: 'create',
      }
    }
    requirePermission(actor.permissions, 'business:update:self')
    if (!input.recordId)
      throw new DomainError(422, 'VALIDATION_ERROR', '编辑弹窗需要实际记录')
    const row = await sourceRecord(db, actor, source, input.recordId, true)
    if (row.status !== 'draft')
      throw new DomainError(409, 'STATE_CONFLICT', '终态或审批中的记录不可编辑')
    return {
      kind: 'modal',
      targetId: target.id,
      formSnapshot: release.formSnapshot,
      mode: 'edit',
      record: {
        id: row.id,
        revision: row.revision,
        status: row.status,
        fields: row.fields,
      },
    }
  }
  throw new DomainError(
    422,
    'LOW_CODE_ACTION_KIND_INVALID',
    '该动作需要实际业务提交入口'
  )
}
export const registerLowCodeRuntime = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault
) => {
  server.get('/api/low-code/runtime-pages', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, P.run, async (db, current) => {
      const pages = await rows<import('./low-code-pages').LowCodePageRow>(
        db,
        "SELECT * FROM low_code_pages WHERE tenant_id=$1 AND status='enabled' AND active_release_id IS NOT NULL ORDER BY updated_at DESC,id LIMIT 100",
        [current.tenantId]
      )
      const list: {
        id: string
        name: string
        title: string
        releaseVersion: number
      }[] = []
      await sequential(pages, async (page) => {
        const release = await readLowCodeRelease(
          db,
          current,
          page.id,
          selectedPageReleaseId(page, current.userId)
        )
        const schema = parseLowCodePage(release.schema_snapshot)
        if (
          !schema.permissionCode ||
          hasPermission(current.permissions, schema.permissionCode)
        )
          list.push({
            id: page.id,
            name: page.name,
            title: schema.title,
            releaseVersion: release.release_version,
          })
      })
      return { code: 20000, data: { list, total: list.length } }
    })
  })
  server.get('/api/low-code/runtime/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(pool, actor, P.run, async (db, current) => ({
      code: 20000,
      data: await runtimeDto(db, current, await context(db, current, id)),
    }))
  })
  server.post('/api/low-code/pages/:id/preview', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['schema'])
    return authorizedTransaction(
      pool,
      actor,
      P.update,
      async (db, current) => ({
        code: 20000,
        data: await runtimeDto(
          db,
          current,
          await context(db, current, id, undefined, body.schema)
        ),
      })
    )
  })
  const registerAction = (preview: boolean) => {
    const route = preview
      ? '/api/low-code/pages/:id/preview/actions/:actionId'
      : '/api/low-code/runtime/:id/actions/:actionId'
    server.post(route, async (request) => {
      const actor = await authenticate(pool, request)
      const params = record(request.params)
      const id = text(params.id, 'id', 100)
      const actionId = text(params.actionId, 'actionId', 100)
      const raw = record(request.body)
      let previewSchema: unknown
      let input: RuntimeInput
      if (preview) {
        onlyKeys(raw, ['schema', 'input'])
        previewSchema = parseLowCodePage(raw.schema)
        input = parseLowCodeRuntimeInput(raw.input)
      } else input = parseLowCodeRuntimeInput(raw)
      const permission = preview ? P.update : P.run
      const read = await authorizedTransaction(
        pool,
        actor,
        permission,
        async (db, current) => {
          const ctx = await context(
            db,
            current,
            id,
            preview ? undefined : input.releaseId,
            previewSchema
          )
          const cfg = await configured(db, current, ctx, actionId)
          return { ctx, cfg }
        }
      )
      if (read.cfg.action.type !== 'submit')
        return authorizedTransaction(
          pool,
          actor,
          permission,
          async (db, current) => {
            const ctx = await context(
              db,
              current,
              id,
              preview ? undefined : input.releaseId,
              previewSchema
            )
            const result = await performReadAction(
              db,
              current,
              ctx,
              actionId,
              input
            )
            await audit(
              db,
              current,
              'low-code',
              `runtime.${read.cfg.action.type}`,
              'low-code-page',
              id,
              'success',
              { actionId, releaseId: ctx.releaseId }
            )
            return { code: 20000, data: result }
          }
        )
      const key = scalarHeader(request, 'idempotency-key')
      const payload = {
        ...input,
        ...(preview ? { previewHash: contentHash(previewSchema) } : {}),
      }
      const operation = `low-code:action:${id}:${read.ctx.releaseId}:${actionId}`
      const result = await idempotent(
        pool,
        actor,
        permission,
        operation,
        key,
        payload,
        async (db, current) => {
          const ctx = await context(
            db,
            current,
            id,
            preview ? undefined : input.releaseId,
            previewSchema
          )
          const { action, target, source } = await configured(
            db,
            current,
            ctx,
            actionId
          )
          if (action.type !== 'submit' || source.kind !== 'application-records')
            throw new DomainError(
              422,
              'LOW_CODE_ACTION_KIND_INVALID',
              '动作不是受控业务提交'
            )
          await sourceForm(db, current, source)
          let receipt: {
            id: string
            revision: number
            status: string
            instanceId?: string
          }
          if (action.operation === 'create') {
            if (input.recordId)
              throw new DomainError(
                422,
                'VALIDATION_ERROR',
                '创建不能指定旧记录'
              )
            if (!input.fields)
              throw new DomainError(422, 'VALIDATION_ERROR', '请填写业务表单')
            receipt = await createRecordInTransaction(
              db,
              current,
              { applicationReleaseId: source.resourceId, fields: input.fields },
              fault
            )
          } else {
            if (!input.recordId || !input.expectedRevision)
              throw new DomainError(
                422,
                'VALIDATION_ERROR',
                '业务修改需要记录和版本'
              )
            await sourceRecord(db, current, source, input.recordId, true)
            if (action.operation === 'save')
              receipt = await saveRecordInTransaction(
                db,
                current,
                input.recordId,
                {
                  fields: input.fields || {},
                  expectedRevision: input.expectedRevision,
                }
              )
            else {
              if (input.fields !== undefined)
                throw new DomainError(
                  422,
                  'LOW_CODE_UNSAVED_FIELDS',
                  '请先保存输入再提交审批'
                )
              receipt = await submitRecordInTransaction(
                db,
                current,
                input.recordId,
                { expectedRevision: input.expectedRevision, comment: '' },
                fault
              )
            }
          }
          fault('low-code:business-command')
          await audit(
            db,
            current,
            'low-code',
            'runtime.submit',
            'low-code-page',
            id,
            'success',
            {
              actionId,
              recordId: receipt.id,
              releaseId: ctx.releaseId,
              operation: action.operation as string,
            }
          )
          return { kind: 'submit', targetId: target.id, record: receipt }
        },
        false,
        '',
        async (db, current, response) => {
          const ctx = await context(
            db,
            current,
            id,
            preview ? undefined : input.releaseId,
            previewSchema
          )
          const { action, source } = await configured(
            db,
            current,
            ctx,
            actionId
          )
          const permissionByOperation: Record<string, string> = {
            create: 'business:create',
            save: 'business:update:self',
            start: 'business:submit',
          }
          const required = permissionByOperation[action.operation || 'start']
          requirePermission(current.permissions, required)
          await sourceRecord(db, current, source, response.record.id, true)
          return response
        }
      )
      return { code: 20000, data: result }
    })
  }
  registerAction(false)
  registerAction(true)
  const registerData = (preview: boolean) =>
    server.post(
      preview
        ? '/api/low-code/pages/:id/preview/data/:materialId'
        : '/api/low-code/runtime/:id/data/:materialId',
      async (request) => {
        const actor = await authenticate(pool, request)
        const params = record(request.params)
        const id = text(params.id, 'id', 100)
        const materialId = text(params.materialId, 'materialId', 100)
        const raw = record(request.body)
        let input: RuntimeInput
        let previewSchema: unknown
        if (preview) {
          onlyKeys(raw, ['schema', 'input'])
          previewSchema = parseLowCodePage(raw.schema)
          input = parseLowCodeRuntimeInput(raw.input)
        } else input = parseLowCodeRuntimeInput(raw)
        return authorizedTransaction(
          pool,
          actor,
          preview ? P.update : P.run,
          async (db, current) => {
            const ctx = await context(
              db,
              current,
              id,
              preview ? undefined : input.releaseId,
              previewSchema
            )
            const material = one(
              ctx.schema.materials.filter((item) => item.id === materialId)
            )
            requireMaterialAccess(current, ctx.schema, material)
            if (material.type === 'ProForm')
              throw new DomainError(
                422,
                'LOW_CODE_MATERIAL_SOURCE_INVALID',
                '表单需使用明确弹窗/提交动作'
              )
            const source = one(
              ctx.snapshots.filter((item) => item.id === material.sourceId)
            )
            return {
              code: 20000,
              data: await queryLowCodeSource(db, current, source, input.params),
            }
          }
        )
      }
    )
  registerData(false)
  registerData(true)
}
export default registerLowCodeRuntime
