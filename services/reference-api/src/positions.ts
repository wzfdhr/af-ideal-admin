import { randomUUID } from 'node:crypto'
import {
  DomainError,
  POSITION_PERMISSIONS,
  parsePosition,
  onlyKeys,
  positiveInteger,
  record,
  text,
} from '@af-admin/contracts'
import {
  requirePermission,
  assertRevision,
  hasPermission,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import { audit, idempotent, one, pageQuery, rows } from './support'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import type { Position } from '@af-admin/contracts'

interface PositionRow {
  id: string
  department_id: string
  position_name: string
  status: 'enabled' | 'disabled'
  revision: number
  created_at: Date
  updated_at: Date
}
const dto = (row: PositionRow): Position => ({
  id: row.id,
  departmentId: row.department_id,
  positionName: row.position_name,
  status: row.status,
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})
const read = async (
  client: Pick<Pool, 'query'>,
  tenantId: string,
  id: string
) =>
  one(
    await rows<PositionRow>(
      client,
      'SELECT * FROM positions WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL',
      [tenantId, id]
    )
  )
const department = async (client: PoolClient, tenantId: string, id: string) => {
  const row = one(
    await rows<{ department_name: string; status: string }>(
      client,
      'SELECT department_name,status FROM departments WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL',
      [tenantId, id]
    )
  )
  if (row.status !== 'enabled')
    throw new DomainError(409, 'DEPARTMENT_UNAVAILABLE', '部门已停用')
  const ancestors = await rows<{ status: string; deleted_at: Date | null }>(
    client,
    'WITH RECURSIVE parents AS (SELECT id,parent_id,status,deleted_at FROM departments WHERE tenant_id=$1 AND id=$2 UNION SELECT d.id,d.parent_id,d.status,d.deleted_at FROM departments d JOIN parents p ON d.id=p.parent_id WHERE d.tenant_id=$1) SELECT status,deleted_at FROM parents',
    [tenantId, id]
  )
  if (ancestors.some((item) => item.status !== 'enabled' || item.deleted_at))
    throw new DomainError(409, 'DEPARTMENT_UNAVAILABLE', '部门或上级部门已停用')
  return row
}

export const registerPositions = (server: FastifyInstance, pool: Pool) => {
  const ok = (data: unknown, id: string) => ({ code: 20000, data, traceId: id })
  server.get('/api/system/positions', async (request) => {
    const actor = await authenticate(pool, request)
    if (!hasPermission(actor.permissions, POSITION_PERMISSIONS.assign))
      requirePermission(actor.permissions, POSITION_PERMISSIONS.list)
    const query = record(request.query)
    const page = pageQuery(query)
    const parent =
      typeof query.departmentId === 'string' ? query.departmentId : ''
    const params = [actor.tenantId, parent]
    const predicate =
      "WHERE tenant_id=$1 AND deleted_at IS NULL AND ($2='' OR department_id=$2)"
    const count = one(
      await rows<{ total: string }>(
        pool,
        `SELECT count(*) AS total FROM positions ${predicate}`,
        params
      )
    )
    const result = await rows<PositionRow>(
      pool,
      `SELECT * FROM positions ${predicate} ORDER BY position_name,id LIMIT $3 OFFSET $4`,
      [...params, page.pageSize, page.offset]
    )
    return ok({ list: result.map(dto), total: Number(count.total) }, request.id)
  })
  const save = async (request: FastifyRequest, update: boolean) => {
    const actor = await authenticate(pool, request)
    const id = update ? text(record(request.params).id, 'id', 100) : undefined
    const input = parsePosition(request.body, update)
    return ok(
      await idempotent(
        pool,
        actor,
        update ? POSITION_PERMISSIONS.update : POSITION_PERMISSIONS.create,
        id ? `position:update:${id}` : 'position:create',
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const old = id ? await read(client, current.tenantId, id) : undefined
          if (old)
            assertRevision(old.revision, input.expectedRevision as number)
          await department(client, current.tenantId, input.departmentId)
          if (old && old.department_id !== input.departmentId) {
            const refs = one(
              await rows<{ total: string }>(
                client,
                'SELECT count(*) AS total FROM memberships WHERE tenant_id=$1 AND position_id=$2',
                [current.tenantId, id]
              )
            )
            if (Number(refs.total))
              throw new DomainError(
                409,
                'POSITION_REFERENCED',
                '岗位有关联成员，不能移动到其他部门'
              )
          }
          const resourceId = id || randomUUID()
          const existing = await rows<{ id: string }>(
            client,
            'SELECT id FROM positions WHERE tenant_id=$1 AND department_id=$2 AND position_name=$3 AND deleted_at IS NULL AND id<>$4',
            [
              current.tenantId,
              input.departmentId,
              input.positionName,
              resourceId,
            ]
          )
          if (existing.length)
            throw new DomainError(
              409,
              'POSITION_NAME_EXISTS',
              '该部门已有同名岗位'
            )
          if (old)
            await client.query(
              'UPDATE positions SET department_id=$3,position_name=$4,status=$5,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
              [
                current.tenantId,
                resourceId,
                input.departmentId,
                input.positionName,
                input.status,
              ]
            )
          else
            await client.query(
              'INSERT INTO positions (tenant_id,id,department_id,position_name,status) VALUES ($1,$2,$3,$4,$5)',
              [
                current.tenantId,
                resourceId,
                input.departmentId,
                input.positionName,
                input.status,
              ]
            )
          await audit(
            client,
            current,
            'system',
            old ? 'position.update' : 'position.create',
            'position',
            resourceId
          )
          return dto(await read(client, current.tenantId, resourceId))
        },
        true
      ),
      request.id
    )
  }
  server.post('/api/system/positions', async (request) => save(request, false))
  server.put('/api/system/positions/:id', async (request) =>
    save(request, true)
  )
  server.delete('/api/system/positions/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const revision = positiveInteger(body.expectedRevision)
    return ok(
      await idempotent(
        pool,
        actor,
        POSITION_PERMISSIONS.delete,
        `position:delete:${id}`,
        scalarHeader(request, 'idempotency-key'),
        { expectedRevision: revision },
        async (client, current) => {
          const position = await read(client, current.tenantId, id)
          assertRevision(position.revision, revision)
          const refs = one(
            await rows<{ total: string }>(
              client,
              'SELECT count(*) AS total FROM memberships WHERE tenant_id=$1 AND position_id=$2',
              [current.tenantId, id]
            )
          )
          if (Number(refs.total))
            throw new DomainError(
              409,
              'POSITION_REFERENCED',
              '岗位有关联成员，不能删除'
            )
          await client.query(
            'UPDATE positions SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
          await audit(
            client,
            current,
            'system',
            'position.delete',
            'position',
            id
          )
          return null
        },
        true
      ),
      request.id
    )
  })
  server.get('/api/system/organization-members', async (request) => {
    const actor = await authenticate(pool, request)
    requirePermission(actor.permissions, POSITION_PERMISSIONS.assign)
    const page = pageQuery(request.query)
    const result = await rows<{
      id: string
      name: string
      departmentId: string | null
      positionId: string | null
      positionName: string | null
      revision: number
      status: string
    }>(
      pool,
      'SELECT m.user_id AS id,u.name,m.department_id AS "departmentId",m.position_id AS "positionId",p.position_name AS "positionName",m.revision,m.status FROM memberships m JOIN users u ON m.user_id=u.id LEFT JOIN positions p ON p.tenant_id=m.tenant_id AND p.id=m.position_id WHERE m.tenant_id=$1 ORDER BY m.user_id LIMIT $2 OFFSET $3',
      [actor.tenantId, page.pageSize, page.offset]
    )
    const count = one(
      await rows<{ total: string }>(
        pool,
        'SELECT count(*) AS total FROM memberships WHERE tenant_id=$1',
        [actor.tenantId]
      )
    )
    return ok({ list: result, total: Number(count.total) }, request.id)
  })
  server.post(
    '/api/system/organization-members/:id/assign',
    async (request) => {
      const actor = await authenticate(pool, request)
      const id = text(record(request.params).id, 'id', 100)
      const body = record(request.body)
      onlyKeys(body, ['departmentId', 'positionId', 'expectedRevision'])
      const input = {
        departmentId: text(body.departmentId, 'departmentId', 100),
        positionId:
          body.positionId === null
            ? null
            : text(body.positionId, 'positionId', 100),
        expectedRevision: positiveInteger(body.expectedRevision),
      }
      return ok(
        await idempotent(
          pool,
          actor,
          POSITION_PERMISSIONS.assign,
          `organization:assign:${id}`,
          scalarHeader(request, 'idempotency-key'),
          input,
          async (client, current) => {
            const member = one(
              await rows<{ revision: number; status: string }>(
                client,
                'SELECT revision,status FROM memberships WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE',
                [current.tenantId, id]
              )
            )
            assertRevision(member.revision, input.expectedRevision)
            if (member.status !== 'enabled')
              throw new DomainError(409, 'MEMBER_UNAVAILABLE', '成员已停用')
            const target = await department(
              client,
              current.tenantId,
              input.departmentId
            )
            if (input.positionId) {
              const position = await read(
                client,
                current.tenantId,
                input.positionId
              )
              if (position.department_id !== input.departmentId)
                throw new DomainError(
                  422,
                  'POSITION_DEPARTMENT_MISMATCH',
                  '岗位不属于所选部门',
                  { positionId: ['请选择该部门的岗位'] }
                )
              if (position.status !== 'enabled')
                throw new DomainError(409, 'POSITION_UNAVAILABLE', '岗位已停用')
            }
            await client.query(
              'UPDATE memberships SET department_id=$3,position_id=$4,department_name=$5,revision=revision+1 WHERE tenant_id=$1 AND user_id=$2',
              [
                current.tenantId,
                id,
                input.departmentId,
                input.positionId,
                target.department_name,
              ]
            )
            await audit(
              client,
              current,
              'system',
              'organization.assign',
              'membership',
              id
            )
            return {
              id,
              departmentId: input.departmentId,
              positionId: input.positionId,
              revision: member.revision + 1,
            }
          },
          true
        ),
        request.id
      )
    }
  )
}
export default registerPositions
