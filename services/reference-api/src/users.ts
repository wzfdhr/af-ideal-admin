import { randomUUID } from 'node:crypto'
import {
  USER_PERMISSIONS,
  DomainError,
  parseUserCreate,
  parseUserUpdate,
  privatePassword,
  maskPhone,
  maskEmail,
  onlyKeys,
  record,
  positiveInteger,
  text,
} from '@af-admin/contracts'
import {
  hasPermission,
  requirePermission,
  assertRevision,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import { hashPassword } from './security'
import {
  audit,
  idempotent,
  one,
  rows,
  pageQuery,
  authorizedTransaction,
} from './support'
import type { Actor } from './auth'
import type { FastifyInstance } from 'fastify'
import type { Pool, PoolClient } from 'pg'

interface UserRow {
  id: string
  username: string
  name: string
  phone: string
  email: string
  dept: string
  status: string
  role: string
  revision: number
  created_at: Date
  updated_at: Date
  owner_tenant_id: string | null
}
const projection =
  'm.user_id AS id,u.username,COALESCE(m.display_name,u.name) AS name,m.phone,m.email,COALESCE(d.department_name,m.department_name) AS dept,m.status,m.role,m.revision,m.created_at,m.updated_at,u.owner_tenant_id'
const sources =
  'FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN departments d ON d.tenant_id=m.tenant_id AND d.id=m.department_id AND d.deleted_at IS NULL'
const dto = (value: UserRow, actor: Actor, forceMask = false) => ({
  id: value.id,
  username: value.username,
  name: value.name,
  phone:
    !forceMask &&
    hasPermission(actor.permissions, USER_PERMISSIONS.readContacts)
      ? value.phone
      : maskPhone(value.phone),
  email:
    !forceMask &&
    hasPermission(actor.permissions, USER_PERMISSIONS.readContacts)
      ? value.email
      : maskEmail(value.email),
  contactsMasked:
    forceMask ||
    !hasPermission(actor.permissions, USER_PERMISSIONS.readContacts),
  dept: value.dept,
  status: value.status,
  role: value.role,
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
    await rows<UserRow>(
      client,
      `SELECT ${projection} ${sources} WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.deleted_at IS NULL${
        lock ? ' FOR UPDATE OF m' : ''
      }`,
      [tenantId, id]
    )
  )
const preserveGovernor = async (
  client: PoolClient,
  actor: Actor,
  id: string
) => {
  const required = [
    USER_PERMISSIONS.create,
    USER_PERMISSIONS.update,
    USER_PERMISSIONS.delete,
  ]
  const governors = await rows<{ user_id: string; permissions: string[] }>(
    client,
    "SELECT m.user_id,m.permissions FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled'",
    [actor.tenantId]
  )
  const available = governors.filter((member) =>
    required.every((permission) =>
      hasPermission(member.permissions, permission)
    )
  )
  if (
    available.some((member) => member.user_id === id) &&
    !available.some((member) => member.user_id !== id)
  )
    throw new DomainError(
      409,
      'LAST_ADMINISTRATOR',
      '必须保留至少一名有效用户管理员'
    )
  const pending = one(
    await rows<{ total: string }>(
      client,
      "SELECT count(*) AS total FROM workflow_tasks t JOIN workflow_instances i ON i.tenant_id=t.tenant_id AND i.id=t.instance_id WHERE t.tenant_id=$1 AND t.assignee_id=$2 AND t.status='pending' AND i.status='running'",
      [actor.tenantId, id]
    )
  )
  if (Number(pending.total))
    throw new DomainError(
      409,
      'MEMBER_HAS_PENDING_TASKS',
      '成员仍有待处理审批，请先处理或转交'
    )
}

export const registerUsers = (server: FastifyInstance, pool: Pool) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/system/users', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      USER_PERMISSIONS.list,
      async (client, current) => {
        const query = record(request.query)
        const page = pageQuery(query)
        const username =
          typeof query.username === 'string' ? query.username.slice(0, 64) : ''
        const status = typeof query.status === 'string' ? query.status : ''
        if (status && !['enabled', 'disabled'].includes(status))
          throw new DomainError(422, 'VALIDATION_ERROR', '成员状态筛选无效')
        if (
          query.phone &&
          !hasPermission(current.permissions, USER_PERMISSIONS.readContacts)
        )
          throw new DomainError(403, 'FORBIDDEN', '没有查询联系资料的权限')
        const phone =
          typeof query.phone === 'string' ? query.phone.slice(0, 30) : ''
        const params = [current.tenantId, `%${username}%`, status, `%${phone}%`]
        const filter =
          "WHERE m.tenant_id=$1 AND m.deleted_at IS NULL AND u.username ILIKE $2 AND ($3='' OR m.status=$3) AND m.phone LIKE $4"
        const count = one(
          await rows<{ total: string }>(
            client,
            `SELECT count(*) AS total ${sources} ${filter}`,
            params
          )
        )
        const values = await rows<UserRow>(
          client,
          `SELECT ${projection} ${sources} ${filter} ORDER BY m.user_id LIMIT $5 OFFSET $6`,
          [...params, page.pageSize, page.offset]
        )
        return ok(
          {
            list: values.map((value) => dto(value, current)),
            total: Number(count.total),
          },
          request.id
        )
      }
    )
  })
  server.get('/api/system/users/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      USER_PERMISSIONS.detail,
      async (client, current) => {
        return ok(
          dto(
            await read(
              client,
              current.tenantId,
              text(record(request.params).id, 'id', 100)
            ),
            current
          ),
          request.id
        )
      }
    )
  })
  server.post('/api/system/users', async (request) => {
    const actor = await authenticate(pool, request)
    requirePermission(actor.permissions, USER_PERMISSIONS.create)
    const input = parseUserCreate(request.body)
    const passwordHash = await hashPassword(input.initialPassword)
    try {
      return ok(
        await idempotent(
          pool,
          actor,
          USER_PERMISSIONS.create,
          'user:create',
          scalarHeader(request, 'idempotency-key'),
          input,
          async (client, current) => {
            const id = randomUUID()
            if (
              (
                await rows(client, 'SELECT id FROM users WHERE username=$1', [
                  input.username,
                ])
              ).length
            )
              throw new DomainError(409, 'USERNAME_UNAVAILABLE', '用户名不可用')
            await client.query(
              'INSERT INTO users (id,username,name,password_hash,owner_tenant_id) VALUES ($1,$2,$3,$4,$5)',
              [id, input.username, input.name, passwordHash, current.tenantId]
            )
            await client.query(
              "INSERT INTO memberships (tenant_id,user_id,display_name,phone,email,department_name,role,permissions,status) VALUES ($1,$2,$3,$4,$5,'未分配','user','[]',$6)",
              [
                current.tenantId,
                id,
                input.name,
                input.phone,
                input.email,
                input.status,
              ]
            )
            await audit(
              client,
              current,
              'system',
              'user.create',
              'membership',
              id
            )
            return dto(await read(client, current.tenantId, id), current, true)
          },
          true
        ),
        request.id
      )
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new DomainError(409, 'USERNAME_UNAVAILABLE', '用户名不可用')
      throw error
    }
  })
  server.put('/api/system/users/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const input = parseUserUpdate(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        USER_PERMISSIONS.update,
        `user:update:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const old = await read(client, current.tenantId, id, true)
          assertRevision(old.revision, input.expectedRevision)
          if (input.status === 'disabled' && old.status !== 'disabled')
            await preserveGovernor(client, current, id)
          await client.query(
            "UPDATE memberships SET display_name=$3,phone=$4,email=$5,status=$6,session_epoch=session_epoch+CASE WHEN status='enabled' AND $6='disabled' THEN 1 ELSE 0 END,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND user_id=$2",
            [
              current.tenantId,
              id,
              input.name ?? old.name,
              input.phone ?? old.phone,
              input.email ?? old.email,
              input.status ?? old.status,
            ]
          )
          await audit(
            client,
            current,
            'system',
            'user.update',
            'membership',
            id
          )
          return dto(await read(client, current.tenantId, id), current, true)
        },
        true
      ),
      request.id
    )
  })
  server.delete('/api/system/users/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const revision = positiveInteger(body.expectedRevision)
    return ok(
      await idempotent(
        pool,
        actor,
        USER_PERMISSIONS.delete,
        `user:delete:${id}`,
        scalarHeader(request, 'idempotency-key'),
        { expectedRevision: revision },
        async (client, current) => {
          const old = await read(client, current.tenantId, id, true)
          assertRevision(old.revision, revision)
          await preserveGovernor(client, current, id)
          await client.query(
            "UPDATE memberships SET status='disabled',deleted_at=now(),updated_at=now(),session_epoch=session_epoch+1,revision=revision+1 WHERE tenant_id=$1 AND user_id=$2",
            [current.tenantId, id]
          )
          await audit(
            client,
            current,
            'system',
            'user.delete',
            'membership',
            id
          )
          return null
        },
        true
      ),
      request.id
    )
  })
  server.post('/api/system/users/:id/reset-password', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['initialPassword', 'expectedRevision'])
    requirePermission(actor.permissions, USER_PERMISSIONS.resetPassword)
    const input = {
      initialPassword: privatePassword(body.initialPassword),
      expectedRevision: positiveInteger(body.expectedRevision),
    }
    const passwordHash = await hashPassword(input.initialPassword)
    return ok(
      await idempotent(
        pool,
        actor,
        USER_PERMISSIONS.resetPassword,
        `user:password:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const member = await read(client, current.tenantId, id, true)
          assertRevision(member.revision, input.expectedRevision)
          if (member.owner_tenant_id !== current.tenantId)
            throw new DomainError(
              409,
              'EXTERNAL_IDENTITY',
              '该身份由外部管理，请使用本人修改密码路径'
            )
          await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
            id,
          ])
          const shared = one(
            await rows<{ total: string }>(
              client,
              'SELECT count(*) AS total FROM memberships WHERE user_id=$1 AND tenant_id<>$2',
              [id, current.tenantId]
            )
          )
          if (Number(shared.total))
            throw new DomainError(
              409,
              'EXTERNAL_IDENTITY',
              '该身份由外部管理，请使用本人修改密码路径'
            )
          await client.query(
            'UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',
            [id, passwordHash]
          )
          await client.query(
            'UPDATE memberships SET revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND user_id=$2',
            [current.tenantId, id]
          )
          await client.query(
            'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
            [id]
          )
          await audit(
            client,
            current,
            'system',
            'user.password-reset',
            'membership',
            id
          )
          return { id, revision: member.revision + 1 }
        },
        true
      ),
      request.id
    )
  })
}
export default registerUsers
