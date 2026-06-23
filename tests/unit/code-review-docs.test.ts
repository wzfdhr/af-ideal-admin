import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

const docs = [
  '.github/pull_request_template.md',
  'docs/development/code-review-checklist.md',
  'docs/development/risk-levels.md',
]

describe('enterprise code review documentation', () => {
  it('ships PR template, review checklist and risk level guide', () => {
    docs.forEach((docPath) => {
      expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)
    })

    const developmentIndex = readFile('docs/development/index.md')

    expect(developmentIndex).toContain('code-review-checklist.md')
    expect(developmentIndex).toContain('risk-levels.md')
  })

  it('requires every PR to explain scope, validation, risk and rollback', () => {
    const template = readFile('.github/pull_request_template.md')

    expect(template).toContain('变更范围')
    expect(template).toContain('验证命令')
    expect(template).toContain('风险等级')
    expect(template).toContain('回滚方式')
    expect(template).toContain('npm run lint:check')
    expect(template).toContain('npm run typecheck')
    expect(template).toContain('npm run test')
    expect(template).toContain('npm run build:prd')
  })

  it('marks sensitive areas as requiring tests and reviewer checks', () => {
    const checklist = readFile('docs/development/code-review-checklist.md')
    const riskLevels = readFile('docs/development/risk-levels.md')

    ;['权限', '认证', '请求', '表单 schema'].forEach((area) => {
      expect(checklist).toContain(area)
      expect(checklist).toContain('必须有测试')
    })

    expect(checklist).toContain('可合并')
    expect(checklist).toContain('暂缓合并')
    expect(riskLevels).toContain('P0')
    expect(riskLevels).toContain('P1')
    expect(riskLevels).toContain('P2')
    expect(riskLevels).toContain('P3')
    expect(riskLevels).toContain('回滚')
  })
})
