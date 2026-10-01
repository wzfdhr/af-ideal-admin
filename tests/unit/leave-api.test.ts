import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from '@/api/request'
import {
  createLeaveRequest,
  submitLeaveRequest,
  decideLeaveTask,
} from '@/api/leave'

vi.mock('@/api/request', () => ({ default: { post: vi.fn() } }))

describe('leave API command boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(request.post).mockResolvedValue({ data: { id: 'request-1' } })
  })

  it('uses the atomic business endpoint and preserves retry keys', async () => {
    await submitLeaveRequest('request-1', 2, 'same-retry-key')
    expect(request.post).toHaveBeenCalledWith(
      '/leave-requests/request-1/submit',
      { expectedRevision: 2, comment: '' },
      { headers: { 'Idempotency-Key': 'same-retry-key' } }
    )
  })

  it('rejects invalid leave fields and missing rejection opinions before network', async () => {
    await expect(
      createLeaveRequest({
        applicationReleaseId: 'release-1',
        fields: {
          leaveType: 'personal',
          startDate: '2026-02-30',
          endDate: '2026-03-01',
          startSlot: 'am',
          endSlot: 'pm',
          reason: '',
        },
      })
    ).rejects.toThrow('日期无效')
    await expect(
      decideLeaveTask('task-1', 'reject', 1, '', 'key')
    ).rejects.toThrow('意见')
    expect(request.post).not.toHaveBeenCalled()
  })
})
