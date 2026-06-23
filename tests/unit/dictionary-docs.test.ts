import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('dictionary documentation', () => {
  it('documents cache, shared display source and error contracts', () => {
    const doc = readFile('docs/components/dictionary.md')

    ;[
      'getOptions',
      'getLabel',
      'in-flight request',
      'DictSelect',
      'DictRadio',
      'loadError',
      'inline error',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
