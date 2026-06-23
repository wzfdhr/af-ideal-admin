import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

const requiredCapabilities = [
  '权限控制',
  '表单设计器',
  '流程设计器',
  '低代码',
  '大屏',
  '报表',
  '消息中心',
  '审计',
  '多租户',
  '文件',
  '主题',
  '插件化',
]

describe('enterprise capability map documentation', () => {
  it('keeps the capability map discoverable from development docs', () => {
    const developmentIndex = readFile('docs/development/index.md')

    expect(developmentIndex).toContain(
      '../architecture/enterprise-admin-capability-map.md'
    )
  })

  it('maps every required capability to tier, order and Mock data needs', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain('## 能力总览表')

    requiredCapabilities.forEach((capability) => {
      const rowPattern = new RegExp(
        `\\|\\s*${capability}\\s*\\|[^\\n]*\\|\\s*(MVP|增强能力|长期生态)\\s*\\|[^\\n]*Mock[^\\n]*\\|`,
        'u'
      )

      expect(rowPattern.test(capabilityMap)).toBe(true)
    })
  })

  it('keeps the build order and missing capability roadmap explicit', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain('## 推荐建设顺序')
    expect(capabilityMap).toContain('## 缺失能力路线图')
    expect(capabilityMap).toContain('消息中心')
    expect(capabilityMap).toContain('多租户')
    expect(capabilityMap).toContain('文件与资源管理')
    expect(capabilityMap).toContain('插件化')
  })
})
