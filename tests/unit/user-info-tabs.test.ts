import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('user info tab panels', () => {
  it('fills the personal attachment tab with enterprise profile content', () => {
    const attachmentPanel = readFile(
      'src/views/user/info/widgets/info-attachment.vue'
    )

    expect(attachmentPanel).not.toContain('<div>11</div>')
    ;[
      'data-testid="user-attachment-panel"',
      '最近上传',
      '资料类型',
      '权限说明',
      '上传规范',
      '身份证明',
      '劳动合同',
    ].forEach((requiredText) => {
      expect(attachmentPanel).toContain(requiredText)
    })
  })
})
