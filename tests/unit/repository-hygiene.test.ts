import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

const listTrackedFiles = () =>
  execFileSync('git', ['ls-files'], {
    cwd: rootDir,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)

const isTextFile = (filePath: string) => {
  const absolutePath = path.join(rootDir, filePath)
  const stat = fs.statSync(absolutePath)

  if (stat.size > 1024 * 1024) return false

  const buffer = fs.readFileSync(absolutePath)
  return !buffer.includes(0)
}

describe('repository hygiene gate', () => {
  it('does not track generated artifacts, dependency archives or local reports', () => {
    const forbiddenTrackedPatterns = [
      { label: 'build output', pattern: /^dist\// },
      { label: 'dependency directory', pattern: /^node_modules\// },
      { label: 'coverage output', pattern: /^coverage\// },
      { label: 'test result output', pattern: /^test-results\// },
      { label: 'playwright report output', pattern: /^playwright-report\// },
      { label: 'zip archive', pattern: /\.zip$/ },
      { label: 'macOS metadata', pattern: /(^|\/)\.DS_Store$/ },
    ]

    const violations = listTrackedFiles().flatMap((filePath) =>
      forbiddenTrackedPatterns
        .filter(({ pattern }) => pattern.test(filePath))
        .map(({ label }) => `${filePath} matches ${label}`)
    )

    expect(violations).toEqual([])
  })

  it('keeps ignore rules for local outputs, reports and package archives', () => {
    const ignoredEntries = readFile('.gitignore')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))

    ;[
      'dist',
      'node_modules/',
      'coverage',
      'test-results/',
      'playwright-report/',
      '*.zip',
      '.DS_Store',
    ].forEach((entry) => {
      expect(ignoredEntries).toContain(entry)
    })
  })

  it('documents repository hygiene in the development center and release checklist', () => {
    const hygienePath = 'docs/development/repository-hygiene.md'

    expect(fs.existsSync(path.join(rootDir, hygienePath))).toBe(true)

    const developmentIndex = readFile('docs/development/index.md')
    const releaseChecklist = readFile('docs/development/release-checklist.md')
    const hygieneGuide = readFile(hygienePath)

    expect(developmentIndex).toContain('repository-hygiene.md')
    expect(releaseChecklist).toContain('repository-hygiene.md')
    ;['生成产物', '依赖压缩包', '敏感信息', 'git ls-files'].forEach(
      (keyword) => {
        expect(hygieneGuide).toContain(keyword)
      }
    )
  })

  it('does not contain sensitive access tokens in tracked text files', () => {
    const secretPatterns = [
      {
        label: 'GitHub personal access token',
        pattern: new RegExp(`${['github', 'pat'].join('_')}_`, 'i'),
      },
      {
        label: 'GitHub classic token',
        pattern: /ghp_[A-Za-z0-9_]{12,}/i,
      },
      {
        label: 'Authorization bearer credential',
        pattern: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{12,}/i,
      },
      {
        label: 'x-access-token credential',
        pattern:
          /x-access-token\s*[:=]\s*(?!\[redacted\]|\.{3}|<)[A-Za-z0-9._-]{12,}/i,
      },
    ]

    const violations = listTrackedFiles()
      .filter(isTextFile)
      .flatMap((filePath) => {
        const content = readFile(filePath)

        return secretPatterns
          .filter(({ pattern }) => pattern.test(content))
          .map(({ label }) => `${filePath} contains ${label}`)
      })

    expect(violations).toEqual([])
  })
})
