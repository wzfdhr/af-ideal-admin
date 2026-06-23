import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('data screen designer documentation', () => {
  it('documents the T-353 schema, widgets, realtime scenarios, theme, and preview loop', () => {
    const doc = readFile('docs/components/data-screen-designer.md')

    ;[
      'CURRENT_DATA_SCREEN_SCHEMA_VERSION',
      'validateDataScreenSchema',
      '1920x1080',
      'dark',
      'brandColor',
      'LineChart',
      'BarChart',
      'PieChart',
      'RankingList',
      'MetricCard',
      'ScrollTable',
      'enterprise-ops-screen',
      'realtime',
      'empty',
      'alert',
      'failure',
      '全屏预览',
      'errorMessage',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
