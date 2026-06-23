import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

const expectedProductTasks = Array.from({ length: 16 }, (_, index) => {
  const taskNumber = String(index + 601).padStart(3, '0')

  return `T-${taskNumber}`
})

describe('product commercialization documentation', () => {
  it('tracks the M5 productization stage as executable task checklist items', () => {
    const checklist = readFile(
      'docs/quality/enterprise-admin-task-checklist.md'
    )

    expect(checklist).toContain('M5：产品化与可销售交付阶段')
    expectedProductTasks.forEach((taskId) => {
      expect(checklist).toContain(taskId)
    })
    ;[
      '产品定位与版本分层',
      '演示租户与演示数据包',
      '产品演示路径',
      '一键部署方案',
      '商业交付包',
    ].forEach((requiredText) => {
      expect(checklist).toContain(requiredText)
    })
  })

  it('documents T-601 product positioning and edition boundaries', () => {
    expect(fs.existsSync(path.join(rootDir, 'docs/product/index.md'))).toBe(
      true
    )
    expect(
      fs.existsSync(path.join(rootDir, 'docs/product/product-positioning.md'))
    ).toBe(true)

    const productIndex = readFile('docs/product/index.md')
    const positioning = readFile('docs/product/product-positioning.md')

    expect(productIndex).toContain('product-positioning.md')
    ;[
      'T-601',
      '目标客户',
      '产品定位',
      '销售版本能力矩阵',
      '开源版',
      '专业版',
      '企业版',
      'Mock-first',
      '能力边界',
      '商业化不包含项',
    ].forEach((requiredText) => {
      expect(positioning).toContain(requiredText)
    })
  })

  it('keeps the README aligned with the productized introduction', () => {
    const readme = readFile('README.md')

    ;[
      'docs/product/index.md',
      'docs/product/product-positioning.md',
      'M5：产品化与可销售交付阶段',
      'Mock-first',
      '表单设计器',
      '流程设计器',
      '低代码',
      '数据大屏',
      '报表中心',
      '审计日志',
      '开源版',
      '专业版',
      '企业版',
    ].forEach((requiredText) => {
      expect(readme).toContain(requiredText)
    })
  })
})
