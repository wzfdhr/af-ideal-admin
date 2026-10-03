import { randomUUID } from 'node:crypto'
import {
  BUSINESS_PERMISSIONS as P,
  DomainError,
  record,
  onlyKeys,
  text,
  positiveInteger,
  parseCommand,
  validateBusinessFields,
  computeBusinessFields,
} from '@af-admin/contracts'
import { assertRevision, advanceWorkflow } from '@af-admin/workflow-core'
import { instanceTimers } from './timer-state'
import {
  startParallelActivities,
  parallelActivityProgress,
} from './parallel-activities'
import {
  assertFormSourcesAvailable,
  requireFormSourceRead,
  projectRecordSourceOptions,
  canReadFormSources,
} from './form-source-bindings'
import { assertFilesReady } from './file-policy'
import { authenticate, scalarHeader } from './auth'
import { readRelease, validatePeople } from './application'
import {
  activeRelease,
  addTask,
  appendHistory,
  appendRouteHistory,
  history,
} from './leave'
import { readRecordRow, visibleRecord, businessDto } from './record-access'
import { withdrawInstance } from './workflow'
import {
  rows,
  one,
  pageQuery,
  authorizedTransaction,
  idempotent,
  audit,
  enqueue,
  sequential,
  noFault,
} from './support'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

const detail = async (db: Database, actor: Actor, id: string) => {
  const row = await visibleRecord(db, actor, id)
  if (row.record_kind !== 'generic')
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  const release = await readRelease(
    db,
    actor.tenantId,
    row.application_release_id
  )
  const instances = await rows<{ id: string }>(
    db,
    'SELECT id FROM workflow_instances WHERE tenant_id=$1 AND request_id=$2',
    [actor.tenantId, id]
  )
  const tasks = instances[0]
    ? await rows<{
        id: string
        revision: number
        status: string
        nodeName: string
      }>(
        db,
        `SELECT id,revision,status,node_name AS "nodeName" FROM workflow_tasks WHERE tenant_id=$1 AND instance_id=$2 AND assignee_id=$3 AND status='pending' ORDER BY created_at,id`,
        [actor.tenantId, instances[0].id, actor.userId]
      )
    : []
  const dto = businessDto({ ...row, instance_id: instances[0]?.id }, actor)
  if (release.formSnapshot.dataSources.length && !canReadFormSources(actor))
    dto.allowedActions = dto.allowedActions.filter(
      (action) => !['edit', 'submit'].includes(action)
    )
  return {
    ...dto,
    release: {
      ...release,
      formSnapshot: projectRecordSourceOptions(
        actor,
        release.formSnapshot,
        row.fields
      ),
    },
    tasks,
    ...(instances[0] && release.workflowSnapshot.version >= 3
      ? {
          activities: await parallelActivityProgress(
            db,
            actor,
            instances[0].id,
            release.workflowSnapshot
          ),
        }
      : {}),
    timers: instances[0]
      ? await instanceTimers(db, actor.tenantId, instances[0].id)
      : [],
    computedFields: computeBusinessFields(release.formSnapshot, row.fields),
    history: instances[0]
      ? await history(db, actor.tenantId, instances[0].id)
      : [],
  }
}
export const registerBusinessRecords = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/business/applications', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.read,
      async (client, current) => {
        const apps = await rows(
          client,
          "SELECT id,name,active_release_id AS \"activeReleaseId\" FROM applications WHERE tenant_id=$1 AND business_kind='generic' AND status='enabled' AND active_release_id IS NOT NULL ORDER BY name,id LIMIT 100",
          [current.tenantId]
        )
        return ok(apps, request.id)
      }
    )
  })
  server.get('/api/business/applications/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(
      pool,
      actor,
      P.read,
      async (client, current) => {
        const app = one(
          await rows<{
            active_release_id: string | null
            business_kind: string
            status: string
          }>(
            client,
            'SELECT active_release_id,business_kind,status FROM applications WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
        )
        if (app.business_kind !== 'generic')
          throw new DomainError(404, 'NOT_FOUND', '资源不存在')
        if (app.status === 'archived')
          throw new DomainError(409, 'APPLICATION_ARCHIVED', '应用已归档')
        if (!app.active_release_id)
          throw new DomainError(409, 'APPLICATION_UNPUBLISHED', '应用尚未发布')
        const release = await readRelease(
          client,
          current.tenantId,
          app.active_release_id
        )
        await assertFormSourcesAvailable(client, current, release.formSnapshot)
        return ok({ applicationId: id, release }, request.id)
      }
    )
  })
  server.get('/api/business/records', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.read,
      async (client, current) => {
        const page = pageQuery(request.query)
        const query = record(request.query)
        const appId =
          typeof query.applicationId === 'string' ? query.applicationId : ''
        const params = [current.tenantId, current.userId, appId]
        const base =
          "FROM business_records r JOIN application_releases ar ON ar.tenant_id=r.tenant_id AND ar.id=r.application_release_id WHERE r.tenant_id=$1 AND r.applicant_id=$2 AND r.record_kind='generic' AND ($3='' OR ar.application_id=$3)"
        const total = one(
          await rows<{ total: string }>(
            client,
            `SELECT count(*) AS total ${base}`,
            params
          )
        )
        const values = await rows<import('./record-access').RecordRow>(
          client,
          `SELECT r.* ${base} ORDER BY r.updated_at DESC,r.id LIMIT $4 OFFSET $5`,
          [...params, page.pageSize, page.offset]
        )
        return ok(
          {
            list: values.map((row) => businessDto(row, current)),
            total: Number(total.total),
          },
          request.id
        )
      }
    )
  })
  server.get('/api/business/records/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (client, current) =>
        ok(await detail(client, current, id), request.id)
    )
  })
  server.post('/api/business/records', async (request) => {
    const actor = await authenticate(pool, request)
    const body = record(request.body)
    onlyKeys(body, ['applicationReleaseId', 'fields'])
    const input = {
      applicationReleaseId: text(
        body.applicationReleaseId,
        'applicationReleaseId',
        100
      ),
      fields: record(body.fields, 'fields'),
    }
    return ok(
      await idempotent(
        pool,
        actor,
        P.create,
        'business:create',
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const release = await activeRelease(
            client,
            current,
            input.applicationReleaseId,
            'generic'
          )
          requireFormSourceRead(current, release.formSnapshot)
          const fields = validateBusinessFields(
            release.formSnapshot,
            input.fields,
            false
          )
          await assertFormSourcesAvailable(
            client,
            current,
            release.formSnapshot,
            fields
          )
          computeBusinessFields(release.formSnapshot, fields)
          const id = randomUUID()
          await client.query(
            "INSERT INTO business_records(tenant_id,id,record_kind,application_release_id,applicant_id,applicant_name,department_snapshot,fields,half_day_units) VALUES ($1,$2,'generic',$3,$4,$5,$6,$7,NULL)",
            [
              current.tenantId,
              id,
              release.id,
              current.userId,
              current.name,
              current.department,
              JSON.stringify(fields),
            ]
          )
          fault('business:create-stored')
          await audit(
            client,
            current,
            'business',
            'create',
            'business-record',
            id
          )
          const row = await readRecordRow(client, current, id)
          return { id: row.id, revision: row.revision, status: row.status }
        }
      ),
      request.id
    )
  })
  server.patch('/api/business/records/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['fields', 'expectedRevision', 'applicationReleaseId'])
    const input = {
      fields: record(body.fields, 'fields'),
      expectedRevision: positiveInteger(body.expectedRevision),
      applicationReleaseId:
        body.applicationReleaseId === undefined
          ? undefined
          : text(body.applicationReleaseId, 'applicationReleaseId', 100),
    }
    return ok(
      await idempotent(
        pool,
        actor,
        P.update,
        `business:update:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const old = await readRecordRow(client, current, id, true)
          if (
            old.record_kind !== 'generic' ||
            old.applicant_id !== current.userId
          )
            throw new DomainError(404, 'NOT_FOUND', '资源不存在')
          assertRevision(old.revision, input.expectedRevision)
          if (old.status !== 'draft')
            throw new DomainError(409, 'STATE_CONFLICT', '只能编辑未提交草稿')
          const release = await activeRelease(
            client,
            current,
            input.applicationReleaseId || old.application_release_id,
            'generic'
          )
          const previous = await readRelease(
            client,
            current.tenantId,
            old.application_release_id
          )
          if (release.applicationId !== previous.applicationId)
            throw new DomainError(404, 'NOT_FOUND', '资源不存在')
          requireFormSourceRead(current, release.formSnapshot)
          const fields = validateBusinessFields(
            release.formSnapshot,
            input.fields,
            false
          )
          await assertFormSourcesAvailable(
            client,
            current,
            release.formSnapshot,
            fields
          )
          computeBusinessFields(release.formSnapshot, fields)
          await client.query(
            'UPDATE business_records SET fields=$3,application_release_id=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id, JSON.stringify(fields), release.id]
          )
          await audit(
            client,
            current,
            'business',
            'update',
            'business-record',
            id
          )
          return { id, revision: old.revision + 1, status: old.status }
        }
      ),
      request.id
    )
  })
  server.post('/api/business/records/:id/submit', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const input = parseCommand(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        P.submit,
        `business:submit:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const draft = await readRecordRow(client, current, id, true)
          if (
            draft.record_kind !== 'generic' ||
            draft.applicant_id !== current.userId
          )
            throw new DomainError(404, 'NOT_FOUND', '资源不存在')
          assertRevision(draft.revision, input.expectedRevision)
          if (draft.status !== 'draft')
            throw new DomainError(409, 'STATE_CONFLICT', '记录已经提交')
          const release = await activeRelease(
            client,
            current,
            draft.application_release_id,
            'generic'
          )
          await assertFilesReady(client, current.tenantId, id)
          requireFormSourceRead(current, release.formSnapshot)
          const validatedFields = validateBusinessFields(
            release.formSnapshot,
            draft.fields
          )
          await assertFormSourcesAvailable(
            client,
            current,
            release.formSnapshot,
            validatedFields
          )
          const routeValues = {
            ...validatedFields,
            ...computeBusinessFields(release.formSnapshot, validatedFields),
          }
          await validatePeople(
            client,
            current.tenantId,
            release.workflowSnapshot,
            current.userId,
            routeValues
          )
          const parallel = release.workflowSnapshot.version >= 3
          const next = parallel
            ? { approval: null, routes: [], copiedUserIds: [] }
            : advanceWorkflow(release.workflowSnapshot, undefined, routeValues)
          const instanceId = randomUUID()
          await client.query(
            "INSERT INTO workflow_instances(tenant_id,id,request_id,release_id,status,current_node_id) VALUES ($1,$2,$3,$4,'running',$5)",
            [
              current.tenantId,
              instanceId,
              id,
              release.id,
              next.approval?.id || null,
            ]
          )
          await client.query(
            "UPDATE business_records SET status='running',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [current.tenantId, id]
          )
          if (next.approval)
            await addTask(
              client,
              current,
              instanceId,
              id,
              next.approval,
              'generic'
            )
          await appendHistory(client, current, instanceId, 'start')
          if (parallel)
            await startParallelActivities({
              db: client,
              actor: current,
              instanceId,
              requestId: id,
              applicantId: current.userId,
              businessKind: 'generic',
              schema: release.workflowSnapshot,
              values: routeValues,
              fault,
            })
          await appendRouteHistory(client, current, instanceId, next.routes)
          await sequential(next.copiedUserIds, async (recipient) =>
            enqueue(
              client,
              current,
              recipient,
              id,
              '业务记录抄送',
              'message',
              'copy'
            )
          )
          if (next.copiedUserIds.length)
            await appendHistory(
              client,
              current,
              instanceId,
              'copy',
              null,
              '已按流程抄送'
            )
          fault('business:submit-task-created')
          await audit(
            client,
            current,
            'business',
            'submit',
            'business-record',
            id,
            'success',
            { instanceId }
          )
          return {
            id,
            instanceId,
            revision: draft.revision + 1,
            status: 'running',
          }
        }
      ),
      request.id
    )
  })
  server.post('/api/business/records/:id/withdraw', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const resource = await readRecordRow(pool, actor, id)
    if (resource.record_kind !== 'generic')
      throw new DomainError(404, 'NOT_FOUND', '资源不存在')
    const instance = one(
      await rows<{ id: string }>(
        pool,
        'SELECT id FROM workflow_instances WHERE tenant_id=$1 AND request_id=$2',
        [actor.tenantId, id]
      )
    )
    return ok(
      await withdrawInstance(
        pool,
        actor,
        instance.id,
        request.body,
        scalarHeader(request, 'idempotency-key'),
        fault
      ),
      request.id
    )
  })
}
export default registerBusinessRecords
