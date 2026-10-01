import { DomainError, onlyKeys, record, text } from '@af-admin/contracts'
import { digest, hashPassword, newToken, verifyPassword } from './security'
import type { AuthUser, TenantContext, UserRole } from '@af-admin/contracts'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'

export interface Actor {
  userId: string
  name: string
  tenantId: string
  department: string
  role: UserRole
  permissions: string[]
  traceId: string
}
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
    department_name: string
    role: UserRole
    permissions: string[]
  }>(
    "SELECT m.department_name,m.role,m.permissions FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND t.status='enabled'",
    [tenantId, user.user_id]
  )
  if (!membership.rowCount)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  const info = membership.rows[0]
  return {
    userId: user.user_id,
    name: user.name,
    tenantId,
    department: info.department_name,
    role: info.role,
    permissions: info.permissions,
    traceId: request.id,
  }
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
    'SELECT t.id AS "tenantId",t.name,m.permissions,m.revision AS "permissionVersion" FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.status=\'enabled\' AND t.status=\'enabled\' ORDER BY t.id',
    [userId]
  )
  return result.rows
}
export const registerAuth = (server: FastifyInstance, pool: Pool) => {
  const attempts = new Map<string, { count: number; until: number }>()
  const throttle = (key: string, maximum: number) => {
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
    if (value.count > maximum)
      throw new DomainError(429, 'RATE_LIMITED', '登录尝试过于频繁，请稍后再试')
  }
  const dummyPassword = hashPassword(newToken())
  server.post('/api/user/login', async (request) => {
    throttle(`ip:${request.ip}`, 30)
    const body = record(request.body)
    onlyKeys(body, ['username', 'password'])
    const username = text(body.username, 'username', 100)
    const password = text(body.password, 'password', 200)
    throttle(`account:${username}`, 10)
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
    await pool.query(
      "INSERT INTO sessions (token_hash,user_id,default_tenant_id,expires_at) VALUES ($1,$2,$3,now()+interval '8 hours')",
      [digest(token), user.id, tenants[0].tenantId]
    )
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
    await authenticate(pool, request)
    await pool.query(
      'UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',
      [digest(scalarHeader(request, 'x-access-token') || '')]
    )
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
  server.post('/api/tenants/switch', async (request) => {
    const actor = await authenticate(pool, request)
    const body = record(request.body)
    onlyKeys(body, ['tenantId'])
    const selected = (await tenantContexts(pool, actor.userId)).find(
      (context) => context.tenantId === body.tenantId
    )
    if (!selected) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
    // A switch validates membership but never changes another tab's session default.
    return { code: 20000, data: selected, traceId: request.id }
  })
}
