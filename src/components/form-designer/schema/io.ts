import { migrateFormSchema } from './migrate'
import type { VersionedFormSchema } from './types'

export type FormSchemaRef = {
  value: VersionedFormSchema
}

export const exportFormSchema = (schema: unknown) =>
  JSON.stringify(migrateFormSchema(schema), null, 2)

export const importFormSchema = (source: string) => {
  try {
    return migrateFormSchema(JSON.parse(source))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('表单 schema JSON 格式错误')
    }

    throw error
  }
}

export const applyImportedFormSchema = (
  target: FormSchemaRef,
  source: string
) => {
  const importedSchema = importFormSchema(source)
  target.value = importedSchema
  return importedSchema
}
