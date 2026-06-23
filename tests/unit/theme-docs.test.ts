import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('theme documentation', () => {
  it('documents theme contract, mock scenarios and permissions', () => {
    const docPath = 'docs/components/theme-center.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      '/themes/brands',
      '/themes/brands/:tenantId',
      '/themes/brands/:tenantId/apply',
      'theme:view',
      'theme:update',
      'theme:apply',
      'Mock',
      '租户品牌',
      '主题色',
      '暗色模式',
      '紧凑模式',
      'adapter token',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('keeps the enterprise capability map aligned with delivered theme MVP', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain(
      '| 主题 | 已具备主题中心、Mock 租户品牌、Logo、标题、主题色、暗色模式、紧凑模式和 adapter token 预览 | 长期生态 | 11 |'
    )
    expect(capabilityMap).toContain(
      '补真实主题持久化、运行时 CSS 变量注入和 aheart-ui 主题变量映射'
    )
  })
})
