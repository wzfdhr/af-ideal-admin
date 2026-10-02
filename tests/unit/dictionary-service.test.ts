import { describe, expect, it, vi } from 'vitest'
import { createDictionaryService } from '@/services/dictionary'

describe('dictionary service', () => {
  it('isolates tenants, rejects late old responses and only retains the newest refresh', async () => {
    let scope = 'tenant-a'
    const pending: ((value: { label: string; value: string }[]) => void)[] = []
    const service = createDictionaryService({
      scope: () => scope,
      fetcher: () =>
        new Promise((resolve) => {
          pending.push(resolve)
        }),
    })
    const old = service.getOptions('private').catch((error) => error)
    scope = 'tenant-b'
    expect(service.getLabel('private', 'v')).toBe('v')
    const current = service.getOptions('private')
    pending[1]([{ label: 'B', value: 'v' }])
    await current
    pending[0]([{ label: 'A private', value: 'v' }])
    expect((await old).name).toBe('ContextChangedError')
    expect(service.getLabel('private', 'v')).toBe('B')
    const earlier = service.getOptions('private', true).catch((error) => error)
    const newest = service.getOptions('private', true)
    pending[3]([{ label: 'newest', value: 'v' }])
    await newest
    pending[2]([{ label: 'earlier', value: 'v' }])
    expect((await earlier).name).toBe('ContextChangedError')
    expect(service.getLabel('private', 'v')).toBe('newest')
  })
  it('expires a successful cache and invalidates pending requests on clear', async () => {
    let now = 0
    const fetcher = vi.fn().mockResolvedValue([{ label: 'old', value: 'v' }])
    const service = createDictionaryService({
      fetcher,
      now: () => now,
      ttlMs: 10,
    })
    await service.getOptions('category')
    now = 11
    fetcher.mockResolvedValue([{ label: 'new', value: 'v' }])
    await service.getOptions('category')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(service.getLabel('category', 'v')).toBe('new')
    service.clear('category')
    expect(service.getLabel('category', 'v')).toBe('v')
  })
  it('caches remote dictionary requests by key', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ label: '男', value: 1 }])
    const service = createDictionaryService({ fetcher })

    await expect(service.getOptions('gender')).resolves.toEqual([
      { label: '男', value: 1 },
    ])
    await expect(service.getOptions('gender')).resolves.toEqual([
      { label: '男', value: 1 },
    ])

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('gender')
  })

  it('returns static dictionaries without calling the remote fetcher', async () => {
    const fetcher = vi.fn()
    const service = createDictionaryService({
      fetcher,
      staticDictionaries: {
        status: [{ label: '启用', value: 'enabled' }],
      },
    })

    await expect(service.getOptions('status')).resolves.toEqual([
      { label: '启用', value: 'enabled' },
    ])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('exposes a clear error state when loading fails', async () => {
    const service = createDictionaryService({
      fetcher: vi.fn().mockRejectedValue(new Error('network down')),
    })

    await expect(service.getOptions('broken')).rejects.toMatchObject({
      key: 'broken',
      message: '字典 broken 加载失败',
    })
    expect(service.getState('broken')).toMatchObject({
      loading: false,
      error: '字典 broken 加载失败',
      options: [],
    })
  })

  it('resolves table display labels from the same cached dictionary source', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ label: '男', value: 'male' }])
    const service = createDictionaryService({ fetcher })

    await service.getOptions('gender')

    expect(service.getLabel('gender', 'male')).toBe('男')
    expect(service.getLabel('gender', 'unknown', '未知')).toBe('未知')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
