import { randomUUID } from 'node:crypto'
import {
  DomainError,
  invalid,
  withSelfServicePermissions,
} from '@af-admin/contracts'
import { requirePermission, hasPermission } from '@af-admin/workflow-core'
import { transaction } from './database'
import { digest } from './security'
import type { Actor } from './auth'
import type { Pool, PoolClient, QueryResultRow } from 'pg'
import type { Json, JsonObject, UserRole } from '@af-admin/contracts'

export type Database = Pick<Pool, 'query'>
export type FaultInjector = (point: string) => void
export const noFault: FaultInjector = () => undefined
export const rows = async <T extends QueryResultRow>(
  db: Database,
  sql: string,
  values: unknown[] = []
): Promise<T[]> => (await db.query<T>(sql, values)).rows
export const notFound = (): never => {
  throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}
export const one = <T>(items: T[]): T => items[0] || notFound()
export const pageQuery = (input: unknown) => {
  const query = (input || {}) as Record<string, unknown>
  const current = Number(query.current || 1)
  const pageSize = Number(query.pageSize || 10)
  if (
    !Number.isSafeInteger(current) ||
    current < 1 ||
    current > 1000000 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    invalid('pagination', '分页参数无效')
  return {
    current,
    pageSize,
    offset: (current - 1) * pageSize,
    keyword:
      typeof query.keyword === 'string' ? query.keyword.slice(0, 100) : '',
  }
}
export const sequential = <T>(items: T[], run: (item: T) => Promise<void>) =>
  items.reduce(async (previous, item) => {
    await previous
    await run(item)
  }, Promise.resolve())

const refreshActor = async (
  client: PoolClient,
  actor: Actor
): Promise<Actor> => {
  const membership = one(
    await rows<{
      permissions: string[]
      department_name: string
      role: UserRole
      name: string
    }>(
      client,
      "SELECT m.permissions,COALESCE(d.department_name,m.department_name) AS department_name,m.role,COALESCE(m.display_name,u.name) AS name FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id LEFT JOIN departments d ON d.tenant_id=m.tenant_id AND d.id=m.department_id AND d.deleted_at IS NULL WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND m.session_epoch=$3 AND u.status='enabled' AND t.status='enabled' AND EXISTS (SELECT 1 FROM sessions s WHERE s.token_hash=$4 AND s.user_id=m.user_id AND s.revoked_at IS NULL AND s.expires_at>now()) FOR SHARE OF m,u,t",
      [actor.tenantId, actor.userId, actor.sessionEpoch, actor.sessionHash]
    )
  )
  return {
    ...actor,
    permissions: withSelfServicePermissions(membership.permissions),
    department: membership.department_name,
    role: membership.role,
    name: membership.name,
  }
}
export const authorizedTransaction = <T>(
  pool: Pool,
  actor: Actor,
  permission: string,
  run: (client: PoolClient, current: Actor) => Promise<T>,
  exclusiveTenant = false,
  identityGate = ''
) =>
  transaction(pool, async (client) => {
    if (identityGate)
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [identityGate]
      )
    one(
      await rows<{ id: string }>(
        client,
        `SELECT id FROM tenants WHERE id=$1 AND status='enabled' FOR ${
          exclusiveTenant ? 'UPDATE' : 'SHARE'
        }`,
        [actor.tenantId]
      )
    )
    const current = await refreshActor(client, actor)
    requirePermission(current.permissions, permission)
    return run(client, current)
  })
const canonical = (input: Json): Json => {
  if (Array.isArray(input)) return input.map(canonical)
  if (input !== null && typeof input === 'object') {
    const output: JsonObject = {}
    Object.keys(input)
      .sort()
      .forEach((key) => {
        output[key] = canonical(input[key])
      })
    return output
  }
  return input
}
export const contentHash = (input: unknown) =>
  digest(JSON.stringify(canonical(JSON.parse(JSON.stringify(input)) as Json)))
export const idempotent = <T>(
  pool: Pool,
  actor: Actor,
  permission: string,
  operation: string,
  key: string | undefined,
  payload: unknown,
  run: (client: PoolClient, current: Actor) => Promise<T>,
  exclusiveTenant = false,
  identityGate = ''
): Promise<T> => {
  if (!key || key.length < 8 || key.length > 200)
    invalid('Idempotency-Key', '写命令必须提供有效的 Idempotency-Key')
  const requestHash = contentHash(payload)
  return authorizedTransaction(
    pool,
    actor,
    permission,
    async (client, current) => {
      const scope = JSON.stringify([
        current.tenantId,
        current.userId,
        operation,
        key,
      ])
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [scope]
      )
      await client.query(
        'DELETE FROM idempotency_records WHERE tenant_id=$1 AND actor_id=$2 AND operation=$3 AND key=$4 AND expires_at<=now()',
        [current.tenantId, current.userId, operation, key]
      )
      const previous = await rows<{ request_hash: string; response: T }>(
        client,
        'SELECT request_hash,response FROM idempotency_records WHERE tenant_id=$1 AND actor_id=$2 AND operation=$3 AND key=$4',
        [current.tenantId, current.userId, operation, key]
      )
      if (previous.length) {
        if (previous[0].request_hash !== requestHash)
          throw new DomainError(
            409,
            'IDEMPOTENCY_CONFLICT',
            '同一个重试标识不能用于不同内容'
          )
        return previous[0].response
      }
      const result = await run(client, current)
      await client.query(
        'INSERT INTO idempotency_records (tenant_id,actor_id,operation,key,request_hash,response) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          current.tenantId,
          current.userId,
          operation,
          key,
          requestHash,
          JSON.stringify(result),
        ]
      )
      return result
    },
    exclusiveTenant,
    identityGate
  )
}
export const audit = async (
  db: Database,
  actor: Actor,
  module: string,
  action: string,
  targetType: string,
  targetId: string,
  result: 'success' | 'failure' = 'success',
  detail: JsonObject = {}
) => {
  await db.query(
    'INSERT INTO audit_events (tenant_id,id,actor_id,actor_name,module,action,result,target_type,target_id,trace_id,detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [
      actor.tenantId,
      randomUUID(),
      actor.userId,
      actor.name,
      module,
      action,
      result,
      targetType,
      targetId,
      actor.traceId,
      JSON.stringify(detail),
    ]
  )
}
export const enqueue = async (
  db: Database,
  actor: Actor,
  recipientId: string,
  requestId: string,
  title: string,
  category = 'message',
  kind: 'status' | 'copy' = 'status'
) => {
  const membership = one(
    await rows<{ permissions: string[] }>(
      db,
      'SELECT permissions FROM memberships WHERE tenant_id=$1 AND user_id=$2',
      [actor.tenantId, recipientId]
    )
  )
  const canReadBusiness = ['leave:read:self', 'workflow:todo'].some(
    (permission) => hasPermission(membership.permissions, permission)
  )
  const target = encodeURIComponent(requestId)
  let link = `/leave/requests/${target}`
  if (kind === 'copy' && !canReadBusiness) {
    link = hasPermission(membership.permissions, 'audit:read')
      ? `/audit/logs?targetId=${target}`
      : '/leave/application'
  }
  await db.query(
    'INSERT INTO outbox (tenant_id,id,recipient_id,payload) VALUES ($1,$2,$3,$4)',
    [
      actor.tenantId,
      randomUUID(),
      recipientId,
      JSON.stringify({
        title,
        content:
          kind === 'copy'
            ? '请查看授权范围内的流程记录'
            : '请打开申请详情查看当前状态',
        category,
        link,
        requestId,
        access: kind === 'copy' && canReadBusiness ? 'copy' : 'none',
      }),
    ]
  )
}
