import request from '@/api/request'
import {
  migrateFormSchema,
  type VersionedFormSchema,
} from '@/components/form-designer/schema'

export type FormSchemaStatus = 'draft' | 'published' | 'rolled-back'

export interface FormSchemaMutationResult {
  id: string
  schema?: VersionedFormSchema
  status?: FormSchemaStatus
  version?: number
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
