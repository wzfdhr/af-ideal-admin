import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchPluginManifest,
  fetchPlugins,
  togglePluginStatus,
  type PluginQuery,
} from '@/api/plugin'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('plugin api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches plugins with keyword, status and extension filters', async () => {
    const query: PluginQuery = {
      current: 1,
      pageSize: 10,
      keyword: 'workflow',
      status: 'enabled',
      extensionType: 'route',
    }
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await fetchPlugins(query)

    expect(requestMock.get).toHaveBeenCalledWith('/plugins', {
      params: query,
    })
  })

  it('loads manifest and toggles plugin lifecycle status', async () => {
    requestMock.get.mockResolvedValueOnce({
      data: {
        id: 'workflow-plugin',
        name: 'Workflow Plugin',
        status: 'enabled',
      },
    })
    requestMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        id: 'workflow-plugin',
        status: 'disabled',
      },
    })

    await fetchPluginManifest('workflow-plugin')
    await togglePluginStatus('workflow-plugin', false)

    expect(requestMock.get).toHaveBeenCalledWith(
      '/plugins/workflow-plugin/manifest'
    )
    expect(requestMock.post).toHaveBeenCalledWith(
      '/plugins/workflow-plugin/toggle',
      { enabled: false }
    )
  })
})
