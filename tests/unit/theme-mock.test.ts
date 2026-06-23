import { describe, expect, it } from 'vitest'
import { createThemeMockStore } from '@/mock/modules/theme'

describe('theme mock store', () => {
  it('seeds tenant brands and filters by keyword', () => {
    const store = createThemeMockStore()
    const result = store.queryBrands({
      current: 1,
      pageSize: 20,
      keyword: 'Aheart',
    })

    expect(result.total).toBeGreaterThan(0)
    expect(result.list[0].tenantName).toContain('Aheart')
    expect(result.list[0].adapterTokens.colorPrimary).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('updates theme tokens and rejects invalid primary colors', () => {
    const store = createThemeMockStore({
      now: () => '2026-06-23 10:00:00',
    })

    const updated = store.updateBrand('tenant-a', {
      appTitle: 'Aheart Console',
      logoUrl: '/mock/theme/aheart.svg',
      primaryColor: '#0e9f6e',
      darkMode: true,
      compactMode: true,
    })
    const invalid = store.updateBrand('tenant-a', {
      primaryColor: 'green',
    })

    expect(updated.success).toBe(true)
    expect(updated.record?.primaryColor).toBe('#0e9f6e')
    expect(updated.record?.adapterTokens.borderRadius).toBe(4)
    expect(updated.record?.updatedAt).toBe('2026-06-23 10:00:00')
    expect(invalid).toEqual({
      success: false,
      reason: '主题色必须是 6 位十六进制颜色',
    })
  })

  it('creates preview and apply results for the selected tenant brand', () => {
    const store = createThemeMockStore({
      now: () => '2026-06-23 10:00:00',
    })

    const preview = store.getPreview('tenant-a')
    const applied = store.applyBrand('tenant-a')

    expect(preview?.tenantId).toBe('tenant-a')
    expect(preview?.adapterTokens.colorPrimary).toBe('#165dff')
    expect(applied).toEqual({
      tenantId: 'tenant-a',
      appliedAt: '2026-06-23 10:00:00',
      adapterTokens: preview?.adapterTokens,
    })
  })
})
