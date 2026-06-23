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

  it('requires reviewer decision evidence and sensitive-area test mapping', () => {
    const template = readFile('.github/pull_request_template.md')
    const checklist = readFile('docs/development/code-review-checklist.md')
    const riskLevels = readFile('docs/development/risk-levels.md')

    ;[
      'Reviewer 判定记录',
      '结论：可合并 / 请求修改 / 暂缓合并',
      '验证证据',
      '敏感区域测试矩阵',
      '权限 / 认证 / 请求 / 表单 schema',
    ].forEach((keyword) => {
      expect(template).toContain(keyword)
    })
    ;[
      '## 阻断合并条件',
      '## 风险等级判定矩阵',
      'P0 必须阻断',
      'P1 必须补测',
      'P2 必须说明回滚',
      'P3 可按最小验证放行',
    ].forEach((keyword) => {
      expect(checklist).toContain(keyword)
    })

    expect(riskLevels).toContain('风险等级判定矩阵')
    expect(riskLevels).toContain('从高到低取最高风险等级')
  })
})
