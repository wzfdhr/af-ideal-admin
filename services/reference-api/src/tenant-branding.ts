import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import {
  DomainError,
  TENANT_BRAND_PERMISSIONS,
  TENANT_BRAND_LOGO_MAX_BYTES,
  TENANT_BRAND_LOGO_MAX_DIMENSION,
  TENANT_BRAND_DEFAULT_PRIMARY_COLOR,
  parseTenantBrandDraftSave,
  parseTenantBrandApply,
  parseMembershipPreferencesUpdate,
  record,
  onlyKeys,
} from '@af-admin/contracts'
import {
  assertRevision,
  hasPermission,
  requirePermission,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  authorizedTransaction,
  idempotent,
  one,
  rows,
  audit,
  contentCanonical,
  contentHash,
  pageQuery,
  noFault,
} from './support'
import { LocalObjectStore, fileDigest } from './file-storage'
import { visibleRecord } from './record-access'
import type { Database, FaultInjector } from './support'
import type { Actor } from './auth'
import type { FileRuntime } from './files'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type {
  TenantBrandDraftV1,
  TenantBrandLogoMetadataV1,
  TenantBrandLogoV1,
  TenantBrandConfigurationV1,
  TenantBrandAppliedVersionV1,
  TenantBrandRuntimeV1,
  MembershipPreferencesV1,
  TenantBrandActorV1,
  MembershipPreferenceValuesV1,
} from '@af-admin/contracts'

const MANAGE = TENANT_BRAND_PERMISSIONS.manage
interface BrandConfiguration {
  tenant_id: string
  revision: number
  draft_revision: number
  draft: TenantBrandDraftV1
  draft_logo_file_id: string | null
  active_version_id: string | null
  updated_by: string
  updated_name: string
  updated_at: Date
}
interface BrandVersion {
  tenant_id: string
  id: string
  version_number: number
  source_draft_revision: number
  snapshot: TenantBrandDraftV1
  logo_file_id: string | null
  logo_binding: TenantBrandLogoMetadataV1 | null
  content_canonical: string
  content_hash: string
  applied_by: string
  applied_name: string
  applied_at: Date | string
}
interface LogoBinding {
  tenant_id: string
  file_id: string
  object_key: string
  mime_type: 'image/png' | 'image/jpeg'
  size: number
  sha256: string
  width: number
  height: number
  bound_by: string
}
interface StoredLogo {
  tenant_id: string
  id: string
  owner_id: string
  record_id: string | null
  object_key: string
  mime_type: string
  size: number
  sha256: string
  status: string
  scan_engine: string | null
  scan_error: string | null
}
interface PreferencesRow {
  tenant_id: string
  user_id: string
  revision: number
  locale: MembershipPreferenceValuesV1['locale']
  appearance: MembershipPreferenceValuesV1['appearance']
  compact: boolean | null
  updated_at: Date
}
const unavailable = () =>
  new DomainError(
    409,
    'TENANT_BRAND_LOGO_UNAVAILABLE',
    '品牌标识当前未通过文件状态或实际图像校验'
  )
const invalidImage = () =>
  new DomainError(
    422,
    'TENANT_BRAND_LOGO_INVALID',
    '品牌标识必须为完整、单帧且每轴1至1024像素的PNG或JPEG图像'
  )
const storeFor = (files: FileRuntime) => {
  const root = files.storageRoot || process.env.FILE_STORAGE_DIR
  if (!root)
    throw new DomainError(
      503,
      'TENANT_BRAND_STORAGE_UNAVAILABLE',
      '品牌文件存储暂不可用'
    )
  return new LocalObjectStore(root)
}
const gate = (db: Database, tenantId: string, write = false) =>
  db.query(
    `SELECT ${
      write ? 'pg_advisory_xact_lock' : 'pg_advisory_xact_lock_shared'
    }(hashtextextended($1,0))`,
    [`tenant-brand:${tenantId}`]
  )
const configuration = async (db: Database, tenantId: string, lock = false) =>
  (
    await rows<BrandConfiguration>(
      db,
      `SELECT * FROM tenant_brand_configurations WHERE tenant_id=$1 ${
        lock ? 'FOR UPDATE' : 'FOR SHARE'
      }`,
      [tenantId]
    )
  )[0]
const logoMetadata = (binding: LogoBinding): TenantBrandLogoMetadataV1 => ({
  fileId: binding.file_id,
  mimeType: binding.mime_type,
  size: binding.size,
  sha256: binding.sha256,
  width: binding.width,
  height: binding.height,
})
const readBinding = async (db: Database, tenantId: string, id: string) =>
  (
    await rows<LogoBinding>(
      db,
      'SELECT * FROM tenant_brand_logo_bindings WHERE tenant_id=$1 AND file_id=$2',
      [tenantId, id]
    )
  )[0]
const fallback = async (
  db: Database,
  tenantId: string
): Promise<TenantBrandDraftV1> => {
  const tenant = one(
    await rows<{ name: string }>(
      db,
      "SELECT name FROM tenants WHERE id=$1 AND status='enabled'",
      [tenantId]
    )
  )
  return {
    version: 1,
    brandName: tenant.name,
    title:
      process.env.APP_TITLE || process.env.VITE_APP_TITLE || 'AF-Ideal-Admin',
    logoFileId: null,
    primaryColor: TENANT_BRAND_DEFAULT_PRIMARY_COLOR,
    appearance: 'light',
    compact: false,
    defaultLocale: 'zh-CN',
  }
}
// Verify PNG structure and CRC before allowing the decoder to inspect a byte buffer.
/* eslint-disable no-bitwise */
const crcTable = Uint32Array.from({ length: 256 }, (_, number) => {
  let value = number
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
const crc32 = (bytes: Buffer, start: number, end: number) => {
  let result = 0xffffffff
  for (let index = start; index < end; index += 1)
    result = crcTable[(result ^ bytes[index]) & 255] ^ (result >>> 8)
  return (result ^ 0xffffffff) >>> 0
}
/* eslint-enable no-bitwise */
const pngContainer = (bytes: Buffer) => {
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw invalidImage()
  let position = 8
  let headers = 0
  let data = false
  let ended = false
  while (position < bytes.length) {
    if (position + 12 > bytes.length) throw invalidImage()
    const length = bytes.readUInt32BE(position)
    const end = position + 12 + length
    if (end > bytes.length) throw invalidImage()
    const kind = bytes.toString('ascii', position + 4, position + 8)
    if (
      !/^[A-Za-z]{4}$/.test(kind) ||
      ['acTL', 'fcTL', 'fdAT'].includes(kind) ||
      crc32(bytes, position + 4, end - 4) !== bytes.readUInt32BE(end - 4)
    )
      throw invalidImage()
    if (headers === 0 && kind !== 'IHDR') throw invalidImage()
    if (kind === 'IHDR') {
      headers += 1
      if (headers !== 1 || length !== 13) throw invalidImage()
      const width = bytes.readUInt32BE(position + 8)
      const height = bytes.readUInt32BE(position + 12)
      if (width < 1 || height < 1 || width > 1024 || height > 1024)
        throw invalidImage()
    }
    if (kind === 'IDAT') data = true
    if (kind === 'IEND') {
      if (length !== 0 || !data || end !== bytes.length) throw invalidImage()
      ended = true
    }
    if (
      !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(kind) &&
      kind[0] === kind[0].toUpperCase()
    )
      throw invalidImage()
    position = end
  }
  if (!ended) throw invalidImage()
}
const jpegContainer = (bytes: Buffer) => {
  if (!bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    throw invalidImage()
  let position = 2
  let inScan = false
  let frames = 0
  let scans = 0
  let ended = false
  while (position < bytes.length) {
    if (inScan) {
      while (position < bytes.length && bytes[position] !== 255) position += 1
    }
    if (position >= bytes.length || bytes[position] !== 255)
      throw invalidImage()
    while (position < bytes.length && bytes[position] === 255) position += 1
    if (position >= bytes.length) throw invalidImage()
    const marker = bytes[position]
    position += 1
    // Stuffed bytes and restart markers stay inside the current entropy stream.
    // eslint-disable-next-line no-continue
    if (inScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue
    inScan = false
    if (marker === 0xd9) {
      if (position !== bytes.length || frames !== 1 || scans < 1)
        throw invalidImage()
      ended = true
      break
    }
    if (
      marker === 0xd8 ||
      marker === 0 ||
      marker === 1 ||
      position + 2 > bytes.length
    )
      throw invalidImage()
    const length = bytes.readUInt16BE(position)
    if (length < 2 || position + length > bytes.length) throw invalidImage()
    if (
      marker === 0xe2 &&
      bytes
        .subarray(position + 2, position + 6)
        .equals(Buffer.from([77, 80, 70, 0]))
    )
      throw invalidImage()
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      frames += 1
      if (length < 8 || frames !== 1) throw invalidImage()
      const height = bytes.readUInt16BE(position + 3)
      const width = bytes.readUInt16BE(position + 5)
      if (width < 1 || height < 1 || width > 1024 || height > 1024)
        throw invalidImage()
    }
    if (marker === 0xda) {
      scans += 1
      inScan = true
    }
    position += length
  }
  if (!ended) throw invalidImage()
}
/** Fully decodes approved byte formats. No input string is ever interpreted as a path or decoder instruction. */
export const validateTenantBrandLogoBytes = async (
  bytes: Buffer,
  mimeType: string
) => {
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    bytes.length > TENANT_BRAND_LOGO_MAX_BYTES
  )
    throw invalidImage()
  if (mimeType === 'image/png') pngContainer(bytes)
  else if (mimeType === 'image/jpeg') jpegContainer(bytes)
  else throw invalidImage()
  try {
    const decoder = sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: TENANT_BRAND_LOGO_MAX_DIMENSION ** 2,
      unlimited: false,
    })
    const metadata = await decoder.metadata()
    if (
      metadata.format !== (mimeType === 'image/png' ? 'png' : 'jpeg') ||
      (metadata.pages ?? 1) !== 1 ||
      (metadata.delay?.length ?? 0) > 1 ||
      !metadata.channels ||
      metadata.channels > 4 ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 1024 ||
      metadata.height > 1024
    )
      throw invalidImage()
    const decoded = await decoder
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true })
    const { width, height, channels } = decoded.info
    if (
      width !== metadata.width ||
      height !== metadata.height ||
      width < 1 ||
      height < 1 ||
      width > 1024 ||
      height > 1024 ||
      channels < 1 ||
      channels > 4 ||
      decoded.data.length !== width * height * channels ||
      decoded.data.length > 4 * 1024 * 1024
    )
      throw invalidImage()
    return { width, height }
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw invalidImage()
  }
}
const checkedLogo = async (
  db: Database,
  tenantId: string,
  id: string,
  files: FileRuntime,
  binding: LogoBinding | undefined
) => {
  const file = one(
    await rows<StoredLogo>(
      db,
      'SELECT * FROM stored_files WHERE tenant_id=$1 AND id=$2 FOR SHARE',
      [tenantId, id]
    )
  )
  if (
    file.status !== 'ready' ||
    !file.scan_engine?.startsWith('ClamAV ') ||
    file.scan_error !== null ||
    !['image/png', 'image/jpeg'].includes(file.mime_type) ||
    file.size < 1 ||
    file.size > TENANT_BRAND_LOGO_MAX_BYTES
  )
    throw unavailable()
  if (
    binding &&
    (binding.object_key !== file.object_key ||
      binding.sha256 !== file.sha256 ||
      binding.size !== file.size ||
      binding.mime_type !== file.mime_type)
  )
    throw unavailable()
  const bytes = await storeFor(files).get(file.object_key)
  if (bytes.length !== file.size || fileDigest(bytes) !== file.sha256)
    throw unavailable()
  const dimensions = await validateTenantBrandLogoBytes(bytes, file.mime_type)
  if (
    binding &&
    (dimensions.width !== binding.width || dimensions.height !== binding.height)
  )
    throw unavailable()
  return { file, bytes, dimensions }
}
const bindLogo = async (
  db: Database,
  actor: Actor,
  id: string | null,
  files: FileRuntime
): Promise<LogoBinding | null> => {
  if (id === null) return null
  const previous = await readBinding(db, actor.tenantId, id)
  if (!previous) {
    const file = one(
      await rows<StoredLogo>(
        db,
        'SELECT * FROM stored_files WHERE tenant_id=$1 AND id=$2 FOR SHARE',
        [actor.tenantId, id]
      )
    )
    if (file.owner_id !== actor.userId)
      throw new DomainError(404, 'NOT_FOUND', '资源不存在')
    if (
      !hasPermission(actor.permissions, 'file:preview') &&
      !hasPermission(actor.permissions, 'file:download')
    )
      requirePermission(actor.permissions, 'file:preview')
    if (file.record_id) await visibleRecord(db, actor, file.record_id)
  }
  const checked = await checkedLogo(db, actor.tenantId, id, files, previous)
  if (previous) return previous
  return one(
    await rows<LogoBinding>(
      db,
      'INSERT INTO tenant_brand_logo_bindings(tenant_id,file_id,object_key,mime_type,size,sha256,width,height,bound_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [
        actor.tenantId,
        id,
        checked.file.object_key,
        checked.file.mime_type,
        checked.file.size,
        checked.file.sha256,
        checked.dimensions.width,
        checked.dimensions.height,
        actor.userId,
      ]
    )
  )
}
const currentLogo = async (
  db: Database,
  tenantId: string,
  id: string | null,
  files: FileRuntime
): Promise<TenantBrandLogoV1 | null> => {
  if (id === null) return null
  try {
    const binding = await readBinding(db, tenantId, id)
    if (!binding) throw unavailable()
    await checkedLogo(db, tenantId, id, files, binding)
    return { fileId: id, status: 'ready', metadata: logoMetadata(binding) }
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    return { fileId: id, status: 'unavailable', metadata: null }
  }
}
const verifyVersion = (value: BrandVersion) => {
  const snapshot = { snapshot: value.snapshot, logoBinding: value.logo_binding }
  if (
    value.content_canonical !== contentCanonical(snapshot) ||
    value.content_hash !== contentHash(snapshot) ||
    value.snapshot.logoFileId !== value.logo_file_id
  )
    throw new DomainError(
      409,
      'TENANT_BRAND_VERSION_CORRUPT',
      '品牌应用版本完整性校验失败'
    )
  return value
}
const activeVersion = async (
  db: Database,
  config: BrandConfiguration | undefined
) =>
  config?.active_version_id
    ? verifyVersion(
        one(
          await rows<BrandVersion>(
            db,
            'SELECT * FROM tenant_brand_versions WHERE tenant_id=$1 AND id=$2',
            [config.tenant_id, config.active_version_id]
          )
        )
      )
    : null
const actorDto = async (
  db: Database,
  actor: Actor,
  id: string,
  name: string
): Promise<TenantBrandActorV1> =>
  one(
    await rows<TenantBrandActorV1>(
      db,
      "SELECT CASE WHEN af_member_field_visible($1,$2,$3,$4,'username') THEN $4 ELSE NULL END AS id,CASE WHEN af_member_field_visible($1,$2,$3,$4,'name') THEN $5 ELSE NULL END AS name",
      [actor.tenantId, actor.userId, MANAGE, id, name]
    )
  )
const versionDto = async (
  db: Database,
  actor: Actor,
  value: BrandVersion
): Promise<TenantBrandAppliedVersionV1> => {
  verifyVersion(value)
  return {
    version: 1,
    source: 'server',
    id: value.id,
    versionNumber: value.version_number,
    sourceDraftRevision: value.source_draft_revision,
    snapshot: value.snapshot,
    logoBinding: value.logo_binding,
    contentHash: value.content_hash,
    appliedAt: new Date(value.applied_at).toISOString(),
    appliedBy: await actorDto(db, actor, value.applied_by, value.applied_name),
  }
}
const configDto = async (
  db: Database,
  actor: Actor,
  files: FileRuntime
): Promise<TenantBrandConfigurationV1> => {
  requirePermission(actor.permissions, MANAGE)
  const config = await configuration(db, actor.tenantId)
  const version = await activeVersion(db, config)
  const draft = config?.draft ?? (await fallback(db, actor.tenantId))
  return {
    version: 1,
    source: 'server',
    tenantId: actor.tenantId,
    revision: config?.revision ?? 1,
    draftRevision: config?.draft_revision ?? 0,
    draft,
    draftLogo: await currentLogo(db, actor.tenantId, draft.logoFileId, files),
    activeVersionId: version?.id ?? null,
    activeVersion: version ? await versionDto(db, actor, version) : null,
    pendingApply:
      !!config &&
      (!version || contentHash(draft) !== contentHash(version.snapshot)),
    updatedAt: config?.updated_at.toISOString() ?? null,
    updatedBy: config
      ? await actorDto(db, actor, config.updated_by, config.updated_name)
      : null,
    allowedActions: config ? ['save', 'apply'] : ['save'],
  }
}
const preferencesDto = async (
  db: Database,
  actor: Actor,
  branding: TenantBrandDraftV1,
  versionId: string | null
): Promise<MembershipPreferencesV1> => {
  const stored = (
    await rows<PreferencesRow>(
      db,
      'SELECT * FROM membership_preferences WHERE tenant_id=$1 AND user_id=$2 FOR SHARE',
      [actor.tenantId, actor.userId]
    )
  )[0]
  const values: MembershipPreferenceValuesV1 = {
    locale: stored?.locale ?? null,
    appearance: stored?.appearance ?? null,
    compact: stored?.compact ?? null,
  }
  return {
    version: 1,
    source: 'server',
    tenantId: actor.tenantId,
    userId: actor.userId,
    revision: stored?.revision ?? 1,
    values,
    effective: {
      locale: values.locale ?? branding.defaultLocale,
      appearance: values.appearance ?? branding.appearance,
      compact: values.compact ?? branding.compact,
      activeBrandVersionId: versionId,
    },
    updatedAt: stored?.updated_at.toISOString() ?? null,
  }
}
const runtimeDto = async (
  db: Database,
  actor: Actor,
  files: FileRuntime
): Promise<TenantBrandRuntimeV1> => {
  const config = await configuration(db, actor.tenantId)
  const version = await activeVersion(db, config)
  const branding = version?.snapshot ?? (await fallback(db, actor.tenantId))
  return {
    version: 1,
    source: 'server',
    tenantId: actor.tenantId,
    activeVersionId: version?.id ?? null,
    branding,
    logo: await currentLogo(db, actor.tenantId, branding.logoFileId, files),
    preferences: await preferencesDto(db, actor, branding, version?.id ?? null),
  }
}
/** Root's files DELETE bridge must call this while holding the file lock, after migration 032 activation. */
export const assertTenantBrandFileDeletable = async (
  db: Database,
  tenantId: string,
  fileId: string
) => {
  const { pinned } = one(
    await rows<{ pinned: boolean }>(
      db,
      'SELECT EXISTS(SELECT 1 FROM tenant_brand_configurations WHERE tenant_id=$1 AND draft_logo_file_id=$2) OR EXISTS(SELECT 1 FROM tenant_brand_versions WHERE tenant_id=$1 AND logo_file_id=$2) AS pinned',
      [tenantId, fileId]
    )
  )
  if (pinned)
    throw new DomainError(
      409,
      'TENANT_BRAND_LOGO_IN_USE',
      '文件仍被品牌草稿或已应用历史版本引用'
    )
}
export const registerTenantBranding = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault,
  files: FileRuntime = {}
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  server.get('/api/tenant-branding/runtime', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), [])
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        await gate(db, current.tenantId)
        return ok(await runtimeDto(db, current, files), request.id)
      }
    )
  })
  server.get('/api/tenant-branding/configuration', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), [])
    return authorizedTransaction(pool, actor, MANAGE, async (db, current) => {
      await gate(db, current.tenantId)
      return ok(await configDto(db, current, files), request.id)
    })
  })
  server.put('/api/tenant-branding/draft', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseTenantBrandDraftSave(request.body)
    const result = await idempotent<{
      tenantId: string
      data?: TenantBrandConfigurationV1
    }>(
      pool,
      actor,
      MANAGE,
      'tenant-brand.draft.save',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        await gate(db, current.tenantId, true)
        const previous = await configuration(db, current.tenantId, true)
        assertRevision(previous?.revision ?? 1, input.expectedRevision)
        await bindLogo(db, current, input.draft.logoFileId, files)
        const saved = one(
          await rows<BrandConfiguration>(
            db,
            'INSERT INTO tenant_brand_configurations(tenant_id,revision,draft_revision,draft,draft_logo_file_id,updated_by,updated_name) VALUES($1,2,1,$2,$3,$4,$5) ON CONFLICT(tenant_id) DO UPDATE SET revision=tenant_brand_configurations.revision+1,draft_revision=tenant_brand_configurations.draft_revision+1,draft=EXCLUDED.draft,draft_logo_file_id=EXCLUDED.draft_logo_file_id,updated_by=EXCLUDED.updated_by,updated_name=EXCLUDED.updated_name,updated_at=clock_timestamp() RETURNING *',
            [
              current.tenantId,
              JSON.stringify(input.draft),
              input.draft.logoFileId,
              current.userId,
              current.name,
            ]
          )
        )
        await audit(
          db,
          current,
          'tenant-branding',
          'draft.saved',
          'tenant-branding',
          current.tenantId,
          'success',
          { revision: saved.revision, draftRevision: saved.draft_revision }
        )
        fault('tenant-brand.draft.before-commit')
        return { tenantId: current.tenantId }
      },
      false,
      '',
      async (db, current) => {
        await gate(db, current.tenantId)
        return {
          tenantId: current.tenantId,
          data: await configDto(db, current, files),
        }
      }
    )
    return ok(result.data, request.id)
  })
  server.post('/api/tenant-branding/apply', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseTenantBrandApply(request.body)
    const result = await idempotent<{
      tenantId: string
      data?: TenantBrandConfigurationV1
    }>(
      pool,
      actor,
      MANAGE,
      'tenant-brand.apply',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        await gate(db, current.tenantId, true)
        const config = await configuration(db, current.tenantId, true)
        if (!config)
          throw new DomainError(
            409,
            'TENANT_BRAND_DRAFT_REQUIRED',
            '请先保存品牌草稿'
          )
        assertRevision(config.revision, input.expectedRevision)
        const binding = await bindLogo(
          db,
          current,
          config.draft_logo_file_id,
          files
        )
        const alreadyApplied = (
          await rows<BrandVersion>(
            db,
            'SELECT * FROM tenant_brand_versions WHERE tenant_id=$1 AND source_draft_revision=$2',
            [current.tenantId, config.draft_revision]
          )
        )[0]
        if (alreadyApplied) return { tenantId: current.tenantId }
        const metadata = binding ? logoMetadata(binding) : null
        const payload = { snapshot: config.draft, logoBinding: metadata }
        const id = randomUUID()
        const version = one(
          await rows<BrandVersion>(
            db,
            'INSERT INTO tenant_brand_versions(tenant_id,id,version_number,source_draft_revision,snapshot,logo_file_id,logo_binding,content_canonical,content_hash,applied_by,applied_name) SELECT $1,$2,COALESCE(max(version_number),0)+1,$3,$4,$5,$6,$7,$8,$9,$10 FROM tenant_brand_versions WHERE tenant_id=$1 RETURNING *',
            [
              current.tenantId,
              id,
              config.draft_revision,
              JSON.stringify(config.draft),
              config.draft_logo_file_id,
              metadata ? JSON.stringify(metadata) : null,
              contentCanonical(payload),
              contentHash(payload),
              current.userId,
              current.name,
            ]
          )
        )
        await db.query(
          'UPDATE tenant_brand_configurations SET active_version_id=$2,revision=revision+1,updated_by=$3,updated_name=$4,updated_at=clock_timestamp() WHERE tenant_id=$1',
          [current.tenantId, id, current.userId, current.name]
        )
        await audit(
          db,
          current,
          'tenant-branding',
          'applied',
          'tenant-branding',
          current.tenantId,
          'success',
          {
            revision: config.revision + 1,
            draftRevision: config.draft_revision,
            versionNumber: version.version_number,
          }
        )
        fault('tenant-brand.apply.before-commit')
        return { tenantId: current.tenantId }
      },
      false,
      '',
      async (db, current) => {
        await gate(db, current.tenantId)
        return {
          tenantId: current.tenantId,
          data: await configDto(db, current, files),
        }
      }
    )
    return ok(result.data, request.id)
  })
  server.get('/api/tenant-branding/versions', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), ['current', 'pageSize'])
    const page = pageQuery(request.query)
    return authorizedTransaction(pool, actor, MANAGE, async (db, current) => {
      await gate(db, current.tenantId)
      const result = one(
        await rows<{ list: BrandVersion[]; total: number }>(
          db,
          "WITH matching AS MATERIALIZED(SELECT * FROM tenant_brand_versions WHERE tenant_id=$1),page AS(SELECT * FROM matching ORDER BY version_number DESC LIMIT $2 OFFSET $3) SELECT (SELECT count(*)::int FROM matching) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb) AS list",
          [current.tenantId, page.pageSize, page.offset]
        )
      )
      return ok(
        {
          version: 1,
          source: 'server',
          list: await Promise.all(
            result.list.map((value) => versionDto(db, current, value))
          ),
          total: result.total,
          current: page.current,
          pageSize: page.pageSize,
        },
        request.id
      )
    })
  })
  server.get('/api/tenant-branding/logo', async (request, reply) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), [])
    const result = await authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        await gate(db, current.tenantId)
        const version = await activeVersion(
          db,
          await configuration(db, current.tenantId)
        )
        if (!version?.logo_file_id)
          throw new DomainError(404, 'NOT_FOUND', '资源不存在')
        const binding = await readBinding(
          db,
          current.tenantId,
          version.logo_file_id
        )
        if (
          !binding ||
          contentHash(logoMetadata(binding)) !==
            contentHash(version.logo_binding)
        )
          throw unavailable()
        try {
          return await checkedLogo(
            db,
            current.tenantId,
            binding.file_id,
            files,
            binding
          )
        } catch (error) {
          if (error instanceof DomainError) throw unavailable()
          throw error
        }
      }
    )
    return reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header(
        'Content-Disposition',
        `inline; filename="tenant-logo.${
          result.file.mime_type === 'image/png' ? 'png' : 'jpg'
        }"`
      )
      .header('X-Content-SHA256', fileDigest(result.bytes))
      .header('Content-Length', result.bytes.length)
      .type(result.file.mime_type)
      .send(result.bytes)
  })
  server.get('/api/membership-preferences', async (request) => {
    const actor = await authenticate(pool, request)
    onlyKeys(record(request.query), [])
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        await gate(db, current.tenantId)
        return ok(
          (await runtimeDto(db, current, files)).preferences,
          request.id
        )
      }
    )
  })
  server.patch('/api/membership-preferences', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseMembershipPreferencesUpdate(request.body)
    const result = await idempotent<{
      userId: string
      data?: MembershipPreferencesV1
    }>(
      pool,
      actor,
      '',
      'membership-preferences.update',
      scalarHeader(request, 'idempotency-key'),
      input,
      async (db, current) => {
        await gate(db, current.tenantId)
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `membership-preferences:${current.tenantId}:${current.userId}`,
        ])
        const previous = (
          await rows<PreferencesRow>(
            db,
            'SELECT * FROM membership_preferences WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE',
            [current.tenantId, current.userId]
          )
        )[0]
        assertRevision(previous?.revision ?? 1, input.expectedRevision)
        const next = {
          locale:
            input.locale === undefined
              ? previous?.locale ?? null
              : input.locale,
          appearance:
            input.appearance === undefined
              ? previous?.appearance ?? null
              : input.appearance,
          compact:
            input.compact === undefined
              ? previous?.compact ?? null
              : input.compact,
        }
        const saved = one(
          await rows<PreferencesRow>(
            db,
            'INSERT INTO membership_preferences(tenant_id,user_id,revision,locale,appearance,compact) VALUES($1,$2,2,$3,$4,$5) ON CONFLICT(tenant_id,user_id) DO UPDATE SET revision=membership_preferences.revision+1,locale=EXCLUDED.locale,appearance=EXCLUDED.appearance,compact=EXCLUDED.compact,updated_at=clock_timestamp() RETURNING *',
            [
              current.tenantId,
              current.userId,
              next.locale,
              next.appearance,
              next.compact,
            ]
          )
        )
        await audit(
          db,
          current,
          'tenant-branding',
          'preferences.updated',
          'membership',
          current.userId,
          'success',
          { revision: saved.revision }
        )
        fault('membership-preferences.before-commit')
        return { userId: current.userId }
      },
      false,
      '',
      async (db, current) => {
        await gate(db, current.tenantId)
        return {
          userId: current.userId,
          data: (await runtimeDto(db, current, files)).preferences,
        }
      }
    )
    return ok(result.data, request.id)
  })
}
