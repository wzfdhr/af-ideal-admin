import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '../..')

const readFile = (filePath: string) =>
  fs.readFileSync(path.join(rootDir, filePath), 'utf8')

describe('audit event documentation', () => {
  it('documents the T-402 audit boundary and sanitization responsibilities', () => {
    const doc = readFile('docs/architecture/audit-events.md')

    ;[
      'T-402',
      'recordAuditEvent',
      '提交前脱敏',
      '双旁路',
      'operator',
      'occurredAt',
      'target',
      'result',
      '前端负责',
      '后端负责',
      'Authorization',
      '身份证号',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })

  it('documents the T-404 mock query loop and display redaction rules', () => {
    const doc = readFile('docs/architecture/audit-events.md')

    ;[
      'T-404',
      'GET /audit/events',
      'operatorName',
      'module',
      'result',
      'eventType',
      'dateRange',
      'auth.login',
      'system.role.update',
      'workflow.publish',
      'form.publish',
      'data-screen.publish',
      'report.export',
      '页面展示前二次脱敏',
    ].forEach((keyword) => {
      expect(doc).toContain(keyword)
    })
  })
})
