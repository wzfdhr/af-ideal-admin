import assert from 'node:assert/strict'
import { test } from 'node:test'

const { default: brand } = await import(
  process.env.TENANT_BRANDING_CONTRACT_MODULE ||
    new URL('../dist/tenant-branding.js', import.meta.url).href
)
const {
  parseTenantBrandDraftSave: save,
  parseTenantBrandApply: apply,
  parseMembershipPreferencesUpdate: preferences,
} = brand
const draft = (patch = {}) => ({
  version: 1,
  brandName: '研发品牌 🚀',
  title: '订单 < 10 · 研发工作台',
  logoFileId: null,
  primaryColor: '#165dff',
  appearance: 'light',
  compact: false,
  defaultLocale: 'zh-CN',
  ...patch,
})
const body = (patch = {}) => ({
  version: 1,
  expectedRevision: 3,
  draft: draft(),
  ...patch,
})
const invalid = (parse, value) =>
  assert.throws(
    () => parse(value),
    (error) =>
      error.name === 'DomainError' &&
      error.status === 422 &&
      error.businessCode === 'VALIDATION_ERROR'
  )

test('full brand draft normalization preserves Unicode, comparison text, spacing and false without applying', () => {
  const source = body({
    draft: draft({
      brandName: '  工作台 · Ω  ',
      title: '订单 < 10 & 数量 > 0',
    }),
  })
  const parsed = save(source)
  assert.deepEqual(parsed, {
    version: 1,
    expectedRevision: 3,
    draft: { ...source.draft, primaryColor: '#165DFF' },
  })
  assert.equal(source.draft.primaryColor, '#165dff')
  assert.equal(Object.hasOwn(parsed, 'activeVersionId'), false)
  assert.equal(Object.hasOwn(parsed.draft, 'source'), false)
})

test('versions are numeric v1 only, with safe omission normalization', () => {
  const input = body()
  delete input.version
  delete input.draft.version
  assert.equal(save(input).version, 1)
  assert.equal(save(input).draft.version, 1)
  assert.deepEqual(apply({ expectedRevision: 1 }), {
    version: 1,
    expectedRevision: 1,
  })
  for (const version of [0, 2, 32, '1', '2', null, undefined, NaN]) {
    invalid(save, body({ version }))
    invalid(save, body({ draft: draft({ version }) }))
    invalid(apply, { version, expectedRevision: 1 })
    invalid(preferences, { version, expectedRevision: 1, compact: false })
  }
})

test('save, apply and preference commands require exact positive integer revisions', () => {
  for (const expectedRevision of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    '3',
    null,
    undefined,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    invalid(save, body({ expectedRevision }))
    invalid(apply, { expectedRevision })
    invalid(preferences, { expectedRevision, compact: false })
  }
  assert.equal(
    apply({ expectedRevision: Number.MAX_SAFE_INTEGER }).expectedRevision,
    Number.MAX_SAFE_INTEGER
  )
})

test('draft save requires complete editable values instead of manufacturing tenant or deployment defaults', () => {
  for (const key of [
    'brandName',
    'title',
    'logoFileId',
    'primaryColor',
    'appearance',
    'compact',
    'defaultLocale',
  ]) {
    const value = draft()
    delete value[key]
    invalid(save, body({ draft: value }))
  }
  invalid(save, { expectedRevision: 1 })
  invalid(save, body({ draft: null }))
})

test('brand and title bounds count Unicode code points and retain exact valid inputs', () => {
  const value = draft({ brandName: '界'.repeat(64), title: '🚀'.repeat(100) })
  assert.deepEqual(save(body({ draft: value })).draft, {
    ...value,
    primaryColor: '#165DFF',
  })
  invalid(save, body({ draft: draft({ brandName: '界'.repeat(65) }) }))
  invalid(save, body({ draft: draft({ title: '🚀'.repeat(101) }) }))
  for (const value of ['', ' ', '\u00a0', null, 42, false]) {
    invalid(save, body({ draft: draft({ brandName: value }) }))
    invalid(save, body({ draft: draft({ title: value }) }))
  }
})

test('plain display text rejects markup, controls, bidi controls and malformed UTF-16 without banning comparisons', () => {
  for (const value of [
    '<script>alert(1)</script>',
    '<img src=x onerror=x>',
    '</svg>',
    '<b',
    '<!DOCTYPE html>',
    '<!-- x -->',
    '<?xml?>',
    'line\nnext',
    'tab\tname',
    'null\u0000byte',
    '\u007f',
    '\u0085',
    'x\u202Ey',
    'x\u200By',
    '\uD800',
    '\uDC00',
  ]) {
    invalid(save, body({ draft: draft({ brandName: value }) }))
    invalid(save, body({ draft: draft({ title: value }) }))
  }
  for (const value of [
    '订单 < 10',
    '数量 > 0',
    'R&D',
    '进度 50%_完成',
    'A "quoted" title',
    "Maker's Space",
    '🚀 团队',
  ])
    assert.equal(
      save(body({ draft: draft({ title: value }) })).draft.title,
      value
    )
})

test('primary color accepts exactly six hexadecimal digits and canonicalizes case', () => {
  assert.equal(
    save(body({ draft: draft({ primaryColor: '#aBcD09' }) })).draft
      .primaryColor,
    '#ABCD09'
  )
  for (const primaryColor of [
    '#fff',
    '#ffffffff',
    '165dff',
    '#12GG34',
    ' #165dff',
    'var(--primary)',
    'rgb(1,2,3)',
    'url(x)',
    null,
    165255,
  ])
    invalid(save, body({ draft: draft({ primaryColor }) }))
})

test('locales, appearance and compact are closed and never coerced', () => {
  for (const defaultLocale of ['zh-CN', 'en-US'])
    for (const appearance of ['light', 'dark'])
      for (const compact of [true, false]) {
        const result = save(
          body({ draft: draft({ defaultLocale, appearance, compact }) })
        ).draft
        assert.equal(result.defaultLocale, defaultLocale)
        assert.equal(result.appearance, appearance)
        assert.equal(result.compact, compact)
      }
  for (const defaultLocale of ['zh', 'en', 'en-us', 'fr-FR', 'inherit', null])
    invalid(save, body({ draft: draft({ defaultLocale }) }))
  for (const appearance of ['system', 'inherit', 'DARK', true, null])
    invalid(save, body({ draft: draft({ appearance }) }))
  for (const compact of ['false', 0, 1, null, undefined])
    invalid(save, body({ draft: draft({ compact }) }))
})

test('logo is only an opaque file ID or explicit null, including real base64url leading characters', () => {
  for (const logoFileId of [
    'aecc0f16-036e-4134-91bc-b2e0c97ecb10',
    '-file_token',
    '_file-token',
    'a'.repeat(100),
    null,
  ])
    assert.equal(
      save(body({ draft: draft({ logoFileId }) })).draft.logoFileId,
      logoFileId
    )
  for (const logoFileId of [
    '',
    undefined,
    'a'.repeat(101),
    '__proto__',
    'constructor',
    'prototype',
    ' file-1',
    'file 1',
  ])
    invalid(save, body({ draft: draft({ logoFileId }) }))
})

test('logo reference has no URL, foreign tenant carrier, path, SVG, script or client attestation channel', () => {
  for (const logoFileId of [
    'https://example.test/logo.png',
    '//example.test/logo.png',
    'javascript:alert(1)',
    'javascript:evil',
    'data:image/png;base64,AAAA',
    '<svg/>',
    '../file-1',
    'tenant-b:file-1',
    'file/1',
    'file\\1',
    { fileId: 'file-1', tenantId: 'tenant-b' },
    ['file-1'],
  ])
    invalid(save, body({ draft: draft({ logoFileId }) }))
  for (const key of [
    'tenantId',
    'logoUrl',
    'logo',
    'logoMetadata',
    'mimeType',
    'sha256',
    'width',
    'height',
    'size',
    'clean',
    'scanStatus',
    'isOwner',
  ])
    invalid(save, body({ draft: { ...draft(), [key]: 'client-assertion' } }))
  // A well-formed ID alone is not proof of ownership/clean status. Backend binding checks are mandatory.
  assert.equal(
    save(body({ draft: draft({ logoFileId: 'existing-file-token' }) })).draft
      .logoFileId,
    'existing-file-token'
  )
})

test('applying selects only the current server draft at the expected revision', () => {
  assert.deepEqual(apply({ version: 1, expectedRevision: 4 }), {
    version: 1,
    expectedRevision: 4,
  })
  for (const key of [
    'draft',
    'snapshot',
    'activeVersionId',
    'versionId',
    'sourceDraftRevision',
    'contentHash',
    'appliedBy',
    'appliedAt',
    'logoBinding',
    'count',
    'force',
  ])
    invalid(apply, {
      version: 1,
      expectedRevision: 4,
      [key]: key === 'draft' ? draft() : 'forged',
    })
})

test('clients cannot select tenant, member, executor or idempotency provenance in any command', () => {
  for (const key of [
    'tenantId',
    'userId',
    'memberId',
    'executor',
    'actorId',
    'createdBy',
    'source',
    'idempotencyKey',
    'commandKey',
    'revision',
    'status',
  ]) {
    invalid(save, { ...body(), [key]: 'forged' })
    invalid(apply, { expectedRevision: 1, [key]: 'forged' })
    invalid(preferences, {
      expectedRevision: 1,
      compact: false,
      [key]: 'forged',
    })
  }
})

test('preferences PATCH distinguishes omitted fields from explicit inherited nulls', () => {
  assert.deepEqual(preferences({ expectedRevision: 8, locale: 'en-US' }), {
    version: 1,
    expectedRevision: 8,
    locale: 'en-US',
  })
  assert.deepEqual(
    preferences({ expectedRevision: 8, appearance: null, compact: false }),
    { version: 1, expectedRevision: 8, appearance: null, compact: false }
  )
  assert.deepEqual(
    preferences({
      version: 1,
      expectedRevision: 8,
      locale: null,
      appearance: null,
      compact: null,
    }),
    {
      version: 1,
      expectedRevision: 8,
      locale: null,
      appearance: null,
      compact: null,
    }
  )
  invalid(preferences, { expectedRevision: 8 })
  for (const field of ['locale', 'appearance', 'compact'])
    invalid(preferences, { expectedRevision: 8, [field]: undefined })
})

test('preference choices remain strict and cannot submit resolved effective facts', () => {
  for (const locale of ['inherit', 'auto', 'zh', 'fr-FR', 1, false])
    invalid(preferences, { expectedRevision: 1, locale })
  for (const appearance of ['inherit', 'system', 'dark-mode', 0, true])
    invalid(preferences, { expectedRevision: 1, appearance })
  for (const compact of [0, 1, 'false', 'true'])
    invalid(preferences, { expectedRevision: 1, compact })
  for (const key of [
    'effective',
    'activeBrandVersionId',
    'values',
    'updatedAt',
    'defaultLocale',
    'primaryColor',
  ])
    invalid(preferences, {
      expectedRevision: 1,
      compact: false,
      [key]: { compact: true },
    })
})

test('record inputs reject arrays, dates, classes and inherited prototypes at both boundaries', () => {
  class Carrier {
    constructor(value) {
      Object.assign(this, value)
    }
  }
  for (const value of [
    [],
    new Array(2),
    new Date(),
    new Carrier(body()),
    Object.assign(Object.create({ future: true }), body()),
  ])
    invalid(save, value)
  for (const value of [
    [],
    new Date(),
    new Carrier(draft()),
    Object.assign(Object.create({ compact: true }), draft()),
  ])
    invalid(save, body({ draft: value }))
  invalid(
    apply,
    Object.assign(Object.create({ expectedRevision: 1 }), { version: 1 })
  )
  invalid(
    preferences,
    Object.assign(Object.create({ locale: 'en-US' }), {
      expectedRevision: 1,
      compact: false,
    })
  )
})

test('own prototype pollution keys and unknown nested versions are rejected without mutating prototypes', () => {
  const pollution = JSON.parse(
    '{"version":1,"expectedRevision":1,"__proto__":{"polluted":true}}'
  )
  invalid(apply, pollution)
  invalid(
    save,
    body({
      draft: JSON.parse(JSON.stringify({ ...draft(), constructor: 'forged' })),
    })
  )
  invalid(
    preferences,
    JSON.parse(
      '{"expectedRevision":1,"compact":false,"__proto__":{"polluted":true}}'
    )
  )
  assert.equal({}.polluted, undefined)
})

test('accessors are rejected before evaluation, including recognized required fields', () => {
  let calls = 0
  const getter = () => {
    calls += 1
    throw new Error('Getter must never run')
  }
  for (const [parse, value, key] of [
    [save, body(), 'expectedRevision'],
    [apply, { expectedRevision: 1 }, 'version'],
    [preferences, { expectedRevision: 1, compact: false }, 'compact'],
  ]) {
    Object.defineProperty(value, key, { enumerable: true, get: getter })
    invalid(parse, value)
  }
  const nested = draft()
  Object.defineProperty(nested, 'logoFileId', { enumerable: true, get: getter })
  invalid(save, body({ draft: nested }))
  const outer = body()
  Object.defineProperty(outer, 'draft', { enumerable: true, get: getter })
  invalid(save, outer)
  assert.equal(calls, 0)
})

test('symbols and hidden data properties cannot smuggle fields through otherwise plain input', () => {
  for (const [parse, base] of [
    [save, body()],
    [apply, { expectedRevision: 1 }],
    [preferences, { expectedRevision: 1, compact: false }],
  ]) {
    const symbol = { ...base, [Symbol('secret')]: 'x' }
    invalid(parse, symbol)
    const hidden = { ...base }
    Object.defineProperty(hidden, 'future', { value: 'x', enumerable: false })
    invalid(parse, hidden)
  }
  const hidden = draft()
  Object.defineProperty(hidden, 'title', {
    value: 'hidden title',
    enumerable: false,
  })
  invalid(save, body({ draft: hidden }))
  const nested = { ...draft(), [Symbol.toStringTag]: 'Brand' }
  invalid(save, body({ draft: nested }))
})

test('plain null-prototype records normalize to independent ordinary records without mutation', () => {
  const source = Object.assign(
    Object.create(null),
    body({ draft: Object.assign(Object.create(null), draft()) })
  )
  Object.freeze(source.draft)
  Object.freeze(source)
  const result = save(source)
  assert.equal(Object.getPrototypeOf(result), Object.prototype)
  assert.equal(Object.getPrototypeOf(result.draft), Object.prototype)
  assert.notEqual(result.draft, source.draft)
  assert.equal(source.draft.primaryColor, '#165dff')
  assert.equal(result.draft.primaryColor, '#165DFF')
  const patch = Object.freeze(
    Object.assign(Object.create(null), { expectedRevision: 3, compact: null })
  )
  assert.deepEqual(preferences(patch), {
    version: 1,
    expectedRevision: 3,
    compact: null,
  })
})

test('restoring prior editable values requires a fresh save revision and preserves their exact normalized content', () => {
  const original = save(
    body({
      draft: draft({
        brandName: ' 品牌 Ω ',
        logoFileId: '-opaque_file',
        appearance: 'dark',
        compact: true,
        defaultLocale: 'en-US',
      }),
    })
  ).draft
  const restored = save({
    expectedRevision: 19,
    draft: JSON.parse(JSON.stringify(original)),
  })
  assert.equal(restored.expectedRevision, 19)
  assert.deepEqual(restored.draft, original)
  invalid(save, {
    expectedRevision: 19,
    versionId: 'old-immutable-version',
    draft: original,
  })
  assert.deepEqual(apply({ expectedRevision: 20 }), {
    version: 1,
    expectedRevision: 20,
  })
})

test('image operational constants constrain later byte decoding without accepting client facts', () => {
  assert.deepEqual(brand.TENANT_BRAND_LOGO_MIME_TYPES, [
    'image/png',
    'image/jpeg',
  ])
  assert.equal(brand.TENANT_BRAND_LOGO_MAX_BYTES, 2 * 1024 * 1024)
  assert.equal(brand.TENANT_BRAND_LOGO_MIN_DIMENSION, 1)
  assert.equal(brand.TENANT_BRAND_LOGO_MAX_DIMENSION, 1024)
  assert.equal(brand.TENANT_BRAND_DEFAULT_PRIMARY_COLOR, '#165DFF')
  assert.deepEqual(brand.TENANT_BRAND_PERMISSIONS, {
    manage: 'tenant:brand:manage',
  })
  invalid(
    save,
    body({
      draft: {
        ...draft(),
        logoBinding: {
          fileId: 'file-1',
          mimeType: 'image/png',
          size: 1,
          width: 1,
          height: 1,
          sha256: '0'.repeat(64),
        },
      },
    })
  )
})
