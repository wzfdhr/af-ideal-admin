import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

const expectedSubtasks = [
  'T-200A.1',
  'T-200A.2',
  'T-200A.3',
  'T-200A.4',
  'T-200A.5',
]

describe('ui library strategy documentation', () => {
  it('tracks aheart-ui incubation as executable development plan items', () => {
    const strategy = readFile('docs/architecture/ui-library-strategy.md')
    const checklist = readFile(
      'docs/quality/enterprise-admin-task-checklist.md'
    )
    const plan = readFile(
      'docs/superpowers/plans/2026-06-22-enterprise-admin-framework.md'
    )

    expectedSubtasks.forEach((subtask) => {
      expect(strategy).toContain(subtask)
      expect(checklist).toContain(subtask)
      expect(plan).toContain(subtask)
    })

    expect(strategy).toContain('Development Plan Placement')
    expect(checklist).toContain('未完成的子任务必须标记为阻塞生产替换')
    expect(plan).toContain('docs/architecture/aheart-ui-maturity-matrix.md')
  })
})
