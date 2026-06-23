import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('data permission documentation', () => {
  it('documents data permission contract, mock scenarios and permissions', () => {
    const docPath = 'docs/components/data-permission-center.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      '/permissions/data-scopes',
      '/permissions/data-scopes/preview',
      '/permissions/data-scopes/:roleId',
      'data-permission:view',
      'data-permission:update',
      'data-permission:preview',
      'Mock',
      '全部数据',
      '本租户',
      '本部门及下级',
      '本部门',
      '本人',
      '字段权限',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('keeps the enterprise capability map aligned with delivered data permission MVP', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain(
      '| 权限控制 | 已具备路由、菜单、按钮权限、权限码模型和数据权限中心 MVP | MVP | 1 |'
    )
    expect(capabilityMap).toContain(
      '补真实后端数据权限 SQL/ORM 注入、字段脱敏和租户隔离审计'
    )
  })
})
