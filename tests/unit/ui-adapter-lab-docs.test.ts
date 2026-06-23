import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('ui adapter lab documentation', () => {
  it('documents Mock-backed adapter lab contracts and acceptance states', () => {
    const docPath = 'docs/components/ui-adapter-lab.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      'T-200A.3',
      '/ui-adapter-lab/items',
      '/ui-adapter-lab/error',
      'ui-adapter-lab:view',
      'ui-adapter-lab:create',
      'ui-adapter-lab:update',
      'ui-adapter-lab:error',
      'Mock',
      'ProTable',
      'ProForm',
      'Modal',
      'Drawer',
      '空态',
      '错误态',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
