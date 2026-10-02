import { randomUUID } from 'node:crypto'
import {
  DICTIONARY_PERMISSIONS as P,
  DomainError,
  parseDictionary,
  parseDictionaryItems,
  record,
  onlyKeys,
  text,
  positiveInteger,
} from '@af-admin/contracts'
import { assertRevision } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  authorizedTransaction,
  idempotent,
  audit,
  one,
  rows,
  pageQuery,
  noFault,
  sequential,
} from './support'
import type { Database, FaultInjector } from './support'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'

interface DictionaryRow {
  id: string
  dict_name: string
  dict_type: string
  status: string
  description: string
  revision: number
  created_at: Date
  updated_at: Date
}
const dto = (row: DictionaryRow) => ({
  id: row.id,
  dictName: row.dict_name,
  dictType: row.dict_type,
  dictStatus: row.status,
  description: row.description,
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})
const read = async (db: Database, tenant: string, id: string, lock = false) =>
  one(
    await rows<DictionaryRow>(
      db,
      `SELECT * FROM dictionaries WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL${
        lock ? ' FOR UPDATE' : ''
      }`,
      [tenant, id]
    )
  )
export const registerDictionaries = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/system/dictionaries', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.list,
      async (client, current) => {
        const q = record(request.query)
        const page = pageQuery(q)
        onlyKeys(q, [
          'current',
          'pageSize',
          'dictName',
          'dictType',
          'dictStatus',
        ])
        const status =
          q.dictStatus === undefined ? '' : text(q.dictStatus, 'dictStatus', 20)
        if (status && !['enabled', 'disabled'].includes(status))
          throw new DomainError(422, 'VALIDATION_ERROR', '字典状态筛选无效')
        const args = [
          current.tenantId,
          typeof q.dictName === 'string' ? q.dictName.slice(0, 100) : '',
          typeof q.dictType === 'string' ? q.dictType.slice(0, 60) : '',
          status,
        ]
        const predicate =
          "tenant_id=$1 AND deleted_at IS NULL AND strpos(dict_name,$2)>0 AND strpos(dict_type,$3)>0 AND ($4='' OR status=$4)"
        const list = await rows<DictionaryRow>(
          client,
          `SELECT * FROM dictionaries WHERE ${predicate} ORDER BY created_at DESC,id LIMIT $5 OFFSET $6`,
          [...args, page.pageSize, page.offset]
        )
        const count = one(
          await rows<{ total: string }>(
            client,
            `SELECT count(*) AS total FROM dictionaries WHERE ${predicate}`,
            args
          )
        )
        return ok(
          { list: list.map(dto), total: Number(count.total) },
          request.id
        )
      }
    )
  })
  server.get('/api/system/dictionaries/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(
      pool,
      actor,
      P.detail,
      async (client, current) => {
        const dictionary = await read(client, current.tenantId, id)
        // Parent SHARE locks make metadata and item revision one consistent snapshot.
        await client.query(
          'SELECT id FROM dictionaries WHERE tenant_id=$1 AND id=$2 FOR SHARE',
          [current.tenantId, id]
        )
        const latest = await read(client, current.tenantId, id)
        const items = await rows(
          client,
          'SELECT label,value,disabled FROM dictionary_items WHERE tenant_id=$1 AND dictionary_id=$2 ORDER BY ordinal',
          [current.tenantId, dictionary.id]
        )
        return ok({ ...dto(latest), items }, request.id)
      }
    )
  })
  ;(['POST', 'PUT'] as const).forEach((method) =>
    server.route({
      method,
      url:
        method === 'POST'
          ? '/api/system/dictionaries'
          : '/api/system/dictionaries/:id',
      handler: async (request) => {
        const actor = await authenticate(pool, request)
        const id =
          method === 'PUT'
            ? text(record(request.params).id, 'id', 100)
            : undefined
        const input = parseDictionary(request.body, Boolean(id))
        return ok(
          await idempotent(
            pool,
            actor,
            id ? P.update : P.create,
            id ? `dictionary:update:${id}` : 'dictionary:create',
            scalarHeader(request, 'idempotency-key'),
            input,
            async (client, current) => {
              const old = id
                ? await read(client, current.tenantId, id, true)
                : undefined
              if (old) {
                assertRevision(old.revision, input.expectedRevision as number)
                if (old.dict_type !== input.dictType)
                  throw new DomainError(
                    409,
                    'DICTIONARY_TYPE_IMMUTABLE',
                    '已创建的字典类型不能更改'
                  )
              }
              const duplicate = await rows(
                client,
                'SELECT id FROM dictionaries WHERE tenant_id=$1 AND dict_type=$2 AND id<>$3',
                [current.tenantId, input.dictType, id || '']
              )
              if (duplicate.length)
                throw new DomainError(
                  409,
                  'DICTIONARY_TYPE_EXISTS',
                  '本租户已有或曾有此字典类型'
                )
              const target = id || randomUUID()
              if (id)
                await client.query(
                  'UPDATE dictionaries SET dict_name=$3,status=$4,description=$5,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
                  [
                    current.tenantId,
                    target,
                    input.dictName,
                    input.dictStatus,
                    input.description,
                  ]
                )
              else
                await client.query(
                  'INSERT INTO dictionaries(tenant_id,id,dict_name,dict_type,status,description) VALUES($1,$2,$3,$4,$5,$6)',
                  [
                    current.tenantId,
                    target,
                    input.dictName,
                    input.dictType,
                    input.dictStatus,
                    input.description,
                  ]
                )
              fault('dictionary:written')
              await audit(
                client,
                current,
                'system',
                id ? 'dictionary.update' : 'dictionary.create',
                'dictionary',
                target,
                'success',
                { revision: (old?.revision || 0) + 1 }
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
  server.put('/api/system/dictionaries/:id/items', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const input = parseDictionaryItems(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        P.update,
        `dictionary:items:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const old = await read(client, current.tenantId, id, true)
          assertRevision(old.revision, input.expectedRevision)
          await client.query(
            'DELETE FROM dictionary_items WHERE tenant_id=$1 AND dictionary_id=$2',
            [current.tenantId, id]
          )
          await sequential(
            input.items.map((item, ordinal) => ({ ...item, ordinal })),
            async (item) => {
              await client.query(
                'INSERT INTO dictionary_items(tenant_id,dictionary_id,ordinal,label,value,disabled) VALUES($1,$2,$3,$4,$5::jsonb,$6)',
                [
                  current.tenantId,
                  id,
                  item.ordinal,
                  item.label,
                  JSON.stringify(item.value),
                  item.disabled,
                ]
              )
            }
          )
          await client.query(
            'UPDATE dictionaries SET revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
          fault('dictionary:written')
          await audit(
            client,
            current,
            'system',
            'dictionary.items-update',
            'dictionary',
            id,
            'success',
            { itemCount: input.items.length, revision: old.revision + 1 }
          )
          return {
            ...dto(await read(client, current.tenantId, id)),
            items: input.items,
          }
        },
        true
      ),
      request.id
    )
  })
  server.delete('/api/system/dictionaries/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const input = { expectedRevision: positiveInteger(body.expectedRevision) }
    return ok(
      await idempotent(
        pool,
        actor,
        P.delete,
        `dictionary:delete:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const old = await read(client, current.tenantId, id, true)
          assertRevision(old.revision, input.expectedRevision)
          await client.query(
            'UPDATE dictionaries SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
          fault('dictionary:written')
          await audit(
            client,
            current,
            'system',
            'dictionary.delete',
            'dictionary',
            id,
            'success',
            { revision: old.revision + 1 }
          )
          return null
        },
        true
      ),
      request.id
    )
  })
  server.get('/api/sys/dic/dictStatus', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, P.list, async () =>
      ok(
        [
          { label: '启用', value: 'enabled' },
          { label: '停用', value: 'disabled' },
        ],
        request.id
      )
    )
  })
  server.get('/api/sys/dic/:type', async (request) => {
    const actor = await authenticate(pool, request)
    const type = text(record(request.params).type, 'type', 60)
    return authorizedTransaction(
      pool,
      actor,
      P.read,
      async (client, current) => {
        const dictionary = one(
          await rows<DictionaryRow>(
            client,
            'SELECT * FROM dictionaries WHERE tenant_id=$1 AND dict_type=$2 AND deleted_at IS NULL FOR SHARE',
            [current.tenantId, type]
          )
        )
        if (dictionary.status !== 'enabled')
          throw new DomainError(
            409,
            'DICTIONARY_UNAVAILABLE',
            '字典已停用，请联系配置人员'
          )
        const items = await rows(
          client,
          'SELECT label,value,disabled FROM dictionary_items WHERE tenant_id=$1 AND dictionary_id=$2 AND NOT disabled ORDER BY ordinal',
          [current.tenantId, dictionary.id]
        )
        return ok(items, request.id)
      }
    )
  })
}

export default registerDictionaries
