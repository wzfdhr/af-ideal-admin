import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('plugin documentation', () => {
  it('documents plugin contract, mock scenarios and permissions', () => {
    const docPath = 'docs/components/plugin-center.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      '/plugins',
      '/plugins/:id/manifest',
      '/plugins/:id/toggle',
      'plugin:view',
      'plugin:toggle',
      'plugin:manifest',
      'Mock',
      'manifest',
      '路由注册',
      '菜单注册',
      '权限注册',
      'Mock 注册',
      '物料注册',
      '启停生命周期',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('keeps the enterprise capability map aligned with delivered plugin MVP', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain(
      '| 插件化 | 已具备插件中心、Mock 插件清单、manifest、启停状态、路由、菜单、权限、Mock 和物料注册预览 | 长期生态 | 12 |'
    )
    expect(capabilityMap).toContain(
      '补真实插件加载隔离、运行时注册生命周期和插件市场发布流程'
    )
  })
})
