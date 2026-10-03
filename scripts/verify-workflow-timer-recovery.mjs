import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, open, writeFile, readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import api from '../services/reference-api/dist/index.js'
import worker from '../services/reference-api/dist/workflow-timer-worker.js'
import migration from '../services/reference-api/dist/migrate.js'

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
  process.env.TIMERS_RECOVERY_POSTGRES_CONTAINER || 'af-admin-r1-postgres'
const root =
  process.env.TIMERS_RECOVERY_OUTPUT ||
  'test-results/full-product/scheduling-20261003/database-copy'
await mkdir(root, { recursive: true })
const source = new Pool({ connectionString: sourceUrl.toString() })
const targetName = `af_timer_recovery_${randomUUID().replaceAll('-', '')}_demo`
const targetUrl = new URL(sourceUrl)
targetUrl.pathname = `/${targetName}`
let created = false,
  restored,
  server
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
      'x-tenant-id': 'tenant-a',
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
  'application_releases',
  'workflow_instances',
  'workflow_tasks',
  'workflow_timers',
  'workflow_timer_events',
  'workflow_assignment_events',
]
try {
  const suffix = randomUUID().slice(0, 8)
  const app = await call(
    origin,
    'a-admin',
    '/application-center',
    {
      name: '定时独立数据库恢复',
      code: `timer-copy-${suffix}`,
      template: 'equipment',
    },
    'POST'
  )
  const form = await call(
      origin,
      'a-admin',
      `/form-schemas/${app.formDraftId}`
    ),
    workflow = await call(
      origin,
      'a-admin',
      `/workflows/${app.workflowDraftId}`
    )
  const node = (id, type, config = {}) => ({ id, type, name: id, config }),
    edge = (source, target) => ({
      id: `${source}-${target}`,
      source,
      target,
      label: '',
    })
  const schema = {
    version: 4,
    nodes: [
      node('start', 'start'),
      node('wait', 'wait', { delaySeconds: 15 }),
      node('approve', 'approval', { approvers: ['a-manager-1'] }),
      node('end', 'end'),
    ],
    edges: [
      edge('start', 'wait'),
      edge('wait', 'approve'),
      edge('approve', 'end'),
    ],
  }
  const saved = await call(
    origin,
    'a-admin',
    `/workflows/${workflow.id}`,
    { schema, expectedRevision: workflow.revision },
    'PUT'
  )
  const release = await call(
    origin,
    'a-admin',
    `/applications/${app.id}/releases`,
    {
      formDraftId: form.id,
      workflowDraftId: workflow.id,
      formRevision: form.revision,
      workflowRevision: saved.revision,
      expectedRevision: app.revision,
    },
    'POST'
  )
  const record = await call(
    origin,
    'a-employee',
    '/business/records',
    {
      applicationReleaseId: release.id,
      fields: { itemName: '恢复副本设备', quantity: 1, reason: '原库保持在途' },
    },
    'POST'
  )
  await call(
    origin,
    'a-employee',
    `/business/records/${record.id}/submit`,
    { expectedRevision: record.revision },
    'POST'
  )
  const before = await call(
    origin,
    'a-employee',
    `/business/records/${record.id}`
  )
  assert.equal(before.timers[0].status, 'pending')
  await call(origin, 'a-manager-1', '/workflow-todos?pageSize=100')
  const counts = Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [table, await rowCount(source, table)])
    )
  )
  const dumpPath = path.join(root, 'snapshot.dump'),
    dump = await open(dumpPath, 'w', 0o600),
    log = await open(path.join(root, 'restore.log'), 'w', 0o600)
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
  await migration.verifyMigrationReadiness(restored)
  const copiedCounts = Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [table, await rowCount(restored, table)])
    )
  )
  assert.deepEqual(copiedCounts, counts)
  server = api.createServer(restored)
  const restoredOrigin = await server.listen({ host: '127.0.0.1', port: 0 })
  const copied = await call(
    restoredOrigin,
    'a-employee',
    `/business/records/${record.id}`
  )
  assert.deepEqual(
    copied.release.workflowSnapshot,
    before.release.workflowSnapshot
  )
  assert.equal(copied.timers[0].dueAt, before.timers[0].dueAt)
  const remaining = new Date(copied.timers[0].dueAt).getTime() - Date.now()
  if (remaining > 0)
    await new Promise((resolve) => setTimeout(resolve, remaining + 50))
  await Promise.all([
    worker.processWorkflowTimers(restored),
    worker.processWorkflowTimers(restored),
  ])
  const task = (
    await call(restoredOrigin, 'a-manager-1', '/workflow-todos?pageSize=100')
  ).list.find((task) => task.requestId === record.id)
  assert.ok(task)
  await call(
    restoredOrigin,
    'a-manager-1',
    `/workflow-tasks/${task.id}/approve`,
    { expectedRevision: task.revision },
    'POST'
  )
  const finished = await call(
    restoredOrigin,
    'a-employee',
    `/business/records/${record.id}`
  )
  assert.equal(finished.status, 'approved')
  assert.equal(
    finished.history.filter((item) => item.action === 'timer-resume').length,
    1
  )
  const untouched = await call(
    origin,
    'a-employee',
    `/business/records/${record.id}`
  )
  assert.equal(untouched.status, 'running')
  assert.equal(untouched.timers[0].status, 'pending')
  assert.equal(
    (
      await source.query('SELECT id FROM workflow_tasks WHERE instance_id=$1', [
        untouched.instanceId,
      ])
    ).rowCount,
    0
  )
  const report = {
    plannedAt: before.timers[0].dueAt,
    tableCounts: counts,
    restoredTableCounts: copiedCounts,
    restoredStatus: finished.status,
    originalStatus: untouched.status,
    originalTimerStatus: untouched.timers[0].status,
    immutableReleaseHash: release.contentHash,
    migrationCount: copiedCounts.schema_migrations,
    preservedSession: true,
    timerEffectCount: 1,
    caveat:
      'independent database copy in the existing local PostgreSQL service; not a customer deployment or whole-product recovery acceptance',
  }
  await writeFile(
    path.join(root, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  process.stdout.write(
    'Independent database restore resumed one fixed timer and approval; original database stayed pending\n'
  )
} finally {
  if (server) await server.close()
  if (restored) await restored.end()
  if (created) await source.query(`DROP DATABASE ${targetName}`)
  await source.end()
}
