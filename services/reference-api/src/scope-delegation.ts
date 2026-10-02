import {
  DomainError,
  USER_PERMISSIONS,
  ROLE_PERMISSIONS,
  POSITION_PERMISSIONS,
  MEMBER_SCOPE_FIELDS,
} from '@af-admin/contracts'
import { rows, one } from './support'
import type { Actor } from './auth'
import type { PoolClient } from 'pg'

const memberCodes = new Set<string>([
  ...Object.values(USER_PERMISSIONS),
  ROLE_PERMISSIONS.assign,
  POSITION_PERMISSIONS.assign,
])
interface Policy {
  roleId: string | null
  scope: string
  roots: string[]
  fields: string[]
}
const policies = async (
  client: PoolClient,
  actor: Actor,
  code: string
): Promise<Policy[]> => {
  const direct = one(
    await rows<{ allowed: boolean }>(
      client,
      "SELECT permissions ? $3 OR permissions ? '*' AS allowed FROM memberships WHERE tenant_id=$1 AND user_id=$2",
      [actor.tenantId, actor.userId, code]
    )
  )
  if (direct.allowed)
    return [
      {
        roleId: null,
        scope: 'all',
        roots: [],
        fields: [...MEMBER_SCOPE_FIELDS],
      },
    ]
  return rows<Policy>(
    client,
    "SELECT r.id AS \"roleId\",COALESCE(s.data_scope,'self') AS scope,COALESCE(s.field_permissions,'[]'::jsonb) AS fields,CASE WHEN EXISTS(SELECT 1 FROM role_scope_departments sd WHERE sd.tenant_id=r.tenant_id AND sd.role_id=r.id) THEN ARRAY(SELECT sd.department_id FROM role_scope_departments sd WHERE sd.tenant_id=r.tenant_id AND sd.role_id=r.id) ELSE ARRAY(SELECT department_id FROM memberships WHERE tenant_id=$1 AND user_id=$2 AND department_id IS NOT NULL) END AS roots FROM member_roles mr JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id JOIN role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id LEFT JOIN role_member_scopes s ON s.tenant_id=r.tenant_id AND s.role_id=r.id WHERE mr.tenant_id=$1 AND mr.user_id=$2 AND rp.permission_code=$3 AND r.status='enabled' AND r.deleted_at IS NULL",
    [actor.tenantId, actor.userId, code]
  )
}
const descendant = async (
  client: PoolClient,
  tenant: string,
  root: string,
  target: string
) =>
  one(
    await rows<{ allowed: boolean }>(
      client,
      'WITH RECURSIVE parents AS (SELECT id,parent_id FROM departments WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL UNION SELECT d.id,d.parent_id FROM departments d JOIN parents p ON d.id=p.parent_id WHERE d.tenant_id=$1 AND d.deleted_at IS NULL) SELECT EXISTS(SELECT 1 FROM parents WHERE id=$3) AS allowed',
      [tenant, target, root]
    )
  ).allowed
export const assertDataDelegation = async (
  client: PoolClient,
  actor: Actor,
  codes: string[],
  roleId: string | null,
  targetUserId: string,
  candidate?: Omit<Policy, 'roleId'>
) => {
  await codes
    .filter((code) => memberCodes.has(code))
    .reduce(async (previous, code) => {
      await previous
      const owned = await policies(client, actor, code)
      let granted: Policy = {
        roleId: null,
        scope: 'all',
        roots: [],
        fields: [...MEMBER_SCOPE_FIELDS],
      }
      if (roleId) {
        const target =
          candidate ||
          one(
            await rows<{ scope: string; fields: string[] }>(
              client,
              'SELECT data_scope AS scope,field_permissions AS fields FROM role_member_scopes WHERE tenant_id=$1 AND role_id=$2',
              [actor.tenantId, roleId]
            )
          )
        const roots = candidate
          ? candidate.roots.map((id) => ({ id }))
          : await rows<{ id: string }>(
              client,
              'SELECT department_id AS id FROM role_scope_departments WHERE tenant_id=$1 AND role_id=$2',
              [actor.tenantId, roleId]
            )
        const user = one(
          await rows<{ department_id: string | null }>(
            client,
            'SELECT department_id FROM memberships WHERE tenant_id=$1 AND user_id=$2',
            [actor.tenantId, targetUserId]
          )
        )
        let selected: string[] = roots.map((value) => value.id)
        if (!selected.length && user.department_id)
          selected = [user.department_id]
        granted = { ...target, roleId, roots: selected }
      }
      const checks = await owned.reduce(async (previousChecks, policy) => {
        const result = await previousChecks
        const check = async () => {
          if (!granted.fields.every((field) => policy.fields.includes(field)))
            return false
          if (['all', 'tenant'].includes(policy.scope)) return true
          if (granted.scope === 'self') {
            return one(
              await rows<{ allowed: boolean }>(
                client,
                'SELECT af_member_scope_visible($1,$2,$3,$4,$5) AS allowed',
                [
                  actor.tenantId,
                  actor.userId,
                  code,
                  targetUserId,
                  policy.roleId,
                ]
              )
            ).allowed
          }
          if (
            !['department', 'department-and-children'].includes(
              granted.scope
            ) ||
            !['department', 'department-and-children'].includes(policy.scope)
          )
            return false
          if (
            granted.scope === 'department-and-children' &&
            policy.scope !== 'department-and-children'
          )
            return false
          if (!granted.roots.length) return false
          const roots = await granted.roots.reduce(
            async (previousRoots, root) => {
              const rootResults = await previousRoots
              const checkRoot = async () => {
                if (policy.scope === 'department')
                  return policy.roots.includes(root)
                return (
                  await policy.roots.reduce(
                    async (previousParents, parent) => [
                      ...(await previousParents),
                      await descendant(client, actor.tenantId, parent, root),
                    ],
                    Promise.resolve([] as boolean[])
                  )
                ).some(Boolean)
              }
              return [...rootResults, await checkRoot()]
            },
            Promise.resolve([] as boolean[])
          )
          return roots.every(Boolean)
        }
        return [...result, await check()]
      }, Promise.resolve([] as boolean[]))
      if (!checks.some(Boolean))
        throw new DomainError(
          403,
          'SCOPE_DELEGATION',
          '不能通过角色或直接授权扩大自身可管理的数据范围或字段'
        )
    }, Promise.resolve())
}
export default assertDataDelegation
