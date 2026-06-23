import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeCenter from '@/views/theme/center/index.vue'
import type {
  ThemeBrandPageResult,
  ThemeBrandRecord,
  ThemePreviewResult,
} from '@/api/theme'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  applyThemeBrand: vi.fn(),
  fetchThemeBrands: vi.fn(),
  fetchThemePreview: vi.fn(),
  updateThemeBrand: vi.fn(),
}))

vi.mock('@/api/theme', () => ({
  applyThemeBrand: apiMocks.applyThemeBrand,
  fetchThemeBrands: apiMocks.fetchThemeBrands,
  fetchThemePreview: apiMocks.fetchThemePreview,
  updateThemeBrand: apiMocks.updateThemeBrand,
}))

const brand: ThemeBrandRecord = {
  tenantId: 'tenant-a',
  tenantName: 'Aheart 科技',
  brandName: 'Aheart',
  appTitle: 'Aheart Admin',
  logoUrl: '/mock/theme/aheart.svg',
  loginBackground: '/mock/theme/login-aheart.png',
  primaryColor: '#165dff',
  darkMode: false,
  compactMode: false,
  current: true,
  updatedAt: '2026-06-23 09:00:00',
  adapterTokens: {
    colorPrimary: '#165dff',
    borderRadius: 6,
    fontSizeBase: 14,
  },
}

const brandResult: ThemeBrandPageResult = {
  list: [brand],
  total: 1,
}

const preview: ThemePreviewResult = {
  tenantId: 'tenant-a',
  brandName: 'Aheart',
  appTitle: 'Aheart Admin',
  logoUrl: '/mock/theme/aheart.svg',
  darkMode: false,
  compactMode: false,
  adapterTokens: brand.adapterTokens,
}

describe('ThemeCenter page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchThemeBrands.mockResolvedValue(brandResult)
    apiMocks.fetchThemePreview.mockResolvedValue(preview)
    apiMocks.updateThemeBrand.mockResolvedValue({
      success: true,
      record: brand,
    })
    apiMocks.applyThemeBrand.mockResolvedValue({
      tenantId: 'tenant-a',
      appliedAt: '2026-06-23 10:00:00',
      adapterTokens: brand.adapterTokens,
    })
  })

  it('loads theme brands, preview and adapter tokens', async () => {
    const wrapper = mount(ThemeCenter)
    await flushPromises()
    await flushPromises()

    expect(apiMocks.fetchThemeBrands).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '',
    })
    expect(apiMocks.fetchThemePreview).toHaveBeenCalledWith('tenant-a')
    expect(wrapper.find('[data-testid="theme-center"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Aheart Admin')
    expect(wrapper.text()).toContain('#165dff')
  })

  it('filters, edits and applies tenant theme settings', async () => {
    const wrapper = mount(ThemeCenter)
    await flushPromises()

    await wrapper
      .find<HTMLInputElement>('[data-testid="theme-keyword"]')
      .setValue('Aheart')
    await wrapper.find('[data-testid="theme-query"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchThemeBrands).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      keyword: 'Aheart',
    })

    await wrapper
      .find<HTMLInputElement>('[data-testid="theme-primary-color"]')
      .setValue('#0e9f6e')
    await wrapper
      .find<HTMLInputElement>('[data-testid="theme-dark-mode"]')
      .setValue(true)
    await wrapper
      .find<HTMLInputElement>('[data-testid="theme-compact-mode"]')
      .setValue(true)
    await wrapper.find('[data-testid="theme-save"]').trigger('click')
    await flushPromises()

    expect(apiMocks.updateThemeBrand).toHaveBeenCalledWith('tenant-a', {
      appTitle: 'Aheart Admin',
      logoUrl: '/mock/theme/aheart.svg',
      loginBackground: '/mock/theme/login-aheart.png',
      primaryColor: '#0e9f6e',
      darkMode: true,
      compactMode: true,
    })

    await wrapper.find('[data-testid="theme-apply-tenant-a"]').trigger('click')
    await flushPromises()

    expect(apiMocks.applyThemeBrand).toHaveBeenCalledWith('tenant-a')
  })
})
