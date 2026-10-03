import { beforeEach, expect, it, vi } from 'vitest'
import {
  packageBindingPeople,
  packageBindingSources,
} from '@/api/application-packages'

const request = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/request', () => ({ default: request }))
beforeEach(() => vi.resetAllMocks())
it('keeps both binding directories selectable beyond the first 100 rows', async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({
    id: `source-${index}`,
  }))
  request.get
    .mockResolvedValueOnce({ data: first })
    .mockResolvedValueOnce({ data: [{ id: 'source-101' }] })
  expect(await packageBindingSources()).toHaveLength(101)
  expect(request.get).toHaveBeenLastCalledWith(
    '/application-packages/sources',
    { params: { current: 2, pageSize: 100 } }
  )
  request.get
    .mockResolvedValueOnce({ data: first })
    .mockResolvedValueOnce({ data: [{ id: 'person-101' }] })
  expect(await packageBindingPeople()).toHaveLength(101)
  expect(request.get).toHaveBeenLastCalledWith('/application-packages/people', {
    params: { current: 2, pageSize: 100 },
  })
})
it('does not silently return a truncated mapping list when a later page fails authorization', async () => {
  request.get
    .mockResolvedValueOnce({
      data: Array.from({ length: 100 }, (_, id) => ({ id })),
    })
    .mockRejectedValueOnce(new Error('permission revoked'))
  await expect(packageBindingSources()).rejects.toThrow('permission revoked')
})
