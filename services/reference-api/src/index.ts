import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import { DomainError } from '@af-admin/contracts'
import { createPool } from './database'
import { registerAuth } from './auth'
import type { Pool } from 'pg'

export const createServer = (database?: Pool) => {
  const pool = database || createPool()
  const server = Fastify({
    logger: false,
    bodyLimit: 65536,
    genReqId: () => randomUUID(),
  })
  server.setErrorHandler((error, request, reply) => {
    const failure =
      error instanceof DomainError
        ? error
        : new DomainError(500, 'INTERNAL_ERROR', '服务暂时不可用')
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
  server.get('/ready', async () => {
    await pool.query('SELECT name FROM schema_migrations LIMIT 1')
    return { status: 'ready' }
  })
  registerAuth(server, pool)
  if (!database)
    server.addHook('onClose', async () => {
      await pool.end()
    })
  return server
}

if (require.main === module) {
  createServer().listen({
    port: Number(process.env.PORT || 10888),
    host: process.env.HOST || '127.0.0.1',
  })
}

export default createServer
