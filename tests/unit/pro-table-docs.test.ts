import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('ProTable documentation', () => {
  it('documents pagination, loading, refresh and empty state contracts', () => {
    const doc = readFile('docs/components/pro-table.md')

    ;[
      'pagination',
      'loading',
      'empty state',
      'emptyText',
      'reset',
      'reload',
      'fetchData',
      'Server Pagination',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
