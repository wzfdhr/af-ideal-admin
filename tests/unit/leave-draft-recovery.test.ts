import { afterEach, expect, it } from 'vitest'
import {
  clearLeaveRecovery,
  readLeaveRecovery,
  registerLeaveRecovery,
  retainLeaveDrafts,
  saveLeaveRecovery,
} from '@/services/leave-draft-recovery'

const fields = {
  leaveType: 'personal',
  startDate: '2026-10-01',
  startSlot: 'am',
  endDate: '2026-10-01',
  endSlot: 'pm',
  reason: '合成未保存内容',
}
afterEach(() => sessionStorage.clear())
it('reauthentication recovery is scoped to the original actor, tenant and request', () => {
  saveLeaveRecovery('employee-a', 'tenant-a', 'request-1', fields)
  expect(readLeaveRecovery('employee-a', 'tenant-a', 'request-1')?.reason).toBe(
    fields.reason
  )
  expect(
    readLeaveRecovery('employee-b', 'tenant-a', 'request-1')
  ).toBeUndefined()
  expect(
    readLeaveRecovery('employee-a', 'tenant-b', 'request-1')
  ).toBeUndefined()
  expect(
    readLeaveRecovery('employee-a', 'tenant-a', 'request-2')
  ).toBeUndefined()
  clearLeaveRecovery('employee-a', 'tenant-a', 'request-1')
  expect(
    readLeaveRecovery('employee-a', 'tenant-a', 'request-1')
  ).toBeUndefined()
})
it('expired or malformed recovery is ignored and failing storage cannot block logout', () => {
  const key = 'r1-leave-recovery:["a","t","r"]'
  sessionStorage.setItem(
    key,
    JSON.stringify({ at: Date.now() - 86400001, fields })
  )
  expect(readLeaveRecovery('a', 't', 'r')).toBeUndefined()
  sessionStorage.setItem(key, '{invalid')
  expect(readLeaveRecovery('a', 't', 'r')).toBeUndefined()
  const remove = registerLeaveRecovery(() => {
    throw new Error('quota')
  })
  expect(() => retainLeaveDrafts()).not.toThrow()
  remove()
})
