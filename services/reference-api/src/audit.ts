import { randomUUID } from 'node:crypto'
import {
  AUDIT_PERMISSIONS,
  AUDIT_PROJECTION_VERSION,
  AUDIT_EVENT_TYPES,
  AUDIT_RESULTS,
  parseAuditQuery,
  parseAuditQueryV2,
  record,
  invalid,
} from '@af-admin/contracts'
import { authenticate } from './auth'
import { authorizedTransaction, noFault } from './support'
import { queryAuditEvents, queryAuditEventsV2 } from './audit-query'
import { auditCatalogue } from './audit-policy'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type { FaultInjector } from './support'

/** The only legacy bridge preserves two positional dates, including an empty left boundary. */
export const auditHttpQuery = (input: unknown) => {
  const transport = record(input, 'query')
  // Fastify's parser uses its own null-prototype class. Copy only validated
  // own data properties before applying the strict shared domain contract.
  const entries: [string, unknown][] = []
  Reflect.ownKeys(transport).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(transport, key)
    if (
      typeof key !== 'string' ||
      !descriptor ||
      !('value' in descriptor) ||
      !descriptor.enumerable
    )
      invalid('query', '查询不接受符号、隐藏字段或访问器')
    entries.push([key as string, descriptor?.value])
  })
  const query = Object.fromEntries(entries)
  const old = Object.hasOwn(query, 'dateRange')
  const brackets = Object.hasOwn(query, 'dateRange[]')
  if (old && brackets) invalid('dateRange', '日期参数存在歧义')
  if (query.version === '2' || query.version === 2) {
    if (old || brackets) invalid('dateRange', '查询v2必须使用独立日期参数')
    return parseAuditQueryV2(query)
  }
  if (!old && !brackets) return parseAuditQuery(query)
  if (Object.hasOwn(query, 'from') || Object.hasOwn(query, 'to'))
    invalid('dateRange', '不能混用旧日期和独立日期参数')
  const dates = query[old ? 'dateRange' : 'dateRange[]']
  if (
    !Array.isArray(dates) ||
    dates.length !== 2 ||
    dates.some((value) => typeof value !== 'string')
  )
    invalid('dateRange', '旧日期必须保留两个明确位置')
  const rest = Object.fromEntries(
    Object.entries(query).filter(
      ([key]) => !['dateRange', 'dateRange[]'].includes(key)
    )
  )
  return parseAuditQuery({
    ...rest,
    from: (dates as string[])[0],
    to: (dates as string[])[1],
  })
}
export const registerAudit = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/audit/events', async (request) => {
    const actor = await authenticate(pool, request)
    const query = auditHttpQuery(request.query)
    return authorizedTransaction(
      pool,
      actor,
      AUDIT_PERMISSIONS.read,
      async (db, current) =>
        ok(
          await (query.version === 2
            ? queryAuditEventsV2(db, current, query)
            : queryAuditEvents(db, current, query)),
          request.id
        )
    )
  })
  server.get('/api/audit/catalogue', async (request) => {
    const actor = await authenticate(pool, request)
    if (Object.keys(record(request.query)).length)
      invalid('query', '目录不接受筛选或事实字段')
    return authorizedTransaction(
      pool,
      actor,
      AUDIT_PERMISSIONS.read,
      async () =>
        ok(
          {
            version: 1,
            source: 'server',
            projectionVersion: AUDIT_PROJECTION_VERSION,
            modules: auditCatalogue.map(({ module, label }) => ({
              code: module,
              label,
            })),
            actions: auditCatalogue.flatMap(({ module, actions }) =>
              actions.map((action) => ({ module, ...action }))
            ),
            eventTypes: AUDIT_EVENT_TYPES,
            results: AUDIT_RESULTS,
          },
          request.id
        )
    )
  })
  server.post('/api/audit/events', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        const id = randomUUID()
        await db.query(
          'INSERT INTO client_telemetry(tenant_id,id,actor_id,trace_id) VALUES($1,$2,$3,$4)',
          [current.tenantId, id, current.userId, request.id]
        )
        fault('audit:telemetry-stored')
        return ok({ id, source: 'browser' }, request.id)
      }
    )
  })
}
