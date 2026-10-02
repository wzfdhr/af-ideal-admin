import { randomUUID } from 'node:crypto'
import {
  APPLICATION_PERMISSIONS as P,
  DomainError,
  parseApplicationCreate,
  parseApplicationCopy,
  parseForm,
  parseWorkflow,
  onlyKeys,
  record,
  text,
  positiveInteger,
} from '@af-admin/contracts'
import { assertRevision } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  pageQuery,
  authorizedTransaction,
  idempotent,
  audit,
} from './support'
import { readRelease } from './application'
import type {
  ManagedApplication,
  FormSchema,
  WorkflowSchema,
} from '@af-admin/contracts'
import type { Pool, PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'
import type { Actor } from './auth'

interface AppRow {
  tenant_id: string
  id: string
  code: string
  name: string
  description: string
  business_kind: 'leave' | 'generic'
  status: 'enabled' | 'archived'
  revision: number
  form_draft_id: string | null
  workflow_draft_id: string | null
  active_release_id: string | null
  form_revision: number | null
  workflow_revision: number | null
  created_at: Date
  updated_at: Date
}
const dto = (row: AppRow): ManagedApplication => ({
  tenantId: row.tenant_id,
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
  businessKind: row.business_kind,
  status: row.status,
  revision: row.revision,
  formDraftId: row.form_draft_id,
  workflowDraftId: row.workflow_draft_id,
  activeReleaseId: row.active_release_id,
  formRevision: row.form_revision ?? null,
  workflowRevision: row.workflow_revision ?? null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})
const projection =
  'a.*,(SELECT f.revision FROM form_drafts f WHERE f.tenant_id=a.tenant_id AND f.id=a.form_draft_id) AS form_revision,(SELECT w.revision FROM workflow_drafts w WHERE w.tenant_id=a.tenant_id AND w.id=a.workflow_draft_id) AS workflow_revision'
const read = async (
  client: PoolClient,
  tenantId: string,
  id: string,
  lock = false
) =>
  one(
    await rows<AppRow>(
      client,
      `SELECT ${projection} FROM applications a WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [tenantId, id]
    )
  )
const enabled = (app: AppRow) => {
  if (app.status === 'archived')
    throw new DomainError(409, 'APPLICATION_ARCHIVED', '应用已归档，请先恢复')
}
const blankForm = (): FormSchema => ({
  version: 1,
  formConfig: { size: 'medium', layout: 'vertical', labelAlign: 'right' },
  widgetsConfig: [],
  dataSources: [],
})
const blankWorkflow = (): WorkflowSchema => ({
  version: 1,
  nodes: [
    { id: 'start', type: 'start', name: '开始', config: {} },
    { id: 'end', type: 'end', name: '结束', config: {} },
  ],
  edges: [{ id: 'start-end', source: 'start', target: 'end', label: '' }],
})
const provision = async (
  client: PoolClient,
  actor: Actor,
  metadata: { code: string; name: string; description: string },
  kind: 'leave' | 'generic',
  form: FormSchema,
  workflow: WorkflowSchema
) => {
  if (
    (
      await rows(
        client,
        'SELECT id FROM applications WHERE tenant_id=$1 AND code=$2',
        [actor.tenantId, metadata.code]
      )
    ).length
  )
    throw new DomainError(409, 'APPLICATION_CODE_EXISTS', '应用标识已使用')
  const id = randomUUID()
  const formId = randomUUID()
  const workflowId = randomUUID()
  const formCopy = parseForm(form)
  const workflowCopy = parseWorkflow(workflow)
  workflowCopy.nodes.forEach((node) => {
    if (node.config.formId) node.config.formId = formId
  })
  await client.query(
    'INSERT INTO form_drafts(tenant_id,id,name,schema) VALUES ($1,$2,$3,$4)',
    [actor.tenantId, formId, `${metadata.name}表单`, JSON.stringify(formCopy)]
  )
  await client.query(
    'INSERT INTO workflow_drafts(tenant_id,id,name,schema) VALUES ($1,$2,$3,$4)',
    [
      actor.tenantId,
      workflowId,
      `${metadata.name}流程`,
      JSON.stringify(workflowCopy),
    ]
  )
  try {
    await client.query(
      'INSERT INTO applications(tenant_id,id,code,name,description,business_kind,form_draft_id,workflow_draft_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        actor.tenantId,
        id,
        metadata.code,
        metadata.name,
        metadata.description,
        kind,
        formId,
        workflowId,
      ]
    )
  } catch (failure) {
    const error = failure as { code?: string; constraint?: string }
    if (
      error.code === '23505' &&
      error.constraint === 'applications_tenant_id_code_key'
    )
      throw new DomainError(409, 'APPLICATION_CODE_EXISTS', '应用标识已使用')
    throw failure
  }
  return dto(await read(client, actor.tenantId, id))
}

export const registerApplicationCenter = (
  server: FastifyInstance,
  pool: Pool
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/application-center', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.list,
      async (client, current) => {
        const page = pageQuery(request.query)
        const query = record(request.query)
        if (query.tenantId && query.tenantId !== current.tenantId)
          throw new DomainError(403, 'TENANT_FORBIDDEN', '不能查询其他租户')
        const status = typeof query.status === 'string' ? query.status : ''
        if (status && !['enabled', 'archived'].includes(status))
          throw new DomainError(422, 'VALIDATION_ERROR', '应用状态无效')
        const filter =
          "WHERE tenant_id=$1 AND (name ILIKE $2 OR code ILIKE $2) AND ($3='' OR status=$3)"
        const params = [current.tenantId, `%${page.keyword}%`, status]
        const count = one(
          await rows<{ total: string }>(
            client,
            `SELECT count(*) AS total FROM applications ${filter}`,
            params
          )
        )
        const list = await rows<AppRow>(
          client,
          `SELECT ${projection} FROM applications a ${filter} ORDER BY updated_at DESC,id LIMIT $4 OFFSET $5`,
          [...params, page.pageSize, page.offset]
        )
        return ok(
          { list: list.map(dto), total: Number(count.total) },
          request.id
        )
      }
    )
  })
  server.get('/api/application-center/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(pool, actor, P.list, async (client, current) =>
      ok(dto(await read(client, current.tenantId, id)), request.id)
    )
  })
  server.post('/api/application-center', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseApplicationCreate(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        P.create,
        'application:create',
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          let form = blankForm()
          let workflow = blankWorkflow()
          if (input.template === 'leave') {
            const template = await read(client, current.tenantId, 'leave', true)
            enabled(template)
            if (!template.active_release_id)
              throw new DomainError(409, 'TEMPLATE_UNPUBLISHED', '模板尚未发布')
            const release = await readRelease(
              client,
              current.tenantId,
              template.active_release_id
            )
            form = release.formSnapshot
            workflow = release.workflowSnapshot
          }
          const created = await provision(
            client,
            current,
            input,
            input.template === 'leave' ? 'leave' : 'generic',
            form,
            workflow
          )
          await audit(
            client,
            current,
            'application',
            'application.create',
            'application',
            created.id,
            'success',
            { template: input.template }
          )
          return created
        }
      ),
      request.id
    )
  })
  server.patch('/api/application-center/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['name', 'description', 'expectedRevision'])
    if (body.name === undefined && body.description === undefined)
      throw new DomainError(422, 'VALIDATION_ERROR', '请提供要修改的应用信息')
    if (
      body.description !== undefined &&
      (typeof body.description !== 'string' || body.description.length > 500)
    )
      throw new DomainError(422, 'VALIDATION_ERROR', '应用说明无效')
    const input = {
      expectedRevision: positiveInteger(body.expectedRevision),
      name: body.name === undefined ? undefined : text(body.name, 'name', 100),
      description:
        typeof body.description === 'string'
          ? body.description.trim()
          : undefined,
    }
    return ok(
      await idempotent(
        pool,
        actor,
        'application:configure',
        `application:metadata:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const old = await read(client, current.tenantId, id, true)
          enabled(old)
          assertRevision(old.revision, input.expectedRevision)
          const name = input.name ?? old.name
          const description = input.description ?? old.description
          if (name === old.name && description === old.description)
            throw new DomainError(409, 'STATE_CONFLICT', '应用信息未变化')
          await client.query(
            'UPDATE applications SET name=$3,description=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id, name, description]
          )
          await audit(
            client,
            current,
            'application',
            'application.metadata',
            'application',
            id,
            'success',
            {
              fields: Object.keys(input).filter(
                (key) => key !== 'expectedRevision'
              ),
            }
          )
          return dto(await read(client, current.tenantId, id))
        }
      ),
      request.id
    )
  })
  server.post('/api/application-center/:id/copy', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const input = parseApplicationCopy(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        P.copy,
        `application:copy:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const source = await read(client, current.tenantId, id, true)
          enabled(source)
          assertRevision(source.revision, input.expectedRevision)
          let form: FormSchema
          let workflow: WorkflowSchema
          if (source.active_release_id) {
            const release = await readRelease(
              client,
              current.tenantId,
              source.active_release_id
            )
            form = release.formSnapshot
            workflow = release.workflowSnapshot
          } else {
            if (
              input.formRevision === undefined ||
              input.workflowRevision === undefined
            )
              throw new DomainError(
                422,
                'DRAFT_VERSION_REQUIRED',
                '未发布应用复制必须提供两个草稿的当前版本'
              )
            const f = one(
              await rows<{ schema: FormSchema; revision: number }>(
                client,
                'SELECT schema,revision FROM form_drafts WHERE tenant_id=$1 AND id=$2 FOR SHARE',
                [current.tenantId, source.form_draft_id]
              )
            )
            const w = one(
              await rows<{ schema: WorkflowSchema; revision: number }>(
                client,
                'SELECT schema,revision FROM workflow_drafts WHERE tenant_id=$1 AND id=$2 FOR SHARE',
                [current.tenantId, source.workflow_draft_id]
              )
            )
            assertRevision(f.revision, input.formRevision ?? 0)
            assertRevision(w.revision, input.workflowRevision ?? 0)
            form = f.schema
            workflow = w.schema
          }
          const created = await provision(
            client,
            current,
            input,
            source.business_kind,
            form,
            workflow
          )
          await audit(
            client,
            current,
            'application',
            'application.copy',
            'application',
            created.id,
            'success',
            {
              sourceApplicationId: id,
              sourceReleaseId: source.active_release_id,
            }
          )
          return created
        }
      ),
      request.id
    )
  })
  server.put('/api/application-center/:id/state', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['status', 'expectedRevision'])
    if (!['enabled', 'archived'].includes(String(body.status)))
      throw new DomainError(422, 'VALIDATION_ERROR', '应用状态无效')
    const input = {
      status: String(body.status),
      expectedRevision: positiveInteger(body.expectedRevision),
    }
    return ok(
      await idempotent(
        pool,
        actor,
        P.archive,
        `application:state:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const old = await read(client, current.tenantId, id, true)
          assertRevision(old.revision, input.expectedRevision)
          if (old.status === input.status)
            throw new DomainError(409, 'STATE_CONFLICT', '应用已经处于该状态')
          await client.query(
            'UPDATE applications SET status=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id, input.status]
          )
          await audit(
            client,
            current,
            'application',
            input.status === 'archived'
              ? 'application.archive'
              : 'application.restore',
            'application',
            id
          )
          return dto(await read(client, current.tenantId, id))
        }
      ),
      request.id
    )
  })
}
export default registerApplicationCenter
