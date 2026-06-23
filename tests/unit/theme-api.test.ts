import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyThemeBrand,
  fetchThemeBrands,
  fetchThemePreview,
  updateThemeBrand,
  type ThemeBrandQuery,
  type ThemeUpdatePayload,
} from '@/api/theme'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('theme api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches tenant theme brands with keyword filters', async () => {
    const query: ThemeBrandQuery = {
      current: 1,
      pageSize: 10,
      keyword: 'Aheart',
    }
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await fetchThemeBrands(query)

    expect(requestMock.get).toHaveBeenCalledWith('/themes/brands', {
      params: query,
    })
  })

  it('loads preview, updates brand tokens and applies the active theme', async () => {
    const payload: ThemeUpdatePayload = {
      appTitle: 'Aheart Console',
      logoUrl: '/mock/theme/logo.svg',
      primaryColor: '#165dff',
      darkMode: true,
      compactMode: true,
    }

    requestMock.get.mockResolvedValueOnce({
      data: {
        tenantId: 'tenant-a',
        adapterTokens: {
          colorPrimary: '#165dff',
          borderRadius: 4,
          fontSizeBase: 14,
        },
      },
    })
    requestMock.put.mockResolvedValueOnce({
      data: {
        success: true,
      },
    })
    requestMock.post.mockResolvedValueOnce({
      data: {
        tenantId: 'tenant-a',
        appliedAt: '2026-06-23 10:00:00',
      },
    })

    await fetchThemePreview('tenant-a')
    await updateThemeBrand('tenant-a', payload)
    await applyThemeBrand('tenant-a')

    expect(requestMock.get).toHaveBeenCalledWith('/themes/brands/tenant-a')
    expect(requestMock.put).toHaveBeenCalledWith(
      '/themes/brands/tenant-a',
      payload
    )
    expect(requestMock.post).toHaveBeenCalledWith(
      '/themes/brands/tenant-a/apply'
    )
  })
})
