import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('report schedule documentation', () => {
  it('documents schedule contract, export audit and permissions', () => {
    const docPath = 'docs/components/report-schedules.md'

    expect(fs.existsSync(path.join(rootDir, docPath))).toBe(true)

    const doc = readFile(docPath)

    ;[
      '/report-schedules',
      '/report-schedule-audits',
      'report:schedule',
      'report:audit',
      'Mock',
      '定时报表',
      '导出审计',
      '接收范围',
      '失败场景',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('keeps the enterprise capability map aligned with delivered schedule MVP', () => {
    const capabilityMap = readFile(
      'docs/architecture/enterprise-admin-capability-map.md'
    )

    expect(capabilityMap).toContain(
      '| 报表 | 已具备报表中心 MVP、查询、导出任务模拟、定时报表和导出审计 Mock'
    )
    expect(capabilityMap).toContain(
      '补真实调度器、字段级脱敏和导出文件审计归档'
    )
  })
})
