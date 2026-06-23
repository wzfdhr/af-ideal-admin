import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('form runtime documentation', () => {
  it('documents the runtime-only import boundary for business pages', () => {
    const doc = readFile('docs/components/form-runtime.md')

    expect(doc).toContain('@/components/form-runtime')
    expect(doc).toContain('migrateFormSchema')
    expect(doc).toContain('CURRENT_FORM_SCHEMA_VERSION')
    expect(doc).toContain('renderer only')
    expect(doc).not.toContain('@/components/form-designer/schema')
  })
})
