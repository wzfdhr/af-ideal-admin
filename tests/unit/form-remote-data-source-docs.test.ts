import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('form remote data source documentation', () => {
  it('documents security, timeout, adapter and standard mock response contracts', () => {
    const doc = readFile('docs/components/form-remote-data-source.md')

    ;[
      '未授权的远程数据源',
      'params',
      'timeout',
      'responseAdapter',
      'responseWrap',
      'code',
      '远程选项响应格式错误',
      '远程选项加载超时',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
