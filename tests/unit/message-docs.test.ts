import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('message center documentation', () => {
  it('documents message center contract, mock scenarios and permissions', () => {
    const docPath = 'docs/components/message-center.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      '/messages/notifications',
      'message:list',
      'message:read',
      'message:batch-read',
      'Mock',
      '站内信',
      '公告',
      '待办',
      '告警',
      '批量已读',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('keeps the enterprise capability map aligned with delivered message MVP', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain(
      '| 消息中心 | 已具备消息管理页面、API 契约、Mock 站内信、公告、待办、告警和已读操作 | 增强能力 | 7 |'
    )
    expect(capabilityMap).toContain('补消息跳转联动、消息订阅和 WebSocket 推送')
  })
})
