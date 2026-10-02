import { rows } from './support'
import { assertDataDelegation } from './scope-delegation'
import type { Actor } from './auth'
import type { PoolClient } from 'pg'

const ancestors = async (
  client: PoolClient,
  tenantId: string,
  id: string | null
) =>
  (
    await rows<{ id: string }>(
      client,
      'WITH RECURSIVE parents AS (SELECT id,parent_id FROM departments WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL UNION SELECT d.id,d.parent_id FROM departments d JOIN parents p ON d.id=p.parent_id WHERE d.tenant_id=$1 AND d.deleted_at IS NULL) SELECT id FROM parents',
      [tenantId, id]
    )
  ).map((value) => value.id)

export const assertTreeScopeChange = async (
  client: PoolClient,
  actor: Actor,
  movingId: string,
  parentId: string | null
) => {
  const before = await ancestors(client, actor.tenantId, movingId)
  const destination = await ancestors(client, actor.tenantId, parentId)
  const gained = destination.filter((id) => !before.includes(id))
  if (!gained.length) return
  const affected = await rows<{
    id: string
    subject_user: string
    fields: string[]
    codes: string[]
  }>(
    client,
    "WITH candidates AS (SELECT r.id,m.user_id AS subject_user,s.field_permissions AS fields,(SELECT COALESCE(jsonb_agg(rp.permission_code),'[]'::jsonb) FROM role_permissions rp WHERE rp.tenant_id=r.tenant_id AND rp.role_id=r.id) AS codes,CASE WHEN EXISTS(SELECT 1 FROM role_scope_departments sd WHERE sd.tenant_id=r.tenant_id AND sd.role_id=r.id) THEN ARRAY(SELECT sd.department_id FROM role_scope_departments sd WHERE sd.tenant_id=r.tenant_id AND sd.role_id=r.id) ELSE ARRAY(SELECT m.department_id WHERE m.department_id IS NOT NULL) END AS roots FROM roles r JOIN role_member_scopes s ON s.tenant_id=r.tenant_id AND s.role_id=r.id JOIN member_roles mr ON mr.tenant_id=r.tenant_id AND mr.role_id=r.id JOIN memberships m ON m.tenant_id=mr.tenant_id AND m.user_id=mr.user_id WHERE r.tenant_id=$1 AND r.deleted_at IS NULL AND m.deleted_at IS NULL AND s.data_scope='department-and-children') SELECT DISTINCT ON (id) id,subject_user,fields,codes FROM candidates WHERE roots && $2::text[] AND NOT roots && $3::text[] ORDER BY id,subject_user",
    [actor.tenantId, gained, before]
  )
  // Evaluate against the original tree, before the actor's own roots can expand.
  await affected.reduce(async (previous, role) => {
    await previous
    await assertDataDelegation(
      client,
      actor,
      role.codes,
      role.id,
      role.subject_user,
      {
        scope: 'department-and-children',
        roots: [movingId],
        fields: role.fields,
      }
    )
  }, Promise.resolve())
}

export default assertTreeScopeChange
