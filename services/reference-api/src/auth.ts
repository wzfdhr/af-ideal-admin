import {
  DomainError,
  createR1Menu,
  onlyKeys,
  record,
  text,
  withSelfServicePermissions,
} from '@af-admin/contracts'
import { requirePermission } from '@af-admin/workflow-core'
import { digest, hashPassword, newToken, verifyPassword } from './security'
import { transaction } from './database'
import type { AuthUser, TenantContext, UserRole } from '@af-admin/contracts'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Pool } from 'pg'

export interface Actor {
  userId: string
  name: string
  tenantId: string
  department: string
  role: UserRole
  permissions: string[]
  traceId: string
  sessionEpoch: number
  sessionHash: string
}
const authenticatedActors = new WeakMap<FastifyRequest, Actor>()
export const getAuthenticatedActor = (request: FastifyRequest) =>
  authenticatedActors.get(request)
export const scalarHeader = (request: FastifyRequest, name: string) => {
  const value = request.headers[name]
  return typeof value === 'string' ? value : undefined
}
export const authenticate = async (
  pool: Pool,
  request: FastifyRequest
): Promise<Actor> => {
  const token = scalarHeader(request, 'x-access-token')
  if (!token || token.length > 200)
    throw new DomainError(401, 'UNAUTHORIZED', '登录已过期，请重新登录')
  const session = await pool.query<{
    user_id: string
    default_tenant_id: string
    name: string
  }>(
    "SELECT s.user_id,s.default_tenant_id,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='enabled'",
    [digest(token)]
  )
  if (!session.rowCount)
    throw new DomainError(401, 'UNAUTHORIZED', '登录已过期，请重新登录')
  const user = session.rows[0]
  const tenantId =
    scalarHeader(request, 'x-tenant-id') || user.default_tenant_id
  const membership = await pool.query<{
    name: string
    session_epoch: number
    department_name: string
    role: UserRole
    permissions: string[]
  }>(
    "SELECT m.session_epoch,COALESCE(m.display_name,u.name) AS name,COALESCE(d.department_name,m.department_name) AS department_name,m.role,af_effective_permissions(m.tenant_id,m.user_id) AS permissions FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id LEFT JOIN departments d ON d.tenant_id=m.tenant_id AND d.id=m.department_id AND d.deleted_at IS NULL WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND t.status='enabled' AND u.status='enabled'",
    [tenantId, user.user_id]
  )
  if (!membership.rowCount)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  const info = membership.rows[0]
  const scope = await pool.query<{ epoch: number }>(
    'SELECT epoch FROM session_scopes WHERE token_hash=$1 AND tenant_id=$2 AND user_id=$3',
    [digest(token), tenantId, user.user_id]
  )
  if (scope.rows[0]?.epoch !== info.session_epoch)
    throw new DomainError(
      401,
      'SESSION_SCOPE_REVOKED',
      '当前租户会话已失效，请重新登录'
    )
  const actor: Actor = {
    userId: user.user_id,
    name: info.name,
    tenantId,
    department: info.department_name,
    role: info.role,
    permissions: withSelfServicePermissions(info.permissions),
    traceId: request.id,
    sessionEpoch: info.session_epoch,
    sessionHash: digest(token),
  }
  authenticatedActors.set(request, actor)
  return actor
}
export const tenantContexts = async (
  pool: Pool,
  userId: string
): Promise<TenantContext[]> => {
  const result = await pool.query<{
    tenantId: string
    name: string
    permissions: string[]
    permissionVersion: number
  }>(
    'SELECT t.id AS "tenantId",t.name,af_effective_permissions(m.tenant_id,m.user_id) AS permissions,m.revision AS "permissionVersion" FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.status=\'enabled\' AND t.status=\'enabled\' ORDER BY t.id',
    [userId]
  )
  return result.rows.map((context) => ({
    ...context,
    permissions: withSelfServicePermissions(context.permissions),
  }))
}
export const registerAuth = (server: FastifyInstance, pool: Pool) => {
  const attempts = new Map<string, { count: number; until: number }>()
  const throttle = (key: string, maximum: number, reply: FastifyReply) => {
    const now = Date.now()
    const current = attempts.get(key)
    const value =
      current && current.until > now
        ? current
        : { count: 0, until: now + 60000 }
    value.count += 1
    attempts.set(key, value)
    if (attempts.size > 5000) {
      attempts.forEach((bucket, entry) => {
        if (bucket.until <= now) attempts.delete(entry)
      })
      if (attempts.size > 5000)
        attempts.delete(attempts.keys().next().value as string)
    }
    if (value.count > maximum) {
      reply.header(
        'Retry-After',
        Math.max(1, Math.ceil((value.until - now) / 1000))
      )
      throw new DomainError(429, 'RATE_LIMITED', '登录尝试过于频繁，请稍后再试')
    }
  }
  const dummyPassword = hashPassword(newToken())
  server.post('/api/user/login', async (request, reply) => {
    throttle(`ip:${request.ip}`, 30, reply)
    const body = record(request.body)
    onlyKeys(body, ['username', 'password'])
    const username = text(body.username, 'username', 100)
    if (
      typeof body.password !== 'string' ||
      !body.password ||
      body.password.length > 200
    )
      throw new DomainError(422, 'VALIDATION_ERROR', '密码输入无效')
    const { password } = body
    throttle(`account:${username}`, 10, reply)
    const users = await pool.query<{
      id: string
      password_hash: string
      status: string
    }>('SELECT id,password_hash,status FROM users WHERE username=$1', [
      username,
    ])
    const user = users.rows[0]
    const correct = await verifyPassword(
      password,
      user ? user.password_hash : await dummyPassword
    )
    if (!user || user.status !== 'enabled' || !correct)
      throw new DomainError(401, 'LOGIN_FAILED', '用户名或密码错误')
    const tenants = await tenantContexts(pool, user.id)
    if (!tenants.length)
      throw new DomainError(403, 'FORBIDDEN', '没有可访问的租户')
    const token = newToken()
    await transaction(pool, async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`credential:${user.id}`]
      )
      const locked = await client.query<{
        password_hash: string
        status: string
      }>('SELECT password_hash,status FROM users WHERE id=$1 FOR SHARE', [
        user.id,
      ])
      if (
        locked.rows[0]?.status !== 'enabled' ||
        locked.rows[0]?.password_hash !== user.password_hash
      )
        throw new DomainError(401, 'LOGIN_FAILED', '用户名或密码错误')
      const available = await client.query<{ tenant_id: string }>(
        "SELECT m.tenant_id FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND t.status='enabled' ORDER BY m.tenant_id FOR SHARE OF m,t",
        [user.id]
      )
      if (!available.rowCount)
        throw new DomainError(403, 'FORBIDDEN', '没有可访问的租户')
      await client.query(
        "INSERT INTO sessions (token_hash,user_id,default_tenant_id,expires_at) VALUES ($1,$2,$3,now()+interval '8 hours')",
        [digest(token), user.id, available.rows[0].tenant_id]
      )
      await client.query(
        "INSERT INTO session_scopes (token_hash,tenant_id,user_id,epoch) SELECT $1,m.tenant_id,m.user_id,m.session_epoch FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND t.status='enabled'",
        [digest(token), user.id]
      )
      await client.query(
        "INSERT INTO audit_events (tenant_id,id,actor_id,actor_name,module,action,result,target_type,target_id,trace_id) SELECT $1,$2,id,name,'auth','login','success','session',$3,$4 FROM users WHERE id=$3",
        [available.rows[0].tenant_id, newToken(), user.id, request.id]
      )
    })
    return { code: 20000, data: { token }, traceId: request.id }
  })
  const info = async (request: FastifyRequest) => {
    const actor = await authenticate(pool, request)
    const user: AuthUser = {
      id: actor.userId,
      name: actor.name,
      role: actor.role,
      permissions: actor.permissions,
      dept: actor.department,
      avatar: '',
      tenantId: actor.tenantId,
      tenants: await tenantContexts(pool, actor.userId),
    }
    return { code: 20000, data: user, traceId: request.id }
  }
  server.get('/api/user/info', info)
  server.post('/api/user/info', info)
  server.post('/api/user/logout', async (request) => {
    const actor = await authenticate(pool, request)
    await transaction(pool, async (client) => {
      await client.query(
        'UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',
        [digest(scalarHeader(request, 'x-access-token') || '')]
      )
      await client.query(
        "INSERT INTO audit_events (tenant_id,id,actor_id,actor_name,module,action,result,target_type,target_id,trace_id) VALUES ($1,$2,$3,$4,'auth','logout','success','session',$3,$5)",
        [actor.tenantId, newToken(), actor.userId, actor.name, request.id]
      )
    })
    return { code: 20000, data: null, traceId: request.id }
  })
  server.get('/api/tenants', async (request) => {
    const actor = await authenticate(pool, request)
    const contexts = await tenantContexts(pool, actor.userId)
    return {
      code: 20000,
      data: {
        list: contexts.map((tenant) => ({
          id: tenant.tenantId,
          name: tenant.name,
          code: tenant.tenantId,
          status: 'enabled',
          current: tenant.tenantId === actor.tenantId,
        })),
        total: contexts.length,
      },
      traceId: request.id,
    }
  })
  server.get('/api/tenants/:id/context', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const selected = (await tenantContexts(pool, actor.userId)).find(
      (context) => context.tenantId === id
    )
    if (!selected) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
    return {
      code: 20000,
      data: {
        ...selected,
        currentTenant: {
          id,
          name: selected.name,
          code: id,
          status: 'enabled',
          current: true,
          brandName: selected.name,
          themeColor: '#165dff',
        },
        orgTree: [],
        dataScopes: [],
      },
      traceId: request.id,
    }
  })
  server.get('/api/tenants/:id/members', async (request) => {
    const actor = await authenticate(pool, request)
    const tenantId = text(record(request.params).id, 'id', 100)
    if (tenantId !== actor.tenantId)
      throw new DomainError(404, 'NOT_FOUND', '资源不存在')
    requirePermission(actor.permissions, 'application:configure')
    const members = await pool.query<{
      id: string
      name: string
      permissions: string[]
    }>(
      "SELECT m.user_id AS id,COALESCE(m.display_name,u.name) AS name,af_effective_permissions(m.tenant_id,m.user_id) AS permissions FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' ORDER BY COALESCE(m.display_name,u.name),m.user_id",
      [tenantId]
    )
    return {
      code: 20000,
      data: members.rows.map((member) => ({
        id: member.id,
        name: member.name,
        canApprove: ['workflow:approve', 'workflow:reject'].every(
          (permission) =>
            member.permissions.includes(permission) ||
            member.permissions.includes('*')
        ),
      })),
      traceId: request.id,
    }
  })
  server.post('/api/tenants/switch', async (request) => {
    const actor = await authenticate(pool, request)
    const body = record(request.body)
    onlyKeys(body, ['tenantId'])
    const target = text(body.tenantId, 'tenantId', 100)
    const selected = (await tenantContexts(pool, actor.userId)).find(
      (context) => context.tenantId === target
    )
    if (!selected) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
    // A switch validates membership but never changes another tab's session default.
    return { code: 20000, data: selected, traceId: request.id }
  })
  const menu = async (request: FastifyRequest) => {
    const actor = await authenticate(pool, request)
    return {
      code: 20000,
      data: createR1Menu(actor.permissions),
      traceId: request.id,
    }
  }
  server.get('/api/user/menu', menu)
  server.post('/api/user/menu', menu)
}
