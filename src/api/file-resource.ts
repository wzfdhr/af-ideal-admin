import request from '@/api/request'

export type FileResourceCategory =
  | 'image'
  | 'pdf'
  | 'excel'
  | 'word'
  | 'archive'
  | 'other'

export type FilePermissionStatus = 'allowed' | 'denied'

export interface FileResourceRecord {
  id: string
  fileName: string
  category: FileResourceCategory
  mimeType: string
  size: number
  owner: string
  tenantId: string
  permissionStatus: FilePermissionStatus
  createdAt: string
  updatedAt: string
}

export interface FileResourceQuery {
  current: number
  pageSize: number
  keyword?: string
  category?: FileResourceCategory | ''
  permissionStatus?: FilePermissionStatus | ''
}

export interface FileResourcePageResult {
  list: FileResourceRecord[]
  total: number
}

export interface FileUploadPayload {
  fileName: string
  size: number
  mimeType: string
  owner: string
  tenantId: string
}

export interface FileUploadResult {
  success: boolean
  record?: FileResourceRecord
  reason?: string
}

export interface FileAccessResult {
  url?: string
  expiresAt?: string
  denied?: boolean
  reason?: string
}

export const fetchFileResources = async (params: FileResourceQuery) => {
  const response = await request.get<FileResourcePageResult>(
    '/files/resources',
    {
      params,
    }
  )
  return response.data
}

export const uploadFileResource = async (payload: FileUploadPayload) => {
  const response = await request.post<FileUploadResult>(
    '/files/resources/upload',
    payload
  )
  return response.data
}

export const createFileResourceDownload = async (id: string) => {
  const response = await request.post<FileAccessResult>(
    `/files/resources/${id}/download`
  )
  return response.data
}

export const createFilePreviewTask = async (id: string) => {
  const response = await request.post<FileAccessResult>(
    `/files/resources/${id}/preview`
  )
  return response.data
}
