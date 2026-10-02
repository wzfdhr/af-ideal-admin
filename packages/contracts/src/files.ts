import { invalid, record, onlyKeys, text, positiveInteger } from './schemas'

export const FILE_PERMISSIONS = {
  list: 'file:list',
  upload: 'file:upload',
  download: 'file:download',
  preview: 'file:preview',
  delete: 'file:delete',
} as const
export const FILE_CHUNK_SIZE = 1048576
export const FILE_MAX_SIZE = 20971520
export const FILE_TYPES: Record<string, string> = {
  txt: 'text/plain',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
export const parseFileUpload = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, ['fileName', 'mimeType', 'size', 'sha256', 'recordId'])
  const fileName = text(body.fileName, 'fileName', 120)
  const mimeType = text(body.mimeType, 'mimeType', 150)
  const size = positiveInteger(body.size)
  if (
    fileName.includes('/') ||
    fileName.includes('\\') ||
    [...fileName].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  )
    invalid('fileName', '文件名不能包含路径或控制字符')
  const extension = fileName.split('.').slice(-1)[0]?.toLowerCase() || ''
  if (FILE_TYPES[extension] !== mimeType)
    invalid('mimeType', '文件扩展名与允许类型不一致')
  if (size > FILE_MAX_SIZE) invalid('size', '文件不能超过20MiB')
  const sha256 = text(body.sha256, 'sha256', 64)
  if (!/^[0-9a-f]{64}$/.test(sha256)) invalid('sha256', '文件摘要无效')
  return {
    fileName,
    mimeType,
    size,
    sha256,
    recordId:
      body.recordId === undefined || body.recordId === null
        ? null
        : text(body.recordId, 'recordId', 100),
  }
}
