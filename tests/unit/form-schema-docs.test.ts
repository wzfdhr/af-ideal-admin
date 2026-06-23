import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('form schema documentation', () => {
  it('documents version migration and unsupported version policy', () => {
    const doc = readFile('docs/components/form-schema.md')

    ;[
      'legacy schema',
      'current schema',
      'future version',
      '不支持的表单 schema 版本',
      'CURRENT_FORM_SCHEMA_VERSION',
      'migrateFormSchema',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('documents import, export, preview, publish, and rollback constraints', () => {
    const doc = readFile('docs/components/form-schema.md')

    ;[
      'exportFormSchema',
      'importFormSchema',
      'applyImportedFormSchema',
      '表单 schema JSON 格式错误',
      'previewVisible',
      'FormRenderer',
      'publishFormSchema',
      'rollbackFormSchema',
      '发布前 schema 校验失败时不会发起接口请求',
      'actionError',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
