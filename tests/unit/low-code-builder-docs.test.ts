import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('low-code builder documentation', () => {
  it('documents the T-352 schema, materials, actions, permissions, and mock loop', () => {
    const doc = readFile('docs/components/low-code-builder.md')

    ;[
      'CURRENT_LOW_CODE_PAGE_SCHEMA_VERSION',
      'validateLowCodePageSchema',
      'LOW_CODE_MATERIALS',
      'ProTable',
      'ProForm',
      'ChartCard',
      'StatCard',
      'permissionCode',
      'query',
      'submit',
      'navigate',
      'openModal',
      'refreshBlock',
      'previewLowCodeDataSource',
      'low-code-customer-query',
      'customers',
      'empty',
      'failure',
      'actionError',
      'previewError',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
