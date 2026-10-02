import { DomainError } from '@af-admin/contracts'
import { hasPermission } from '@af-admin/workflow-core'
import { rows, one } from './support'
import type {
  JsonObject,
  LeaveStatus,
  BusinessRecord,
} from '@af-admin/contracts'
import type { Database } from './support'
import type { Actor } from './auth'

export interface RecordRow {
  tenant_id: string
  id: string
  record_kind: 'leave' | 'generic'
  application_release_id: string
  applicant_id: string
  applicant_name: string
  department_snapshot: string
  fields: JsonObject
  half_day_units: number | null
  status: LeaveStatus
  revision: number
  previous_request_id: string | null
  created_at: Date
  updated_at: Date
  instance_id?: string | null
}
export const readRecordRow = async (
  db: Database,
  actor: Actor,
  id: string,
  lock = false
): Promise<RecordRow> =>
  one(
    await rows<RecordRow>(
      db,
      `SELECT * FROM business_records WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [actor.tenantId, id]
    )
  )
export const visibleRecord = async (db: Database, actor: Actor, id: string) => {
  const row = await readRecordRow(db, actor, id)
  const prefix = row.record_kind === 'leave' ? 'leave' : 'business'
  const owner =
    row.applicant_id === actor.userId &&
    hasPermission(actor.permissions, `${prefix}:read:self`)
  const review = ['workflow:todo', 'workflow:approve', 'workflow:reject'].some(
    (code) => hasPermission(actor.permissions, code)
  )
  const participated = review
    ? await rows(
        db,
        'SELECT t.id FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE i.tenant_id=$1 AND i.request_id=$2 AND t.assignee_id=$3 LIMIT 1',
        [actor.tenantId, id, actor.userId]
      )
    : []
  const copied =
    hasPermission(actor.permissions, `${prefix}:read:self`) || review
      ? await rows(
          db,
          "SELECT id FROM outbox WHERE tenant_id=$1 AND recipient_id=$2 AND payload->>'requestId'=$3 AND payload->>'access'='copy' LIMIT 1",
          [actor.tenantId, actor.userId, id]
        )
      : []
  if (!owner && !participated.length && !copied.length)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  return row
}
export const businessDto = (row: RecordRow, actor: Actor): BusinessRecord => {
  const allowedActions: string[] = []
  if (row.applicant_id === actor.userId) {
    if (row.status === 'draft') {
      if (hasPermission(actor.permissions, 'business:update:self'))
        allowedActions.push('edit')
      if (hasPermission(actor.permissions, 'business:submit'))
        allowedActions.push('submit')
    }
    if (
      row.status === 'running' &&
      hasPermission(actor.permissions, 'business:withdraw:self')
    )
      allowedActions.push('withdraw')
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    applicationReleaseId: row.application_release_id,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    fields: row.fields,
    status: row.status,
    revision: row.revision,
    instanceId: row.instance_id || null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    allowedActions,
  }
}
