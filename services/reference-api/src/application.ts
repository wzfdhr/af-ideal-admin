import { randomUUID } from 'node:crypto'
import {
  DomainError,
  onlyKeys,
  record,
  text,
  positiveInteger,
  parseForm,
  parseWorkflow,
  parsePublish,
  validateLeaveForm,
} from '@af-admin/contracts'
import {
  assertRevision,
  requirePermission,
  hasPermission,
  validateSerialWorkflow,
} from '@af-admin/workflow-core'
import {
  authorizedTransaction,
  idempotent,
  rows,
  one,
  pageQuery,
  audit,
  contentHash,
  sequential,
} from './support'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'
import type {
  Application,
  Draft,
  FormSchema,
  WorkflowSchema,
  Release,
} from '@af-admin/contracts'

interface ReleaseRow {
  tenant_id: string
  id: string
  application_id: string
  release_version: number
  form_snapshot: FormSchema
  workflow_snapshot: WorkflowSchema
  content_hash: string
  published_by: string
  published_at: Date
}
interface ApplicationRow {
  tenant_id: string
  id: string
  code: string
  name: string
  active_release_id: string | null
  revision: number
}
interface DraftRow {
  id: string
  name: string
  schema: FormSchema | WorkflowSchema
  revision: number
  created_at: Date
  updated_at: Date
}
export const releaseDto = (row: ReleaseRow): Release => ({
  id: row.id,
  tenantId: row.tenant_id,
  applicationId: row.application_id,
  releaseVersion: row.release_version,
  formSnapshot: row.form_snapshot,
  workflowSnapshot: row.workflow_snapshot,
  contentHash: row.content_hash,
  publishedBy: row.published_by,
  publishedAt: row.published_at.toISOString(),
})
export const readRelease = async (
  db: Database,
  tenantId: string,
  id: string
): Promise<Release> =>
  releaseDto(
    one(
      await rows<ReleaseRow>(
        db,
        'SELECT * FROM application_releases WHERE tenant_id=$1 AND id=$2',
        [tenantId, id]
      )
    )
  )
export const applicationDto = (row: ApplicationRow): Application => ({
  tenantId: row.tenant_id,
  id: row.id,
  name: row.name,
  code: row.code,
  activeReleaseId: row.active_release_id,
  revision: row.revision,
})
export const readApplication = async (
  db: Database,
  actor: Actor,
  id: string
): Promise<Application> => {
  const app = applicationDto(
    one(
      await rows<ApplicationRow>(
        db,
        'SELECT * FROM applications WHERE tenant_id=$1 AND id=$2',
        [actor.tenantId, id]
      )
    )
  )
  app.releases = (
    await rows<ReleaseRow>(
      db,
      'SELECT * FROM application_releases WHERE tenant_id=$1 AND application_id=$2 ORDER BY release_version DESC',
      [actor.tenantId, id]
    )
  ).map(releaseDto)
  return app
}
export const validatePeople = async (
  db: Database,
  tenantId: string,
  workflow: WorkflowSchema,
  applicantId?: string
) => {
  const approvers = workflow.nodes.flatMap((node) =>
    node.type === 'approval' ? node.config.approvers || [] : []
  )
  if (applicantId && approvers.includes(applicantId))
    throw new DomainError(422, 'SELF_APPROVAL', '申请人不能审批自己的申请')
  const people = [
    ...new Set([
      ...approvers,
      ...workflow.nodes.flatMap((node) => node.config.ccUsers || []),
    ]),
  ]
  await sequential(people, async (userId) => {
    const members = await rows<{ permissions: string[] }>(
      db,
      "SELECT m.permissions FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND u.status='enabled'",
      [tenantId, userId]
    )
    if (!members.length)
      throw new DomainError(
        422,
        'INACTIVE_APPROVER',
        '流程引用了无效的租户成员'
      )
    if (approvers.includes(userId)) {
      if (
        !['workflow:approve', 'workflow:reject'].every((code) =>
          hasPermission(members[0].permissions, code)
        )
      )
        throw new DomainError(422, 'INVALID_APPROVER', '流程处理人缺少审批权限')
    }
  })
}
const tableFor = (kind: 'form' | 'workflow') =>
  kind === 'form' ? 'form_drafts' : 'workflow_drafts'
const draftDto = (row: DraftRow): Draft<FormSchema | WorkflowSchema> => ({
  id: row.id,
  name: row.name,
  schema: row.schema,
  revision: row.revision,
  version: row.schema.version,
  status: 'draft',
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})
export const readDraft = async (
  db: Database,
  actor: Actor,
  kind: 'form' | 'workflow',
  id: string
) => {
  requirePermission(actor.permissions, 'application:configure')
  return draftDto(
    one(
      await rows<DraftRow>(
        db,
        `SELECT * FROM ${tableFor(kind)} WHERE tenant_id=$1 AND id=$2`,
        [actor.tenantId, id]
      )
    )
  )
}
export const listDrafts = async (
  db: Database,
  actor: Actor,
  kind: 'form' | 'workflow',
  input: unknown
) => {
  requirePermission(actor.permissions, 'application:configure')
  const page = pageQuery(input)
  const table = tableFor(kind)
  const params = [actor.tenantId, `%${page.keyword}%`]
  const count = one(
    await rows<{ total: string }>(
      db,
      `SELECT count(*) AS total FROM ${table} WHERE tenant_id=$1 AND name ILIKE $2`,
      params
    )
  )
  const list = await rows<DraftRow>(
    db,
    `SELECT * FROM ${table} WHERE tenant_id=$1 AND name ILIKE $2 ORDER BY updated_at DESC,id LIMIT $3 OFFSET $4`,
    [...params, page.pageSize, page.offset]
  )
  return { list: list.map(draftDto), total: Number(count.total) }
}
export const saveDraft = (
  pool: Pool,
  actor: Actor,
  kind: 'form' | 'workflow',
  input: unknown,
  id?: string
) => {
  const body = record(input)
  onlyKeys(
    body,
    id ? ['name', 'schema', 'expectedRevision'] : ['name', 'schema']
  )
  const schema =
    kind === 'form' ? parseForm(body.schema) : parseWorkflow(body.schema)
  const name =
    body.name === undefined && id ? undefined : text(body.name, 'name', 100)
  return authorizedTransaction(
    pool,
    actor,
    'application:configure',
    async (client, current) => {
      const table = tableFor(kind)
      if (id) {
        const old = one(
          await rows<DraftRow>(
            client,
            `SELECT * FROM ${table} WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
            [current.tenantId, id]
          )
        )
        assertRevision(old.revision, positiveInteger(body.expectedRevision))
        await client.query(
          `UPDATE ${table} SET name=$3,schema=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [current.tenantId, id, name || old.name, JSON.stringify(schema)]
        )
      } else {
        id = randomUUID()
        await client.query(
          `INSERT INTO ${table} (tenant_id,id,name,schema) VALUES ($1,$2,$3,$4)`,
          [current.tenantId, id, name, JSON.stringify(schema)]
        )
      }
      await audit(
        client,
        current,
        'application',
        'save-draft',
        kind,
        id as string
      )
      return draftDto(
        one(
          await rows<DraftRow>(
            client,
            `SELECT * FROM ${table} WHERE tenant_id=$1 AND id=$2`,
            [current.tenantId, id]
          )
        )
      )
    }
  )
}
export const publishApplication = (
  pool: Pool,
  actor: Actor,
  id: string,
  input: unknown,
  key: string | undefined,
  fault: FaultInjector
) => {
  const payload = parsePublish(input)
  return idempotent(
    pool,
    actor,
    'application:publish',
    `publish:${id}`,
    key,
    payload,
    async (client, current) => {
      const app = one(
        await rows<ApplicationRow>(
          client,
          'SELECT * FROM applications WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [current.tenantId, id]
        )
      )
      assertRevision(app.revision, payload.expectedRevision)
      const form = one(
        await rows<DraftRow>(
          client,
          'SELECT * FROM form_drafts WHERE tenant_id=$1 AND id=$2 FOR SHARE',
          [current.tenantId, payload.formDraftId]
        )
      )
      const workflow = one(
        await rows<DraftRow>(
          client,
          'SELECT * FROM workflow_drafts WHERE tenant_id=$1 AND id=$2 FOR SHARE',
          [current.tenantId, payload.workflowDraftId]
        )
      )
      assertRevision(form.revision, payload.formRevision)
      assertRevision(workflow.revision, payload.workflowRevision)
      const formSnapshot = parseForm(form.schema)
      validateLeaveForm(formSnapshot)
      const workflowSnapshot = validateSerialWorkflow(workflow.schema)
      workflowSnapshot.nodes.forEach((node) => {
        if (node.config.formId && node.config.formId !== payload.formDraftId)
          throw new DomainError(
            422,
            'FORM_BINDING_INVALID',
            '流程节点引用了其他表单'
          )
      })
      await validatePeople(client, current.tenantId, workflowSnapshot)
      const { version } = one(
        await rows<{ version: number }>(
          client,
          'SELECT COALESCE(max(release_version),0)+1 AS version FROM application_releases WHERE tenant_id=$1 AND application_id=$2',
          [current.tenantId, id]
        )
      )
      const releaseId = randomUUID()
      await client.query(
        'INSERT INTO application_releases (tenant_id,id,application_id,release_version,form_snapshot,workflow_snapshot,content_hash,published_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          current.tenantId,
          releaseId,
          id,
          version,
          JSON.stringify(formSnapshot),
          JSON.stringify(workflowSnapshot),
          contentHash({ form: formSnapshot, workflow: workflowSnapshot }),
          current.userId,
        ]
      )
      fault('publish:release-created')
      await client.query(
        'UPDATE applications SET active_release_id=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
        [current.tenantId, id, releaseId]
      )
      await audit(
        client,
        current,
        'application',
        'publish',
        'application',
        id,
        'success',
        { releaseId, releaseVersion: version }
      )
      return readRelease(client, current.tenantId, releaseId)
    }
  )
}
export const activateRelease = (
  pool: Pool,
  actor: Actor,
  id: string,
  input: unknown,
  key: string | undefined
) => {
  const body = record(input)
  onlyKeys(body, ['releaseId', 'expectedRevision'])
  const payload = {
    releaseId: text(body.releaseId, 'releaseId', 100),
    expectedRevision: positiveInteger(body.expectedRevision),
  }
  return idempotent(
    pool,
    actor,
    'application:rollback',
    `activate:${id}`,
    key,
    payload,
    async (client, current) => {
      const app = one(
        await rows<ApplicationRow>(
          client,
          'SELECT * FROM applications WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [current.tenantId, id]
        )
      )
      assertRevision(app.revision, payload.expectedRevision)
      const release = await readRelease(
        client,
        current.tenantId,
        payload.releaseId
      )
      if (release.applicationId !== id)
        throw new DomainError(404, 'NOT_FOUND', '资源不存在')
      await client.query(
        'UPDATE applications SET active_release_id=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
        [current.tenantId, id, release.id]
      )
      await audit(
        client,
        current,
        'application',
        'activate-release',
        'application',
        id,
        'success',
        { releaseId: release.id }
      )
      return readApplication(client, current, id)
    }
  )
}
