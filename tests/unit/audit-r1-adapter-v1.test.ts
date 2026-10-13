import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installR1MockAdapter, r1Demo } from '@/mock/r1-adapter'

describe('audit query bridge in the R1 development adapter', () => {
  beforeEach(() => {
    localStorage.setItem('userId', 'a-admin')
    vi.restoreAllMocks()
  })

  it('preserves both audit date positions as repeated params instead of a comma string', async () => {
    vi.spyOn(r1Demo, 'isIdentity').mockReturnValue(true)
    const request = vi.spyOn(r1Demo, 'request').mockReturnValue({
      list: [],
      total: 0,
    })
    const client = axios.create()
    installR1MockAdapter(client)
    await client.get('/audit/events', {
      params: { dateRange: ['', '2026-10-13'] },
    })
    expect(request).toHaveBeenCalledWith(
      'get',
      '/audit/events?dateRange=&dateRange=2026-10-13',
      'a-admin',
      'tenant-a',
      undefined,
      undefined
    )
  })

  it('leaves non-audit array bridging on the existing generic string path', async () => {
    vi.spyOn(r1Demo, 'isIdentity').mockReturnValue(true)
    const request = vi.spyOn(r1Demo, 'request').mockReturnValue({ ok: true })
    const client = axios.create()
    installR1MockAdapter(client)
    await client.get('/unrelated', { params: { values: ['a', 'b'] } })
    expect(request.mock.calls[0][1]).toBe('/unrelated?values=a%2Cb')
  })
})
