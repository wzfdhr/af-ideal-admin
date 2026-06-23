import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('workflow designer documentation', () => {
  it('documents the T-351 designer, schema, permission, and mock runtime loop', () => {
    const doc = readFile('docs/components/workflow-designer.md')

    ;[
      'AntV X6',
      'start',
      'approval',
      'copy',
      'condition',
      'parallel',
      'end',
      'CURRENT_WORKFLOW_SCHEMA_VERSION',
      'validateWorkflowSchema',
      'loadDraft',
      'getWorkflowDefinition',
      'actionError',
      '没有流程发布权限',
      'approve',
      'reject',
      'transfer',
      'withdraw',
      'history',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
