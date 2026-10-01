import { randomUUID } from 'node:crypto'
import {
  DEPARTMENT_PERMISSIONS,
  POSITION_PERMISSIONS,
  DomainError,
  parseDepartment,
  positiveInteger,
  record,
  onlyKeys,
  text,
} from '@af-admin/contracts'
import {
  assertRevision,
  requirePermission,
  departmentTree,
  hasPermission,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import { audit, idempotent, one, pageQuery, rows } from './support'
import type { Department, DepartmentInput } from '@af-admin/contracts'
import type { Actor } from './auth'
import type { Database } from './support'
import type { FastifyInstance } from 'fastify'
import type { Pool, PoolClient } from 'pg'

interface DepartmentRow {
  id: string
  parent_id: string | null
  department_name: string
  leader: string
  sort: number
  status: 'enabled' | 'disabled'
  revision: number
  created_at: Date
  updated_at: Date
}
const dto = (row: DepartmentRow): Department => ({
  id: row.id,
  parentId: row.parent_id,
  departmentName: row.department_name,
  leader: row.leader,
  sort: row.sort,
  status: row.status,
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})
const read = async (db: Database, tenantId: string, id: string, lock = false) =>
  one(
    await rows<DepartmentRow>(
      db,
      `SELECT * FROM departments WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL${
        lock ? ' FOR UPDATE' : ''
      }`,
      [tenantId, id]
    )
  )
const treeLock = (client: PoolClient, tenantId: string) =>
  client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `department-tree:${tenantId}`,
  ])
const validateParent = async (
  client: PoolClient,
  tenantId: string,
  parentId: string | null,
  id: string
) => {
  if (!parentId) return
  const parent = await read(client, tenantId, parentId)
  if (parent.status !== 'enabled')
    throw new DomainError(409, 'PARENT_UNAVAILABLE', '父部门已停用')
  const ancestors = await rows<{ id: string; status: string }>(
    client,
    'WITH RECURSIVE parents AS (SELECT id,parent_id,status FROM departments WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL UNION SELECT d.id,d.parent_id,d.status FROM departments d JOIN parents p ON d.id=p.parent_id WHERE d.tenant_id=$1 AND d.deleted_at IS NULL) SELECT id,status FROM parents',
    [tenantId, parentId]
  )
  if (ancestors.some((item) => item.id === id))
    throw new DomainError(
      409,
      'DEPARTMENT_CYCLE',
      '父部门不能是自身或自己的子部门'
    )
  if (ancestors.some((item) => item.status !== 'enabled'))
    throw new DomainError(409, 'PARENT_UNAVAILABLE', '上级部门已停用')
}
const write = (
  pool: Pool,
  actor: Actor,
  id: string | undefined,
  input: DepartmentInput,
  key: string | undefined
) =>
  idempotent(
    pool,
    actor,
    id ? DEPARTMENT_PERMISSIONS.update : DEPARTMENT_PERMISSIONS.create,
    id ? `department:update:${id}` : 'department:create',
    key,
    input,
    async (client, current) => {
      await treeLock(client, current.tenantId)
      const old = id
        ? await read(client, current.tenantId, id, true)
        : undefined
      if (old) assertRevision(old.revision, input.expectedRevision as number)
      const resourceId = id || randomUUID()
      const parentId =
        input.parentId === undefined ? old?.parent_id || null : input.parentId
      await validateParent(client, current.tenantId, parentId, resourceId)
      const duplicated = await rows<{ id: string }>(
        client,
        'SELECT id FROM departments WHERE tenant_id=$1 AND parent_id IS NOT DISTINCT FROM $2 AND department_name=$3 AND id<>$4 AND deleted_at IS NULL',
        [current.tenantId, parentId, input.departmentName, resourceId]
      )
      if (duplicated.length)
        throw new DomainError(
          409,
          'DEPARTMENT_NAME_EXISTS',
          '同一父部门下已有此名称'
        )
      if (old)
        await client.query(
          'UPDATE departments SET parent_id=$3,department_name=$4,leader=$5,sort=$6,status=$7,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
          [
            current.tenantId,
            resourceId,
            parentId,
            input.departmentName,
            input.leader,
            input.sort,
            input.status,
          ]
        )
      else
        await client.query(
          'INSERT INTO departments (tenant_id,id,parent_id,department_name,leader,sort,status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [
            current.tenantId,
            resourceId,
            parentId,
            input.departmentName,
            input.leader,
            input.sort,
            input.status,
          ]
        )
      await audit(
        client,
        current,
        'system',
        old ? 'department.update' : 'department.create',
        'department',
        resourceId
      )
      return dto(await read(client, current.tenantId, resourceId))
    }
  )

export const registerOrganization = (server: FastifyInstance, pool: Pool) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/sys/dic/departmentStatus', async (request) => {
    const actor = await authenticate(pool, request)
    requirePermission(actor.permissions, DEPARTMENT_PERMISSIONS.list)
    return ok(
      [
        { label: '启用', value: 'enabled' },
        { label: '停用', value: 'disabled' },
      ],
      request.id
    )
  })
  server.get('/api/system/departments', async (request) => {
    const actor = await authenticate(pool, request)
    requirePermission(actor.permissions, DEPARTMENT_PERMISSIONS.list)
    const query = record(request.query)
    const page = pageQuery(query)
    const name =
      typeof query.departmentName === 'string'
        ? query.departmentName.slice(0, 100)
        : ''
    const status = typeof query.status === 'string' ? query.status : ''
    if (status && !['enabled', 'disabled'].includes(status))
      throw new DomainError(422, 'VALIDATION_ERROR', '部门状态筛选无效')
    const parameters = [actor.tenantId, `%${name}%`, status]
    const predicate =
      "WHERE tenant_id=$1 AND deleted_at IS NULL AND department_name ILIKE $2 AND ($3='' OR status=$3)"
    const count = one(
      await rows<{ total: string }>(
        pool,
        `SELECT count(*) AS total FROM departments ${predicate}`,
        parameters
      )
    )
    const result = await rows<DepartmentRow>(
      pool,
      `SELECT * FROM departments ${predicate} ORDER BY sort,id LIMIT $4 OFFSET $5`,
      [...parameters, page.pageSize, page.offset]
    )
    return ok({ list: result.map(dto), total: Number(count.total) }, request.id)
  })
  server.get('/api/system/departments/tree', async (request) => {
    const actor = await authenticate(pool, request)
    const lookupPermissions = [
      POSITION_PERMISSIONS.list,
      POSITION_PERMISSIONS.assign,
      POSITION_PERMISSIONS.create,
      POSITION_PERMISSIONS.update,
    ]
    if (
      !lookupPermissions.some((permission) =>
        hasPermission(actor.permissions, permission)
      )
    )
      requirePermission(actor.permissions, DEPARTMENT_PERMISSIONS.list)
    const departments = await rows<DepartmentRow>(
      pool,
      'SELECT * FROM departments WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY sort,id',
      [actor.tenantId]
    )
    return ok(departmentTree(departments.map(dto)), request.id)
  })
  server.get('/api/system/departments/:id', async (request) => {
    const actor = await authenticate(pool, request)
    requirePermission(actor.permissions, DEPARTMENT_PERMISSIONS.detail)
    return ok(
      dto(
        await read(
          pool,
          actor.tenantId,
          text(record(request.params).id, 'id', 100)
        )
      ),
      request.id
    )
  })
  server.post('/api/system/departments', async (request) =>
    ok(
      await write(
        pool,
        await authenticate(pool, request),
        undefined,
        parseDepartment(request.body),
        scalarHeader(request, 'idempotency-key')
      ),
      request.id
    )
  )
  server.put('/api/system/departments/:id', async (request) =>
    ok(
      await write(
        pool,
        await authenticate(pool, request),
        text(record(request.params).id, 'id', 100),
        parseDepartment(request.body, true),
        scalarHeader(request, 'idempotency-key')
      ),
      request.id
    )
  )
  server.delete('/api/system/departments/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const expectedRevision = positiveInteger(body.expectedRevision)
    return ok(
      await idempotent(
        pool,
        actor,
        DEPARTMENT_PERMISSIONS.delete,
        `department:delete:${id}`,
        scalarHeader(request, 'idempotency-key'),
        { expectedRevision },
        async (client, current) => {
          await treeLock(client, current.tenantId)
          const value = await read(client, current.tenantId, id, true)
          assertRevision(value.revision, expectedRevision)
          const referenced = one(
            await rows<{ total: string }>(
              client,
              'SELECT (SELECT count(*) FROM departments WHERE tenant_id=$1 AND parent_id=$2 AND deleted_at IS NULL)+(SELECT count(*) FROM memberships WHERE tenant_id=$1 AND department_id=$2)+(SELECT count(*) FROM positions WHERE tenant_id=$1 AND department_id=$2 AND deleted_at IS NULL) AS total',
              [current.tenantId, id]
            )
          )
          if (Number(referenced.total))
            throw new DomainError(
              409,
              'DEPARTMENT_REFERENCED',
              '部门有关联成员、子部门或岗位，不能删除'
            )
          await client.query(
            'UPDATE departments SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
          await audit(
            client,
            current,
            'system',
            'department.delete',
            'department',
            id
          )
          return null
        }
      ),
      request.id
    )
  })
}

export default registerOrganization
