import { webcrypto } from 'node:crypto'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TenantBrandingPage from '@/views/theme/branding/index.vue'
import useUserStore from '@/store/modules/user'
import type { StoredFile } from '@/api/stored-files'
import type {
  MembershipPreferencesV1,
  TenantBrandConfigurationV1,
  TenantBrandRuntimeV1,
  TenantBrandVersionPageV1,
} from '@af-admin/contracts'

const api = vi.hoisted(() => ({
  applyTenantBrandDraft: vi.fn(),
  fetchMembershipPreferences: vi.fn(),
  fetchTenantBrandConfiguration: vi.fn(),
  fetchTenantBrandLogo: vi.fn(),
  fetchTenantBrandRuntime: vi.fn(),
  fetchTenantBrandVersions: vi.fn(),
  saveTenantBrandDraft: vi.fn(),
  updateMembershipPreferences: vi.fn(),
}))
const stored = vi.hoisted(() => ({
  listStoredFiles: vi.fn(),
  uploadStoredFile: vi.fn(),
}))
vi.mock('@/api/tenant-branding', async () => {
  const actual = await vi.importActual('@/api/tenant-branding')
  return { ...actual, ...api }
})
vi.mock('@/api/stored-files', () => stored)

const draft = {
  version: 1 as const,
  brandName: '演示品牌',
  title: '演示管理台',
  logoFileId: null,
  primaryColor: '#165DFF',
  appearance: 'light' as const,
  compact: false,
  defaultLocale: 'zh-CN' as const,
}
const preferences: MembershipPreferencesV1 = {
  version: 1,
  source: 'server',
  tenantId: 'tenant-a',
  userId: 'member-1',
  revision: 3,
  values: { locale: null, appearance: null, compact: null },
  effective: {
    locale: 'zh-CN',
    appearance: 'light',
    compact: false,
    activeBrandVersionId: 'brand-v1',
  },
  updatedAt: null,
}
const runtime: TenantBrandRuntimeV1 = {
  version: 1,
  source: 'server',
  tenantId: 'tenant-a',
  activeVersionId: 'brand-v1',
  branding: draft,
  logo: null,
  preferences,
}
const activeVersion = {
  version: 1 as const,
  source: 'server' as const,
  id: 'brand-v1',
  versionNumber: 1,
  sourceDraftRevision: 1,
  snapshot: draft,
  logoBinding: null,
  contentHash: 'a'.repeat(64),
  appliedAt: '2026-10-13T10:00:00.000Z',
  appliedBy: { id: 'admin-1', name: '管理员' },
}
const configuration: TenantBrandConfigurationV1 = {
  version: 1,
  source: 'server',
  tenantId: 'tenant-a',
  revision: 4,
  draftRevision: 2,
  draft: { ...draft, title: '待应用标题' },
  draftLogo: null,
  activeVersionId: activeVersion.id,
  activeVersion,
  pendingApply: true,
  updatedAt: '2026-10-13T10:01:00.000Z',
  updatedBy: { id: 'admin-1', name: '管理员' },
  allowedActions: ['save', 'apply'],
}
const versions: TenantBrandVersionPageV1 = {
  version: 1,
  source: 'server',
  list: [activeVersion],
  total: 1,
  current: 1,
  pageSize: 20,
}
const scanningFile: StoredFile = {
  id: 'logo-file-1',
  fileName: 'logo.png',
  mimeType: 'image/png',
  size: 100,
  recordId: null,
  status: 'scanning',
  revision: 1,
  scanEngine: null,
}

const mountPage = async (permissions: string[] = []) => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const user = useUserStore()
  user.$patch({
    id: 'member-1',
    tenantId: 'tenant-a',
    permissions,
  })
  const wrapper = mount(TenantBrandingPage, {
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return { wrapper, user }
}

describe('tenant branding reference page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('crypto', webcrypto)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 128, height: 64, close: vi.fn() }))
    )
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:brand-logo'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    localStorage.setItem('token', 'brand-token')
    localStorage.setItem('userId', 'member-1')
    api.fetchTenantBrandRuntime.mockResolvedValue(runtime)
    api.fetchMembershipPreferences.mockResolvedValue(preferences)
    api.fetchTenantBrandConfiguration.mockResolvedValue(configuration)
    api.fetchTenantBrandVersions.mockResolvedValue(versions)
    api.saveTenantBrandDraft.mockResolvedValue({
      ...configuration,
      revision: 5,
      draftRevision: 3,
    })
    api.applyTenantBrandDraft.mockResolvedValue({
      ...configuration,
      revision: 5,
      pendingApply: false,
    })
    api.updateMembershipPreferences.mockResolvedValue({
      ...preferences,
      revision: 4,
      values: { locale: 'en-US', appearance: 'dark', compact: true },
      effective: {
        ...preferences.effective,
        locale: 'en-US',
        appearance: 'dark',
        compact: true,
      },
    })
    stored.listStoredFiles.mockResolvedValue({ list: [], total: 0 })
    stored.uploadStoredFile.mockResolvedValue({ id: scanningFile.id })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(URL, 'createObjectURL')
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  })

  it('lets an ordinary member update only own explicit or inherited preferences', async () => {
    const refresh = vi.fn()
    window.addEventListener('tenant-branding:refresh', refresh)
    const { wrapper } = await mountPage()
    expect(api.fetchTenantBrandRuntime).toHaveBeenCalledTimes(1)
    expect(api.fetchTenantBrandConfiguration).not.toHaveBeenCalled()
    expect(api.fetchTenantBrandVersions).not.toHaveBeenCalled()
    expect(stored.listStoredFiles).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="brand-draft-save"]').exists()).toBe(
      false
    )
    await wrapper.get('[data-testid="brand-pref-locale"]').setValue('en-US')
    await wrapper.get('[data-testid="brand-pref-appearance"]').setValue('dark')
    await wrapper.get('[data-testid="brand-pref-compact"]').setValue('true')
    await wrapper.get('[data-testid="brand-pref-save"]').trigger('submit')
    await flushPromises()
    expect(api.updateMembershipPreferences).toHaveBeenCalledWith(
      {
        version: 1,
        expectedRevision: 3,
        locale: 'en-US',
        appearance: 'dark',
        compact: true,
      },
      expect.any(String)
    )
    expect(refresh).toHaveBeenCalledTimes(1)
    window.removeEventListener('tenant-branding:refresh', refresh)
    wrapper.unmount()
  })

  it('shows draft versus active facts and performs revision-checked save and apply', async () => {
    const refresh = vi.fn()
    window.addEventListener('tenant-branding:refresh', refresh)
    const { wrapper } = await mountPage(['tenant:brand:manage', 'file:list'])
    expect(wrapper.text()).toContain('与活动版本不同，等待应用')
    expect(wrapper.text()).toContain('v1')
    await wrapper.get('[data-testid="brand-title"]').setValue('新标题')
    await wrapper.get('[data-testid="brand-logo-clear"]').trigger('click')
    await wrapper.get('[data-testid="brand-draft-save"]').trigger('submit')
    await flushPromises()
    expect(api.saveTenantBrandDraft).toHaveBeenCalledWith(
      {
        version: 1,
        expectedRevision: 4,
        draft: {
          ...configuration.draft,
          title: '新标题',
          logoFileId: null,
        },
      },
      expect.any(String)
    )
    api.fetchTenantBrandConfiguration.mockResolvedValue({
      ...configuration,
      revision: 5,
      draftRevision: 3,
    })
    await wrapper.get('[data-testid="brand-apply"]').trigger('click')
    await flushPromises()
    expect(api.applyTenantBrandDraft).toHaveBeenCalledWith(
      { version: 1, expectedRevision: 5 },
      expect.any(String)
    )
    expect(refresh).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { kind: 'brand', tenantId: 'tenant-a' },
      })
    )
    window.removeEventListener('tenant-branding:refresh', refresh)
    wrapper.unmount()
  })

  it('retains local draft and refuses a stale configuration revision', async () => {
    const { wrapper } = await mountPage(['tenant:brand:manage'])
    await wrapper.get('[data-testid="brand-title"]').setValue('不能丢失的标题')
    api.fetchTenantBrandConfiguration.mockResolvedValueOnce({
      ...configuration,
      revision: 9,
    })
    await wrapper.get('[data-testid="brand-draft-save"]').trigger('submit')
    await flushPromises()
    expect(api.saveTenantBrandDraft).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('其他管理员更新')
    expect(
      (wrapper.get('[data-testid="brand-title"]').element as HTMLInputElement)
        .value
    ).toBe('不能丢失的标题')
    wrapper.unmount()
  })

  it('keeps uploaded files unavailable until the real scanner reports ready', async () => {
    stored.listStoredFiles.mockResolvedValueOnce({
      list: [scanningFile],
      total: 1,
    })
    const { wrapper } = await mountPage([
      'tenant:brand:manage',
      'file:list',
      'file:upload',
    ])
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', {
      type: 'image/png',
    })
    const upload = wrapper.get('[data-testid="brand-logo-upload"]')
    Object.defineProperty(upload.element, 'files', {
      configurable: true,
      value: [file],
    })
    await upload.trigger('change')
    await flushPromises()
    expect(stored.uploadStoredFile).toHaveBeenCalledWith(
      file,
      undefined,
      undefined,
      expect.any(Function)
    )
    expect(
      wrapper.get('[data-testid="brand-logo-file"]').findAll('option')
    ).toHaveLength(1)
    stored.listStoredFiles.mockResolvedValueOnce({
      list: [
        {
          ...scanningFile,
          status: 'ready',
          scanEngine: 'ClamAV 1.5.4',
        },
      ],
      total: 1,
    })
    await wrapper.get('[data-testid="brand-logo-refresh"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.get('[data-testid="brand-logo-file"]').findAll('option')
    ).toHaveLength(2)
    expect(wrapper.text()).toContain('ClamAV 1.5.4')
    wrapper.unmount()
  })

  it('does not start an upload when identity changes during deferred image decode', async () => {
    let resolveBitmap!: (value: {
      width: number
      height: number
      close: () => void
    }) => void
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveBitmap = resolve
          })
      )
    )
    const { wrapper, user } = await mountPage([
      'tenant:brand:manage',
      'file:list',
      'file:upload',
    ])
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'late.png', {
      type: 'image/png',
    })
    const upload = wrapper.get('[data-testid="brand-logo-upload"]')
    Object.defineProperty(upload.element, 'files', {
      configurable: true,
      value: [file],
    })
    const pending = upload.trigger('change')
    user.$patch({ permissions: [] })
    await flushPromises()
    resolveBitmap({ width: 64, height: 64, close: vi.fn() })
    await pending
    await flushPromises()
    expect(stored.uploadStoredFile).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="brand-logo-upload"]').exists()).toBe(
      false
    )
    wrapper.unmount()
  })

  it('drops late management data and clears it immediately when permission changes', async () => {
    let resolve!: (value: TenantBrandConfigurationV1) => void
    api.fetchTenantBrandConfiguration.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const mounted = mountPage(['tenant:brand:manage'])
    await flushPromises()
    const { wrapper, user } = await mounted
    user.$patch({ permissions: [] })
    await flushPromises()
    resolve(configuration)
    await flushPromises()
    expect(wrapper.find('[data-testid="brand-draft-save"]').exists()).toBe(
      false
    )
    expect(api.fetchTenantBrandConfiguration).toHaveBeenCalledTimes(1)
    expect(api.fetchTenantBrandRuntime).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
