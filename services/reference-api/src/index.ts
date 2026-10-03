import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import { DomainError } from '@af-admin/contracts'
import { registerWorkflowRecovery } from './workflow-recovery'
import { createPool } from './database'
import { registerAuth, getAuthenticatedActor } from './auth'
import { registerBusiness } from './routes'
import { audit, noFault } from './support'
import { alertConfigurationAdmins } from './alerts'
import { verifyMigrationReadiness } from './migrate'
import { registerOrganization } from './organization'
import { registerPositions } from './positions'
import { registerUsers } from './users'
import { registerCredentials } from './credentials'
import { registerFormDataSources } from './form-data-sources'
import { registerDictionaries } from './dictionaries'
import { registerRoles } from './roles'
import { registerApplicationPackages } from './application-packages'
import { registerFiles } from './files'
import { registerBusinessRecords } from './business-records'
import { registerApplicationCenter } from './application-center'
import { registerDataScopes } from './data-scopes'
import type { FileRuntime } from './files'
import type { FaultInjector } from './support'
import type { Pool } from 'pg'

export const createServer = (
  database?: Pool,
  fault: FaultInjector = noFault,
  files: FileRuntime = {}
) => {
  const pool = database || createPool()
  const server = Fastify({
    logger: false,
    bodyLimit: 65536,
    genReqId: () => randomUUID(),
  })
  if (!database)
    server.addHook('onResponse', async (request, reply) => {
      process.stdout.write(
        `${JSON.stringify({
          traceId: request.id,
          route: request.routeOptions.url || 'unknown',
          httpStatus: reply.statusCode,
          at: new Date().toISOString(),
        })}\n`
      )
    })
  server.setErrorHandler(async (error, request, reply) => {
    let failure = new DomainError(500, 'INTERNAL_ERROR', '服务暂时不可用')
    if (error instanceof DomainError) failure = error
    else if (
      [400, 413].includes(Number((error as { statusCode?: number }).statusCode))
    )
      failure = new DomainError(
        422,
        'INVALID_REQUEST',
        '请求格式或内容大小无效',
        { body: ['请检查请求格式和内容大小'] }
      )
    const actor = getAuthenticatedActor(request)
    try {
      if (actor)
        await audit(
          pool,
          actor,
          'request',
          request.routeOptions.url || 'unknown',
          'request',
          request.id,
          'failure',
          { businessCode: failure.businessCode }
        )
      else if (request.routeOptions.url === '/api/user/login')
        await pool.query(
          'INSERT INTO auth_failures (trace_id,business_code) VALUES ($1,$2)',
          [request.id, failure.businessCode]
        )
      if (
        actor &&
        [
          'NEXT_APPROVER_UNAVAILABLE',
          'INACTIVE_APPROVER',
          'INVALID_APPROVER',
        ].includes(failure.businessCode)
      )
        await alertConfigurationAdmins(pool, actor)
    } catch {
      // Reporting cannot change the original command failure or reveal payloads.
    }
    reply.status(failure.status).send({
      code: failure.status,
      data: null,
      businessCode: failure.businessCode,
      message: failure.message,
      errors: failure.errors,
      traceId: request.id,
    })
  })
  server.setNotFoundHandler(() => {
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  })
  server.get('/health', async () => ({ status: 'ready' }))
  server.get('/api/runtime-context', async () => ({
    code: 20000,
    data: { mode: process.env.APP_MODE === 'demo' ? 'demo' : 'pilot' },
  }))
  server.get('/ready', async () => {
    await verifyMigrationReadiness(pool)
    return { status: 'ready' }
  })
  registerAuth(server, pool)
  registerBusiness(server, pool, fault)
  registerOrganization(server, pool)
  registerPositions(server, pool)
  registerUsers(server, pool)
  registerCredentials(server, pool)
  registerRoles(server, pool)
  registerDictionaries(server, pool, fault)
  registerFormDataSources(server, pool, fault)
  registerDataScopes(server, pool)
  registerApplicationCenter(server, pool)
  registerBusinessRecords(server, pool, fault)
  registerWorkflowRecovery(server, pool, fault)
  registerFiles(server, pool, files)
  registerApplicationPackages(server, pool, fault)
  if (!database)
    server.addHook('onClose', async () => {
      await pool.end()
    })
  return server
}

if (require.main === module) {
  const server = createServer()
  server.listen({
    port: Number(process.env.PORT || 10888),
    host: process.env.HOST || '127.0.0.1',
  })
  const shutdown = async () => {
    await server.close()
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

export default createServer
