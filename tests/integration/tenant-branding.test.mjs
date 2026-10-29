import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { before, after, test } from 'node:test'
import database from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import brand from '../../services/reference-api/dist/tenant-branding.js'
import jobs from '../../services/reference-api/dist/file-jobs.js'

const sharp = createRequire(
  new URL('../../services/reference-api/package.json', import.meta.url)
)('sharp')
const pool = database.createPool(),
  tokens = new Map(),
  passwords = new Map(),
  tenantIds = [],
  availableTenantFixtures = [],
  members = [],
  roles = [],
  children = new Set()
let server,
  storageRoot,
  originals = [],
  isolated = false,
  failure = ''
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
before(async () => {
  assert.equal(process.env.APP_MODE, 'demo')
  assert.match(
    (await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^af_admin_tests_[a-z0-9]+_demo$/
  )
  isolated = true
  await migrations.migrate(pool)
  await seed.seedDemo(pool)
  if (
    !(
      await pool.query(
        "SELECT to_regclass('public.tenant_brand_configurations') AS name"
      )
    ).rows[0].name
  )
    await database.transaction(pool, async (client) =>
      client.query(
        await readFile(
          new URL(
            '../../services/reference-api/migrations/032_tenant_branding.sql',
            import.meta.url
          ),
          'utf8'
        )
      )
    )
  storageRoot = await mkdtemp(join(tmpdir(), 'af-tenant-branding-'))
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin')"
    )
  ).rows
  const codes = (
    await pool.query(
      "SELECT code FROM permission_definitions WHERE status='enabled'"
    )
  ).rows.map((row) => row.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin')",
    [JSON.stringify(codes)]
  )
  // Populate the complete membership scope before the first real admin login.
  // Each test still receives a distinct tenant; no auth scope or limiter is bypassed.
  for (let index = 0; index < 14; index += 1)
    availableTenantFixtures.push(await createTenantFixture())
  const inject = (point) => {
    if (point === failure) {
      failure = ''
      throw new Error('Controlled branding transaction rollback')
    }
  }
  server = api.createServer(pool, inject, { storageRoot })
  if (!server.hasRoute({ method: 'GET', url: '/api/tenant-branding/runtime' }))
    brand.registerTenantBranding(server, pool, inject, { storageRoot })
  await server.ready()
})
after(async () => {
  await Promise.all(Array.from(children).map(stopChild))
  if (server) await server.close()
  if (isolated) {
    for (const item of originals)
      await pool.query(
        'UPDATE memberships SET permissions=$3::jsonb WHERE tenant_id=$1 AND user_id=$2',
        [item.tenant_id, item.user_id, JSON.stringify(item.permissions)]
      )
    await pool.query(
      "UPDATE memberships SET status='disabled',deleted_at=now() WHERE user_id=ANY($1::text[])",
      [members]
    )
    await pool.query(
      "UPDATE roles SET status='disabled',deleted_at=now() WHERE id=ANY($1::text[])",
      [roles]
    )
    await pool.query(
      "UPDATE tenants SET status='disabled' WHERE id=ANY($1::text[])",
      [tenantIds]
    )
  }
  await pool.end()
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true })
})
const login = async (user) => {
  if (tokens.has(user)) return tokens.get(user)
  const response = await server.inject({
    method: 'POST',
    url: '/api/user/login',
    payload: { username: user, password: passwords.get(user) || user },
  })
  assert.equal(response.statusCode, 200, response.body)
  tokens.set(user, response.json().data.token)
  return tokens.get(user)
}
const call = async (
  path,
  {
    user = 'a-admin',
    tenantId = 'tenant-a',
    method = 'GET',
    body,
    bytes,
    key = randomUUID(),
  } = {}
) =>
  server.inject({
    method,
    url: `/api${path}`,
    headers: {
      'x-access-token': await login(user),
      'x-tenant-id': tenantId,
      'idempotency-key': key,
      ...(bytes ? { 'content-type': 'application/octet-stream' } : {}),
    },
    ...(bytes
      ? { payload: bytes }
      : body === undefined
      ? {}
      : { payload: body }),
  })
const ok = (response) => {
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().code, 20000)
  return response.json().data
}
const createTenantFixture = async () => {
  const id = `brand-${randomUUID()}`,
    name = `品牌租户-${randomUUID().slice(0, 8)}`
  await pool.query('INSERT INTO tenants(id,name) VALUES($1,$2)', [id, name])
  tenantIds.push(id)
  const codes = (
    await pool.query(
      "SELECT code FROM permission_definitions WHERE status='enabled'"
    )
  ).rows.map((row) => row.code)
  await pool.query(
    "INSERT INTO memberships(tenant_id,user_id,department_name,role,permissions) VALUES($1,'a-admin','Brand fixture','admin',$2::jsonb)",
    [id, JSON.stringify(codes)]
  )
  return { id, name }
}
const tenant = async () => {
  const fixture = availableTenantFixtures.shift()
  assert.ok(fixture, 'Every test must use a pre-created independent tenant')
  return fixture
}
const person = async (organization, { manage = true, files = true } = {}) => {
  const username = `brand-${randomUUID().slice(0, 8)}`,
    password = 'Brand-private-test-2026'
  const created = ok(
    await call('/system/users', {
      tenantId: organization.id,
      method: 'POST',
      body: {
        username,
        name: `品牌成员-${randomUUID().slice(0, 8)}`,
        phone: '',
        email: '',
        initialPassword: password,
        status: 'enabled',
      },
    })
  )
  members.push(created.id)
  passwords.set(username, password)
  const permissions = [
    ...(manage ? ['tenant:brand:manage'] : []),
    ...(files
      ? [
          'file:upload',
          'file:preview',
          'file:download',
          'file:delete',
          'file:list',
        ]
      : []),
  ]
  const role = ok(
    await call('/system/roles', {
      tenantId: organization.id,
      method: 'POST',
      body: {
        roleName: `Brand ${randomUUID()}`,
        roleKey: `brand-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions,
      },
    })
  )
  roles.push(role.id)
  ok(
    await call(`/system/users/${created.id}/authorization`, {
      tenantId: organization.id,
      method: 'POST',
      body: {
        roleIds: [role.id],
        directPermissions: [],
        expectedRevision: created.revision,
      },
    })
  )
  return { ...created, username, roleId: role.id, tenantId: organization.id }
}
const as = (owner, extra = {}) => ({
  user: owner.username,
  tenantId: owner.tenantId,
  ...extra,
})
const config = (owner) =>
  call('/tenant-branding/configuration', as(owner)).then(ok)
const runtime = (owner) => call('/tenant-branding/runtime', as(owner)).then(ok)
const values = (patch = {}) => ({
  version: 1,
  brandName: '实际租户品牌',
  title: '订单 < 10 · 工作台',
  logoFileId: null,
  primaryColor: '#165dff',
  appearance: 'light',
  compact: false,
  defaultLocale: 'zh-CN',
  ...patch,
})
const save = async (owner, draft, revision, key = randomUUID()) =>
  call(
    '/tenant-branding/draft',
    as(owner, {
      method: 'PUT',
      key,
      body: {
        expectedRevision: revision ?? (await config(owner)).revision,
        draft,
      },
    })
  )
const apply = async (owner, revision, key = randomUUID()) =>
  call(
    '/tenant-branding/apply',
    as(owner, {
      method: 'POST',
      key,
      body: { expectedRevision: revision ?? (await config(owner)).revision },
    })
  )
const imageBytes = async (format = 'png', width = 32, height = 16) =>
  sharp({
    create: {
      width,
      height,
      channels: format === 'png' ? 4 : 3,
      background: '#165DFF',
    },
  })
    [format]()
    .toBuffer()
const upload = async (owner, bytes, mime = 'image/png') => {
  const upload = ok(
    await call(
      '/files/uploads',
      as(owner, {
        method: 'POST',
        body: {
          fileName: `logo-${randomUUID()}.${
            mime === 'image/png' ? 'png' : 'jpg'
          }`,
          mimeType: mime,
          size: bytes.length,
          sha256: digest(bytes),
        },
      })
    )
  )
  let revision = upload.revision
  for (let index = 0; index < Math.ceil(bytes.length / 1048576); index += 1)
    revision = ok(
      await call(
        `/files/uploads/${upload.id}/parts/${index}`,
        as(owner, {
          method: 'PUT',
          bytes: bytes.subarray(index * 1048576, (index + 1) * 1048576),
        })
      )
    ).revision
  ok(
    await call(
      `/files/uploads/${upload.id}/complete`,
      as(owner, { method: 'POST', body: { expectedRevision: revision } })
    )
  )
  return upload.id
}
const scanOwned = async (owner, fileId) => {
  assert.equal(
    await jobs.processFileScan(
      pool,
      { storageRoot },
      { tenantId: owner.tenantId, fileIds: [fileId] }
    ),
    true
  )
  const row = (
    await pool.query(
      'SELECT * FROM stored_files WHERE tenant_id=$1 AND id=$2',
      [owner.tenantId, fileId]
    )
  ).rows[0]
  assert.equal(row.status, 'ready')
  assert.match(row.scan_engine, /^ClamAV /)
  return row
}
const readyImage = async (owner, format = 'png') => {
  const bytes = await imageBytes(format),
    id = await upload(
      owner,
      bytes,
      format === 'png' ? 'image/png' : 'image/jpeg'
    ),
    file = await scanOwned(owner, id)
  return { id, bytes, file }
}
const stopChild = async (child) => {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    children.delete(child)
    return
  }
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
  try {
    await exited
  } finally {
    clearTimeout(timer)
    children.delete(child)
  }
}

test('normal members read real tenant defaults and own nullable preferences without management or file grants', async () => {
  const organization = await tenant(),
    member = await person(organization, { manage: false, files: false })
  const current = await runtime(member)
  assert.equal(current.tenantId, organization.id)
  assert.equal(current.branding.brandName, organization.name)
  assert.equal(current.branding.primaryColor, '#165DFF')
  assert.equal(current.activeVersionId, null)
  assert.equal(current.logo, null)
  assert.equal(Object.hasOwn(current, 'draft'), false)
  assert.equal(current.preferences.userId, member.id)
  assert.deepEqual(current.preferences.values, {
    locale: null,
    appearance: null,
    compact: null,
  })
  assert.equal(
    (await call('/tenant-branding/configuration', as(member))).statusCode,
    403
  )
  const preference = ok(
    await call(
      '/membership-preferences',
      as(member, {
        method: 'PATCH',
        body: {
          expectedRevision: 1,
          locale: 'en-US',
          appearance: 'dark',
          compact: false,
        },
      })
    )
  )
  assert.deepEqual(preference.values, {
    locale: 'en-US',
    appearance: 'dark',
    compact: false,
  })
  assert.equal(preference.effective.compact, false)
  const cleared = ok(
    await call(
      '/membership-preferences',
      as(member, {
        method: 'PATCH',
        body: { expectedRevision: preference.revision, appearance: null },
      })
    )
  )
  assert.equal(cleared.values.locale, 'en-US')
  assert.equal(cleared.values.appearance, null)
  assert.equal(cleared.effective.appearance, 'light')
  const other = await person(organization, { manage: false, files: false })
  assert.equal((await runtime(other)).preferences.values.locale, null)
  assert.equal(
    (
      await call(
        '/membership-preferences',
        as(member, {
          method: 'PATCH',
          body: {
            expectedRevision: cleared.revision,
            userId: other.id,
            locale: 'zh-CN',
          },
        })
      )
    ).statusCode,
    422
  )
})

for (const format of ['png', 'jpeg'])
  test(`real clean ${format} draft save and immutable apply expose only active approved logo bytes to tenant members`, async () => {
    const organization = await tenant(),
      manager = await person(organization),
      viewer = await person(organization, { manage: false, files: false }),
      asset = await readyImage(manager, format)
    const initial = await config(manager)
    assert.equal(initial.revision, 1)
    assert.equal(initial.draftRevision, 0)
    assert.equal((await apply(manager, 1)).statusCode, 409)
    const saved = ok(
      await save(
        manager,
        values({
          logoFileId: asset.id,
          appearance: 'dark',
          compact: true,
          defaultLocale: 'en-US',
        }),
        1
      )
    )
    assert.equal(saved.revision, 2)
    assert.equal(saved.draftRevision, 1)
    assert.equal(saved.activeVersionId, null)
    assert.equal(saved.draftLogo.status, 'ready')
    assert.equal(saved.pendingApply, true)
    assert.equal((await runtime(viewer)).logo, null)
    const applied = ok(await apply(manager, saved.revision))
    assert.equal(applied.activeVersion.versionNumber, 1)
    assert.equal(applied.activeVersion.logoBinding.sha256, digest(asset.bytes))
    assert.equal(applied.pendingApply, false)
    const current = await runtime(viewer)
    assert.equal(current.activeVersionId, applied.activeVersionId)
    assert.equal(current.logo.metadata.width, 32)
    assert.equal(current.logo.metadata.height, 16)
    assert.equal(current.preferences.effective.appearance, 'dark')
    assert.equal(current.preferences.effective.compact, true)
    const explicit = ok(
      await call(
        '/membership-preferences',
        as(viewer, {
          method: 'PATCH',
          body: {
            expectedRevision: current.preferences.revision,
            compact: false,
          },
        })
      )
    )
    assert.equal(explicit.effective.compact, false)
    const inherited = ok(
      await call(
        '/membership-preferences',
        as(viewer, {
          method: 'PATCH',
          body: { expectedRevision: explicit.revision, compact: null },
        })
      )
    )
    assert.equal(inherited.effective.compact, true)
    assert.equal(
      (await call(`/files/resources/${asset.id}/content`, as(viewer)))
        .statusCode,
      403
    )
    const logo = await call('/tenant-branding/logo', as(viewer))
    assert.equal(logo.statusCode, 200)
    assert.deepEqual(logo.rawPayload, asset.bytes)
    assert.equal(logo.headers['x-content-sha256'], digest(asset.bytes))
    assert.equal(logo.headers['cache-control'], 'no-store')
    assert.equal(
      (await call(`/tenant-branding/logo?fileId=${asset.id}`, as(viewer)))
        .statusCode,
      422
    )
    const reopened = await config(manager)
    assert.deepEqual(reopened.draft, saved.draft)
    const changed = ok(
      await save(manager, values({ title: '仅草稿变化' }), reopened.revision)
    )
    assert.equal(changed.activeVersionId, applied.activeVersionId)
    assert.equal((await runtime(viewer)).branding.title, saved.draft.title)
    assert.deepEqual(
      (await config(manager)).activeVersion,
      applied.activeVersion
    )
    await assert.rejects(
      pool.query(
        "UPDATE tenant_brand_versions SET snapshot=jsonb_set(snapshot,'{title}','\"tampered\"') WHERE tenant_id=$1 AND id=$2",
        [organization.id, applied.activeVersionId]
      ),
      /immutable/i
    )
  })

test('unapproved other-owner files and foreign-tenant file carriers cannot become logo bindings', async () => {
  const first = await tenant(),
    second = await tenant(),
    owner = await person(first),
    manager = await person(first),
    foreign = await person(second),
    asset = await readyImage(owner),
    foreignAsset = await readyImage(foreign)
  assert.equal(
    (await save(manager, values({ logoFileId: asset.id }))).statusCode,
    404
  )
  assert.equal(
    (await save(manager, values({ logoFileId: foreignAsset.id }))).statusCode,
    404
  )
  await assert.rejects(
    pool.query(
      'INSERT INTO tenant_brand_logo_bindings(tenant_id,file_id,object_key,mime_type,size,sha256,width,height,bound_by) SELECT tenant_id,id,object_key,mime_type,size,sha256,32,16,$3 FROM stored_files WHERE tenant_id=$1 AND id=$2',
      [first.id, asset.id, manager.id]
    ),
    /requires same-tenant clean immutable file identity/i
  )
  const approved = ok(await save(owner, values({ logoFileId: asset.id })))
  const reused = ok(
    await save(manager, values({ logoFileId: asset.id }), approved.revision)
  )
  assert.equal(reused.draftLogo.status, 'ready')
  assert.equal(
    (await call(`/files/resources/${asset.id}/content`, as(manager)))
      .statusCode,
    404
  )
  ok(await apply(manager, reused.revision))
  assert.equal((await runtime(foreign)).logo, null)
  assert.equal(
    (await call('/tenant-branding/logo', as(foreign))).statusCode,
    404
  )
})

test('approved branding survives uploader disable but current file withdrawal or byte mismatch immediately stops logo serving', async () => {
  const organization = await tenant(),
    owner = await person(organization),
    viewer = await person(organization, { manage: false, files: false }),
    asset = await readyImage(owner)
  ok(await save(owner, values({ logoFileId: asset.id })))
  const applied = ok(await apply(owner))
  await pool.query(
    "UPDATE memberships SET status='disabled' WHERE tenant_id=$1 AND user_id=$2",
    [organization.id, owner.id]
  )
  try {
    assert.deepEqual(
      (await call('/tenant-branding/logo', as(viewer))).rawPayload,
      asset.bytes
    )
    assert.equal(
      (await runtime(viewer)).activeVersionId,
      applied.activeVersionId
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET status='enabled' WHERE tenant_id=$1 AND user_id=$2",
      [organization.id, owner.id]
    )
    tokens.delete(owner.username)
    await login(owner.username)
  }
  await pool.query(
    "UPDATE stored_files SET status='infected' WHERE tenant_id=$1 AND id=$2",
    [organization.id, asset.id]
  )
  try {
    assert.equal((await runtime(viewer)).logo.status, 'unavailable')
    assert.equal(
      (await call('/tenant-branding/logo', as(viewer))).statusCode,
      409
    )
    assert.equal((await apply(owner)).statusCode, 409)
  } finally {
    await pool.query(
      "UPDATE stored_files SET status='ready' WHERE tenant_id=$1 AND id=$2",
      [organization.id, asset.id]
    )
  }
  const location = join(storageRoot, asset.file.object_key, 'content')
  await writeFile(location, Buffer.from('corrupt bytes'))
  try {
    assert.equal(
      (await call('/tenant-branding/logo', as(viewer))).statusCode,
      409
    )
    assert.equal((await runtime(viewer)).logo.metadata, null)
  } finally {
    await writeFile(location, asset.bytes)
  }
  assert.deepEqual(
    (await call('/tenant-branding/logo', as(viewer))).rawPayload,
    asset.bytes
  )
})

test('draft and applied history pin logos; clearing a never-applied draft removes only its deletion pin', async () => {
  const organization = await tenant(),
    owner = await person(organization),
    permanent = await readyImage(owner),
    temporary = await readyImage(owner)
  let saved = ok(await save(owner, values({ logoFileId: permanent.id })))
  const pinnedDelete = await call(
    `/files/resources/${permanent.id}`,
    as(owner, {
      method: 'DELETE',
      body: { expectedRevision: permanent.file.revision },
    })
  )
  assert.equal(pinnedDelete.statusCode, 409)
  assert.equal(pinnedDelete.json().businessCode, 'TENANT_BRAND_LOGO_IN_USE')
  await assert.rejects(
    database.transaction(pool, (client) =>
      brand.assertTenantBrandFileDeletable(
        client,
        organization.id,
        permanent.id
      )
    ),
    (error) => error.businessCode === 'TENANT_BRAND_LOGO_IN_USE'
  )
  await assert.rejects(
    pool.query(
      "UPDATE stored_files SET status='deleted' WHERE tenant_id=$1 AND id=$2",
      [organization.id, permanent.id]
    ),
    /referenced/i
  )
  ok(await apply(owner, saved.revision))
  saved = ok(await save(owner, values({ logoFileId: temporary.id })))
  await assert.rejects(
    pool.query(
      "UPDATE stored_files SET status='deleted' WHERE tenant_id=$1 AND id=$2",
      [organization.id, temporary.id]
    ),
    /referenced/i
  )
  saved = ok(await save(owner, values({ logoFileId: null }), saved.revision))
  await brand.assertTenantBrandFileDeletable(
    pool,
    organization.id,
    temporary.id
  )
  const file = (
    await pool.query(
      'SELECT revision FROM stored_files WHERE tenant_id=$1 AND id=$2',
      [organization.id, temporary.id]
    )
  ).rows[0]
  assert.equal(
    (
      await call(
        `/files/resources/${temporary.id}`,
        as(owner, {
          method: 'DELETE',
          body: { expectedRevision: file.revision },
        })
      )
    ).statusCode,
    200
  )
  ok(await apply(owner, saved.revision))
  await assert.rejects(
    pool.query(
      "UPDATE stored_files SET status='deleted' WHERE tenant_id=$1 AND id=$2",
      [organization.id, permanent.id]
    ),
    /referenced/i
  )
  assert.equal((await call('/tenant-branding/logo', as(owner))).statusCode, 404)
})

const pngCrc = (bytes) => {
  let value = 0xffffffff
  for (const byte of bytes) {
    value ^= byte
    for (let index = 0; index < 8; index += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return (value ^ 0xffffffff) >>> 0
}
const animatedPng = (bytes) => {
  const chunk = Buffer.alloc(20)
  chunk.writeUInt32BE(8, 0)
  chunk.write('acTL', 4)
  chunk.writeUInt32BE(2, 8)
  chunk.writeUInt32BE(pngCrc(chunk.subarray(4, 16)), 16)
  return Buffer.concat([bytes.subarray(0, 33), chunk, bytes.subarray(33)])
}
const invalidPixels = (bytes) => {
  const result = Buffer.from(bytes)
  let position = 8
  while (position < result.length) {
    const length = result.readUInt32BE(position)
    if (result.toString('ascii', position + 4, position + 8) === 'IDAT') {
      result.fill(0, position + 8, position + 8 + length)
      result.writeUInt32BE(
        pngCrc(result.subarray(position + 4, position + 8 + length)),
        position + 8 + length
      )
      return result
    }
    position += 12 + length
  }
  throw new Error('Fixture has no IDAT')
}
test('real clean but truncated, oversized, animated or malformed images cannot be saved despite successful file scanning', async () => {
  const organization = await tenant(),
    owner = await person(organization),
    png = await imageBytes(),
    jpeg = await imageBytes('jpeg')
  const malformed = [
    { bytes: animatedPng(png), mime: 'image/png' },
    { bytes: invalidPixels(png), mime: 'image/png' },
    { bytes: png.subarray(0, png.length - 8), mime: 'image/png' },
    { bytes: jpeg.subarray(0, jpeg.length - 5), mime: 'image/jpeg' },
    { bytes: await imageBytes('png', 1025, 1), mime: 'image/png' },
    { bytes: Buffer.concat([png, Buffer.from('<svg/>')]), mime: 'image/png' },
    { bytes: Buffer.concat([jpeg, jpeg]), mime: 'image/jpeg' },
  ]
  for (const item of malformed) {
    const id = await upload(owner, item.bytes, item.mime)
    await scanOwned(owner, id)
    assert.equal(
      (await save(owner, values({ logoFileId: id }))).statusCode,
      422
    )
    assert.equal(
      (
        await pool.query(
          'SELECT * FROM tenant_brand_logo_bindings WHERE tenant_id=$1 AND file_id=$2',
          [organization.id, id]
        )
      ).rowCount,
      0
    )
  }
  assert.equal((await config(owner)).revision, 1)
})

test('save/apply/preferences reject forged client facts, stale revisions and current privilege revocation even on command replay', async () => {
  const organization = await tenant(),
    owner = await person(organization),
    key = randomUUID()
  const saved = ok(await save(owner, values(), 1, key))
  assert.equal(ok(await save(owner, values(), 1, key)).revision, saved.revision)
  assert.equal(
    (await save(owner, values({ title: 'different' }), 1, key)).statusCode,
    409
  )
  assert.equal((await save(owner, values(), 1)).statusCode, 409)
  for (const body of [
    { version: 2, expectedRevision: saved.revision },
    { expectedRevision: saved.revision, snapshot: values() },
    { expectedRevision: saved.revision, tenantId: 'tenant-b' },
    {
      expectedRevision: saved.revision,
      logoBinding: { sha256: '0'.repeat(64) },
    },
  ])
    assert.equal(
      (
        await call(
          '/tenant-branding/apply',
          as(owner, { method: 'POST', body })
        )
      ).statusCode,
      422
    )
  await pool.query(
    "DELETE FROM role_permissions WHERE tenant_id=$1 AND role_id=$2 AND permission_code='tenant:brand:manage'",
    [organization.id, owner.roleId]
  )
  try {
    assert.equal((await save(owner, values(), 1, key)).statusCode, 403)
    assert.equal(
      (await call('/tenant-branding/configuration', as(owner))).statusCode,
      403
    )
    assert.equal((await runtime(owner)).activeVersionId, null)
  } finally {
    await pool.query(
      "INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES($1,$2,'tenant:brand:manage')",
      [organization.id, owner.roleId]
    )
  }
  const prefs = ok(await call('/membership-preferences', as(owner))),
    preferenceKey = randomUUID()
  ok(
    await call(
      '/membership-preferences',
      as(owner, {
        method: 'PATCH',
        key: preferenceKey,
        body: { expectedRevision: prefs.revision, locale: 'en-US' },
      })
    )
  )
  await pool.query(
    "UPDATE memberships SET status='disabled' WHERE tenant_id=$1 AND user_id=$2",
    [organization.id, owner.id]
  )
  try {
    assert.ok(
      [401, 403, 404].includes(
        (
          await call(
            '/membership-preferences',
            as(owner, {
              method: 'PATCH',
              key: preferenceKey,
              body: { expectedRevision: prefs.revision, locale: 'en-US' },
            })
          )
        ).statusCode
      )
    )
    assert.ok(
      [401, 403, 404].includes(
        (await call('/tenant-branding/runtime', as(owner))).statusCode
      )
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET status='enabled' WHERE tenant_id=$1 AND user_id=$2",
      [organization.id, owner.id]
    )
    tokens.delete(owner.username)
    await login(owner.username)
  }
})

test('CAS and idempotency serialize concurrent saves and keep failed apply/preferences audit writes atomic', async () => {
  const organization = await tenant(),
    owner = await person(organization),
    current = await config(owner)
  const responses = await Promise.all([
    save(owner, values({ title: 'Candidate A' }), current.revision),
    save(owner, values({ title: 'Candidate B' }), current.revision),
  ])
  assert.deepEqual(
    responses.map((response) => response.statusCode).sort(),
    [200, 409]
  )
  const saved = await config(owner),
    before = (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE tenant_id=$1 AND module='tenant-branding'",
        [organization.id]
      )
    ).rows[0].n
  failure = 'tenant-brand.apply.before-commit'
  assert.equal((await apply(owner, saved.revision)).statusCode, 500)
  assert.equal((await config(owner)).revision, saved.revision)
  assert.equal((await config(owner)).activeVersionId, null)
  assert.equal(
    (
      await pool.query(
        'SELECT * FROM tenant_brand_versions WHERE tenant_id=$1',
        [organization.id]
      )
    ).rowCount,
    0
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE tenant_id=$1 AND module='tenant-branding'",
        [organization.id]
      )
    ).rows[0].n,
    before
  )
  failure = 'membership-preferences.before-commit'
  assert.equal(
    (
      await call(
        '/membership-preferences',
        as(owner, {
          method: 'PATCH',
          body: { expectedRevision: 1, compact: true },
        })
      )
    ).statusCode,
    500
  )
  assert.equal(
    (await call('/membership-preferences', as(owner)).then(ok)).revision,
    1
  )
  const key = randomUUID(),
    applied = await Promise.all([
      apply(owner, saved.revision, key),
      apply(owner, saved.revision, key),
    ])
  assert.equal(ok(applied[0]).activeVersionId, ok(applied[1]).activeVersionId)
  assert.equal(
    (
      await pool.query(
        'SELECT * FROM tenant_brand_versions WHERE tenant_id=$1',
        [organization.id]
      )
    ).rowCount,
    1
  )
})

test('owned real scan scope cannot process another tenant file or evaluate an accessor scope', async () => {
  const first = await tenant(),
    second = await tenant(),
    owner = await person(first),
    other = await person(second),
    bytes = await imageBytes(),
    mine = await upload(owner, bytes),
    foreign = await upload(other, bytes)
  await assert.rejects(
    jobs.processFileScan(
      pool,
      { storageRoot },
      { tenantId: first.id, fileIds: [foreign] }
    )
  )
  let evaluated = false
  await assert.rejects(
    jobs.processFileScan(
      pool,
      { storageRoot },
      {
        tenantId: first.id,
        get fileIds() {
          evaluated = true
          return [mine]
        },
      }
    )
  )
  assert.equal(evaluated, false)
  await scanOwned(owner, mine)
  const unchanged = (
    await pool.query(
      'SELECT status,attempts FROM stored_files WHERE tenant_id=$1 AND id=$2',
      [second.id, foreign]
    )
  ).rows[0]
  assert.equal(unchanged.status, 'scanning')
  assert.equal(unchanged.attempts, 0)
  await scanOwned(other, foreign)
})

test('current tenant disable denies runtime/logo/preferences and re-enabling never changes persisted branding facts', async () => {
  const organization = await tenant(),
    owner = await person(organization),
    asset = await readyImage(owner)
  ok(await save(owner, values({ logoFileId: asset.id })))
  const applied = ok(await apply(owner))
  await pool.query("UPDATE tenants SET status='disabled' WHERE id=$1", [
    organization.id,
  ])
  try {
    for (const path of [
      '/tenant-branding/runtime',
      '/tenant-branding/logo',
      '/membership-preferences',
    ])
      assert.ok(
        [401, 403, 404].includes((await call(path, as(owner))).statusCode)
      )
  } finally {
    await pool.query("UPDATE tenants SET status='enabled' WHERE id=$1", [
      organization.id,
    ])
    tokens.delete(owner.username)
    await login(owner.username)
  }
  assert.equal((await runtime(owner)).activeVersionId, applied.activeVersionId)
  assert.equal(
    (await config(owner)).activeVersion.contentHash,
    applied.activeVersion.contentHash
  )
})

const startBrandChild = async () => {
  const program = String.raw`
 const {createPool}=require(process.env.BRAND_TEST_DATABASE_MODULE);
 const {createServer}=require(process.env.BRAND_TEST_API_MODULE);
 const {registerTenantBranding}=require(process.env.BRAND_TEST_MODULE);
 const pool=createPool();let server;
 (async()=>{
  if(process.env.APP_MODE!=='demo'||!/^af_admin_tests_[a-z0-9]+_demo$/.test((await pool.query('SELECT current_database() AS name')).rows[0].name))throw new Error('Isolated test database required');
  server=createServer(pool,undefined,{storageRoot:process.env.BRAND_TEST_STORAGE});
  if(!server.hasRoute({method:'GET',url:'/api/tenant-branding/runtime'}))registerTenantBranding(server,pool,undefined,{storageRoot:process.env.BRAND_TEST_STORAGE});
  const address=await server.listen({host:'127.0.0.1',port:0});process.stdout.write(JSON.stringify({address})+'\n');
 })().catch(()=>{process.stderr.write('Owned branding child failed\n');process.exitCode=1;pool.end().catch(()=>{})});
 process.on('SIGTERM',()=>Promise.resolve(server?.close()).then(()=>pool.end()).then(()=>process.exit(0)));
 `
  const child = spawn(process.execPath, ['-e', program], {
    env: {
      ...process.env,
      BRAND_TEST_DATABASE_MODULE: fileURLToPath(
        new URL(
          '../../services/reference-api/dist/database.js',
          import.meta.url
        )
      ),
      BRAND_TEST_API_MODULE: fileURLToPath(
        new URL('../../services/reference-api/dist/index.js', import.meta.url)
      ),
      BRAND_TEST_MODULE: fileURLToPath(
        new URL(
          '../../services/reference-api/dist/tenant-branding.js',
          import.meta.url
        )
      ),
      BRAND_TEST_STORAGE: storageRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  const address = await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Owned branding child startup timed out'))
    }, 10000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      children.delete(child)
      clearTimeout(timer)
      reject(new Error(`Owned branding child exited: ${code}`))
    })
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      if (output.length > 4096) {
        clearTimeout(timer)
        child.kill('SIGKILL')
        reject(new Error('Unexpected owned child output'))
        return
      }
      const line = output.split('\n')[0]
      if (!output.includes('\n')) return
      try {
        const value = JSON.parse(line)
        if (
          typeof value.address !== 'string' ||
          !/^http:\/\/127\.0\.0\.1:\d+$/.test(value.address)
        )
          throw new Error('Invalid child address')
        clearTimeout(timer)
        resolve(value.address)
      } catch (error) {
        clearTimeout(timer)
        reject(error)
      }
    })
    child.stderr.resume()
  })
  return { child, address }
}
test('actual API SIGKILL and replacement preserve saved draft, applied logo bytes and current membership preferences', async () => {
  const organization = await tenant(),
    manager = await person(organization),
    viewer = await person(organization, { manage: false, files: false }),
    asset = await readyImage(manager)
  ok(await save(manager, values({ logoFileId: asset.id, title: '已应用版本' })))
  const applied = ok(await apply(manager))
  const saved = ok(
    await save(manager, values({ title: '尚未应用草稿', appearance: 'dark' }))
  )
  const preferences = ok(
    await call(
      '/membership-preferences',
      as(viewer, {
        method: 'PATCH',
        body: { expectedRevision: 1, locale: 'en-US', compact: true },
      })
    )
  )
  const http = async (address, path, owner, binary = false) => {
    const response = await fetch(`${address}/api${path}`, {
      headers: {
        'x-access-token': await login(owner.username),
        'x-tenant-id': organization.id,
      },
    })
    assert.equal(response.status, 200)
    return binary
      ? Buffer.from(await response.arrayBuffer())
      : (await response.json()).data
  }
  const first = await startBrandChild()
  let second
  try {
    const before = await http(
        first.address,
        '/tenant-branding/runtime',
        viewer
      ),
      oldPid = first.child.pid
    assert.equal(before.activeVersionId, applied.activeVersionId)
    assert.equal(before.branding.title, '已应用版本')
    assert.deepEqual(before.preferences, preferences)
    assert.deepEqual(
      await http(first.address, '/tenant-branding/logo', viewer, true),
      asset.bytes
    )
    const exited = once(first.child, 'exit')
    first.child.kill('SIGKILL')
    const [code, signal] = await exited
    assert.equal(code, null)
    assert.equal(signal, 'SIGKILL')
    second = await startBrandChild()
    assert.notEqual(second.child.pid, oldPid)
    assert.deepEqual(
      await http(second.address, '/tenant-branding/runtime', viewer),
      before
    )
    assert.deepEqual(
      await http(second.address, '/tenant-branding/configuration', manager),
      saved
    )
    assert.deepEqual(
      await http(second.address, '/tenant-branding/logo', viewer, true),
      asset.bytes
    )
  } finally {
    await stopChild(first.child)
    if (second) await stopChild(second.child)
  }
})

test('actual decoder honors pixel/byte limits and fully rejects data-invalid PNG even when its header and CRC are valid', async () => {
  const png = await imageBytes(),
    jpeg = await imageBytes('jpeg'),
    max = await imageBytes('png', 1024, 1024)
  assert.deepEqual(await brand.validateTenantBrandLogoBytes(max, 'image/png'), {
    width: 1024,
    height: 1024,
  })
  const progressive = await sharp({
    create: { width: 32, height: 16, channels: 3, background: '#165DFF' },
  })
    .jpeg({ progressive: true })
    .toBuffer()
  assert.deepEqual(
    await brand.validateTenantBrandLogoBytes(progressive, 'image/jpeg'),
    { width: 32, height: 16 }
  )
  for (const [bytes, mime] of [
    [Buffer.alloc(2097153), 'image/png'],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'],
    [png, 'image/svg+xml'],
    [jpeg, 'image/png'],
    [animatedPng(png), 'image/png'],
    [invalidPixels(png), 'image/png'],
  ])
    await assert.rejects(
      brand.validateTenantBrandLogoBytes(bytes, mime),
      (error) => error.businessCode === 'TENANT_BRAND_LOGO_INVALID'
    )
})
