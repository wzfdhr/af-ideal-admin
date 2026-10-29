import { reactive, readonly } from 'vue'
import {
  TENANT_BRANDING_REFRESH_EVENT,
  fetchMembershipPreferences,
  fetchTenantBrandLogo,
  fetchTenantBrandRuntime,
  updateMembershipPreferences,
} from '@/api/tenant-branding'
import { getToken } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import { appTitle } from '@config'
import {
  TENANT_BRAND_DEFAULT_PRIMARY_COLOR,
  TENANT_BRAND_LOGO_MIME_TYPES,
  parseMembershipPreferencesUpdate,
} from '@af-admin/contracts'
import type {
  TenantBrandAppearance,
  TenantBrandLocale,
  TenantBrandLogoMetadataV1,
  TenantBrandRuntimeV1,
} from '@af-admin/contracts'

export interface TenantBrandRuntimeIdentity {
  userId: string | null
  tenantId: string | null
  permissions: readonly string[]
}

const DEFAULT_TITLE = appTitle || 'AF-Ideal-Admin'
const DEFAULT_BRAND_NAME = 'AF-Ideal-Admin'
const DEFAULT_LOCALE: TenantBrandLocale = 'zh-CN'
const styleKeys = Array.from(
  { length: 10 },
  (_, index) => `--primary-${index + 1}`
)
const state = reactive({
  loaded: false,
  loading: false,
  error: '',
  tenantId: null as string | null,
  userId: null as string | null,
  activeVersionId: null as string | null,
  brandName: DEFAULT_BRAND_NAME,
  title: DEFAULT_TITLE,
  logoUrl: '',
  primaryColor: TENANT_BRAND_DEFAULT_PRIMARY_COLOR,
  appearance: 'light' as TenantBrandAppearance,
  compact: false,
  locale: DEFAULT_LOCALE,
})
let generation = 0
let currentLogoUrl = ''
let identityProvider: () => TenantBrandRuntimeIdentity = () => ({
  userId: null,
  tenantId: null,
  permissions: [],
})

export const setTenantBrandIdentityProvider = (
  provider: () => TenantBrandRuntimeIdentity
) => {
  identityProvider = provider
}

const rgb = (color: string) => {
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error('品牌主色格式无效')
  return [1, 3, 5].map((index) =>
    Number.parseInt(color.slice(index, index + 2), 16)
  )
}
const mix = (base: number[], target: number, ratio: number) =>
  base.map((value) => Math.round(value + (target - value) * ratio))
const palette = (color: string, dark: boolean) => {
  const base = rgb(color)
  const before = dark
    ? [0.7, 0.55, 0.4, 0.25, 0.1].map((ratio) => mix(base, 0, ratio))
    : [0.9, 0.75, 0.55, 0.35, 0.15].map((ratio) => mix(base, 255, ratio))
  const after = dark
    ? [0.15, 0.3, 0.5, 0.75].map((ratio) => mix(base, 255, ratio))
    : [0.12, 0.25, 0.38, 0.5].map((ratio) => mix(base, 0, ratio))
  return [...before, base, ...after]
}
const revokeLogo = () => {
  if (currentLogoUrl) URL.revokeObjectURL(currentLogoUrl)
  currentLogoUrl = ''
  state.logoUrl = ''
}
const clearDom = () => {
  const root = document.documentElement
  ;[root, document.body].forEach((element) => {
    styleKeys.forEach((key) => element.style.removeProperty(key))
    element.style.removeProperty('--tenant-brand-primary')
  })
  document.body.removeAttribute('arco-theme')
  document.body.classList.remove('tenant-brand-compact')
  document.title = DEFAULT_TITLE
}
export const clearTenantBrandRuntime = () => {
  generation += 1
  revokeLogo()
  clearDom()
  Object.assign(state, {
    loaded: false,
    loading: false,
    error: '',
    tenantId: null,
    userId: null,
    activeVersionId: null,
    brandName: DEFAULT_BRAND_NAME,
    title: DEFAULT_TITLE,
    primaryColor: TENANT_BRAND_DEFAULT_PRIMARY_COLOR,
    appearance: 'light',
    compact: false,
    locale: DEFAULT_LOCALE,
  })
}
const identityKey = (identity: TenantBrandRuntimeIdentity) =>
  JSON.stringify({
    userId: identity.userId,
    tenantId: identity.tenantId,
    permissions: [...identity.permissions].sort(),
  })
const isCurrent = (
  run: number,
  scope: ReturnType<typeof tenantScope.snapshot>,
  token: string,
  identity: TenantBrandRuntimeIdentity,
  key: string
) =>
  run === generation &&
  tenantScope.isCurrent(scope) &&
  !tenantScope.isTransitioning() &&
  getToken() === token &&
  scope.tenantId === identity.tenantId &&
  identityKey(identity) === key &&
  identityKey(identityProvider()) === key

const digest = async (blob: Blob) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    )
  )
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
export const fetchVerifiedTenantBrandLogo = async (
  metadata: TenantBrandLogoMetadataV1
) => {
  const response = await fetchTenantBrandLogo()
  const size = Number(response.size)
  if (
    !TENANT_BRAND_LOGO_MIME_TYPES.includes(
      response.mimeType as typeof TENANT_BRAND_LOGO_MIME_TYPES[number]
    ) ||
    response.mimeType !== metadata.mimeType ||
    !Number.isSafeInteger(size) ||
    size !== metadata.size ||
    response.blob.size !== metadata.size ||
    !/^[a-f0-9]{64}$/.test(response.sha256) ||
    response.sha256 !== metadata.sha256 ||
    (await digest(response.blob)) !== metadata.sha256
  )
    throw new Error('品牌 Logo 字节与服务器绑定元数据不一致')
  return response.blob
}
const applyDom = (runtime: TenantBrandRuntimeV1, logoUrl: string) => {
  const root = document.documentElement
  palette(
    runtime.branding.primaryColor,
    runtime.preferences.effective.appearance === 'dark'
  ).forEach((value, index) => {
    root.style.setProperty(`--primary-${index + 1}`, value.join(','))
    document.body.style.setProperty(`--primary-${index + 1}`, value.join(','))
  })
  root.style.setProperty(
    '--tenant-brand-primary',
    runtime.branding.primaryColor
  )
  document.body.style.setProperty(
    '--tenant-brand-primary',
    runtime.branding.primaryColor
  )
  if (runtime.preferences.effective.appearance === 'dark')
    document.body.setAttribute('arco-theme', 'dark')
  else document.body.removeAttribute('arco-theme')
  document.body.classList.toggle(
    'tenant-brand-compact',
    runtime.preferences.effective.compact
  )
  document.title = runtime.branding.title
  Object.assign(state, {
    loaded: true,
    loading: false,
    error: '',
    tenantId: runtime.tenantId,
    userId: runtime.preferences.userId,
    activeVersionId: runtime.activeVersionId,
    brandName: runtime.branding.brandName,
    title: runtime.branding.title,
    logoUrl,
    primaryColor: runtime.branding.primaryColor,
    appearance: runtime.preferences.effective.appearance,
    compact: runtime.preferences.effective.compact,
    locale: runtime.preferences.effective.locale,
  })
}
export const refreshTenantBrandRuntime = async (
  identity: TenantBrandRuntimeIdentity
) => {
  clearTenantBrandRuntime()
  const run = generation
  const scope = tenantScope.snapshot()
  const token = getToken()
  const key = identityKey(identity)
  if (!identity.userId || !identity.tenantId || !token) return
  state.loading = true
  try {
    const runtime = await fetchTenantBrandRuntime()
    if (!isCurrent(run, scope, token, identity, key)) return
    if (
      runtime.source !== 'server' ||
      runtime.tenantId !== identity.tenantId ||
      runtime.preferences.tenantId !== identity.tenantId ||
      runtime.preferences.userId !== identity.userId
    )
      throw new Error('品牌运行态身份或租户不匹配')
    let logoUrl = ''
    if (runtime.logo?.status === 'ready') {
      const blob = await fetchVerifiedTenantBrandLogo(runtime.logo.metadata)
      if (!isCurrent(run, scope, token, identity, key)) return
      logoUrl = URL.createObjectURL(blob)
    }
    if (!isCurrent(run, scope, token, identity, key)) {
      if (logoUrl) URL.revokeObjectURL(logoUrl)
      return
    }
    revokeLogo()
    currentLogoUrl = logoUrl
    applyDom(runtime, logoUrl)
  } catch (failure) {
    if (!isCurrent(run, scope, token, identity, key)) return
    clearTenantBrandRuntime()
    state.error =
      failure instanceof Error ? failure.message : '当前品牌运行态加载失败'
  } finally {
    if (run === generation) state.loading = false
  }
}
export const updateTenantBrandLocale = async (
  identity: TenantBrandRuntimeIdentity,
  locale: TenantBrandLocale
) => {
  const run = generation
  const scope = tenantScope.snapshot()
  const token = getToken()
  const key = identityKey(identity)
  if (!identity.userId || !identity.tenantId || !token)
    throw new Error('当前成员身份不可用')
  try {
    const current = await fetchMembershipPreferences()
    if (!isCurrent(run, scope, token, identity, key)) return
    if (
      current.tenantId !== identity.tenantId ||
      current.userId !== identity.userId
    )
      throw new Error('成员偏好身份或租户不匹配')
    const input = parseMembershipPreferencesUpdate({
      version: 1,
      expectedRevision: current.revision,
      locale,
    })
    await updateMembershipPreferences(input, crypto.randomUUID())
    if (!isCurrent(run, scope, token, identity, key)) return
    window.dispatchEvent(
      new CustomEvent(TENANT_BRANDING_REFRESH_EVENT, {
        detail: { kind: 'preferences', tenantId: identity.tenantId },
      })
    )
  } catch (failure) {
    if (isCurrent(run, scope, token, identity, key))
      state.error =
        failure instanceof Error ? failure.message : '语言偏好保存失败'
    throw failure
  }
}
export const tenantBrandRuntime = readonly(state)
export const tenantBrandDefaults = {
  title: DEFAULT_TITLE,
  brandName: DEFAULT_BRAND_NAME,
  locale: DEFAULT_LOCALE,
} as const
