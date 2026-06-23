import { describe, expect, it, vi } from 'vitest'
import { loadRemoteOptions } from '@/components/form-runtime/remote-options'
import type { DataSourceConfig } from '@/components/form-designer/schema'

describe('loadRemoteOptions', () => {
  it('loads allowed remote options with mapped params and response adapter', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        records: [
          {
            id: 'u1',
            name: 'Alice',
          },
        ],
      },
    })
    const dataSources: DataSourceConfig[] = [
      {
        key: 'users',
        name: '用户列表',
        url: '/api/form-options/users',
        timeout: 2500,
        params: {
          tenantId: 'tenantId',
        },
        responseAdapter: {
          listPath: 'data.records',
          labelField: 'name',
          valueField: 'id',
        },
      },
    ]

    await expect(
      loadRemoteOptions({
        dataSources,
        sourceUrl: '/api/form-options/users',
        formValues: {
          tenantId: 'tenant-a',
        },
        request,
      })
    ).resolves.toEqual([
      {
        label: 'Alice',
        value: 'u1',
      },
    ])
    expect(request).toHaveBeenCalledWith({
      url: '/api/form-options/users',
      params: {
        tenantId: 'tenant-a',
      },
      timeout: 2500,
    })
  })

  it('loads standard mock business responses without a custom adapter', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        code: 20000,
        msg: 'success',
        data: [{ label: '张三', value: 'u-1' }],
      },
    })

    await expect(
      loadRemoteOptions({
        dataSources: [
          {
            key: 'users',
            name: '用户列表',
            url: '/api/form-options/users',
          },
        ],
        sourceUrl: '/api/form-options/users',
        request,
      })
    ).resolves.toEqual([{ label: '张三', value: 'u-1' }])
  })

  it('blocks arbitrary remote urls even when they are present in schema', async () => {
    const request = vi.fn()

    await expect(
      loadRemoteOptions({
        dataSources: [
          {
            key: 'external',
            name: '外部接口',
            url: 'https://example.com/options',
          },
        ],
        sourceUrl: 'https://example.com/options',
        request,
      })
    ).rejects.toThrow('未授权的远程数据源')
    expect(request).not.toHaveBeenCalled()
  })

  it('blocks urls that are not in the schema whitelist', async () => {
    const request = vi.fn()

    await expect(
      loadRemoteOptions({
        dataSources: [
          {
            key: 'users',
            name: '用户列表',
            url: '/api/form-options/users',
          },
        ],
        sourceUrl: '/api/form-options/roles',
        request,
      })
    ).rejects.toThrow('未授权的远程数据源')
    expect(request).not.toHaveBeenCalled()
  })

  it('reports timeout failures with a recoverable error message', async () => {
    const request = vi.fn().mockRejectedValue({
      code: 'ECONNABORTED',
    })

    await expect(
      loadRemoteOptions({
        dataSources: [
          {
            key: 'users',
            name: '用户列表',
            url: '/api/form-options/users',
            timeout: 1000,
          },
        ],
        sourceUrl: '/api/form-options/users',
        request,
      })
    ).rejects.toThrow('远程选项加载超时')
  })

  it('reports invalid response formats clearly', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        ok: true,
      },
    })

    await expect(
      loadRemoteOptions({
        dataSources: [
          {
            key: 'users',
            name: '用户列表',
            url: '/api/form-options/users',
          },
        ],
        sourceUrl: '/api/form-options/users',
        request,
      })
    ).rejects.toThrow('远程选项响应格式错误')
  })

  it('reports mock business error responses for failure and timeout scenarios', async () => {
    await expect(
      loadRemoteOptions({
        dataSources: [
          {
            key: 'failure',
            name: '失败选项',
            url: '/api/form-options/failure',
          },
        ],
        sourceUrl: '/api/form-options/failure',
        request: vi.fn().mockResolvedValue({
          data: {
            code: 50000,
            msg: '远程选项加载失败',
            data: null,
          },
        }),
      })
    ).rejects.toThrow('远程选项加载失败')

    await expect(
      loadRemoteOptions({
        dataSources: [
          {
            key: 'timeout',
            name: '超时选项',
            url: '/api/form-options/timeout',
          },
        ],
        sourceUrl: '/api/form-options/timeout',
        request: vi.fn().mockResolvedValue({
          data: {
            code: 50000,
            msg: '远程选项加载超时',
            data: null,
          },
        }),
      })
    ).rejects.toThrow('远程选项加载超时')
  })
})
