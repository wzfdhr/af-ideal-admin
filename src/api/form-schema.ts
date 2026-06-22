import request from '@/api/request'
import {
  migrateFormSchema,
  type VersionedFormSchema,
} from '@/components/form-designer/schema'

export type FormSchemaStatus = 'draft' | 'published' | 'rolled-back'

export interface FormSchemaRecord {
  id: string
  name: string
  schema: VersionedFormSchema
  status: FormSchemaStatus
  version: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

export interface FormSchemaQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: FormSchemaStatus
}

export interface FormSchemaPageResult {
  list: FormSchemaRecord[]
  total: number
}

export interface CreateFormSchemaPayload {
  name: string
  schema: unknown
}

export interface FormSchemaMutationResult {
  id: string
  name?: string
  schema?: VersionedFormSchema
  status?: FormSchemaStatus
  version?: number
}

export interface FormRuntimeSubmitResult {
  id: string
  formId?: string
  status: 'submitted'
  values?: Record<string, unknown>
  submittedAt?: string
}

export const fetchFormSchemas = async (params: FormSchemaQuery) => {
  const response = await request.get<FormSchemaPageResult>('/form-schemas', {
    params,
  })
  return response.data
}

export const getFormSchemaDetail = async (id: string) => {
  const response = await request.get<FormSchemaRecord>(`/form-schemas/${id}`)
  return response.data
}

export const createFormSchema = async ({
  name,
  schema,
}: CreateFormSchemaPayload) => {
  const validatedSchema = migrateFormSchema(schema)
  const response = await request.post<FormSchemaMutationResult>(
    '/form-schemas',
    {
      name,
      schema: validatedSchema,
    }
  )

  return response.data
}

export const saveFormSchema = async (id: string, schema: unknown) => {
  const validatedSchema = migrateFormSchema(schema)
  const response = await request.put<FormSchemaMutationResult>(
    `/form-schemas/${id}`,
    {
      schema: validatedSchema,
    }
  )

  return response.data
}

export const publishFormSchema = async (id: string, schema: unknown) => {
  const validatedSchema = migrateFormSchema(schema)
  const response = await request.post<FormSchemaMutationResult>(
    `/form-schemas/${id}/publish`,
    {
      schema: validatedSchema,
    }
  )

  return response.data
}

export const rollbackFormSchema = async (id: string, version: number) => {
  const response = await request.post<FormSchemaMutationResult>(
    `/form-schemas/${id}/rollback`,
    {
      version,
    }
  )

  return response.data
}

export const submitFormRuntime = async (
  id: string,
  values: Record<string, unknown>
) => {
  const response = await request.post<FormRuntimeSubmitResult>(
    `/form-runtime/${id}/submit`,
    {
      values,
    }
  )

  return response.data
}
