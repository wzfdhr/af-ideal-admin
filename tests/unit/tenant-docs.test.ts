import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('tenant documentation', () => {
  it('documents tenant contract, mock scenarios and permissions', () => {
    const docPath = 'docs/components/tenant-center.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      '/tenants',
      '/tenants/switch',
      'tenant:list',
      'tenant:switch',
      'tenant:org:view',
      'Mock',
      '组织树',
      '数据权限',
      '租户切换',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('keeps the enterprise capability map aligned with delivered tenant MVP', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain(
      '| 多租户 | 已具备租户中心、租户切换、组织树和数据权限范围 Mock 展示 | 增强能力 | 9 |'
    )
    expect(capabilityMap).toContain(
      '补真实租户上下文注入、字段级数据权限和租户品牌落地'
    )
  })
})
