import { FILE_CHUNK_SIZE, FILE_MAX_SIZE, FILE_TYPES } from '@af-admin/contracts'
import request from './request'

export interface StoredFile {
  id: string
  fileName: string
  mimeType: string
  size: number
  recordId: string | null
  status: string
  revision: number
  scanEngine: string | null
}
export const listStoredFiles = async (recordId?: string) =>
  (
    await request.get<{ list: StoredFile[]; total: number }>(
      '/files/resources',
      { params: { recordId, current: 1, pageSize: 100 } }
    )
  ).data
export const uploadStoredFile = async (
  file: File,
  recordId?: string,
  onProgress?: (completed: number) => void
) => {
  if (!file.size || file.size > FILE_MAX_SIZE)
    throw new Error('文件需为1字节至20MiB')
  const extension = file.name.split('.').slice(-1)[0].toLowerCase()
  const mimeType = FILE_TYPES[extension]
  if (!mimeType) throw new Error('文件类型不受支持')
  const bytes = await file.arrayBuffer()
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  )
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  const upload = (
    await request.post<{ id: string; revision: number }>(
      '/files/uploads',
      { fileName: file.name, size: file.size, mimeType, sha256, recordId },
      { headers: { 'Idempotency-Key': crypto.randomUUID() } }
    )
  ).data
  try {
    const parts = Array.from(
      { length: Math.ceil(file.size / FILE_CHUNK_SIZE) },
      (_, index) => index
    )
    const revision = await parts.reduce(async (previous, index) => {
      await previous
      const result = await request.put<{ revision: number }>(
        `/files/uploads/${upload.id}/parts/${index}`,
        bytes.slice(index * FILE_CHUNK_SIZE, (index + 1) * FILE_CHUNK_SIZE),
        { headers: { 'Content-Type': 'application/octet-stream' } }
      )
      onProgress?.(Math.min(file.size, (index + 1) * FILE_CHUNK_SIZE))
      return result.data.revision
    }, Promise.resolve(upload.revision))
    return (
      await request.post<{ id: string }>(
        `/files/uploads/${upload.id}/complete`,
        { expectedRevision: revision },
        { headers: { 'Idempotency-Key': crypto.randomUUID() } }
      )
    ).data
  } catch (failure) {
    try {
      const current = (
        await request.get<{ status: string; revision: number }>(
          `/files/uploads/${upload.id}`
        )
      ).data
      if (current.status === 'uploading')
        await request.post(
          `/files/uploads/${upload.id}/cancel`,
          { expectedRevision: current.revision },
          { headers: { 'Idempotency-Key': crypto.randomUUID() } }
        )
    } catch {
      // Offline or revoked sessions leave a durable upload for the expiry cleanup.
    }
    throw failure
  }
}
export const storedFileBytes = async (file: StoredFile, preview = false) => {
  const response = await request.get<ArrayBuffer>(
    `/files/resources/${file.id}/content`,
    {
      params: { preview: preview ? '1' : undefined },
      responseType: 'arraybuffer',
    }
  )
  return new Blob([response.data], {
    type: String(response.headers['content-type'] || file.mimeType),
  })
}
export const deleteStoredFile = async (file: StoredFile) =>
  (
    await request.delete(`/files/resources/${file.id}`, {
      data: { expectedRevision: file.revision },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
  ).data
