import { invalid, onlyKeys, positiveInteger, record } from './schemas'

export const TENANT_BRAND_VERSION = 1 as const
export const MEMBERSHIP_PREFERENCES_VERSION = 1 as const
export const TENANT_BRAND_PERMISSIONS = {
  manage: 'tenant:brand:manage',
} as const
export const TENANT_BRAND_LOCALES = ['zh-CN', 'en-US'] as const
export const TENANT_BRAND_APPEARANCES = ['light', 'dark'] as const
export const TENANT_BRAND_LOGO_MIME_TYPES = ['image/png', 'image/jpeg'] as const
export const TENANT_BRAND_NAME_MAX_LENGTH = 64
export const TENANT_BRAND_TITLE_MAX_LENGTH = 100
export const TENANT_BRAND_LOGO_ID_MAX_LENGTH = 100
/** Operational resource and display bounds; these are not legal retention or licensing rules. */
export const TENANT_BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024
export const TENANT_BRAND_LOGO_MIN_DIMENSION = 1
export const TENANT_BRAND_LOGO_MAX_DIMENSION = 1024
export const TENANT_BRAND_DEFAULT_PRIMARY_COLOR = '#165DFF'

export type TenantBrandLocale = typeof TENANT_BRAND_LOCALES[number]
export type TenantBrandAppearance = typeof TENANT_BRAND_APPEARANCES[number]
export type TenantBrandLogoMimeType =
  typeof TENANT_BRAND_LOGO_MIME_TYPES[number]

const has = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)
const exact = (input: unknown, keys: string[], field = 'body') => {
  const value = record(input, field)
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid(field, '必须为明确的数据对象')
  Reflect.ownKeys(value).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (
      typeof key !== 'string' ||
      !keys.includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      invalid(field, '不接受未知字段、符号、隐藏属性或访问器')
  })
  onlyKeys(value, keys)
  return value
}
const versionOne = (value: Record<string, unknown>) => {
  if (has(value, 'version') && value.version !== 1)
    invalid('version', '仅支持数值版本1')
}
const plain = (input: unknown, field: string, max: number): string => {
  if (
    typeof input !== 'string' ||
    input.length > max * 2 ||
    !input.trim() ||
    Array.from(input).length > max ||
    /[\p{Cc}\p{Cf}\uD800-\uDFFF]/u.test(input) ||
    /<\s*(?:[!?]|\/?\s*[a-z][a-z0-9:_-]*(?:[\s/>]|$))/iu.test(input)
  )
    return invalid(field, `必须为1至${max}字的纯文本，不接受标记或控制字符`)
  // Keep valid spelling, Unicode and spacing; never reinterpret the value as markup.
  return input
}
const choice = <T extends string>(
  input: unknown,
  allowed: readonly T[],
  field: string
): T => {
  if (typeof input !== 'string' || !allowed.includes(input as T))
    return invalid(field, `${field}值无效`)
  return input as T
}
const bool = (input: unknown, field: string): boolean => {
  if (typeof input !== 'boolean') return invalid(field, '必须为布尔值')
  return input
}
const logoFileId = (input: unknown): string | null => {
  if (input === null) return null
  if (
    typeof input !== 'string' ||
    input.length > TENANT_BRAND_LOGO_ID_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(input) ||
    ['__proto__', 'prototype', 'constructor'].includes(input)
  )
    return invalid(
      'logoFileId',
      '仅接受不含路径或地址的文件标识，或明确null清除'
    )
  return input
}
const color = (input: unknown): string => {
  if (typeof input !== 'string' || !/^#[a-f0-9]{6}$/i.test(input))
    return invalid('primaryColor', '主色必须为#RRGGBB格式')
  return input.toUpperCase()
}

/** Full editable values. Saving never applies these values to current members. */
export interface TenantBrandDraftV1 {
  readonly version: 1
  readonly brandName: string
  readonly title: string
  readonly logoFileId: string | null
  readonly primaryColor: string
  readonly appearance: TenantBrandAppearance
  readonly compact: boolean
  readonly defaultLocale: TenantBrandLocale
}
const parseDraft = (input: unknown): TenantBrandDraftV1 => {
  const value = exact(
    input,
    [
      'version',
      'brandName',
      'title',
      'logoFileId',
      'primaryColor',
      'appearance',
      'compact',
      'defaultLocale',
    ],
    'draft'
  )
  versionOne(value)
  return {
    version: 1,
    brandName: plain(
      value.brandName,
      'brandName',
      TENANT_BRAND_NAME_MAX_LENGTH
    ),
    title: plain(value.title, 'title', TENANT_BRAND_TITLE_MAX_LENGTH),
    logoFileId: logoFileId(value.logoFileId),
    primaryColor: color(value.primaryColor),
    appearance: choice(
      value.appearance,
      TENANT_BRAND_APPEARANCES,
      'appearance'
    ),
    compact: bool(value.compact, 'compact'),
    defaultLocale: choice(
      value.defaultLocale,
      TENANT_BRAND_LOCALES,
      'defaultLocale'
    ),
  }
}
export interface TenantBrandDraftSaveV1 {
  version: 1
  expectedRevision: number
  draft: TenantBrandDraftV1
}
/** Idempotency-Key belongs to the authenticated command transport, never to a brand snapshot. */
export const parseTenantBrandDraftSave = (
  input: unknown
): TenantBrandDraftSaveV1 => {
  const body = exact(input, ['version', 'expectedRevision', 'draft'])
  versionOne(body)
  return {
    version: 1,
    expectedRevision: positiveInteger(body.expectedRevision),
    draft: parseDraft(body.draft),
  }
}
export interface TenantBrandApplyV1 {
  version: 1
  expectedRevision: number
}
/** Apply the currently saved draft at this revision; callers cannot supply a version, actor, hash or snapshot. */
export const parseTenantBrandApply = (input: unknown): TenantBrandApplyV1 => {
  const body = exact(input, ['version', 'expectedRevision'])
  versionOne(body)
  return {
    version: 1,
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}

export interface MembershipPreferenceValuesV1 {
  readonly locale: TenantBrandLocale | null
  readonly appearance: TenantBrandAppearance | null
  readonly compact: boolean | null
}
export interface MembershipPreferencesUpdateV1 {
  version: 1
  expectedRevision: number
  /** Omission leaves the current preference unchanged; null inherits the active tenant default. */
  locale?: TenantBrandLocale | null
  appearance?: TenantBrandAppearance | null
  compact?: boolean | null
}
/** Applies only to the current authenticated membership; no tenant/user selector is accepted. */
export const parseMembershipPreferencesUpdate = (
  input: unknown
): MembershipPreferencesUpdateV1 => {
  const body = exact(input, [
    'version',
    'expectedRevision',
    'locale',
    'appearance',
    'compact',
  ])
  versionOne(body)
  if (!['locale', 'appearance', 'compact'].some((field) => has(body, field)))
    invalid('body', '至少提交一项个人偏好；null表示继承租户默认值')
  return {
    version: 1,
    expectedRevision: positiveInteger(body.expectedRevision),
    ...(has(body, 'locale')
      ? {
          locale:
            body.locale === null
              ? null
              : choice(body.locale, TENANT_BRAND_LOCALES, 'locale'),
        }
      : {}),
    ...(has(body, 'appearance')
      ? {
          appearance:
            body.appearance === null
              ? null
              : choice(body.appearance, TENANT_BRAND_APPEARANCES, 'appearance'),
        }
      : {}),
    ...(has(body, 'compact')
      ? {
          compact: body.compact === null ? null : bool(body.compact, 'compact'),
        }
      : {}),
  }
}

/** Trusted server metadata after actual byte/hash, clean scan, image decode and same-tenant binding checks. */
export interface TenantBrandLogoMetadataV1 {
  readonly fileId: string
  readonly mimeType: TenantBrandLogoMimeType
  readonly size: number
  readonly sha256: string
  readonly width: number
  readonly height: number
}
/** No arbitrary URL, storage path or original file-ACL grant is carried by this projection. */
export type TenantBrandLogoV1 =
  | {
      readonly fileId: string
      readonly status: 'ready'
      readonly metadata: TenantBrandLogoMetadataV1
    }
  | {
      readonly fileId: string
      readonly status: 'unavailable'
      readonly metadata: null
    }
export interface TenantBrandActorV1 {
  readonly id: string | null
  readonly name: string | null
}
/** Immutable application fact; logoBinding describes bytes approved at application time. */
export interface TenantBrandAppliedVersionV1 {
  readonly version: 1
  readonly source: 'server'
  readonly id: string
  readonly versionNumber: number
  readonly sourceDraftRevision: number
  readonly snapshot: TenantBrandDraftV1
  readonly logoBinding: TenantBrandLogoMetadataV1 | null
  readonly contentHash: string
  readonly appliedAt: string
  readonly appliedBy: TenantBrandActorV1
}
/** Management projection only. Ordinary member reads use TenantBrandRuntimeV1 without the draft. */
export interface TenantBrandConfigurationV1 {
  readonly version: 1
  readonly source: 'server'
  readonly tenantId: string
  readonly revision: number
  readonly draftRevision: number
  readonly draft: TenantBrandDraftV1
  readonly draftLogo: TenantBrandLogoV1 | null
  readonly activeVersionId: string | null
  readonly activeVersion: TenantBrandAppliedVersionV1 | null
  readonly pendingApply: boolean
  readonly updatedAt: string | null
  readonly updatedBy: TenantBrandActorV1 | null
  readonly allowedActions: readonly ('save' | 'apply')[]
}
export interface TenantBrandVersionPageV1 {
  readonly version: 1
  readonly source: 'server'
  readonly list: readonly TenantBrandAppliedVersionV1[]
  readonly total: number
  readonly current: number
  readonly pageSize: number
}
export interface EffectiveMembershipPreferencesV1 {
  readonly locale: TenantBrandLocale
  readonly appearance: TenantBrandAppearance
  readonly compact: boolean
  readonly activeBrandVersionId: string | null
}
/** Both identity and effective inherited values are authoritative current server facts. */
export interface MembershipPreferencesV1 {
  readonly version: 1
  readonly source: 'server'
  readonly tenantId: string
  readonly userId: string
  readonly revision: number
  readonly values: MembershipPreferenceValuesV1
  readonly effective: EffectiveMembershipPreferencesV1
  readonly updatedAt: string | null
}
/** Ordinary enabled members may read applied branding; this never grants original file listing/download rights. */
export interface TenantBrandRuntimeV1 {
  readonly version: 1
  readonly source: 'server'
  readonly tenantId: string
  readonly activeVersionId: string | null
  readonly branding: TenantBrandDraftV1
  readonly logo: TenantBrandLogoV1 | null
  readonly preferences: MembershipPreferencesV1
}
