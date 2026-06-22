import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchDataScreenRealtimeData,
  fetchDataScreens,
  getDataScreen,
  publishDataScreen,
  saveDataScreen,
} from '@/api/data-screen'
import { createEnterpriseDataScreenSchema } from '@/components/data-screen/schema'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('data screen api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches data screen list and detail', async () => {
    requestMock.get
      .mockResolvedValueOnce({
        data: {
          list: [],
          total: 0,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'screen-1',
          name: '运营大屏',
        },
      })

    await expect(
      fetchDataScreens({ current: 1, pageSize: 20 })
    ).resolves.toEqual({
      list: [],
      total: 0,
    })
    expect(requestMock.get).toHaveBeenCalledWith('/data-screens', {
      params: {
        current: 1,
        pageSize: 20,
      },
    })

    await expect(getDataScreen('screen-1')).resolves.toEqual({
      id: 'screen-1',
      name: '运营大屏',
    })
    expect(requestMock.get).toHaveBeenLastCalledWith('/data-screens/screen-1')
  })

  it('validates screen schema before saving and publishing', async () => {
    const schema = createEnterpriseDataScreenSchema()
    requestMock.put.mockResolvedValueOnce({
      data: {
        id: 'screen-1',
        schema,
        status: 'draft',
      },
    })
    requestMock.post.mockResolvedValueOnce({
      data: {
        id: 'screen-1',
        status: 'published',
        version: 2,
      },
    })

    await expect(saveDataScreen('screen-1', schema)).resolves.toEqual({
      id: 'screen-1',
      schema,
      status: 'draft',
    })
    expect(requestMock.put).toHaveBeenCalledWith('/data-screens/screen-1', {
      schema,
    })

    await expect(publishDataScreen('screen-1', schema)).resolves.toEqual({
      id: 'screen-1',
      status: 'published',
      version: 2,
    })
    expect(requestMock.post).toHaveBeenCalledWith(
      '/data-screens/screen-1/publish',
      {
        schema,
      }
    )

    await expect(
      saveDataScreen('screen-1', {
        ...schema,
        width: 1280,
      })
    ).rejects.toThrow('非法大屏 schema')
  })

  it('fetches Mock realtime data by scenario', async () => {
    requestMock.post.mockResolvedValueOnce({
      data: {
        metrics: [],
        trend: [],
        distribution: [],
        ranking: [],
        table: [],
        alerts: [],
      },
    })

    await expect(
      fetchDataScreenRealtimeData({
        screenId: 'screen-1',
        dataSourceKey: 'realtime',
        scenario: 'alert',
      })
    ).resolves.toEqual({
      metrics: [],
      trend: [],
      distribution: [],
      ranking: [],
      table: [],
      alerts: [],
    })
    expect(requestMock.post).toHaveBeenCalledWith('/data-screens/realtime', {
      screenId: 'screen-1',
      dataSourceKey: 'realtime',
      scenario: 'alert',
    })
  })
})
