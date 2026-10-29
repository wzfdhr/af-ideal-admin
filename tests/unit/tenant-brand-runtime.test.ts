import { createHash, webcrypto } from 'node:crypto'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearTenantBrandRuntime,
  refreshTenantBrandRuntime,
  setTenantBrandIdentityProvider,
  tenantBrandRuntime,
  updateTenantBrandLocale,
} from '@/services/tenant-brand-runtime'
import { commitTenantContext } from '@/services/tenant-context'
import type { TenantBrandRuntimeV1 } from '@af-admin/contracts'

const api = vi.hoisted(() => ({
  fetchMembershipPreferences: vi.fn(),
  fetchTenantBrandLogo: vi.fn(),
  fetchTenantBrandRuntime: vi.fn(),
  updateMembershipPreferences: vi.fn(),
}))
vi.mock('@/api/tenant-branding', () => ({
  TENANT_BRANDING_REFRESH_EVENT: 'tenant-branding:refresh',
  ...api,
}))

const identity = {
  userId: 'member-1',
  tenantId: 'tenant-a',
  permissions: ['audit:read'],
}
let currentIdentity = { ...identity, permissions: [...identity.permissions] }
const preferences = {
  version: 1 as const,
  source: 'server' as const,
  tenantId: 'tenant-a',
  userId: 'member-1',
  revision: 2,
  values: { locale: null, appearance: null, compact: null },
  effective: {
    locale: 'en-US' as const,
    appearance: 'dark' as const,
    compact: true,
    activeBrandVersionId: 'brand-v2',
  },
  updatedAt: null,
}
const runtime = (
  logo: TenantBrandRuntimeV1['logo'] = null
): TenantBrandRuntimeV1 => ({
  version: 1,
  source: 'server',
  tenantId: 'tenant-a',
  activeVersionId: 'brand-v2',
  branding: {
    version: 1,
    brandName: '租户 A 品牌',
    title: '租户 A 控制台',
    logoFileId: logo?.fileId || null,
    primaryColor: '#0E9F6E',
    appearance: 'light',
    compact: false,
    defaultLocale: 'zh-CN',
  },
  logo,
  preferences,
})

describe('tenant brand runtime', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('Blob', NodeBlob)
    vi.stubGlobal('crypto', webcrypto)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:verified-logo'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    localStorage.setItem('token', 'runtime-token')
    localStorage.removeItem('userId')
    currentIdentity = { ...identity, permissions: [...identity.permissions] }
    setTenantBrandIdentityProvider(() => currentIdentity)
    commitTenantContext(identity.tenantId)
    clearTenantBrandRuntime()
  })
  afterEach(() => {
    clearTenantBrandRuntime()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(URL, 'createObjectURL')
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  })

  it('applies current effective locale, dark theme, compact density, title and RGB palette', async () => {
    api.fetchTenantBrandRuntime.mockResolvedValue(runtime())
    await refreshTenantBrandRuntime(identity)
    expect(tenantBrandRuntime.loaded).toBe(true)
    expect(localStorage.getItem('userId')).toBeNull()
    expect(tenantBrandRuntime.brandName).toBe('租户 A 品牌')
    expect(tenantBrandRuntime.locale).toBe('en-US')
    expect(document.title).toBe('租户 A 控制台')
    expect(document.body.getAttribute('arco-theme')).toBe('dark')
    expect(document.body.classList.contains('tenant-brand-compact')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--primary-6')).toBe(
      '14,159,110'
    )
    expect(document.body.style.getPropertyValue('--primary-6')).toBe(
      '14,159,110'
    )
    expect(
      document.documentElement.style.getPropertyValue('--primary-1')
    ).toMatch(/^\d+,\d+,\d+$/)
  })

  it('creates a logo URL only after MIME, size and SHA match the active binding', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71])
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const logo = {
      fileId: 'logo-1',
      status: 'ready' as const,
      metadata: {
        fileId: 'logo-1',
        mimeType: 'image/png' as const,
        size: bytes.length,
        sha256,
        width: 64,
        height: 64,
      },
    }
    api.fetchTenantBrandRuntime.mockResolvedValue(runtime(logo))
    api.fetchTenantBrandLogo.mockResolvedValue({
      blob: new Blob([bytes], { type: 'image/png' }),
      mimeType: 'image/png',
      size: String(bytes.length),
      sha256,
    })
    await refreshTenantBrandRuntime(identity)
    expect(tenantBrandRuntime.logoUrl).toBe('blob:verified-logo')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    api.fetchTenantBrandLogo.mockResolvedValueOnce({
      blob: new Blob([bytes], { type: 'image/png' }),
      mimeType: 'image/png',
      size: String(bytes.length),
      sha256: '0'.repeat(64),
    })
    await refreshTenantBrandRuntime(identity)
    expect(tenantBrandRuntime.logoUrl).toBe('')
    expect(tenantBrandRuntime.error).toContain('字节与服务器绑定元数据不一致')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:verified-logo')
  })

  it('drops a late response after tenant generation changes and keeps deployment defaults', async () => {
    let resolve!: (value: TenantBrandRuntimeV1) => void
    api.fetchTenantBrandRuntime.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const pending = refreshTenantBrandRuntime(identity)
    commitTenantContext('tenant-b')
    clearTenantBrandRuntime()
    resolve(runtime())
    await pending
    expect(tenantBrandRuntime.loaded).toBe(false)
    expect(tenantBrandRuntime.tenantId).toBeNull()
    expect(tenantBrandRuntime.logoUrl).toBe('')
    expect(document.body.hasAttribute('arco-theme')).toBe(false)
  })

  it('drops a late response when current reactive permissions change without touching token storage', async () => {
    let resolve!: (value: TenantBrandRuntimeV1) => void
    api.fetchTenantBrandRuntime.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const pending = refreshTenantBrandRuntime(identity)
    currentIdentity = { ...identity, permissions: [] }
    resolve(runtime())
    await pending
    expect(tenantBrandRuntime.loaded).toBe(false)
    expect(tenantBrandRuntime.tenantId).toBeNull()
    expect(document.title).not.toBe('租户 A 控制台')
  })

  it('writes locale through current membership CAS and emits a runtime refresh without local persistence', async () => {
    api.fetchMembershipPreferences.mockResolvedValue(preferences)
    api.updateMembershipPreferences.mockResolvedValue({
      ...preferences,
      revision: 3,
      values: { ...preferences.values, locale: 'zh-CN' },
    })
    const changed = vi.fn()
    window.addEventListener('tenant-branding:refresh', changed)
    await updateTenantBrandLocale(identity, 'zh-CN')
    expect(api.updateMembershipPreferences).toHaveBeenCalledWith(
      { version: 1, expectedRevision: 2, locale: 'zh-CN' },
      expect.any(String)
    )
    expect(changed).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('locale')).toBeNull()
    window.removeEventListener('tenant-branding:refresh', changed)
  })
})
