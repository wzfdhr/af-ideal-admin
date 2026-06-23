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
})
