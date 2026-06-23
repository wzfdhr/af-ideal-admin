import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('system dict adapter rehearsal', () => {
  it('moves dictionary modal workflows behind adminUi while documenting remaining gaps', () => {
    const source = readFile('src/views/system/dictSystem/index.vue')
    const report = readFile(
      'docs/architecture/aheart-ui-dict-migration-rehearsal.md'
    )
    const strategy = readFile('docs/architecture/ui-library-strategy.md')

    expect(source).toContain('const { Message, Modal } = adminUi')
    expect(source).toContain(':is="Modal"')
    expect(source).not.toContain('<a-modal')

    expect(report).toContain('T-200A.4')
    expect(report).toContain('src/views/system/dictSystem/index.vue')
    expect(report).toContain('/system/dictionaries')
    expect(report).toContain('system:dict:list')
    expect(report).toContain('ProTable')
    expect(report).toContain('ProForm')
    expect(report).toContain('PermissionButton')
    expect(report).toContain('adminUi.Modal')
    expect(report).toContain('<a-descriptions>')
    expect(report).toContain('Blocked')
    expect(report).toContain('rollback')
    expect(strategy).toContain(
      'docs/architecture/aheart-ui-dict-migration-rehearsal.md'
    )
  })
})
