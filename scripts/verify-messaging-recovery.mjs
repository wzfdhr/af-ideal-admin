import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import { WebSocket } from 'ws'
import { processMessaging } from '@af-admin/reference-api/dist/messaging-worker.js'
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
  process.env.MESSAGING_RECOVERY_POSTGRES_CONTAINER || 'af-admin-r1-postgres'
const root =
  process.env.MESSAGING_RECOVERY_OUTPUT ||
  'test-results/full-product/messaging-20261013/database-copy'
await mkdir(root, { recursive: true })
const source = new Pool({ connectionString: sourceUrl.toString() })
const targetName = `af_message_recovery_${randomUUID().replaceAll(
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
  'message_templates',
  'message_template_reviews',
  'message_template_versions',
  'message_announcements',
  'message_announcement_versions',
  'message_subscriptions',
  'message_send_jobs',
  'message_recipients',
  'message_delivery_events',
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
  const template = await call(
    origin,
    'a-admin',
    '/messaging/templates',
    {
      schema: {
        name: '独立恢复待审批模板',
        channel: 'message',
        title: '恢复验证 {{subject}}',
        content: '原库待审批，恢复库实际投递 {{subject}}',
        variables: [{ key: 'subject', label: '主题', required: true }],
        reviewerId: 'a-manager-1',
        deliveryModes: ['in-app', 'websocket'],
      },
    },
    'POST'
  )
  await call(
    origin,
    'a-admin',
    `/messaging/templates/${template.id}/submit`,
    { expectedRevision: template.revision },
    'POST'
  )
  await call(origin, 'a-manager-1', '/messaging/reviews?pageSize=100')
  await call(origin, 'a-employee', '/messaging/subscriptions')
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
    `/messaging/templates/${template.id}`
  )
  assert.equal(copied.draftState, 'pending')
  const review = (
    await call(restoredOrigin, 'a-manager-1', '/messaging/reviews?pageSize=100')
  ).list.find(
    (item) => item.templateId === template.id && item.status === 'pending'
  )
  assert.ok(review)
  await call(
    restoredOrigin,
    'a-manager-1',
    `/messaging/reviews/${review.id}/decision`,
    {
      expectedRevision: review.revision,
      decision: 'approve',
      reason: '独立数据库恢复后真实审批',
    },
    'POST'
  )
  const approved = await call(
    restoredOrigin,
    'a-admin',
    `/messaging/templates/${template.id}`
  )
  const subscription = (
    await call(restoredOrigin, 'a-employee', '/messaging/subscriptions')
  ).find((item) => item.channel === 'message')
  await call(
    restoredOrigin,
    'a-employee',
    '/messaging/subscriptions/message',
    {
      expectedRevision: subscription.revision,
      subscribed: true,
      deliveryModes: ['in-app', 'websocket'],
    },
    'PUT'
  )
  const job = await call(
    restoredOrigin,
    'a-admin',
    '/messaging/send-jobs',
    {
      templateVersionId: approved.activeVersionId,
      variables: { subject: '真实消息' },
      audience: { scope: 'users', userIds: ['a-employee'] },
      deliveryModes: ['in-app', 'websocket'],
      scheduledAt: null,
    },
    'POST'
  )
  await processMessaging(restored)
  const delivered = await call(
    restoredOrigin,
    'a-admin',
    `/messaging/send-jobs/${job.id}`
  )
  assert.equal(delivered.status, 'sent')
  assert.equal(delivered.counts.sent, 1)
  const inbox = await call(
    restoredOrigin,
    'a-employee',
    `/messages/notifications?pageSize=100&keyword=${encodeURIComponent(
      '恢复验证'
    )}`
  )
  assert.ok(
    inbox.list.some(
      (item) =>
        item.id === delivered.recipients[0].notificationId &&
        item.title === '恢复验证 真实消息'
    )
  )
  const socket = new WebSocket(
    `${restoredOrigin.replace('http:', 'ws:')}/api/messaging/realtime`
  )
  try {
    await once(socket, 'open', { signal: AbortSignal.timeout(5000) })
    const receipt = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error('Restored realtime timeout')),
        10000
      )
      socket.on('message', (raw) => {
        const event = JSON.parse(raw.toString())
        if (
          event.type === 'message.receipt' &&
          event.receiptId === delivered.recipients[0].id
        ) {
          clearTimeout(timer)
          resolve(event)
        }
      })
    })
    socket.send(
      JSON.stringify({
        type: 'auth',
        token: tokens.get('a-employee'),
        tenantId: 'tenant-a',
      })
    )
    const event = await receipt
    socket.send(JSON.stringify({ type: 'ack', receiptId: event.receiptId }))
    await new Promise((resolve, reject) => {
      let timeout
      const poll = setInterval(async () => {
        try {
          const row = (
            await restored.query(
              'SELECT realtime_ack_at FROM message_recipients WHERE id=$1',
              [event.receiptId]
            )
          ).rows[0]
          if (row.realtime_ack_at) {
            clearInterval(poll)
            clearTimeout(timeout)
            resolve()
          }
        } catch (error) {
          clearInterval(poll)
          clearTimeout(timeout)
          reject(error)
        }
      }, 50)
      timeout = setTimeout(() => {
        clearInterval(poll)
        reject(Error('Restored ACK timeout'))
      }, 5000)
    })
  } finally {
    socket.close()
    await once(socket, 'close', { signal: AbortSignal.timeout(3000) })
  }
  const untouched = await call(
    origin,
    'a-admin',
    `/messaging/templates/${template.id}`
  )
  assert.equal(untouched.draftState, 'pending')
  assert.equal(untouched.activeVersionId, null)
  assert.equal(
    (
      await source.query('SELECT id FROM message_send_jobs WHERE id=$1', [
        job.id,
      ])
    ).rowCount,
    0
  )
  const report = {
    tableCounts: counts,
    restoredTableCounts: copiedCounts,
    migrationCount: copiedCounts.schema_migrations,
    preservedSession: true,
    restoredTemplateState: approved.draftState,
    originalTemplateState: untouched.draftState,
    restoredJobStatus: delivered.status,
    persistedNotificationCount: delivered.counts.sent,
    realtimeAck: true,
    caveat:
      'independent database inside existing local PostgreSQL; not fresh-machine deployment or whole-product file-byte restore',
  }
  await writeFile(
    path.join(root, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  process.stdout.write(
    'Independent database restore approved the pending template, persisted one real message and received real websocket ACK; original template stayed pending\n'
  )
} finally {
  if (server) await server.close()
  if (restored) await restored.end()
  if (created) await source.query(`DROP DATABASE ${targetName}`)
  await source.end()
}
