import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('form designer mock loop documentation', () => {
  it('documents the no-backend designer, runtime submit, and remote option loop', () => {
    const doc = readFile('docs/components/form-designer-mock.md')

    ;[
      'form-customer-registration',
      'loadDraft',
      'getFormSchemaDetail',
      'submitPreview',
      'submitFormRuntime',
      'createFormDesignerMockStore',
      'submissions',
      'users',
      'empty',
      'failure',
      'timeout',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
