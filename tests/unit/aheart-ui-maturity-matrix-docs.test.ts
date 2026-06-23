import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')
const matrixPath = 'docs/architecture/aheart-ui-maturity-matrix.md'

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

const requiredRows = [
  '| Core | Button |',
  '| Data | Table |',
  '| Form | Form |',
  '| Form | Input |',
  '| Form | Select |',
  '| Form | DatePicker |',
  '| Data Entry | Upload |',
  '| Data Display | Tree |',
  '| Data Entry | Cascader |',
  '| Feedback | Modal |',
  '| Feedback | Drawer |',
  '| Feedback | Message |',
  '| Feedback | Notification |',
  '| Navigation | Tabs |',
  '| Navigation | Menu |',
  '| Layout | Layout |',
  '| Foundation | Theme |',
  '| Foundation | A11y |',
]

describe('aheart-ui maturity matrix documentation', () => {
  it('tracks enterprise readiness gates for every candidate UI area', () => {
    expect(fs.existsSync(path.join(rootDir, matrixPath))).toBe(true)

    const doc = readFile(matrixPath)

    ;[
      'Type Contract',
      'States',
      'Theme',
      'A11y',
      'Docs',
      'Unit Tests',
      'Visual Check',
      'Mock Demo',
      'Candidate Status',
    ].forEach((column) => {
      expect(doc).toContain(column)
    })

    requiredRows.forEach((row) => {
      expect(doc).toContain(row)
    })

    expect(doc).toContain('生产默认 UI 底座')
    expect(doc).toContain('Not ready')
    expect(doc).toContain('Blocked')
  })
})
