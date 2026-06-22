import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createLowCodePage,
  fetchLowCodePages,
  getLowCodePage,
  previewLowCodeDataSource,
  publishLowCodePage,
  rollbackLowCodePage,
  saveLowCodePage,
} from '@/api/low-code'
import { createQueryTablePageSchema } from '@/components/low-code/schema'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('low-code api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches low-code page list and detail', async () => {
    requestMock.get
      .mockResolvedValueOnce({
        data: {
          list: [],
          total: 0,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'page-1',
          name: '客户查询',
        },
      })

    await expect(
      fetchLowCodePages({ current: 1, pageSize: 20, keyword: '客户' })
    ).resolves.toEqual({ list: [], total: 0 })
    expect(requestMock.get).toHaveBeenCalledWith('/low-code/pages', {
      params: {
        current: 1,
        pageSize: 20,
        keyword: '客户',
      },
    })

    await expect(getLowCodePage('page-1')).resolves.toEqual({
      id: 'page-1',
      name: '客户查询',
    })
    expect(requestMock.get).toHaveBeenLastCalledWith('/low-code/pages/page-1')
  })

  it('creates and saves low-code pages with validated schema', async () => {
    const schema = createQueryTablePageSchema()
    requestMock.post.mockResolvedValueOnce({
      data: {
        id: 'page-2',
        status: 'draft',
        schema,
      },
    })
    requestMock.put.mockResolvedValueOnce({
      data: {
        id: 'page-2',
        status: 'draft',
        schema,
      },
    })

    await expect(
      createLowCodePage({ name: '客户查询', schema })
    ).resolves.toEqual({
      id: 'page-2',
      status: 'draft',
      schema,
    })
    expect(requestMock.post).toHaveBeenCalledWith('/low-code/pages', {
      name: '客户查询',
      schema,
    })

    await expect(saveLowCodePage('page-2', schema)).resolves.toEqual({
      id: 'page-2',
      status: 'draft',
      schema,
    })
    expect(requestMock.put).toHaveBeenCalledWith('/low-code/pages/page-2', {
      schema,
    })
  })

  it('validates low-code page schema before publishing', async () => {
    await expect(
      publishLowCodePage('page-1', {
        title: '非法页面',
        materials: [
          {
            id: 'bad',
            type: 'BadMaterial',
            name: '坏物料',
            props: {},
          },
        ],
        dataSources: [],
      })
    ).rejects.toThrow('非法低代码页面 schema')

    expect(requestMock.post).not.toHaveBeenCalled()
  })

  it('publishes, rolls back and previews data sources', async () => {
    const schema = createQueryTablePageSchema()
    requestMock.post
      .mockResolvedValueOnce({
        data: {
          id: 'page-1',
          status: 'published',
          version: 2,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'page-1',
          status: 'rolled-back',
          version: 1,
        },
      })
      .mockResolvedValueOnce({
        data: {
          columns: ['name', 'status'],
          list: [{ name: 'Aheart', status: 'enabled' }],
          total: 1,
        },
      })

    await expect(publishLowCodePage('page-1', schema)).resolves.toEqual({
      id: 'page-1',
      status: 'published',
      version: 2,
    })
    expect(requestMock.post).toHaveBeenCalledWith(
      '/low-code/pages/page-1/publish',
      {
        schema,
      }
    )

    await expect(rollbackLowCodePage('page-1', 1)).resolves.toEqual({
      id: 'page-1',
      status: 'rolled-back',
      version: 1,
    })
    expect(requestMock.post).toHaveBeenLastCalledWith(
      '/low-code/pages/page-1/rollback',
      {
        version: 1,
      }
    )

    await expect(
      previewLowCodeDataSource({
        pageId: 'page-1',
        dataSourceKey: 'customers',
        params: { keyword: 'Aheart' },
      })
    ).resolves.toEqual({
      columns: ['name', 'status'],
      list: [{ name: 'Aheart', status: 'enabled' }],
      total: 1,
    })
    expect(requestMock.post).toHaveBeenLastCalledWith(
      '/low-code/data-source/preview',
      {
        pageId: 'page-1',
        dataSourceKey: 'customers',
        params: { keyword: 'Aheart' },
      }
    )
  })
})
