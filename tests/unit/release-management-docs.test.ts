import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

const readJson = <T>(filePath: string) => JSON.parse(readFile(filePath)) as T

describe('release management documentation', () => {
  it('ships changelog and release management guide', () => {
    expect(fs.existsSync(path.join(rootDir, 'CHANGELOG.md'))).toBe(true)
    expect(
      fs.existsSync(
        path.join(rootDir, 'docs/development/release-management.md')
      )
    ).toBe(true)

    const developmentIndex = readFile('docs/development/index.md')

    expect(developmentIndex).toContain('release-management.md')
    expect(developmentIndex).toContain('../deployment.md')
  })

  it('keeps current package version traceable in changelog', () => {
    const packageJson = readJson<{ version: string }>('package.json')
    const changelog = readFile('CHANGELOG.md')

    expect(changelog).toContain('Unreleased')
    expect(changelog).toContain(packageJson.version)
    expect(changelog).toContain('变更说明')
    expect(changelog).toContain('迁移说明')
  })

  it('documents conventional commits, version policy and release gates', () => {
    const guide = readFile('docs/development/release-management.md')
    const checklist = readFile('docs/development/release-checklist.md')

    ;['feat:', 'fix:', 'docs:', 'chore:', 'release:'].forEach((prefix) => {
      expect(guide).toContain(prefix)
    })
    ;['MAJOR', 'MINOR', 'PATCH', 'alpha'].forEach((versionPart) => {
      expect(guide).toContain(versionPart)
    })
    ;[
      'npm run lint:check',
      'npm run typecheck',
      'npm run test',
      'npm run build:prd',
    ].forEach((command) => {
      expect(guide).toContain(command)
      expect(checklist).toContain(command)
    })
    expect(guide).toContain('CHANGELOG.md')
    expect(guide).toContain('迁移说明')
    expect(checklist).toContain('CHANGELOG.md')
  })

  it('requires release traceability evidence for every version', () => {
    const packageJson = readJson<{ version: string }>('package.json')
    const changelog = readFile('CHANGELOG.md')
    const guide = readFile('docs/development/release-management.md')
    const checklist = readFile('docs/development/release-checklist.md')
    const currentVersionTitle = `## [${packageJson.version}]`
    const currentVersionStart = changelog.indexOf(currentVersionTitle)
    const currentVersionEnd = changelog.indexOf(
      '\n## [',
      currentVersionStart + 1
    )
    const currentVersionSection = changelog.slice(
      currentVersionStart,
      currentVersionEnd === -1 ? changelog.length : currentVersionEnd
    )

    expect(currentVersionStart).toBeGreaterThanOrEqual(0)
    ;[
      '## 发布证据记录模板',
      '版本号',
      'Git tag',
      '变更说明',
      '迁移说明',
      '验证证据',
      '回滚方式',
      '后端 / 运维配合',
    ].forEach((requiredText) => {
      expect(guide).toContain(requiredText)
    })
    ;[
      '## 版本号与发布证据',
      '`package.json` version',
      '`CHANGELOG.md` 当前版本条目',
      'Git tag',
      '验证证据',
    ].forEach((requiredText) => {
      expect(checklist).toContain(requiredText)
    })
    ;['### 发布证据', 'Git tag', '验证证据', '回滚方式'].forEach(
      (requiredText) => {
        expect(currentVersionSection).toContain(requiredText)
      }
    )
  })
})
