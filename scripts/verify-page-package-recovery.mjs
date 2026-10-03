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
  process.env.PACKAGE_RECOVERY_POSTGRES_CONTAINER || 'af-admin-r1-postgres'
const root =
  process.env.PACKAGE_RECOVERY_OUTPUT ||
  'test-results/full-product/page-package-20261003/database-copy'
await mkdir(root, { recursive: true })
const source = new Pool({ connectionString: sourceUrl.toString() })
const targetName = `af_page_package_recovery_${randomUUID().replaceAll(
  '-',
  ''
)}_demo`
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
  const publish = async (base, user, app) => {
    const form = await call(base, user, `/form-schemas/${app.formDraftId}`)
    const workflow = await call(base, user, `/workflows/${app.workflowDraftId}`)
    return call(
      base,
      user,
      `/applications/${app.id}/releases`,
      {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: workflow.revision,
        expectedRevision: app.revision,
      },
      'POST'
    )
  }
  const app = await call(
    origin,
    'a-admin',
    '/application-center',
    {
      name: '页面包独立恢复源',
      code: `pp-copy-${randomUUID().slice(0, 8)}`,
      template: 'equipment',
    },
    'POST'
  )
  const release = await publish(origin, 'a-admin', app)
  const page = await call(
    origin,
    'a-admin',
    '/low-code/pages/from-application',
    { name: '恢复后独立页面', applicationReleaseId: release.id },
    'POST'
  )
  const pageRelease = await call(
    origin,
    'a-admin',
    `/low-code/pages/${page.id}/publish`,
    { expectedRevision: page.revision },
    'POST'
  )
  const current = await call(origin, 'a-admin', `/application-center/${app.id}`)
  const pkg = await call(
    origin,
    'a-admin',
    `/application-center/${app.id}/package`,
    { expectedRevision: current.revision, pageIds: [page.id] },
    'POST'
  )
  const imported = await call(
    origin,
    'b-admin',
    '/application-packages/import',
    {
      package: pkg,
      name: '恢复待重绑页面',
      code: `pp-copy-target-${randomUUID().slice(0, 8)}`,
      bindings: Object.fromEntries(
        pkg.people.map((slot, index) => [
          slot.key,
          index === 0 ? 'b-manager-1' : 'b-manager-2',
        ])
      ),
      sourceBindings: {},
    },
    'POST'
  )
  assert.equal(imported.pendingPages.status, 'pending')
  // Persist these authorized sessions before the snapshot; the copied API must accept them.
  await ['b-employee', 'b-manager-1', 'b-manager-2'].reduce(
    async (previous, user) => {
      await previous
      await call(origin, user, '/user/info')
    },
    Promise.resolve()
  )
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
  const pending = await call(
    restoredOrigin,
    'b-admin',
    `/application-center/${imported.application.id}/package-pages`
  )
  assert.equal(pending[0].status, 'pending')
  const targetRelease = await publish(
    restoredOrigin,
    'b-admin',
    imported.application
  )
  const bound = await call(
    restoredOrigin,
    'b-admin',
    `/application-package-pages/${imported.pendingPages.id}/bind`,
    { expectedRevision: 1, applicationReleaseId: targetRelease.id },
    'POST'
  )
  const targetPageId = bound.pages[0].id
  const targetPage = await call(
    restoredOrigin,
    'b-admin',
    `/low-code/pages/${targetPageId}`
  )
  const published = await call(
    restoredOrigin,
    'b-admin',
    `/low-code/pages/${targetPageId}/publish`,
    { expectedRevision: targetPage.revision },
    'POST'
  )
  const receipt = await call(
    restoredOrigin,
    'b-employee',
    `/low-code/runtime/${targetPageId}/actions/create`,
    {
      releaseId: published.id,
      fields: {
        itemName: '恢复页面包真实记录',
        quantity: 3,
        unitPrice: '0.10',
        reason: '在恢复库实际创建',
      },
    },
    'POST'
  )
  const { record } = receipt
  await call(
    restoredOrigin,
    'b-employee',
    `/low-code/runtime/${targetPageId}/actions/start`,
    {
      releaseId: published.id,
      recordId: record.id,
      expectedRevision: record.revision,
    },
    'POST'
  )
  await ['b-manager-1', 'b-manager-2'].reduce(async (previous, manager) => {
    await previous
    const task = (
      await call(restoredOrigin, manager, '/workflow-todos?pageSize=100')
    ).list.find((item) => item.requestId === record.id)
    assert.ok(task)
    await call(
      restoredOrigin,
      manager,
      `/workflow-tasks/${task.id}/approve`,
      { expectedRevision: task.revision },
      'POST'
    )
  }, Promise.resolve())
  const finished = await call(
    restoredOrigin,
    'b-employee',
    `/business/records/${record.id}`
  )
  assert.equal(finished.status, 'approved')
  assert.equal(finished.computedFields.totalAmount, '0.30')
  const untouched = await call(
    origin,
    'b-admin',
    `/application-center/${imported.application.id}/package-pages`
  )
  assert.equal(untouched[0].status, 'pending')
  assert.deepEqual(untouched[0].referenceMap, {})
  assert.equal(
    (
      await call(
        origin,
        'b-admin',
        `/application-center/${imported.application.id}`
      )
    ).activeReleaseId,
    null
  )
  assert.equal(
    (
      await source.query(
        'SELECT id FROM low_code_pages WHERE tenant_id=$1 AND id=$2',
        ['tenant-b', targetPageId]
      )
    ).rowCount,
    0
  )
  const report = {
    tableCounts: counts,
    restoredTableCounts: copiedCounts,
    migrationCount: copiedCounts.schema_migrations,
    restoredStatus: finished.status,
    originalPendingStatus: untouched[0].status,
    preservedSession: true,
    originalBusinessReleaseHash: release.contentHash,
    originalPageHash: pageRelease.contentHash,
    restoredTargetBusinessReleaseHash: targetRelease.contentHash,
    restoredTargetPageHash: published.contentHash,
    restoredTotal: finished.computedFields.totalAmount,
    caveat:
      'independent database copy in existing local PostgreSQL; not a clean deployment or whole-product recovery acceptance',
  }
  await writeFile(
    path.join(root, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  process.stdout.write(
    'Independent database restore continued pending page import, bound and published independent pages, then approved a real record; original import stayed pending\n'
  )
} finally {
  if (server) await server.close()
  if (restored) await restored.end()
  if (created) await source.query(`DROP DATABASE ${targetName}`)
  await source.end()
}
