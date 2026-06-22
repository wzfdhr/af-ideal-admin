import request from '@/api/request'
import {
  validateLowCodePageSchema,
  type LowCodePageSchema,
} from '@/components/low-code/schema'

export type LowCodePageStatus = 'draft' | 'published' | 'rolled-back'

export interface LowCodePageRecord {
  id: string
  name: string
  schema: LowCodePageSchema
  status: LowCodePageStatus
  version: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

export interface LowCodePageQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: LowCodePageStatus
}

export interface LowCodePageResult {
  list: LowCodePageRecord[]
  total: number
}

export interface CreateLowCodePagePayload {
  name: string
  schema: unknown
}

export interface LowCodePageMutationResult {
  id: string
  name?: string
  schema?: LowCodePageSchema
  status?: LowCodePageStatus
  version?: number
}

export interface LowCodeDataSourcePreviewPayload {
  pageId?: string
  dataSourceKey: string
  params?: Record<string, unknown>
}

export interface LowCodeDataSourcePreviewResult {
  columns: string[]
  list: Record<string, unknown>[]
  total: number
}

export const fetchLowCodePages = async (params: LowCodePageQuery) => {
  const response = await request.get<LowCodePageResult>('/low-code/pages', {
    params,
  })
  return response.data
}

export const getLowCodePage = async (id: string) => {
  const response = await request.get<LowCodePageRecord>(`/low-code/pages/${id}`)
  return response.data
}

export const createLowCodePage = async ({
  name,
  schema,
}: CreateLowCodePagePayload) => {
  const validatedSchema = validateLowCodePageSchema(schema)
  const response = await request.post<LowCodePageMutationResult>(
    '/low-code/pages',
    {
      name,
      schema: validatedSchema,
    }
  )

  return response.data
}

export const saveLowCodePage = async (id: string, schema: unknown) => {
  const validatedSchema = validateLowCodePageSchema(schema)
  const response = await request.put<LowCodePageMutationResult>(
    `/low-code/pages/${id}`,
    {
      schema: validatedSchema,
    }
  )

  return response.data
}

export const publishLowCodePage = async (id: string, schema: unknown) => {
  const validatedSchema = validateLowCodePageSchema(schema)
  const response = await request.post<LowCodePageMutationResult>(
    `/low-code/pages/${id}/publish`,
    {
      schema: validatedSchema,
    }
  )

  return response.data
}

export const rollbackLowCodePage = async (id: string, version: number) => {
  const response = await request.post<LowCodePageMutationResult>(
    `/low-code/pages/${id}/rollback`,
    {
      version,
    }
  )

  return response.data
}

export const previewLowCodeDataSource = async (
  payload: LowCodeDataSourcePreviewPayload
) => {
  const response = await request.post<LowCodeDataSourcePreviewResult>(
    '/low-code/data-source/preview',
    payload
  )
  return response.data
}
