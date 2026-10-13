import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseReportScheduleDefinition, parseReportScheduleTiming,
  parseReportScheduleCreate, parseReportScheduleUpdate,
  parseReportScheduleToggle, parseReportScheduleCommand,
} from '../dist/index.js'

const timing = (extra = {}) => ({ frequency: 'daily', timeZone: 'Asia/Shanghai', time: '09:00', ...extra })
const schema = (extra = {}) => ({ version: 1, name: '实际自然期报表', definitionVersionId: 'fixed-report-version', timing: timing(), dataWindow: 'previous-period', recipients: { kind: 'tenant' }, format: 'csv', ...extra })
const rejects = (run) => assert.throws(run, (error) => error.status === 422 && error.businessCode === 'VALIDATION_ERROR')

test('schedule v1 fixes a report, supported format, calendar and recipient rule without mutable references', () => {
  for (const format of ['csv', 'xlsx', 'pdf']) {
    const original = schema({ format })
    const parsed = parseReportScheduleDefinition(original)
    assert.deepEqual(parsed, original)
    original.timing.time = '20:00'
    original.recipients.kind = 'role'
    assert.equal(parsed.timing.time, '09:00')
    assert.deepEqual(parsed.recipients, { kind: 'tenant' })
  }
  for (const dataWindow of ['previous-period', 'current-period'])
    assert.equal(parseReportScheduleDefinition(schema({ dataWindow })).dataWindow, dataWindow)
  for (const recipients of [{ kind: 'role', roleId: 'role-owned' }, { kind: 'department', departmentId: 'department-owned' }])
    assert.deepEqual(parseReportScheduleDefinition(schema({ recipients })).recipients, recipients)
})

test('closed calendar shape forbids irrelevant weekly or monthly parameters and arbitrary clock rules', () => {
  assert.equal(parseReportScheduleTiming(timing({ frequency: 'weekly', weekday: 7 })).weekday, 7)
  assert.equal(parseReportScheduleTiming(timing({ frequency: 'monthly', dayOfMonth: 31 })).dayOfMonth, 31)
  for (const input of [timing({ weekday: 1 }), timing({ dayOfMonth: 1 }), timing({ frequency: 'weekly', weekday: 1, dayOfMonth: 1 }), timing({ frequency: 'monthly', dayOfMonth: 1, weekday: 1 }), timing({ cron: '* * * * *' }), timing({ now: '2026-10-13' }), timing({ expression: 'Date.now()' })])
    rejects(() => parseReportScheduleTiming(input))
  for (const time of ['9:00', '24:00', '09:60', '09:00:00', '09:00Z', ' 09:00 ', null])
    rejects(() => parseReportScheduleTiming(timing({ time })))
  for (const timeZone of ['GMT', 'CST', '+08:00', 'local', 'invalid/time-zone', null])
    rejects(() => parseReportScheduleTiming(timing({ timeZone })))
})

test('day numbers are bounded safe integers while calendar gaps remain an explicit runtime policy', () => {
  for (const weekday of [undefined, 0, 8, 1.5, '1', true, Number.MAX_SAFE_INTEGER + 1])
    rejects(() => parseReportScheduleTiming(timing({ frequency: 'weekly', weekday })))
  for (const dayOfMonth of [undefined, 0, 32, 1.5, '1', true])
    rejects(() => parseReportScheduleTiming(timing({ frequency: 'monthly', dayOfMonth })))
  for (const dayOfMonth of [28, 29, 30, 31])
    assert.equal(parseReportScheduleTiming(timing({ frequency: 'monthly', dayOfMonth })).dayOfMonth, dayOfMonth)
})

test('future formats and client authority, cursor, delivery, recipient facts and source data are rejected', () => {
  rejects(() => parseReportScheduleDefinition(Object.create(schema())))
  rejects(() => parseReportScheduleTiming(Object.create(timing())))
  rejects(() => parseReportScheduleDefinition(schema({ recipients: Object.create({ kind: 'tenant' }) })))
  for (const version of [undefined, null, 0, 2, '1'])
    rejects(() => parseReportScheduleDefinition(schema({ version })))
  for (const key of ['tenantId', 'createdBy', 'nextRunAt', 'lastRunAt', 'slotAt', 'cursor', 'occurrenceId', 'rowCount', 'rows', 'recipientIds', 'recipientCount', 'notificationId', 'sent', 'attempts', 'leaseUntil', 'status', 'success', 'scenario', 'producerVersion', 'query', 'sql', 'script', 'email', 'webhook'])
    rejects(() => parseReportScheduleDefinition(schema({ [key]: 'forged' })))
  for (const format of ['html', 'xml', 'CSV', null])
    rejects(() => parseReportScheduleDefinition(schema({ format })))
  for (const dataWindow of ['last-year', 'custom-expression', { from: '2026-01-01' }, null])
    rejects(() => parseReportScheduleDefinition(schema({ dataWindow })))
})

test('recipient references cannot replace IDs with free text, other kinds, client resolved membership or tenant IDs', () => {
  for (const recipients of [{ kind: 'role', roleName: '管理员' }, { kind: 'department', departmentName: '运营部' }, { kind: 'tenant', tenantId: 'other' }, { kind: 'role', roleId: 'role', members: ['user'] }, { kind: 'all' }, { kind: 'self' }, { kind: 'ids', ids: ['user'] }, { kind: 'email', address: 'recipient@example.invalid' }, null])
    rejects(() => parseReportScheduleDefinition(schema({ recipients })))
  for (const roleId of ['', ' ', null, 1, 'x'.repeat(101)])
    rejects(() => parseReportScheduleDefinition(schema({ recipients: { kind: 'role', roleId } })))
})

test('create, update, toggle, retry and cancel require explicit command shapes and exact revisions', () => {
  assert.deepEqual(parseReportScheduleCreate({ schema: schema(), enabled: false }), { schema: schema(), enabled: false })
  assert.equal(parseReportScheduleUpdate({ schema: schema(), expectedRevision: 5 }).expectedRevision, 5)
  assert.deepEqual(parseReportScheduleToggle({ enabled: true, expectedRevision: 3 }), { enabled: true, expectedRevision: 3 })
  assert.deepEqual(parseReportScheduleCommand({ expectedRevision: 7 }), { expectedRevision: 7 })
  for (const enabled of [undefined, 1, 0, 'true', null]) {
    rejects(() => parseReportScheduleCreate({ schema: schema(), enabled }))
    rejects(() => parseReportScheduleToggle({ expectedRevision: 1, enabled }))
  }
  for (const expectedRevision of [undefined, null, 0, -1, 1.2, '1', Infinity]) {
    rejects(() => parseReportScheduleUpdate({ schema: schema(), expectedRevision }))
    rejects(() => parseReportScheduleToggle({ enabled: true, expectedRevision }))
    rejects(() => parseReportScheduleCommand({ expectedRevision }))
  }
  rejects(() => parseReportScheduleCreate({ schema: schema(), enabled: true, nextRunAt: 'forced' }))
  rejects(() => parseReportScheduleCommand({ expectedRevision: 1, recipientIds: ['new-recipient'] }))
})
