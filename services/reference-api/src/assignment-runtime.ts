import { DomainError, invalid } from '@af-admin/contracts'
import { hasPermission } from '@af-admin/workflow-core'
import { rows } from './support'
import type { WorkflowSchema } from '@af-admin/contracts'
import type { Database } from './support'

export const assignmentUserAvailable = async (
  db: Database,
  tenantId: string,
  userId: string
) => {
  const members = await rows<{ permissions: string[] }>(
    db,
    "SELECT af_effective_permissions(m.tenant_id,m.user_id) AS permissions FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled'",
    [tenantId, userId]
  )
  return (
    !!members.length &&
    ['workflow:approve', 'workflow:reject'].every((code) =>
      hasPermission(members[0].permissions, code)
    )
  )
}
export const runtimeAssignments = async (
  db: Database,
  tenantId: string,
  instanceId: string,
  input: WorkflowSchema
): Promise<WorkflowSchema> => {
  const overrides = await rows<{
    node_id: string
    original_assignee_id: string
    target_user_id: string
  }>(
    db,
    'SELECT node_id,original_assignee_id,target_user_id FROM workflow_assignment_overrides WHERE tenant_id=$1 AND instance_id=$2',
    [tenantId, instanceId]
  )
  const schema = JSON.parse(JSON.stringify(input)) as WorkflowSchema
  schema.nodes.forEach((node) => {
    if (!node.config.approvers) return
    node.config.approvers = node.config.approvers.map(
      (original) =>
        overrides.find(
          (row) =>
            row.node_id === node.id && row.original_assignee_id === original
        )?.target_user_id || original
    )
    if (new Set(node.config.approvers).size !== node.config.approvers.length)
      invalid(node.id, '分配覆盖不能让同一成员占据两个签署票位')
  })
  return schema
}
export const originalAssignmentSlot = async (
  db: Database,
  tenantId: string,
  instanceId: string,
  nodeId: string,
  assigneeId: string
) => {
  const overrides = await rows<{ original_assignee_id: string }>(
    db,
    'SELECT original_assignee_id FROM workflow_assignment_overrides WHERE tenant_id=$1 AND instance_id=$2 AND node_id=$3 AND target_user_id=$4',
    [tenantId, instanceId, nodeId, assigneeId]
  )
  if (overrides.length > 1)
    throw new DomainError(409, 'ASSIGNMENT_CONFLICT', '票位覆盖不唯一')
  return overrides[0]?.original_assignee_id || assigneeId
}
