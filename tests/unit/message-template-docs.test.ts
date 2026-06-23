import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('message template task documentation', () => {
  it('documents template contract, send task mock and permissions', () => {
    const docPath = 'docs/components/message-template-tasks.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      '/messages/templates',
      '/messages/send-tasks',
      'message:template',
      'message:send',
      'Mock',
      '消息模板',
      '变量预览',
      '接收人范围',
      '发送任务',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('keeps the enterprise capability map aligned with delivered template MVP', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain(
      '| 消息中心 | 已具备消息管理页面、订阅配置、消息模板、接收人范围、发送任务 Mock'
    )
    expect(capabilityMap).toContain(
      '补真实 WebSocket 网关、消息队列、模板审批和发送审计归档'
    )
  })
})
