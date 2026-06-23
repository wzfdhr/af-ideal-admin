import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('file resource documentation', () => {
  it('documents file resource contract, mock scenarios and permissions', () => {
    const docPath = 'docs/components/file-resource-center.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      '/files/resources',
      '/files/resources/upload',
      'file:list',
      'file:upload',
      'file:download',
      'file:preview',
      'Mock',
      '上传成功',
      '超限',
      '格式错误',
      '权限拒绝',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('keeps the enterprise capability map aligned with delivered file MVP', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain(
      '| 文件 | 已具备文件资源中心、Mock 上传校验、下载、预览和权限拒绝模拟 | 增强能力 | 10 |'
    )
    expect(capabilityMap).toContain('补真实对象存储、分片上传和病毒扫描')
  })
})
