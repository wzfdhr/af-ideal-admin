import { describe, expect, it } from 'vitest'
import { mockFail, mockOk } from '@/mock/response'

describe('mock response helpers', () => {
  it('wraps successful data with the API contract', () => {
    expect(mockOk({ id: 1 })).toEqual({
      code: 20000,
      msg: 'success',
      data: { id: 1 },
    })
  })

  it('wraps business failures with code and message', () => {
    expect(mockFail('Forbidden', 50003)).toEqual({
      code: 50003,
      msg: 'Forbidden',
      data: null,
    })
  })
})
