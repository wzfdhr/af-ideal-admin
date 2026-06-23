import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('observability documentation', () => {
  it('documents the T-401 runtime notice, request isolation, and white-screen loop', () => {
    const doc = readFile('docs/architecture/observability.md')

    ;[
      'app.config.errorHandler',
      'router.onError',
      'af-global-error-notice',
      'onDetected',
      '旁路能力',
      'traceId',
      'version',
      'Authorization',
      '身份证号',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
