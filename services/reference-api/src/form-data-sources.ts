import { randomUUID } from 'node:crypto'
import {
  FORM_DATA_SOURCE_PERMISSIONS as P,
  DICTIONARY_PERMISSIONS,
  DomainError,
  parseFormDataSource,
  record,
  onlyKeys,
  text,
} from '@af-admin/contracts'
import {
  assertRevision,
  requirePermission,
  hasPermission,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  authorizedTransaction,
  idempotent,
  rows,
  one,
  audit,
  pageQuery,
  noFault,
} from './support'
import type { FormDataSource } from '@af-admin/contracts'
import type { Database, FaultInjector } from './support'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'

interface SourceRow {
  id: string
  code: string
  name: string
  kind: 'dictionary'
  dictionary_id: string
  status: 'enabled' | 'disabled'
  description: string
  revision: number
  updated_at: Date
}
const dto = (row: SourceRow): FormDataSource => ({
  id: row.id,
  code: row.code,
  name: row.name,
  kind: row.kind,
  dictionaryId: row.dictionary_id,
  status: row.status,
  description: row.description,
  revision: row.revision,
  updatedAt: row.updated_at.toISOString(),
})
const read = async (db: Database, tenant: string, id: string, lock = false) =>
  one(
    await rows<SourceRow>(
      db,
      `SELECT * FROM form_data_sources WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [tenant, id]
    )
  )
export const registerFormDataSources = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/form-data-sources', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.list,
      async (client, current) => {
        const q = record(request.query)
        onlyKeys(q, ['current', 'pageSize', 'keyword'])
        const page = pageQuery(q)
        const list = await rows<SourceRow>(
          client,
          'SELECT * FROM form_data_sources WHERE tenant_id=$1 AND (strpos(name,$2)>0 OR strpos(code,$2)>0) ORDER BY updated_at DESC,id LIMIT $3 OFFSET $4',
          [current.tenantId, page.keyword, page.pageSize, page.offset]
        )
        const total = one(
          await rows<{ total: string }>(
            client,
            'SELECT count(*) AS total FROM form_data_sources WHERE tenant_id=$1 AND (strpos(name,$2)>0 OR strpos(code,$2)>0)',
            [current.tenantId, page.keyword]
          )
        )
        return ok(
          { list: list.map(dto), total: Number(total.total) },
          request.id
        )
      }
    )
  })
  server.get('/api/form-data-sources/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(pool, actor, P.list, async (client, current) =>
      ok(dto(await read(client, current.tenantId, id)), request.id)
    )
  })
  server.get('/api/form-data-sources/:id/options', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    onlyKeys(record(request.query), [])
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (client, current) => {
        if (
          !hasPermission(current.permissions, P.read) ||
          !hasPermission(current.permissions, DICTIONARY_PERMISSIONS.read)
        )
          throw new DomainError(
            403,
            'DATA_SOURCE_FORBIDDEN',
            '缺少数据源及底层字典读取权限'
          )
        await client.query("SET LOCAL statement_timeout='5000ms'")
        const source = await read(client, current.tenantId, id)
        if (source.status !== 'enabled')
          throw new DomainError(409, 'DATA_SOURCE_UNAVAILABLE', '数据源已停用')
        const dictionary = one(
          await rows<{ revision: number; status: string }>(
            client,
            'SELECT revision,status FROM dictionaries WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE',
            [current.tenantId, source.dictionary_id]
          )
        )
        if (dictionary.status !== 'enabled')
          throw new DomainError(
            409,
            'DATA_SOURCE_UNAVAILABLE',
            '关联字典已停用'
          )
        const items = await rows(
          client,
          'SELECT label,value FROM dictionary_items WHERE tenant_id=$1 AND dictionary_id=$2 AND NOT disabled ORDER BY ordinal LIMIT 201',
          [current.tenantId, source.dictionary_id]
        )
        if (items.length > 200)
          throw new DomainError(
            422,
            'DATA_SOURCE_RESPONSE_INVALID',
            '数据源结果超过允许数量'
          )
        return ok(
          {
            sourceId: source.id,
            sourceRevision: source.revision,
            dictionaryRevision: dictionary.revision,
            options: items,
          },
          request.id
        )
      }
    )
  })
  ;(['POST', 'PUT'] as const).forEach((method) =>
    server.route({
      method,
      url:
        method === 'POST'
          ? '/api/form-data-sources'
          : '/api/form-data-sources/:id',
      handler: async (request) => {
        const actor = await authenticate(pool, request)
        const id =
          method === 'PUT'
            ? text(record(request.params).id, 'id', 100)
            : undefined
        const input = parseFormDataSource(request.body, Boolean(id))
        return ok(
          await idempotent(
            pool,
            actor,
            id ? P.update : P.create,
            id ? `form-source:update:${id}` : 'form-source:create',
            scalarHeader(request, 'idempotency-key'),
            input,
            async (client, current) => {
              requirePermission(
                current.permissions,
                DICTIONARY_PERMISSIONS.read
              )
              const old = id
                ? await read(client, current.tenantId, id, true)
                : undefined
              if (old) {
                assertRevision(old.revision, input.expectedRevision as number)
                if (
                  old.code !== input.code ||
                  old.dictionary_id !== input.dictionaryId
                )
                  throw new DomainError(
                    409,
                    'DATA_SOURCE_BINDING_IMMUTABLE',
                    '数据源编码和关联字典不能更改，请登记新的数据源'
                  )
              }
              const dictionary = one(
                await rows<{ status: string }>(
                  client,
                  'SELECT status FROM dictionaries WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE',
                  [current.tenantId, input.dictionaryId]
                )
              )
              if (dictionary.status !== 'enabled' && input.status === 'enabled')
                throw new DomainError(
                  409,
                  'DATA_SOURCE_UNAVAILABLE',
                  '不能启用关联停用字典的数据源'
                )
              const existing = await rows(
                client,
                'SELECT id FROM form_data_sources WHERE tenant_id=$1 AND code=$2 AND id<>$3',
                [current.tenantId, input.code, id || '']
              )
              if (existing.length)
                throw new DomainError(
                  409,
                  'DATA_SOURCE_CODE_EXISTS',
                  '本租户已有此数据源编码'
                )
              const target = id || randomUUID()
              if (id)
                await client.query(
                  'UPDATE form_data_sources SET name=$3,status=$4,description=$5,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
                  [
                    current.tenantId,
                    target,
                    input.name,
                    input.status,
                    input.description,
                  ]
                )
              else
                await client.query(
                  'INSERT INTO form_data_sources(tenant_id,id,code,name,dictionary_id,status,description) VALUES($1,$2,$3,$4,$5,$6,$7)',
                  [
                    current.tenantId,
                    target,
                    input.code,
                    input.name,
                    input.dictionaryId,
                    input.status,
                    input.description,
                  ]
                )
              fault('form-source:written')
              await audit(
                client,
                current,
                'application',
                id ? 'form-source.update' : 'form-source.create',
                'form-data-source',
                target,
                'success',
                { revision: (old?.revision || 0) + 1, status: input.status }
              )
              return dto(await read(client, current.tenantId, target))
            },
            true
          ),
          request.id
        )
      },
    })
  )
}
export default registerFormDataSources
