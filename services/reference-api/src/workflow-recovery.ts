import { randomUUID } from 'node:crypto'
import {
  DomainError,
  WORKFLOW_RECOVERY_PERMISSIONS as P,
  parseTaskTransfer,
  parseNextRecovery,
  computeBusinessFields,
  record,
  onlyKeys,
  text,
} from '@af-admin/contracts'
import { assertRevision } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  authorizedTransaction,
  idempotent,
  pageQuery,
  audit,
  enqueue,
  sequential,
} from './support'
import { readRecordRow } from './record-access'
import { readRelease } from './application'
import { assertMemberScope } from './member-scope'
import {
  assignmentUserAvailable,
  runtimeAssignments,
} from './assignment-runtime'
import { approvalFrontier } from './recovery-frontier'
import { appendHistory } from './workflow-effects'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

interface Task {
  id: string
  instance_id: string
  request_id: string
  node_id: string
  node_name: string
  assignee_id: string
  original_assignee_id: string
  activity_id: string | null
  status: string
  revision: number
  instance_status: string
  release_id: string
}
const taskRow = async (db: Database, actor: Actor, id: string, own = false) =>
  one(
    await rows<Task>(
      db,
      `SELECT t.*,i.request_id,i.status AS instance_status,i.release_id FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE t.tenant_id=$1 AND t.id=$2${
        own ? ' AND t.assignee_id=$3' : ''
      }`,
      [actor.tenantId, id, ...(own ? [actor.userId] : [])]
    )
  )
const recoverScope = async (db: Database, actor: Actor, task: Task) => {
  const resource = await readRecordRow(db, actor, task.request_id)
  await assertMemberScope(db, actor, P.recover, resource.applicant_id)
  const oldVisible = one(
    await rows<{ visible: boolean }>(
      db,
      'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
      [actor.tenantId, actor.userId, P.recover, task.assignee_id]
    )
  )
  if (!oldVisible.visible) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  return resource
}
const active = (task: Task) => {
  if (task.status !== 'pending' || task.instance_status !== 'running')
    throw new DomainError(409, 'STATE_CONFLICT', '任务或流程已结束')
}
const target = async (
  db: Database,
  actor: Actor,
  task: Task,
  permission: string,
  targetId: string,
  applicantId: string
) => {
  await assertMemberScope(db, actor, permission, targetId)
  if (targetId === applicantId)
    throw new DomainError(422, 'SELF_APPROVAL', '申请人不能审批自己的申请')
  if (targetId === task.assignee_id)
    throw new DomainError(422, 'ASSIGNMENT_UNCHANGED', '目标已经是当前处理人')
  if (!(await assignmentUserAvailable(db, actor.tenantId, targetId)))
    throw new DomainError(
      409,
      'TARGET_APPROVER_UNAVAILABLE',
      '目标未启用或缺少当前审批权限'
    )
  if (
    task.activity_id &&
    (
      await rows(
        db,
        'SELECT id FROM workflow_tasks WHERE tenant_id=$1 AND instance_id=$2 AND activity_id=$3 AND assignee_id=$4 AND id<>$5',
        [actor.tenantId, task.instance_id, task.activity_id, targetId, task.id]
      )
    ).length
  )
    throw new DomainError(
      422,
      'DUPLICATE_SIGNATURE',
      '同一活动不能由目标占据两个签署票位'
    )
}
const unavailableSlots = async (db: Database, actor: Actor, task: Task) => {
  const resource = await readRecordRow(db, actor, task.request_id)
  const release = await readRelease(db, actor.tenantId, task.release_id)
  const schema = await runtimeAssignments(
    db,
    actor.tenantId,
    task.instance_id,
    release.workflowSnapshot
  )
  const values = {
    ...resource.fields,
    ...(resource.record_kind === 'generic'
      ? computeBusinessFields(release.formSnapshot, resource.fields)
      : {}),
  }
  const frontier = await approvalFrontier(
    db,
    actor.tenantId,
    task,
    schema,
    values
  )
  const slots: {
    nodeId: string
    nodeName: string
    originalAssigneeId: string
    assignedUserId: string
  }[] = []
  await sequential(frontier, async (node) => {
    const originals =
      release.workflowSnapshot.nodes.find((original) => original.id === node.id)
        ?.config.approvers || []
    await sequential(node.config.approvers || [], async (assignee) => {
      if (!(await assignmentUserAvailable(db, actor.tenantId, assignee))) {
        const index = node.config.approvers?.indexOf(assignee) || 0
        const scope = await rows<{ visible: boolean }>(
          db,
          'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
          [actor.tenantId, actor.userId, P.recover, assignee]
        )
        if (scope[0]?.visible)
          slots.push({
            nodeId: node.id,
            nodeName: node.name,
            originalAssigneeId: originals[index],
            assignedUserId: assignee,
          })
      }
    })
  })
  return slots
}
const saveEvent = async (
  db: Database,
  actor: Actor,
  task: Task,
  kind: 'transfer' | 'recover-task' | 'recover-next',
  targetId: string,
  reason: string,
  nodeId = task.node_id,
  originalId = task.original_assignee_id,
  fromId = task.assignee_id
) => {
  const id = randomUUID()
  await db.query(
    'INSERT INTO workflow_assignment_events(tenant_id,id,instance_id,task_id,decision_task_id,node_id,original_assignee_id,from_user_id,to_user_id,actor_id,kind,reason,task_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      actor.tenantId,
      id,
      task.instance_id,
      kind === 'recover-next' ? null : task.id,
      kind === 'recover-next' ? task.id : null,
      nodeId,
      originalId,
      fromId,
      targetId,
      actor.userId,
      kind,
      reason,
      task.revision,
    ]
  )
  const release = await readRelease(db, actor.tenantId, task.release_id)
  const nodeName =
    release.workflowSnapshot.nodes.find((node) => node.id === nodeId)?.name ||
    task.node_name
  await appendHistory(
    db,
    actor,
    task.instance_id,
    kind === 'transfer' ? 'transfer' : 'recover',
    kind === 'recover-next' ? null : task.id,
    `${nodeName}：${reason}`
  )
  await audit(
    db,
    actor,
    'workflow',
    kind,
    'workflow-assignment',
    id,
    'success',
    { taskId: task.id, nodeId, fromUserId: fromId, toUserId: targetId }
  )
  return id
}
export const registerWorkflowRecovery = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector
) => {
  const ok = (data: unknown) => ({ code: 20000, data })
  const auth = (request: Parameters<typeof authenticate>[1]) =>
    authenticate(pool, request)
  server.get(
    '/api/workflow-tasks/:id/assignment-candidates',
    async (request) => {
      const actor = await auth(request)
      const id = text(record(request.params).id, 'id', 100)
      const query = record(request.query)
      onlyKeys(query, ['mode', 'nodeId', 'originalAssigneeId'])
      const candidateMode = query.mode || 'transfer'
      if (
        !['transfer', 'recover', 'recover-next'].includes(String(candidateMode))
      )
        throw new DomainError(422, 'VALIDATION_ERROR', '候选模式无效')
      const mode = candidateMode === 'transfer' ? P.transfer : P.recover
      return authorizedTransaction(pool, actor, mode, async (db, current) => {
        const task = await taskRow(db, current, id, mode === P.transfer)
        active(task)
        const resource =
          mode === P.recover
            ? await recoverScope(db, current, task)
            : await readRecordRow(db, current, task.request_id)
        let excludedUser = task.assignee_id
        let currentActivity = task.activity_id
        let reserved: string[] = []
        if (candidateMode === 'recover-next') {
          const nodeId = text(query.nodeId, 'nodeId', 100)
          const originalId = text(
            query.originalAssigneeId,
            'originalAssigneeId',
            100
          )
          const slot = (await unavailableSlots(db, current, task)).find(
            (item) =>
              item.nodeId === nodeId && item.originalAssigneeId === originalId
          )
          if (!slot)
            throw new DomainError(
              409,
              'NO_RECOVERY_REQUIRED',
              '下一票位不再阻塞'
            )
          excludedUser = slot.assignedUserId
          currentActivity = null
          const release = await readRelease(
            db,
            current.tenantId,
            task.release_id
          )
          const schema = await runtimeAssignments(
            db,
            current.tenantId,
            task.instance_id,
            release.workflowSnapshot
          )
          reserved =
            schema.nodes
              .find((node) => node.id === nodeId)
              ?.config.approvers?.filter(
                (memberId) => memberId !== slot.assignedUserId
              ) || []
        }
        const candidates = await rows<{ id: string; name: string }>(
          db,
          "SELECT m.user_id AS id,CASE WHEN af_member_field_visible($1,$2,$3,m.user_id,'name') THEN COALESCE(m.display_name,u.name) ELSE '成员' END AS name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND m.user_id<>$4 AND m.user_id<>$5 AND af_member_scope_visible($1,$2,$3,m.user_id) AND af_effective_permissions(m.tenant_id,m.user_id) ? 'workflow:approve' AND af_effective_permissions(m.tenant_id,m.user_id) ? 'workflow:reject' AND ($6::text IS NULL OR NOT EXISTS(SELECT 1 FROM workflow_tasks t WHERE t.tenant_id=m.tenant_id AND t.instance_id=$7 AND t.activity_id=$6 AND t.assignee_id=m.user_id AND t.id<>$8)) ORDER BY m.user_id LIMIT 100",
          [
            current.tenantId,
            current.userId,
            mode,
            resource.applicant_id,
            excludedUser,
            currentActivity,
            task.instance_id,
            task.id,
          ]
        )
        return ok(candidates.filter((person) => !reserved.includes(person.id)))
      })
    }
  )
  ;(['transfer', 'recover'] as const).forEach((mode) =>
    server.post(`/api/workflow-tasks/:id/${mode}`, async (request) => {
      const actor = await auth(request)
      const id = text(record(request.params).id, 'id', 100)
      const body = parseTaskTransfer(request.body)
      const permission = mode === 'transfer' ? P.transfer : P.recover
      return ok(
        await idempotent(
          pool,
          actor,
          permission,
          `workflow-assignment:${mode}:${id}`,
          scalarHeader(request, 'idempotency-key'),
          body,
          async (db, current) => {
            const located = await taskRow(db, current, id, mode === 'transfer')
            const resource = await readRecordRow(
              db,
              current,
              located.request_id,
              true
            )
            await db.query(
              'SELECT id FROM workflow_instances WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
              [current.tenantId, located.instance_id]
            )
            const task = await taskRow(db, current, id, mode === 'transfer')
            await db.query(
              'SELECT id FROM workflow_tasks WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
              [current.tenantId, id]
            )
            active(task)
            assertRevision(task.revision, body.expectedRevision)
            if (mode === 'recover') {
              await recoverScope(db, current, task)
              if (
                await assignmentUserAvailable(
                  db,
                  current.tenantId,
                  task.assignee_id
                )
              )
                throw new DomainError(
                  409,
                  'NO_RECOVERY_REQUIRED',
                  '当前分配人仍可处理，应由本人转交'
                )
            }
            await target(
              db,
              current,
              task,
              permission,
              body.targetUserId,
              resource.applicant_id
            )
            await db.query(
              'UPDATE workflow_tasks SET assignee_id=$3,revision=revision+1 WHERE tenant_id=$1 AND id=$2',
              [current.tenantId, id, body.targetUserId]
            )
            const eventId = await saveEvent(
              db,
              current,
              task,
              mode === 'transfer' ? 'transfer' : 'recover-task',
              body.targetUserId,
              body.reason
            )
            await enqueue(
              db,
              current,
              body.targetUserId,
              resource.id,
              '有新的转交审批待办',
              'todo'
            )
            fault('assignment:stored')
            return {
              id,
              assigneeId: body.targetUserId,
              revision: task.revision + 1,
              eventId,
            }
          }
        )
      )
    })
  )
  server.post('/api/workflow-tasks/:id/recover-next', async (request) => {
    const actor = await auth(request)
    const id = text(record(request.params).id, 'id', 100)
    const body = parseNextRecovery(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        P.recover,
        `workflow-next-recovery:${id}`,
        scalarHeader(request, 'idempotency-key'),
        body,
        async (db, current) => {
          const located = await taskRow(db, current, id)
          const resource = await readRecordRow(
            db,
            current,
            located.request_id,
            true
          )
          await db.query(
            'SELECT id FROM workflow_instances WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [current.tenantId, located.instance_id]
          )
          const task = await taskRow(db, current, id)
          active(task)
          assertRevision(task.revision, body.expectedRevision)
          await recoverScope(db, current, task)
          const slot = (await unavailableSlots(db, current, task)).find(
            (item) =>
              item.nodeId === body.nodeId &&
              item.originalAssigneeId === body.originalAssigneeId
          )
          if (!slot)
            throw new DomainError(
              409,
              'NO_RECOVERY_REQUIRED',
              '该节点不是当前实际阻塞的下一票位'
            )
          await assertMemberScope(db, current, P.recover, body.targetUserId)
          if (body.targetUserId === resource.applicant_id)
            throw new DomainError(
              422,
              'SELF_APPROVAL',
              '申请人不能审批自己的申请'
            )
          if (
            !(await assignmentUserAvailable(
              db,
              current.tenantId,
              body.targetUserId
            ))
          )
            throw new DomainError(
              409,
              'TARGET_APPROVER_UNAVAILABLE',
              '目标当前不可审批'
            )
          const existing = await rows<{ revision: number }>(
            db,
            'SELECT revision FROM workflow_assignment_overrides WHERE tenant_id=$1 AND instance_id=$2 AND node_id=$3 AND original_assignee_id=$4 FOR UPDATE',
            [
              current.tenantId,
              task.instance_id,
              body.nodeId,
              body.originalAssigneeId,
            ]
          )
          await db.query(
            'INSERT INTO workflow_assignment_overrides(tenant_id,instance_id,node_id,original_assignee_id,target_user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,instance_id,node_id,original_assignee_id) DO UPDATE SET target_user_id=excluded.target_user_id,revision=workflow_assignment_overrides.revision+1,updated_at=now()',
            [
              current.tenantId,
              task.instance_id,
              body.nodeId,
              body.originalAssigneeId,
              body.targetUserId,
            ]
          )
          const release = await readRelease(
            db,
            current.tenantId,
            task.release_id
          )
          await runtimeAssignments(
            db,
            current.tenantId,
            task.instance_id,
            release.workflowSnapshot
          )
          const eventId = await saveEvent(
            db,
            current,
            task,
            'recover-next',
            body.targetUserId,
            body.reason,
            slot.nodeId,
            slot.originalAssigneeId,
            slot.assignedUserId
          )
          fault('assignment:override-stored')
          return {
            id,
            nodeId: body.nodeId,
            originalAssigneeId: body.originalAssigneeId,
            assigneeId: body.targetUserId,
            eventId,
            overrideRevision: (existing[0]?.revision || 0) + 1,
          }
        }
      )
    )
  })
  server.get('/api/workflow-exceptions', async (request) => {
    const actor = await auth(request)
    const page = pageQuery(request.query)
    return authorizedTransaction(
      pool,
      actor,
      P.recover,
      async (db, current) => {
        const base =
          "FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id JOIN business_records r ON r.tenant_id=i.tenant_id AND r.id=i.request_id WHERE t.tenant_id=$1 AND t.status='pending' AND i.status='running' AND af_member_scope_visible($1,$2,$3,r.applicant_id) AND af_historical_member_scope_visible($1,$2,$3,t.assignee_id) AND t.node_name ILIKE $4"
        const params = [
          current.tenantId,
          current.userId,
          P.recover,
          `%${page.keyword}%`,
        ]
        const count = one(
          await rows<{ total: string }>(
            db,
            `SELECT count(*) AS total ${base}`,
            params
          )
        )
        const tasks = await rows<Task>(
          db,
          `SELECT t.*,i.request_id,i.release_id,i.status AS instance_status ${base} ORDER BY t.created_at DESC,t.id LIMIT $5 OFFSET $6`,
          [...params, page.pageSize, page.offset]
        )
        const list: unknown[] = []
        await sequential(tasks, async (task) => {
          list.push({
            id: task.id,
            nodeId: task.node_id,
            nodeName: task.node_name,
            requestId: task.request_id,
            instanceId: task.instance_id,
            revision: task.revision,
            assigneeId: task.assignee_id,
            assigneeUnavailable: !(await assignmentUserAvailable(
              db,
              current.tenantId,
              task.assignee_id
            )),
            nextSlots: await unavailableSlots(db, current, task),
          })
        })
        return ok({ list, total: Number(count.total) })
      }
    )
  })
}

export default registerWorkflowRecovery
