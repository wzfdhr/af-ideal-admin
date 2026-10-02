import {
  DomainError,
  USER_PERMISSIONS,
  ROLE_PERMISSIONS,
  DATA_SCOPE_PERMISSIONS,
} from '@af-admin/contracts'
import { hasPermission } from '@af-admin/workflow-core'
import { rows, one } from './support'
import type { PoolClient } from 'pg'

export const governors = async (client: PoolClient, tenantId: string) => {
  const candidates = await rows<{ user_id: string; permissions: string[] }>(
    client,
    "SELECT m.user_id,af_effective_permissions(m.tenant_id,m.user_id) AS permissions FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled'",
    [tenantId]
  )
  const groups = [
    [USER_PERMISSIONS.create, USER_PERMISSIONS.update, USER_PERMISSIONS.delete],
    [ROLE_PERMISSIONS.assign],
    [ROLE_PERMISSIONS.update, ROLE_PERMISSIONS.permissions],
  ]
  const capabilityGroups = groups.map((required) =>
    candidates
      .filter((member) =>
        required.every((code) => hasPermission(member.permissions, code))
      )
      .map((member) => member.user_id)
  )
  const scopeGovernors = await rows<{ user_id: string }>(
    client,
    "SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND af_effective_permissions(m.tenant_id,m.user_id) ? $2 AND ((m.permissions ? $3 OR m.permissions ? '*') OR EXISTS(SELECT 1 FROM member_roles mr JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id JOIN role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id JOIN role_member_scopes s ON s.tenant_id=r.tenant_id AND s.role_id=r.id WHERE mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id AND r.status='enabled' AND r.deleted_at IS NULL AND rp.permission_code=$3 AND s.data_scope IN ('all','tenant')))",
    [tenantId, DATA_SCOPE_PERMISSIONS.update, USER_PERMISSIONS.list]
  )
  return [...capabilityGroups, scopeGovernors.map((member) => member.user_id)]
}
export const assertGovernorTransition = async (
  client: PoolClient,
  tenantId: string,
  before: string[][]
) => {
  const after = await governors(client, tenantId)
  if (
    before.some((group, index) => group.length > 0 && after[index].length === 0)
  )
    throw new DomainError(
      409,
      'LAST_ADMINISTRATOR',
      '必须保留有效用户管理、授权分配及角色权限维护能力'
    )
}
export const assertMemberDeactivation = async (
  client: PoolClient,
  tenantId: string,
  id: string
) => {
  if (
    (await governors(client, tenantId)).some(
      (group) => group.length === 1 && group[0] === id
    )
  )
    throw new DomainError(
      409,
      'LAST_ADMINISTRATOR',
      '必须保留有效用户管理、授权分配及角色权限维护能力'
    )
}
export const assertNoPendingReviews = async (
  client: PoolClient,
  tenantId: string,
  userId: string
) => {
  const pending = one(
    await rows<{ total: string }>(
      client,
      "SELECT count(*) AS total FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE t.tenant_id=$1 AND t.assignee_id=$2 AND t.status='pending' AND i.status='running'",
      [tenantId, userId]
    )
  )
  if (Number(pending.total))
    throw new DomainError(
      409,
      'MEMBER_HAS_PENDING_TASKS',
      '成员仍有待处理审批，请先处理或转交'
    )
}
