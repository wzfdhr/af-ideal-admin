import assert from 'node:assert/strict'
import { test } from 'node:test'
import contracts from '../dist/index.js'

const { parseLeaveFields, calculateHalfDayUnits, parseCommand, parseWorkflow,
  parseForm, DomainError, LEAVE_FORM, serialWorkflow, demoIdentities } = contracts
const fields = { leaveType: 'personal', startDate: '2026-10-01',
  startSlot: 'am', endDate: '2026-10-02', endSlot: 'pm', reason: '家庭事务' }

test('natural calendar days retain weekends and count half-day slots', () => {
  assert.equal(calculateHalfDayUnits(fields), 4)
  assert.equal(calculateHalfDayUnits({ ...fields, endDate: fields.startDate, endSlot: 'am' }), 1)
  assert.equal(calculateHalfDayUnits({ ...fields, startDate: '2026-10-03', endDate: '2026-10-04' }), 4)
})
test('invalid dates, reversed slots, unknown types and excessive ranges fail with fields', () => {
  for (const patch of [{ startDate: '2026-02-30' }, { endDate: '2026-09-30' },
    { startSlot: 'night' }, { leaveType: 'unlimited' }, { reason: '' },
    { endDate: '2028-10-01' }]) {
    assert.throws(() => parseLeaveFields({ ...fields, ...patch }), DomainError)
  }
  assert.throws(() => parseLeaveFields({ ...fields, startSlot: 'pm',
    endDate: fields.startDate, endSlot: 'am' }), /结束/)
})
test('clients cannot inject applicant, tenant, duration or terminal status', () => {
  for (const key of ['applicantId', 'tenantId', 'halfDayUnits', 'status']) {
    assert.throws(() => parseLeaveFields({ ...fields, [key]: 'forged' }), /不允许/)
  }
})
test('command revisions and rejection comment are checked', () => {
  assert.deepEqual(parseCommand({ expectedRevision: 2, comment: '通过' }),
    { expectedRevision: 2, comment: '通过' })
  for (const revision of [0, -1, 1.5, '2']) {
    assert.throws(() => parseCommand({ expectedRevision: revision }))
  }
  assert.throws(() => parseCommand({ expectedRevision: 1 }, true), /意见/)
})
test('schemas migrate absent legacy format version and reject future versions', () => {
  const wf = serialWorkflow('manager-1', 'manager-2')
  assert.equal(parseWorkflow({ ...wf, version: undefined }).version, 1)
  assert.throws(() => parseWorkflow({ ...wf, version: 2 }), /版本/)
  assert.equal(parseForm(LEAVE_FORM).version, 1)
  assert.throws(() => parseForm({ ...LEAVE_FORM, version: 99 }), /版本/)
})
test('untrusted schema content is never a script, expression or remote URL', () => {
  assert.throws(() => parseForm({ ...LEAVE_FORM, dataSources: [{ url: 'https://evil.test' }] }))
  assert.throws(() => parseForm({ ...LEAVE_FORM, widgetsConfig:
    [{ ...LEAVE_FORM.widgetsConfig[0], config: { rules: 'process.exit()' } }] }))
  assert.throws(() => parseWorkflow({ ...serialWorkflow('manager-1', 'manager-2'),
    nodes: [{ id: 'start', type: 'start', name: 'start', config: { condition: 'evil()' } }] }))
})
test('stable demo identities have distinct IDs and two approvers in both tenants', () => {
  assert.equal(new Set(demoIdentities.map((u) => u.id)).size, demoIdentities.length)
  for (const tenant of ['tenant-a', 'tenant-b']) {
    const users = demoIdentities.filter((u) => u.tenantIds.includes(tenant))
    assert.equal(users.filter((u) => u.kind === 'manager').length, 2)
    assert.ok(users.some((u) => u.kind === 'employee'))
    assert.ok(users.some((u) => u.kind === 'administrator'))
    assert.ok(users.some((u) => u.kind === 'auditor'))
  }
})

test('published leave form requires real business options and usable input configuration', () => {
  contracts.validateLeaveForm(parseForm(LEAVE_FORM))
  const emptyOptions = structuredClone(LEAVE_FORM)
  emptyOptions.widgetsConfig[0].config.options = []
  assert.throws(() => contracts.validateLeaveForm(parseForm(emptyOptions)), /选项/)
  const badOptions = structuredClone(LEAVE_FORM)
  badOptions.widgetsConfig[0].config.options.push({ label: '任意类型', value: 'arbitrary' })
  assert.throws(() => contracts.validateLeaveForm(parseForm(badOptions)), /选项/)
  const unusable = structuredClone(LEAVE_FORM)
  unusable.widgetsConfig.find((item) => item.uid === 'reason').config.maxLength = 0
  assert.throws(() => contracts.validateLeaveForm(parseForm(unusable)), /长度/)
})
