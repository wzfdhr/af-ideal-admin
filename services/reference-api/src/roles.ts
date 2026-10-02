import { randomUUID } from 'node:crypto'
import {
  ROLE_PERMISSIONS,
  DomainError,
  parseRole,
  permissionCodes,
  roleIds,
  record,
  onlyKeys,
  positiveInteger,
  text,
} from '@af-admin/contracts'
import {
  requirePermission,
  hasPermission,
  assertRevision,
  assertDelegation,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  audit,
  idempotent,
  authorizedTransaction,
  rows,
  one,
  pageQuery,
} from './support'
import { governors, assertGovernorTransition } from './governance'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import type { Actor } from './auth'
import type { ManagedRole } from '@af-admin/contracts'

interface RoleRow {
  id: string
  role_name: string
  role_key: string
  role_sort: number
  status: 'enabled' | 'disabled'
  remark: string
  permissions: string[]
  revision: number
  created_at: Date
  updated_at: Date
}
const projection =
  "r.*,(SELECT COALESCE(jsonb_agg(rp.permission_code ORDER BY rp.permission_code),'[]'::jsonb) FROM role_permissions rp WHERE rp.tenant_id=r.tenant_id AND rp.role_id=r.id) AS permissions"
const dto = (value: RoleRow): ManagedRole => ({
  id: value.id,
  roleName: value.role_name,
  roleKey: value.role_key,
  roleSort: value.role_sort,
  status: value.status,
  remark: value.remark,
  permissions: value.permissions,
  revision: value.revision,
  createdAt: value.created_at.toISOString(),
  updatedAt: value.updated_at.toISOString(),
})
const read = async (
  client: Pick<Pool, 'query'>,
  tenantId: string,
  id: string,
  lock = false
) =>
  one(
    await rows<RoleRow>(
      client,
      `SELECT ${projection} FROM roles r WHERE r.tenant_id=$1 AND r.id=$2 AND r.deleted_at IS NULL${
        lock ? ' FOR UPDATE OF r' : ''
      }`,
      [tenantId, id]
    )
  )
const manage = (actor: Actor, permissions: string[]) => {
  if (permissions.some((code) => !hasPermission(actor.permissions, code)))
    throw new DomainError(
      403,
      'PRIVILEGE_BOUNDS',
      '不能管理超出自身授权的角色或成员'
    )
}
const validateCodes = async (client: PoolClient, codes: string[]) => {
  const found = await rows<{ code: string }>(
    client,
    "SELECT code FROM permission_definitions WHERE status='enabled' AND code=ANY($1::text[])",
    [codes]
  )
  if (found.length !== codes.length)
    throw new DomainError(422, 'UNKNOWN_PERMISSION', '权限必须来自当前有效目录')
}
const touchRoleMembers = async (
  client: PoolClient,
  tenantId: string,
  id: string
) => {
  await client.query(
    'UPDATE memberships m SET revision=revision+1,updated_at=now() WHERE m.tenant_id=$1 AND EXISTS (SELECT 1 FROM member_roles mr WHERE mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id AND mr.role_id=$2)',
    [tenantId, id]
  )
  await client.query(
    'UPDATE tenants SET revision=revision+1,updated_at=now() WHERE id=$1',
    [tenantId]
  )
}
export const registerRoles = (server: FastifyInstance, pool: Pool) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/system/permissions', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      ROLE_PERMISSIONS.list,
      async (client, current) => {
        const catalogue = await rows<{
          code: string
          title: string
          module: string
        }>(
          client,
          "SELECT code,title,module FROM permission_definitions WHERE status='enabled' ORDER BY module,code"
        )
        return ok(
          catalogue.map((entry) => ({
            ...entry,
            delegatable: hasPermission(current.permissions, entry.code),
          })),
          request.id
        )
      }
    )
  })
  server.get('/api/system/roles', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      ROLE_PERMISSIONS.list,
      async (client, current) => {
        const query = record(request.query)
        const page = pageQuery(query)
        const name =
          typeof query.roleName === 'string' ? query.roleName.slice(0, 100) : ''
        const count = one(
          await rows<{ total: string }>(
            client,
            'SELECT count(*) AS total FROM roles WHERE tenant_id=$1 AND deleted_at IS NULL AND role_name ILIKE $2',
            [current.tenantId, `%${name}%`]
          )
        )
        const result = await rows<RoleRow>(
          client,
          `SELECT ${projection} FROM roles r WHERE r.tenant_id=$1 AND r.deleted_at IS NULL AND r.role_name ILIKE $2 ORDER BY r.role_sort,r.id LIMIT $3 OFFSET $4`,
          [current.tenantId, `%${name}%`, page.pageSize, page.offset]
        )
        return ok(
          { list: result.map(dto), total: Number(count.total) },
          request.id
        )
      }
    )
  })
  server.get('/api/system/roles/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      ROLE_PERMISSIONS.detail,
      async (client, current) =>
        ok(
          dto(
            await read(
              client,
              current.tenantId,
              text(record(request.params).id, 'id', 100)
            )
          ),
          request.id
        )
    )
  })
  const save = async (request: FastifyRequest, update: boolean) => {
    const actor = await authenticate(pool, request)
    const id = update ? text(record(request.params).id, 'id', 100) : undefined
    const input = parseRole(request.body, update)
    return ok(
      await idempotent(
        pool,
        actor,
        update ? ROLE_PERMISSIONS.update : ROLE_PERMISSIONS.create,
        id ? `role:update:${id}` : 'role:create',
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const old = id
            ? await read(client, current.tenantId, id, true)
            : undefined
          if (old) {
            assertRevision(old.revision, input.expectedRevision as number)
            manage(current, old.permissions)
          }
          if (input.permissions.length || old?.permissions.length)
            requirePermission(current.permissions, ROLE_PERMISSIONS.permissions)
          await validateCodes(client, input.permissions)
          assertDelegation(current.permissions, input.permissions)
          const resource = id || randomUUID()
          const before = await governors(client, current.tenantId)
          if (
            (
              await rows(
                client,
                'SELECT id FROM roles WHERE tenant_id=$1 AND role_key=$2 AND id<>$3 AND deleted_at IS NULL',
                [current.tenantId, input.roleKey, resource]
              )
            ).length
          )
            throw new DomainError(409, 'ROLE_KEY_EXISTS', '角色标识已使用')
          if (old)
            await client.query(
              'UPDATE roles SET role_name=$3,role_key=$4,role_sort=$5,status=$6,remark=$7,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
              [
                current.tenantId,
                resource,
                input.roleName,
                input.roleKey,
                input.roleSort,
                input.status,
                input.remark,
              ]
            )
          else
            await client.query(
              'INSERT INTO roles (tenant_id,id,role_name,role_key,role_sort,status,remark) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [
                current.tenantId,
                resource,
                input.roleName,
                input.roleKey,
                input.roleSort,
                input.status,
                input.remark,
              ]
            )
          await client.query(
            'DELETE FROM role_permissions WHERE tenant_id=$1 AND role_id=$2',
            [current.tenantId, resource]
          )
          await client.query(
            'INSERT INTO role_permissions (tenant_id,role_id,permission_code) SELECT $1,$2,unnest($3::text[])',
            [current.tenantId, resource, input.permissions]
          )
          await assertGovernorTransition(client, current.tenantId, before)
          if (old) await touchRoleMembers(client, current.tenantId, resource)
          await audit(
            client,
            current,
            'system',
            old ? 'role.update' : 'role.create',
            'role',
            resource,
            'success',
            { permissions: input.permissions }
          )
          return dto(await read(client, current.tenantId, resource))
        },
        true
      ),
      request.id
    )
  }
  server.post('/api/system/roles', async (request) => save(request, false))
  server.put('/api/system/roles/:id', async (request) => save(request, true))
  server.delete('/api/system/roles/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const revision = positiveInteger(body.expectedRevision)
    return ok(
      await idempotent(
        pool,
        actor,
        ROLE_PERMISSIONS.delete,
        `role:delete:${id}`,
        scalarHeader(request, 'idempotency-key'),
        { expectedRevision: revision },
        async (client, current) => {
          const old = await read(client, current.tenantId, id, true)
          assertRevision(old.revision, revision)
          manage(current, old.permissions)
          if (
            (
              await rows(
                client,
                'SELECT user_id FROM member_roles WHERE tenant_id=$1 AND role_id=$2 LIMIT 1',
                [current.tenantId, id]
              )
            ).length
          )
            throw new DomainError(
              409,
              'ROLE_REFERENCED',
              '角色仍绑定成员，请先明确调整成员授权'
            )
          await client.query(
            'UPDATE roles SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
          await audit(client, current, 'system', 'role.delete', 'role', id)
          return null
        },
        true
      ),
      request.id
    )
  })
  server.get('/api/system/authorization-members', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      ROLE_PERMISSIONS.assign,
      async (client, current) => {
        const page = pageQuery(request.query)
        const filter =
          'WHERE m.tenant_id=$1 AND m.deleted_at IS NULL AND u.username ILIKE $2'
        const params = [current.tenantId, `%${page.keyword}%`]
        const count = one(
          await rows<{ total: string }>(
            client,
            `SELECT count(*) AS total FROM memberships m JOIN users u ON u.id=m.user_id ${filter}`,
            params
          )
        )
        const members = await rows<{
          id: string
          username: string
          name: string
          status: string
          revision: number
        }>(
          client,
          `SELECT m.user_id AS id,u.username,COALESCE(m.display_name,u.name) AS name,m.status,m.revision FROM memberships m JOIN users u ON u.id=m.user_id ${filter} ORDER BY m.user_id LIMIT $3 OFFSET $4`,
          [...params, page.pageSize, page.offset]
        )
        return ok({ list: members, total: Number(count.total) }, request.id)
      }
    )
  })
  const authorization = async (
    client: Pick<Pool, 'query'>,
    actor: Actor,
    id: string
  ) => {
    const member = one(
      await rows<{
        revision: number
        directPermissions: string[]
        effectivePermissions: string[]
      }>(
        client,
        'SELECT revision,permissions AS "directPermissions",af_effective_permissions(tenant_id,user_id) AS "effectivePermissions" FROM memberships WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL',
        [actor.tenantId, id]
      )
    )
    const assigned = await rows<{
      id: string
      roleName: string
      status: string
    }>(
      client,
      'SELECT r.id,r.role_name AS "roleName",r.status FROM member_roles mr JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id WHERE mr.tenant_id=$1 AND mr.user_id=$2 AND r.deleted_at IS NULL ORDER BY r.id',
      [actor.tenantId, id]
    )
    return { id, ...member, roles: assigned }
  }
  server.get('/api/system/users/:id/authorization', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(
      pool,
      actor,
      ROLE_PERMISSIONS.assign,
      async (client, current) =>
        ok(await authorization(client, current, id), request.id)
    )
  })
  server.post('/api/system/users/:id/authorization', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['roleIds', 'directPermissions', 'expectedRevision'])
    const input = {
      roleIds: roleIds(body.roleIds),
      directPermissions: permissionCodes(body.directPermissions),
      expectedRevision: positiveInteger(body.expectedRevision),
    }
    return ok(
      await idempotent(
        pool,
        actor,
        ROLE_PERMISSIONS.assign,
        `authorization:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const member = one(
            await rows<{
              revision: number
              permissions: string[]
              status: string
            }>(
              client,
              'SELECT revision,status,af_effective_permissions(tenant_id,user_id) AS permissions FROM memberships WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE',
              [current.tenantId, id]
            )
          )
          assertRevision(member.revision, input.expectedRevision)
          manage(current, member.permissions)
          if (member.status !== 'enabled')
            throw new DomainError(409, 'MEMBER_UNAVAILABLE', '成员已停用')
          await validateCodes(client, input.directPermissions)
          assertDelegation(current.permissions, input.directPermissions)
          const targets = await Promise.all(
            input.roleIds.map((roleId) =>
              read(client, current.tenantId, roleId)
            )
          )
          targets.forEach((target) => {
            if (target.status !== 'enabled')
              throw new DomainError(409, 'ROLE_UNAVAILABLE', '角色已停用')
            assertDelegation(current.permissions, target.permissions)
          })
          const before = await governors(client, current.tenantId)
          await client.query(
            'DELETE FROM member_roles WHERE tenant_id=$1 AND user_id=$2',
            [current.tenantId, id]
          )
          await client.query(
            'INSERT INTO member_roles (tenant_id,user_id,role_id) SELECT $1,$2,unnest($3::text[])',
            [current.tenantId, id, input.roleIds]
          )
          await client.query(
            'UPDATE memberships SET permissions=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND user_id=$2',
            [current.tenantId, id, JSON.stringify(input.directPermissions)]
          )
          await assertGovernorTransition(client, current.tenantId, before)
          await audit(
            client,
            current,
            'system',
            'authorization.update',
            'membership',
            id,
            'success',
            {
              roleIds: input.roleIds,
              directPermissions: input.directPermissions,
            }
          )
          return authorization(client, current, id)
        },
        true
      ),
      request.id
    )
  })
}
export default registerRoles
