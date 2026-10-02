import {
  DATA_SCOPE_PERMISSIONS,
  USER_PERMISSIONS,
  DomainError,
  parseMemberScope,
  record,
  onlyKeys,
  text,
} from '@af-admin/contracts'
import { assertDelegation, assertRevision } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  pageQuery,
  authorizedTransaction,
  idempotent,
  audit,
} from './support'
import { projectMemberFields } from './member-scope'
import { assertDataDelegation } from './scope-delegation'
import { governors, assertGovernorTransition } from './governance'
import type { Actor } from './auth'
import type { Pool, PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'

interface RuleRow {
  roleId: string
  roleName: string
  dataScope: string
  fieldPermissions: string[]
  revision: number
  updated_at: Date
  departmentIds: string[]
  permissions: string[]
}
const projection =
  's.role_id AS "roleId",r.role_name AS "roleName",s.data_scope AS "dataScope",s.field_permissions AS "fieldPermissions",s.revision,s.updated_at,(SELECT COALESCE(jsonb_agg(sd.department_id ORDER BY sd.department_id),\'[]\'::jsonb) FROM role_scope_departments sd WHERE sd.tenant_id=s.tenant_id AND sd.role_id=s.role_id) AS "departmentIds",(SELECT COALESCE(jsonb_agg(rp.permission_code),\'[]\'::jsonb) FROM role_permissions rp WHERE rp.tenant_id=r.tenant_id AND rp.role_id=r.id) AS permissions'
const sources =
  'FROM role_member_scopes s JOIN roles r ON r.tenant_id=s.tenant_id AND r.id=s.role_id'
const dto = (rule: RuleRow) => ({
  roleId: rule.roleId,
  roleName: rule.roleName,
  dataScope: rule.dataScope,
  departmentIds: rule.departmentIds,
  fieldPermissions: rule.fieldPermissions,
  revision: rule.revision,
  updatedAt: rule.updated_at.toISOString(),
})
const read = async (client: PoolClient, tenantId: string, roleId: string) =>
  one(
    await rows<RuleRow>(
      client,
      `SELECT ${projection} ${sources} WHERE s.tenant_id=$1 AND s.role_id=$2 AND r.deleted_at IS NULL`,
      [tenantId, roleId]
    )
  )
const authority = async (client: PoolClient, actor: Actor) => {
  const result = one(
    await rows<{ all: boolean }>(
      client,
      "SELECT EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=$1 AND m.user_id=$2 AND (m.permissions ? $3 OR m.permissions ? '*')) OR EXISTS(SELECT 1 FROM member_roles mr JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id JOIN role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id JOIN role_member_scopes s ON s.tenant_id=r.tenant_id AND s.role_id=r.id WHERE mr.tenant_id=$1 AND mr.user_id=$2 AND rp.permission_code=$3 AND r.status='enabled' AND r.deleted_at IS NULL AND s.data_scope IN ('all','tenant')) AS all",
      [actor.tenantId, actor.userId, USER_PERMISSIONS.list]
    )
  )
  if (!result.all)
    throw new DomainError(
      403,
      'SCOPE_AUTHORITY',
      '数据范围治理需要当前本租户全部成员的授权，不能借配置权限扩大自身范围'
    )
}
export const registerDataScopes = (server: FastifyInstance, pool: Pool) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/permissions/data-scopes', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      DATA_SCOPE_PERMISSIONS.view,
      async (client, current) => {
        const page = pageQuery(request.query)
        const query = record(request.query)
        if (query.tenantId && query.tenantId !== current.tenantId)
          throw new DomainError(
            403,
            'TENANT_FORBIDDEN',
            '不能读取其他租户的数据范围'
          )
        const filter =
          'WHERE s.tenant_id=$1 AND r.deleted_at IS NULL AND r.role_name ILIKE $2'
        const count = one(
          await rows<{ total: string }>(
            client,
            `SELECT count(*) AS total ${sources} ${filter}`,
            [current.tenantId, `%${page.keyword}%`]
          )
        )
        const values = await rows<RuleRow>(
          client,
          `SELECT ${projection} ${sources} ${filter} ORDER BY r.role_sort,r.id LIMIT $3 OFFSET $4`,
          [current.tenantId, `%${page.keyword}%`, page.pageSize, page.offset]
        )
        return ok(
          { list: values.map(dto), total: Number(count.total) },
          request.id
        )
      }
    )
  })
  server.get('/api/permissions/data-scopes/:id/members', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(
      pool,
      actor,
      DATA_SCOPE_PERMISSIONS.view,
      async (client, current) => {
        await read(client, current.tenantId, id)
        await authority(client, current)
        const people = await rows<{
          id: string
          name: string
          username: string
        }>(
          client,
          "SELECT m.user_id AS id,COALESCE(m.display_name,u.name) AS name,u.username FROM member_roles mr JOIN memberships m ON m.tenant_id=mr.tenant_id AND m.user_id=mr.user_id JOIN users u ON u.id=m.user_id WHERE mr.tenant_id=$1 AND mr.role_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' ORDER BY m.user_id LIMIT 100",
          [current.tenantId, id]
        )
        const visiblePeople = await people.reduce(
          async (previous, person) => [
            ...(await previous),
            await projectMemberFields(
              client,
              current,
              USER_PERMISSIONS.list,
              person.id,
              person
            ),
          ],
          Promise.resolve([] as Record<string, unknown>[])
        )
        return ok(visiblePeople, request.id)
      }
    )
  })
  server.put('/api/permissions/data-scopes/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const input = parseMemberScope(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        DATA_SCOPE_PERMISSIONS.update,
        `data-scope:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const old = await read(client, current.tenantId, id)
          assertRevision(old.revision, input.expectedRevision)
          await authority(client, current)
          assertDelegation(current.permissions, old.permissions)
          const found = await rows<{ id: string }>(
            client,
            "SELECT id FROM departments WHERE tenant_id=$1 AND id=ANY($2::text[]) AND status='enabled' AND deleted_at IS NULL",
            [current.tenantId, input.departmentIds]
          )
          if (found.length !== input.departmentIds.length)
            throw new DomainError(404, 'NOT_FOUND', '资源不存在')
          const bound = await rows<{ user_id: string }>(
            client,
            'SELECT user_id FROM member_roles WHERE tenant_id=$1 AND role_id=$2',
            [current.tenantId, id]
          )
          const targets = bound.length
            ? bound.map((member) => member.user_id)
            : [current.userId]
          await targets.reduce(async (previous, target) => {
            await previous
            await assertDataDelegation(
              client,
              current,
              old.permissions,
              id,
              target,
              {
                scope: input.dataScope,
                roots: input.departmentIds,
                fields: input.fieldPermissions,
              }
            )
          }, Promise.resolve())
          const before = await governors(client, current.tenantId)
          await client.query(
            'UPDATE role_member_scopes SET data_scope=$3,field_permissions=$4,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND role_id=$2',
            [
              current.tenantId,
              id,
              input.dataScope,
              JSON.stringify(input.fieldPermissions),
            ]
          )
          await client.query(
            'DELETE FROM role_scope_departments WHERE tenant_id=$1 AND role_id=$2',
            [current.tenantId, id]
          )
          await client.query(
            'INSERT INTO role_scope_departments(tenant_id,role_id,department_id) SELECT $1,$2,unnest($3::text[])',
            [current.tenantId, id, input.departmentIds]
          )
          await client.query(
            'UPDATE roles SET revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
          await client.query(
            'UPDATE memberships m SET revision=revision+1,updated_at=now() WHERE m.tenant_id=$1 AND EXISTS(SELECT 1 FROM member_roles mr WHERE mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id AND mr.role_id=$2)',
            [current.tenantId, id]
          )
          await client.query(
            'UPDATE tenants SET revision=revision+1,updated_at=now() WHERE id=$1',
            [current.tenantId]
          )
          await assertGovernorTransition(client, current.tenantId, before)
          await audit(
            client,
            current,
            'authorization',
            'data-scope.update',
            'role',
            id,
            'success',
            {
              dataScope: input.dataScope,
              departmentIds: input.departmentIds,
              fieldPermissions: input.fieldPermissions,
            }
          )
          return dto(await read(client, current.tenantId, id))
        },
        true
      ),
      request.id
    )
  })
  server.post('/api/permissions/data-scopes/preview', async (request) => {
    const actor = await authenticate(pool, request)
    const body = record(request.body)
    onlyKeys(body, ['roleId', 'subjectUserId'])
    const roleId = text(body.roleId, 'roleId', 100)
    const subjectUserId = text(body.subjectUserId, 'subjectUserId', 100)
    return authorizedTransaction(
      pool,
      actor,
      DATA_SCOPE_PERMISSIONS.preview,
      async (client, current) => {
        const rule = await read(client, current.tenantId, roleId)
        await authority(client, current)
        assertDelegation(current.permissions, rule.permissions)
        if (
          !(
            await rows(
              client,
              'SELECT user_id FROM member_roles WHERE tenant_id=$1 AND role_id=$2 AND user_id=$3',
              [current.tenantId, roleId, subjectUserId]
            )
          ).length
        )
          throw new DomainError(
            422,
            'ROLE_NOT_ASSIGNED',
            '请选择已经绑定此角色的成员'
          )
        const values = await rows<{
          id: string
          username: string
          name: string
          dept: string
          status: string
        }>(
          client,
          'SELECT m.user_id AS id,u.username,COALESCE(m.display_name,u.name) AS name,COALESCE(d.department_name,m.department_name) AS dept,m.status FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN departments d ON d.tenant_id=m.tenant_id AND d.id=m.department_id WHERE m.tenant_id=$1 AND af_member_scope_visible($1,$2,$3,m.user_id,$4) ORDER BY m.user_id LIMIT 100',
          [current.tenantId, subjectUserId, USER_PERMISSIONS.list, roleId]
        )
        const subject = { ...current, userId: subjectUserId }
        const visibleRows = await values.reduce(async (previous, value) => {
          const result = await previous
          const authorized = await projectMemberFields(
            client,
            subject,
            USER_PERMISSIONS.list,
            value.id,
            Object.fromEntries(
              Object.entries(value).filter(
                ([field]) =>
                  field === 'id' || rule.fieldPermissions.includes(field)
              )
            )
          )
          return [
            ...result,
            await projectMemberFields(
              client,
              current,
              USER_PERMISSIONS.list,
              value.id,
              authorized
            ),
          ]
        }, Promise.resolve([] as Record<string, unknown>[]))
        return ok({ visibleRows, truncated: values.length === 100 }, request.id)
      }
    )
  })
}
export default registerDataScopes
