import {
  DomainError,
  parseCommand,
  computeBusinessFields,
} from '@af-admin/contracts'
import {
  assertTaskAction,
  assertWithdraw,
  assertRevision,
  advanceWorkflow,
  requirePermission,
  hasPermission,
} from '@af-admin/workflow-core'
import { cancelWorkflowTimers } from './timer-state'
import { runtimeAssignments } from './assignment-runtime'
import {
  continueParallelActivity,
  cancelParallelActivities,
} from './parallel-activities'
import { readRecordRow, visibleRecord } from './record-access'
import { readRelease } from './application'
import {
  leaveDto,
  history,
  appendHistory,
  appendRouteHistory,
  addTask,
} from './leave'
import {
  rows,
  one,
  pageQuery,
  idempotent,
  sequential,
  enqueue,
  audit,
} from './support'
import type {
  JsonObject,
  WorkflowTask,
  InstanceStatus,
} from '@af-admin/contracts'
import type { LeaveRow } from './leave'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'

interface InstanceRow {
  id: string
  request_id: string
  release_id: string
  status: InstanceStatus
  current_node_id: string | null
  revision: number
}
interface TaskRow {
  tenant_id: string
  id: string
  activity_id?: string | null
  instance_id: string
  request_id: string
  node_id: string
  node_name: string
  assignee_id: string
  status: WorkflowTask['status']
  revision: number
  created_at: Date
  completed_at: Date | null
  applicant_name?: string
  record_kind?: 'leave' | 'generic'
  half_day_units?: number | null
}
const taskDto = (row: TaskRow): WorkflowTask => ({
  tenantId: row.tenant_id,
  ...(row.activity_id ? { activityId: row.activity_id } : {}),
  id: row.id,
  instanceId: row.instance_id,
  requestId: row.request_id,
  nodeId: row.node_id,
  nodeName: row.node_name,
  assigneeId: row.assignee_id,
  status: row.status,
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  completedAt: row.completed_at?.toISOString() || null,
  applicantName: row.applicant_name,
  halfDayUnits: row.half_day_units ?? undefined,
  businessKind: row.record_kind || 'leave',
  recordLink:
    row.record_kind === 'generic'
      ? `/business/records/${row.request_id}`
      : `/leave/requests/${row.request_id}`,
})
const readTask = async (db: Database, actor: Actor, id: string) => {
  const row = one(
    await rows<TaskRow>(
      db,
      'SELECT t.*,i.request_id,r.record_kind FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id JOIN business_records r ON r.tenant_id=i.tenant_id AND r.id=i.request_id WHERE t.tenant_id=$1 AND t.id=$2 AND t.assignee_id=$3',
      [actor.tenantId, id, actor.userId]
    )
  )
  return row
}
export const listTasks = async (
  db: Database,
  actor: Actor,
  input: unknown,
  done = false
) => {
  requirePermission(actor.permissions, 'workflow:todo')
  const page = pageQuery(input)
  const filter = done
    ? "t.status IN ('approved','rejected')"
    : "t.status='pending' AND i.status='running'"
  const params = [actor.tenantId, actor.userId, `%${page.keyword}%`]
  const base = `FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id JOIN business_records r ON r.tenant_id=i.tenant_id AND r.id=i.request_id WHERE t.tenant_id=$1 AND t.assignee_id=$2 AND ${filter} AND (t.node_name ILIKE $3 OR r.applicant_name ILIKE $3)`
  const total = one(
    await rows<{ total: string }>(
      db,
      `SELECT count(*) AS total ${base}`,
      params
    )
  )
  const tasks = await rows<TaskRow>(
    db,
    `SELECT t.*,i.request_id,r.applicant_name,r.half_day_units,r.record_kind ${base} ORDER BY t.created_at DESC,t.id LIMIT $4 OFFSET $5`,
    [...params, page.pageSize, page.offset]
  )
  return { list: tasks.map(taskDto), total: Number(total.total) }
}
export const instanceHistory = async (
  db: Database,
  actor: Actor,
  instanceId: string
) => {
  const instance = one(
    await rows<InstanceRow>(
      db,
      'SELECT * FROM workflow_instances WHERE tenant_id=$1 AND id=$2',
      [actor.tenantId, instanceId]
    )
  )
  await visibleRecord(db, actor, instance.request_id)
  return history(db, actor.tenantId, instanceId)
}
export const decideTask = (
  pool: Pool,
  actor: Actor,
  id: string,
  action: 'approve' | 'reject',
  input: unknown,
  key: string | undefined,
  fault: FaultInjector
) => {
  const payload = parseCommand(input, action === 'reject')
  return idempotent(
    pool,
    actor,
    `workflow:${action}`,
    `${action}:${id}`,
    key,
    payload,
    async (client, current) => {
      const located = await readTask(client, current, id)
      const request = await readRecordRow(
        client,
        current,
        located.request_id,
        true
      )
      const instance = one(
        await rows<InstanceRow>(
          client,
          'SELECT * FROM workflow_instances WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [current.tenantId, located.instance_id]
        )
      )
      const task = one(
        await rows<TaskRow>(
          client,
          'SELECT t.*,$3::text AS request_id FROM workflow_tasks t WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [current.tenantId, id, request.id]
        )
      )
      assertTaskAction(
        taskDto(task),
        instance.status,
        current.userId,
        current.permissions,
        action,
        payload.expectedRevision
      )
      if (
        request.status !== 'running' ||
        (!task.activity_id && instance.current_node_id !== task.node_id)
      )
        throw new DomainError(
          409,
          'STATE_CONFLICT',
          '申请已结束或当前节点已经变化'
        )
      const release = await readRelease(
        client,
        current.tenantId,
        instance.release_id
      )
      const executionSchema = await runtimeAssignments(
        client,
        current.tenantId,
        instance.id,
        release.workflowSnapshot
      )
      await client.query(
        'UPDATE workflow_tasks SET status=$3,revision=revision+1,completed_at=now() WHERE tenant_id=$1 AND id=$2',
        [current.tenantId, id, action === 'approve' ? 'approved' : 'rejected']
      )
      await appendHistory(
        client,
        current,
        instance.id,
        action,
        id,
        payload.comment
      )
      let instanceStatus: InstanceStatus = 'rejected'
      let requestStatus = 'rejected'
      let nextNode: string | null = null
      if (release.workflowSnapshot.version >= 3) {
        if (!task.activity_id)
          throw new DomainError(409, 'STATE_CONFLICT', '并行任务缺少耐久活动')
        const fields = request.fields as unknown as JsonObject
        const outcome = await continueParallelActivity(
          {
            db: client,
            actor: current,
            instanceId: instance.id,
            requestId: request.id,
            applicantId: request.applicant_id,
            businessKind: request.record_kind,
            schema: executionSchema,
            values: {
              ...fields,
              ...(request.record_kind === 'generic'
                ? computeBusinessFields(release.formSnapshot, fields)
                : {}),
            },
            fault,
          },
          task.activity_id
        )
        instanceStatus = 'running'
        if (outcome.completed) instanceStatus = 'completed'
        if (outcome.rejected) instanceStatus = 'rejected'
        requestStatus = 'running'
        if (outcome.completed) requestStatus = 'approved'
        if (outcome.rejected) requestStatus = 'rejected'
      } else if (action === 'approve') {
        const fields = request.fields as unknown as JsonObject
        const next = advanceWorkflow(executionSchema, task.node_id, {
          ...fields,
          ...(request.record_kind === 'generic'
            ? computeBusinessFields(release.formSnapshot, fields)
            : {}),
        })
        instanceStatus = next.completed ? 'completed' : 'running'
        requestStatus = next.completed ? 'approved' : 'running'
        nextNode = next.approval?.id || null
        if (next.approval) {
          const available = await rows<{ id: string; permissions: string[] }>(
            client,
            "SELECT m.user_id AS id,af_effective_permissions(m.tenant_id,m.user_id) AS permissions FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND u.status='enabled'",
            [current.tenantId, next.approval.config.approvers?.[0]]
          )
          if (
            !available.length ||
            !['workflow:approve', 'workflow:reject'].every((code) =>
              hasPermission(available[0].permissions, code)
            )
          )
            throw new DomainError(
              409,
              'NEXT_APPROVER_UNAVAILABLE',
              '下一节点处理人不可用，请联系管理员恢复或撤回申请'
            )
          await addTask(
            client,
            current,
            instance.id,
            request.id,
            next.approval,
            request.record_kind
          )
        }
        await appendRouteHistory(client, current, instance.id, next.routes)
        if (next.routes?.length) fault('decision:condition-recorded')
        await sequential(next.copiedUserIds, async (recipient) => {
          await enqueue(
            client,
            current,
            recipient,
            request.id,
            request.record_kind === 'generic' ? '业务记录抄送' : '请假申请抄送',
            'message',
            'copy'
          )
        })
        if (next.copiedUserIds.length)
          await appendHistory(
            client,
            current,
            instance.id,
            'copy',
            null,
            '已按流程抄送'
          )
      }
      await client.query(
        'UPDATE workflow_instances SET status=$3,current_node_id=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
        [current.tenantId, instance.id, instanceStatus, nextNode]
      )
      await client.query(
        'UPDATE business_records SET status=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
        [current.tenantId, request.id, requestStatus]
      )
      const titlePrefix =
        request.record_kind === 'generic' ? '业务申请' : '请假申请'
      if (requestStatus !== 'running') {
        await cancelWorkflowTimers(client, current.tenantId, instance.id)
        await client.query(
          "UPDATE workflow_tasks SET status='cancelled',revision=revision+1,completed_at=now() WHERE tenant_id=$1 AND instance_id=$2 AND status='pending'",
          [current.tenantId, instance.id]
        )
        await enqueue(
          client,
          current,
          request.applicant_id,
          request.id,
          requestStatus === 'approved'
            ? `${titlePrefix}已通过`
            : `${titlePrefix}已驳回`
        )
      }
      fault('decision:state-updated')
      await audit(
        client,
        current,
        'workflow',
        action,
        'workflow-task',
        id,
        'success',
        { requestId: request.id, instanceId: instance.id }
      )
      const result = taskDto(await readTask(client, current, id))
      return {
        ...result,
        requestStatus,
        instanceStatus,
        requestRevision: request.revision + 1,
      }
    }
  )
}
export const withdrawInstance = async (
  pool: Pool,
  actor: Actor,
  id: string,
  input: unknown,
  key: string | undefined,
  fault: FaultInjector
) => {
  const payload = parseCommand(input)
  const subject = one(
    await rows<{ request_id: string }>(
      pool,
      'SELECT request_id FROM workflow_instances WHERE tenant_id=$1 AND id=$2',
      [actor.tenantId, id]
    )
  )
  const resource = await readRecordRow(pool, actor, subject.request_id)
  return idempotent(
    pool,
    actor,
    resource.record_kind === 'generic'
      ? 'business:withdraw:self'
      : 'leave:withdraw:self',
    `withdraw:${id}`,
    key,
    payload,
    async (client, current) => {
      const located = one(
        await rows<InstanceRow>(
          client,
          'SELECT * FROM workflow_instances WHERE tenant_id=$1 AND id=$2',
          [current.tenantId, id]
        )
      )
      const request = await readRecordRow(
        client,
        current,
        located.request_id,
        true
      )
      const instance = one(
        await rows<InstanceRow>(
          client,
          'SELECT * FROM workflow_instances WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [current.tenantId, id]
        )
      )
      assertWithdraw(request.status, request.applicant_id, current.userId)
      assertRevision(request.revision, payload.expectedRevision)
      if (instance.status !== 'running')
        throw new DomainError(409, 'STATE_CONFLICT', '流程已经结束')
      await client.query(
        "UPDATE workflow_instances SET status='withdrawn',current_node_id=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [current.tenantId, id]
      )
      await client.query(
        "UPDATE business_records SET status='withdrawn',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [current.tenantId, request.id]
      )
      await client.query(
        "UPDATE workflow_tasks SET status='cancelled',revision=revision+1,completed_at=now() WHERE tenant_id=$1 AND instance_id=$2 AND status='pending'",
        [current.tenantId, id]
      )
      await cancelWorkflowTimers(client, current.tenantId, id)
      await cancelParallelActivities(client, current, id)
      await appendHistory(
        client,
        current,
        id,
        'withdraw',
        null,
        payload.comment
      )
      await enqueue(
        client,
        current,
        request.applicant_id,
        request.id,
        request.record_kind === 'generic' ? '业务申请已撤回' : '请假申请已撤回'
      )
      fault('withdraw:state-updated')
      await audit(
        client,
        current,
        'leave',
        'withdraw',
        'leave-request',
        request.id
      )
      const result = {
        ...(await readRecordRow(client, current, request.id)),
        instance_id: id,
      }
      return request.record_kind === 'generic'
        ? {
            id: result.id,
            revision: result.revision,
            status: result.status,
            instanceId: id,
          }
        : leaveDto(result as unknown as LeaveRow, current)
    }
  )
}
