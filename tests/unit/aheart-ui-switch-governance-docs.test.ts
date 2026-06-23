import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('aheart-ui switch governance documentation', () => {
  it('documents T-200A.5 switch and rollback gates', () => {
    const docPath = 'docs/architecture/aheart-ui-switch-governance.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)
    const strategy = readFile('docs/architecture/ui-library-strategy.md')
    const checklist = readFile(
      'docs/quality/enterprise-admin-task-checklist.md'
    )

    ;[
      'T-200A.5',
      'Component-level replacement rule',
      'Page-level gray replacement rule',
      'Production default switch rule',
      'Rollback trigger',
      'Owner and evidence',
      'docs/architecture/aheart-ui-maturity-matrix.md',
      'docs/architecture/aheart-ui-dict-migration-rehearsal.md',
      'src/views/examples/ui-adapter-lab/index.vue',
      'Blocked',
      'Ready',
      'rollback',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })

    expect(strategy).toContain(docPath)
    expect(checklist).toContain(docPath)
  })
})
