import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('report center documentation', () => {
  it('documents the T-354 report, chart, export, permission, and error loop', () => {
    const doc = readFile('docs/components/report-center.md')

    ;[
      'trend',
      'distribution',
      'detail',
      'fetchReports',
      'fetchReportData',
      'permissionCode',
      'report:sales-trend:view',
      'report:order-detail:customer',
      'created',
      'in-progress',
      'completed',
      'failed',
      'POST /api/report-export-tasks',
      'GET  /api/report-export-tasks',
      'errorMessage',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
