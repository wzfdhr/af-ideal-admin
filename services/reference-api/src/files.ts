import { randomUUID } from 'node:crypto'
import {
  DomainError,
  FILE_PERMISSIONS as P,
  FILE_CHUNK_SIZE,
  parseFileUpload,
  record,
  text,
  onlyKeys,
  positiveInteger,
} from '@af-admin/contracts'
import { assertRevision } from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  authorizedTransaction,
  idempotent,
  rows,
  one,
  audit,
  pageQuery,
} from './support'
import { visibleRecord } from './record-access'
import { writableAttachment } from './file-policy'
import { LocalObjectStore, fileDigest } from './file-storage'
import type { Actor } from './auth'
import type { Pool, PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'

export interface FileRuntime {
  storageRoot?: string
}
interface UploadRow {
  id: string
  tenant_id: string
  owner_id: string
  record_id: string | null
  file_name: string
  mime_type: string
  size: number
  sha256: string
  status: string
  revision: number
  expires_at: Date
}
interface FileRow extends UploadRow {
  object_key: string
  created_at: Date
  updated_at: Date
  scan_engine: string | null
}
const dto = (file: FileRow) => ({
  id: file.id,
  fileName: file.file_name,
  mimeType: file.mime_type,
  size: file.size,
  recordId: file.record_id,
  status: file.status,
  revision: file.revision,
  createdAt: file.created_at.toISOString(),
  scanEngine: file.scan_engine,
})
const readUpload = async (client: PoolClient, actor: Actor, id: string) =>
  one(
    await rows<UploadRow>(
      client,
      'SELECT * FROM file_uploads WHERE tenant_id=$1 AND id=$2 AND owner_id=$3 FOR UPDATE',
      [actor.tenantId, id, actor.userId]
    )
  )
const writableUpload = async (client: PoolClient, actor: Actor, id: string) => {
  const upload = await readUpload(client, actor, id)
  if (upload.status !== 'uploading' || upload.expires_at < new Date())
    throw new DomainError(409, 'UPLOAD_CLOSED', '上传会话已结束或过期')
  if (upload.record_id)
    await writableAttachment(client, actor, upload.record_id)
  return upload
}
const visibleFile = async (client: PoolClient, actor: Actor, id: string) => {
  const file = one(
    await rows<FileRow>(
      client,
      "SELECT * FROM stored_files WHERE tenant_id=$1 AND id=$2 AND status<>'deleted'",
      [actor.tenantId, id]
    )
  )
  if (file.record_id) await visibleRecord(client, actor, file.record_id)
  else if (file.owner_id !== actor.userId)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  return file
}
const verifyType = (file: UploadRow, bytes: Buffer) => {
  const isZip =
    bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
    bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  let valid = false
  if (file.mime_type === 'text/plain')
    valid =
      !bytes.includes(0) &&
      Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)
  if (file.mime_type === 'application/pdf')
    valid = bytes.subarray(0, 5).toString() === '%PDF-'
  if (file.mime_type === 'image/png')
    valid = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (file.mime_type === 'image/jpeg')
    valid = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  if (
    [
      'application/zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(file.mime_type)
  )
    valid = isZip
  if (!valid)
    throw new DomainError(
      422,
      'FILE_TYPE_MISMATCH',
      '实际文件字节与声明类型不一致'
    )
}
export const registerFiles = (
  server: FastifyInstance,
  pool: Pool,
  options: FileRuntime = {}
) => {
  const store = () => {
    const root = options.storageRoot || process.env.FILE_STORAGE_DIR
    if (!root)
      throw new DomainError(503, 'STORAGE_NOT_CONFIGURED', '文件存储暂不可用')
    return new LocalObjectStore(root)
  }
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body)
  )
  server.post('/api/files/uploads', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseFileUpload(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        P.upload,
        'file:upload-init',
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          store()
          if (input.recordId)
            await writableAttachment(client, current, input.recordId)
          const count = one(
            await rows<{ total: string }>(
              client,
              "SELECT count(*) AS total FROM file_uploads WHERE tenant_id=$1 AND owner_id=$2 AND status='uploading' AND expires_at>now()",
              [current.tenantId, current.userId]
            )
          )
          if (Number(count.total) >= 20)
            throw new DomainError(
              409,
              'UPLOAD_LIMIT',
              '未完成上传过多，请先完成或取消'
            )
          const id = randomUUID()
          await client.query(
            'INSERT INTO file_uploads(tenant_id,id,owner_id,record_id,file_name,mime_type,size,sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [
              current.tenantId,
              id,
              current.userId,
              input.recordId,
              input.fileName,
              input.mimeType,
              input.size,
              input.sha256,
            ]
          )
          await audit(client, current, 'file', 'file.upload-init', 'file', id)
          return {
            id,
            revision: 1,
            chunkSize: FILE_CHUNK_SIZE,
            parts: Math.ceil(input.size / FILE_CHUNK_SIZE),
          }
        }
      ),
      request.id
    )
  })
  server.get('/api/files/uploads/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    return authorizedTransaction(
      pool,
      actor,
      P.upload,
      async (client, current) => {
        const upload = await readUpload(client, current, id)
        const parts = await rows(
          client,
          'SELECT part_index AS index,size,sha256 FROM file_parts WHERE tenant_id=$1 AND upload_id=$2 ORDER BY part_index',
          [current.tenantId, id]
        )
        return ok(
          { id, status: upload.status, revision: upload.revision, parts },
          request.id
        )
      }
    )
  })
  server.post('/api/files/uploads/:id/cancel', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const input = { expectedRevision: positiveInteger(body.expectedRevision) }
    return ok(
      await idempotent(
        pool,
        actor,
        P.upload,
        `file:cancel:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const upload = await writableUpload(client, current, id)
          assertRevision(upload.revision, input.expectedRevision)
          await client.query(
            "UPDATE file_uploads SET status='cancelled',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
            [current.tenantId, id]
          )
          await audit(client, current, 'file', 'file.upload-cancel', 'file', id)
          return { id, status: 'cancelled' }
        }
      ),
      request.id
    )
  })
  server.post('/api/files/resources/:id/retry-scan', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const input = { expectedRevision: positiveInteger(body.expectedRevision) }
    return ok(
      await idempotent(
        pool,
        actor,
        P.upload,
        `file:retry-scan:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const file = one(
            await rows<FileRow>(
              client,
              "SELECT * FROM stored_files WHERE tenant_id=$1 AND id=$2 AND owner_id=$3 AND status='scan-failed' FOR UPDATE",
              [current.tenantId, id, current.userId]
            )
          )
          if (file.record_id)
            await writableAttachment(client, current, file.record_id)
          assertRevision(file.revision, input.expectedRevision)
          await client.query(
            "UPDATE stored_files SET status='scanning',attempts=0,next_attempt_at=now(),claimed_by=NULL,lease_until=NULL,revision=revision+1 WHERE tenant_id=$1 AND id=$2",
            [current.tenantId, id]
          )
          await audit(client, current, 'file', 'file.scan-retry', 'file', id)
          return { id, status: 'scanning' }
        }
      ),
      request.id
    )
  })
  server.put(
    '/api/files/uploads/:id/parts/:index',
    { bodyLimit: FILE_CHUNK_SIZE },
    async (request) => {
      const actor = await authenticate(pool, request)
      const params = record(request.params)
      const id = text(params.id, 'id', 100)
      const index = Number(params.index)
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= 20 ||
        !Buffer.isBuffer(request.body)
      )
        throw new DomainError(422, 'INVALID_PART', '分片格式无效')
      const bytes = request.body as Buffer
      const sha = fileDigest(bytes)
      return authorizedTransaction(
        pool,
        actor,
        P.upload,
        async (client, current) => {
          const upload = await writableUpload(client, current, id)
          const length = Math.min(
            FILE_CHUNK_SIZE,
            upload.size - index * FILE_CHUNK_SIZE
          )
          if (length <= 0 || bytes.length !== length)
            throw new DomainError(
              422,
              'INVALID_PART',
              '分片序号或实际字节数无效'
            )
          const previous = await rows<{ sha256: string }>(
            client,
            'SELECT sha256 FROM file_parts WHERE tenant_id=$1 AND upload_id=$2 AND part_index=$3',
            [current.tenantId, id, index]
          )
          if (previous.length) {
            if (previous[0].sha256 !== sha)
              throw new DomainError(
                409,
                'PART_CONFLICT',
                '同一分片不能覆盖不同内容'
              )
            return ok(
              { index, revision: upload.revision, sha256: sha },
              request.id
            )
          }
          const key = fileDigest(
            Buffer.from(`${current.tenantId}:${id}:${index}:${sha}`)
          )
          await store().put(bytes, key)
          await client.query(
            'INSERT INTO file_parts(tenant_id,upload_id,part_index,size,sha256,object_key) VALUES ($1,$2,$3,$4,$5,$6)',
            [current.tenantId, id, index, bytes.length, sha, key]
          )
          await client.query(
            'UPDATE file_uploads SET revision=revision+1 WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id]
          )
          return ok(
            { index, revision: upload.revision + 1, sha256: sha },
            request.id
          )
        }
      )
    }
  )
  server.post('/api/files/uploads/:id/complete', async (request) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision'])
    const input = { expectedRevision: positiveInteger(body.expectedRevision) }
    return ok(
      await idempotent(
        pool,
        actor,
        P.upload,
        `file:complete:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const upload = await writableUpload(client, current, id)
          assertRevision(upload.revision, input.expectedRevision)
          const parts = await rows<{
            part_index: number
            size: number
            sha256: string
            object_key: string
          }>(
            client,
            'SELECT * FROM file_parts WHERE tenant_id=$1 AND upload_id=$2 ORDER BY part_index',
            [current.tenantId, id]
          )
          if (
            parts.length !== Math.ceil(upload.size / FILE_CHUNK_SIZE) ||
            parts.some((part, index) => part.part_index !== index)
          )
            throw new DomainError(409, 'PARTS_INCOMPLETE', '文件分片尚未完成')
          const buffers = await parts.reduce(async (previous, part) => {
            const values = await previous
            const bytes = await store().get(part.object_key)
            if (bytes.length !== part.size || fileDigest(bytes) !== part.sha256)
              throw new DomainError(503, 'STORAGE_INTEGRITY', '分片校验失败')
            return [...values, bytes]
          }, Promise.resolve([] as Buffer[]))
          const bytes = Buffer.concat(buffers)
          if (
            bytes.length !== upload.size ||
            fileDigest(bytes) !== upload.sha256
          )
            throw new DomainError(
              422,
              'FILE_DIGEST_MISMATCH',
              '实际文件摘要或大小不符'
            )
          verifyType(upload, bytes)
          const key = fileDigest(
            Buffer.from(`${current.tenantId}:${id}:final:${upload.sha256}`)
          )
          await store().put(bytes, key)
          await client.query(
            'INSERT INTO stored_files(tenant_id,id,owner_id,record_id,file_name,mime_type,size,sha256,object_key) SELECT tenant_id,id,owner_id,record_id,file_name,mime_type,size,sha256,$3 FROM file_uploads WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id, key]
          )
          await client.query(
            "UPDATE file_uploads SET status='completed',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
            [current.tenantId, id]
          )
          await audit(
            client,
            current,
            'file',
            'file.upload-complete',
            'file',
            id,
            'success',
            { size: upload.size, sha256: upload.sha256 }
          )
          return { id, status: 'scanning', revision: 1 }
        }
      ),
      request.id
    )
  })
  server.get('/api/files/resources', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.list,
      async (client, current) => {
        const query = record(request.query)
        const page = pageQuery(query)
        const recordId =
          typeof query.recordId === 'string' ? query.recordId : ''
        if (recordId) await visibleRecord(client, current, recordId)
        const params = [
          current.tenantId,
          recordId,
          current.userId,
          `%${page.keyword}%`,
          current.permissions.includes('business:read:self') ||
            current.permissions.includes('*'),
          current.permissions.includes('leave:read:self') ||
            current.permissions.includes('*'),
        ]
        const filter =
          "WHERE tenant_id=$1 AND status<>'deleted' AND (($2<>'' AND record_id=$2) OR ($2='' AND owner_id=$3 AND (record_id IS NULL OR EXISTS(SELECT 1 FROM business_records r WHERE r.tenant_id=$1 AND r.id=record_id AND r.applicant_id=$3 AND ((r.record_kind='generic' AND $5) OR (r.record_kind='leave' AND $6)))))) AND file_name ILIKE $4"
        const count = one(
          await rows<{ total: string }>(
            client,
            `SELECT count(*) AS total FROM stored_files ${filter}`,
            params
          )
        )
        const files = await rows<FileRow>(
          client,
          `SELECT * FROM stored_files ${filter} ORDER BY created_at DESC,id LIMIT $7 OFFSET $8`,
          [...params, page.pageSize, page.offset]
        )
        // An owner listing linked files still needs present-day business visibility.
        const visible = await files.reduce(async (previous, file) => {
          const results = await previous
          try {
            await visibleFile(client, current, file.id)
            return [...results, dto(file)]
          } catch (error) {
            if (error instanceof DomainError && error.status === 404)
              return results
            throw error
          }
        }, Promise.resolve([] as ReturnType<typeof dto>[]))
        return ok({ list: visible, total: Number(count.total) }, request.id)
      }
    )
  })
  server.get('/api/files/resources/:id/content', async (request, reply) => {
    const actor = await authenticate(pool, request)
    const id = text(record(request.params).id, 'id', 100)
    const preview = record(request.query).preview === '1'
    const result = await authorizedTransaction(
      pool,
      actor,
      preview ? P.preview : P.download,
      async (client, current) => {
        const file = await visibleFile(client, current, id)
        if (file.status !== 'ready')
          throw new DomainError(
            409,
            'FILE_NOT_READY',
            '文件未通过扫描，不能读取'
          )
        if (
          preview &&
          ![
            'text/plain',
            'application/pdf',
            'image/png',
            'image/jpeg',
          ].includes(file.mime_type)
        )
          throw new DomainError(422, 'PREVIEW_UNSUPPORTED', '此类型只支持下载')
        const bytes = await store().get(file.object_key)
        if (bytes.length !== file.size || fileDigest(bytes) !== file.sha256)
          throw new DomainError(503, 'STORAGE_INTEGRITY', '文件完整性校验失败')
        await audit(
          client,
          current,
          'file',
          preview ? 'file.preview' : 'file.download',
          'file',
          id
        )
        return { file, bytes }
      }
    )
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'no-store')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
    reply.header(
      'Content-Disposition',
      `${
        preview ? 'inline' : 'attachment'
      }; filename*=UTF-8''${encodeURIComponent(result.file.file_name)}`
    )
    return reply.type(result.file.mime_type).send(result.bytes)
  })
  server.delete('/api/files/resources/:id', async (request) => {
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
        `file:delete:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (client, current) => {
          const file = one(
            await rows<FileRow>(
              client,
              "SELECT * FROM stored_files WHERE tenant_id=$1 AND id=$2 AND owner_id=$3 AND status<>'deleted' FOR UPDATE",
              [current.tenantId, id, current.userId]
            )
          )
          if (file.record_id)
            await writableAttachment(client, current, file.record_id)
          assertRevision(file.revision, input.expectedRevision)
          await client.query(
            "UPDATE stored_files SET status='deleted',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [current.tenantId, id]
          )
          await audit(client, current, 'file', 'file.delete', 'file', id)
          return { id, status: 'deleted' }
        }
      ),
      request.id
    )
  })
}
export default registerFiles
