import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTenantBrandDraft,
  fetchMembershipPreferences,
  fetchTenantBrandConfiguration,
  fetchTenantBrandLogo,
  fetchTenantBrandRuntime,
  fetchTenantBrandVersions,
  saveTenantBrandDraft,
  updateMembershipPreferences,
} from '@/api/tenant-branding'
import type {
  MembershipPreferencesUpdateV1,
  TenantBrandApplyV1,
  TenantBrandDraftSaveV1,
} from '@af-admin/contracts'

const request = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))
vi.mock('@/api/request', () => ({ default: request }))

describe('tenant branding api', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses separate current-member runtime and privileged management reads', async () => {
    request.get
      .mockResolvedValueOnce({ data: { source: 'server', kind: 'runtime' } })
      .mockResolvedValueOnce({ data: { source: 'server', kind: 'config' } })
      .mockResolvedValueOnce({ data: { source: 'server', list: [] } })
      .mockResolvedValueOnce({ data: { source: 'server', kind: 'prefs' } })
    await fetchTenantBrandRuntime()
    await fetchTenantBrandConfiguration()
    await fetchTenantBrandVersions({ current: 2, pageSize: 20 })
    await fetchMembershipPreferences()
    expect(request.get.mock.calls).toEqual([
      ['/tenant-branding/runtime'],
      ['/tenant-branding/configuration'],
      ['/tenant-branding/versions', { params: { current: 2, pageSize: 20 } }],
      ['/membership-preferences'],
    ])
  })

  it('sends revisioned commands with caller idempotency keys and no actor selector', async () => {
    const draft: TenantBrandDraftSaveV1 = {
      version: 1,
      expectedRevision: 4,
      draft: {
        version: 1,
        brandName: 'A 品牌',
        title: 'A 管理台',
        logoFileId: null,
        primaryColor: '#165DFF',
        appearance: 'light',
        compact: false,
        defaultLocale: 'zh-CN',
      },
    }
    const apply: TenantBrandApplyV1 = { version: 1, expectedRevision: 5 }
    const preferences: MembershipPreferencesUpdateV1 = {
      version: 1,
      expectedRevision: 3,
      locale: null,
      appearance: 'dark',
      compact: true,
    }
    request.put.mockResolvedValueOnce({ data: { revision: 5 } })
    request.post.mockResolvedValueOnce({ data: { revision: 6 } })
    request.patch.mockResolvedValueOnce({ data: { revision: 4 } })
    await saveTenantBrandDraft(draft, 'draft-key')
    await applyTenantBrandDraft(apply, 'apply-key')
    await updateMembershipPreferences(preferences, 'preferences-key')
    expect(request.put).toHaveBeenCalledWith('/tenant-branding/draft', draft, {
      headers: { 'Idempotency-Key': 'draft-key' },
    })
    expect(request.post).toHaveBeenCalledWith('/tenant-branding/apply', apply, {
      headers: { 'Idempotency-Key': 'apply-key' },
    })
    expect(request.patch).toHaveBeenCalledWith(
      '/membership-preferences',
      preferences,
      { headers: { 'Idempotency-Key': 'preferences-key' } }
    )
    expect(draft).not.toHaveProperty('actor')
    expect(preferences).not.toHaveProperty('userId')
  })

  it('loads only authenticated applied logo bytes as an opaque blob', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer
    request.get.mockResolvedValueOnce({
      data: bytes,
      headers: {
        'content-type': 'image/png',
        'content-length': '4',
        'x-content-sha256': 'a'.repeat(64),
      },
    })
    const result = await fetchTenantBrandLogo()
    expect(request.get).toHaveBeenCalledWith('/tenant-branding/logo', {
      responseType: 'arraybuffer',
    })
    expect(result.blob.type).toBe('image/png')
    expect(result.blob.size).toBe(4)
    expect(result.mimeType).toBe('image/png')
    expect(result.size).toBe('4')
    expect(result.sha256).toBe('a'.repeat(64))
  })
})
