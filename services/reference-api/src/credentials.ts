import {
  DomainError,
  SELF_PASSWORD_PERMISSION,
  parsePasswordChange,
} from '@af-admin/contracts'
import { assertRevision } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import { authorizedTransaction, idempotent, one, rows, audit } from './support'
import { hashPassword, verifyPassword } from './security'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'

export const registerCredentials = (server: FastifyInstance, pool: Pool) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/user/credential-state', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      SELF_PASSWORD_PERMISSION,
      async (client, current) => {
        const value = one(
          await rows<{ credential_revision: number }>(
            client,
            'SELECT credential_revision FROM users WHERE id=$1',
            [current.userId]
          )
        )
        return ok({ credentialRevision: value.credential_revision }, request.id)
      }
    )
  })
  server.post('/api/user/password', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parsePasswordChange(request.body)
    const passwordHash = await hashPassword(input.newPassword)
    return ok(
      await idempotent(
        pool,
        actor,
        SELF_PASSWORD_PERMISSION,
        'password:self',
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const user = one(
            await rows<{ password_hash: string; credential_revision: number }>(
              client,
              'SELECT password_hash,credential_revision FROM users WHERE id=$1 FOR UPDATE',
              [current.userId]
            )
          )
          assertRevision(user.credential_revision, input.expectedRevision)
          if (!(await verifyPassword(input.oldPassword, user.password_hash)))
            throw new DomainError(
              422,
              'OLD_PASSWORD_INVALID',
              '当前密码不正确',
              { oldPassword: ['请输入正确的当前密码'] }
            )
          await client.query(
            'UPDATE users SET password_hash=$2,credential_revision=credential_revision+1,updated_at=now() WHERE id=$1',
            [current.userId, passwordHash]
          )
          await client.query(
            'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
            [current.userId]
          )
          await audit(
            client,
            current,
            'auth',
            'password.change',
            'user',
            current.userId
          )
          return { credentialRevision: user.credential_revision + 1 }
        },
        false,
        `credential:${actor.userId}`
      ),
      request.id
    )
  })
}
export default registerCredentials
