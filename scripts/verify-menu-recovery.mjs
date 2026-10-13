import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import { createServer } from '@af-admin/reference-api/dist/index.js'
import { verifyMigrationReadiness } from '@af-admin/reference-api/dist/migrate.js'

const sourceUrl = new URL(process.env.DATABASE_URL || '')
const sourceName = decodeURIComponent(sourceUrl.pathname.slice(1))
const origin = process.env.R1_API_URL || 'http://127.0.0.1:10890'
if (
  process.env.APP_MODE !== 'demo' ||
  !sourceName.endsWith('_demo') ||
  sourceUrl.hostname !== '127.0.0.1' ||
  !origin.startsWith('http://127.0.0.1:')
)
  throw new Error(
    'Recovery verification requires an explicitly isolated local demo'
  )
const container =
  process.env.MENU_RECOVERY_POSTGRES_CONTAINER || 'af-admin-r1-postgres'
const root =
  process.env.MENU_RECOVERY_OUTPUT ||
  'test-results/full-product/menus-20261013/database-copy'
await mkdir(root, { recursive: true })
const source = new Pool({ connectionString: sourceUrl.toString() })
const targetName = `af_menu_recovery_${randomUUID().replaceAll('-', '')}_demo`
const targetUrl = new URL(sourceUrl)
targetUrl.pathname = `/${targetName}`
let created = false
let restored
let server
const tokens = new Map()
const call = async (base, user, endpoint, data, method = 'GET') => {
  if (!tokens.has(user)) {
    const response = await fetch(`${origin}/api/user/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: user, password: user }),
    })
    assert.equal(response.status, 200)
    tokens.set(user, (await response.json()).data.token)
  }
  const response = await fetch(`${base}/api${endpoint}`, {
    method,
    headers: {
      'x-access-token': tokens.get(user),
      'x-tenant-id': user.startsWith('b-') ? 'tenant-b' : 'tenant-a',
      'idempotency-key': randomUUID(),
      ...(data ? { 'content-type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  const body = await response.json()
  assert.equal(response.status, 200, body.message)
  return body.data
}
const rowCount = async (pool, table) =>
  (await pool.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0]
    .count
const tables = [
  'schema_migrations',
  'menu_resources',
  'menu_route_catalogue',
  'application_package_page_sets',
  'application_package_page_bindings',
  'application_releases',
  'workflow_instances',
  'workflow_tasks',
  'workflow_timers',
  'workflow_timer_events',
  'workflow_assignment_events',
  'low_code_pages',
  'low_code_releases',
  'low_code_sources',
  'low_code_release_sources',
]
try {
  const suffix = randomUUID().slice(0, 8)
  const parent = await call(
    origin,
    'a-admin',
    '/system/menus',
    {
      menuName: `独立恢复目录-${suffix}`,
      menuType: 'catalog',
      parentId: null,
      permission: '',
      sort: 0,
      status: 'enabled',
    },
    'POST'
  )
  const menu = await call(
    origin,
    'a-admin',
    '/system/menus',
    {
      menuName: `独立恢复字典-${suffix}`,
      menuType: 'menu',
      routeKey: 'dictSystem',
      parentId: parent.id,
      permission: '',
      sort: 0,
      status: 'enabled',
    },
    'POST'
  )
  const before = await call(origin, 'a-admin', `/system/menus/${menu.id}`)
  const counts = Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [table, await rowCount(source, table)])
    )
  )
  const dumpPath = path.join(root, 'snapshot.dump')
  const dump = await open(dumpPath, 'w', 0o600)
  const log = await open(path.join(root, 'restore.log'), 'w', 0o600)
  try {
    const child = spawn(
      'docker',
      [
        'exec',
        container,
        'pg_dump',
        '-Fc',
        '--no-owner',
        '--no-acl',
        '-U',
        decodeURIComponent(sourceUrl.username),
        '-d',
        sourceName,
      ],
      { stdio: ['ignore', dump.fd, log.fd] }
    )
    assert.equal(
      (await once(child, 'exit'))[0],
      0,
      'actual pg_dump must succeed'
    )
  } finally {
    await dump.close()
    await log.close()
  }
  await source.query(`CREATE DATABASE ${targetName}`)
  created = true
  const restoreLog = await open(path.join(root, 'restore.log'), 'a', 0o600)
  try {
    const restore = spawn(
      'docker',
      [
        'exec',
        '-i',
        container,
        'pg_restore',
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '-U',
        decodeURIComponent(sourceUrl.username),
        '-d',
        targetName,
      ],
      { stdio: ['pipe', 'ignore', restoreLog.fd] }
    )
    createReadStream(dumpPath).pipe(restore.stdin)
    assert.equal(
      (await once(restore, 'exit'))[0],
      0,
      'actual independent pg_restore must succeed'
    )
  } finally {
    await restoreLog.close()
  }
  restored = new Pool({ connectionString: targetUrl.toString() })
  await verifyMigrationReadiness(restored)
  const copiedCounts = Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [table, await rowCount(restored, table)])
    )
  )
  assert.deepEqual(copiedCounts, counts)
  server = createServer(restored)
  const restoredOrigin = await server.listen({ host: '127.0.0.1', port: 0 })
  const copied = await call(
    restoredOrigin,
    'a-admin',
    `/system/menus/${menu.id}`
  )
  assert.deepEqual(copied, before)
  const renamed = await call(
    restoredOrigin,
    'a-admin',
    `/system/menus/${menu.id}`,
    {
      menuName: '恢复库独立维护后的标题',
      menuType: copied.menuType,
      routeKey: copied.routeKey,
      parentId: copied.parentId,
      permission: copied.permission,
      sort: copied.sort,
      status: 'enabled',
      expectedRevision: copied.revision,
    },
    'PUT'
  )
  const state = await call(restoredOrigin, 'a-admin', '/navigation/state')
  assert.equal(
    state.menus.find((node) => node.name === `menu-entry-${parent.id}`)
      .children[0].meta.text,
    renamed.menuName
  )
  assert.equal(
    (await call(origin, 'a-admin', `/system/menus/${menu.id}`)).menuName,
    before.menuName
  )
  const report = {
    tableCounts: counts,
    restoredTableCounts: copiedCounts,
    migrationCount: copiedCounts.schema_migrations,
    preservedSession: true,
    restoredName: renamed.menuName,
    originalName: before.menuName,
    registeredComponent: renamed.componentKey,
    registeredRoute: renamed.path,
    caveat:
      'independent database in existing local PostgreSQL; not a fresh-machine deployment or whole-product file-byte restore',
  }
  await writeFile(
    path.join(root, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  process.stdout.write(
    'Independent database restore preserved registered menu hierarchy and session, then changed only the restored navigation title\n'
  )
} finally {
  if (server) await server.close()
  if (restored) await restored.end()
  if (created) await source.query(`DROP DATABASE ${targetName}`)
  await source.end()
}
