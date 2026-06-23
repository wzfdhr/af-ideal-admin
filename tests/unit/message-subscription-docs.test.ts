import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('message subscription documentation', () => {
  it('documents subscription contract, mock push and permissions', () => {
    const docPath = 'docs/components/message-subscriptions.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      '/messages/subscriptions',
      '/messages/subscriptions/push-simulations',
      'message:subscribe',
      'message:push',
      'Mock',
      'WebSocket',
      '订阅配置',
      '跳转联动',
      '推送模拟',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('keeps the enterprise capability map aligned with delivered subscription MVP', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain(
      '| 消息中心 | 已具备消息管理页面、订阅配置、跳转联动、Mock 推送模拟'
    )
    expect(capabilityMap).toContain(
      '补真实 WebSocket 网关、消息模板、接收人范围和发送任务管理'
    )
  })
})
