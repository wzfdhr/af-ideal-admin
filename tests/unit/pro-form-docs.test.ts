import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('ProForm documentation', () => {
  it('documents enterprise form lifecycle contracts', () => {
    const doc = readFile('docs/components/pro-form.md')

    ;[
      'default values',
      'validation',
      'submit loading',
      'submitError',
      'submitErrorText',
      'reset behavior',
      'readonly',
      'async option loading',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
