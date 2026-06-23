import { describe, expect, it, vi } from 'vitest'
import { createDictionaryService } from '@/services/dictionary'

describe('dictionary service', () => {
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
