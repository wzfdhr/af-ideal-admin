import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { before, after, test } from 'node:test'
import { WebSocket } from 'ws'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import worker from '../../services/reference-api/dist/messaging-worker.js'
import notifications from '../../services/reference-api/dist/notification.js'
import contracts from '@af-admin/contracts'

const pool = db.createPool(),
  tokens = new Map(),
  passwords = new Map(),
  ownedMembers = [],
  ownedRoles = []
let server,
  base,
  originals,
  failPoint = ''
before(async () => {
  assert.equal(
    process.env.APP_MODE,
    'demo',
    'Messaging tests require an isolated demo database'
  )
  const database = (await pool.query('SELECT current_database() AS name'))
    .rows[0].name
  assert.match(
    database,
    /^af_admin_tests_[a-z0-9]+_demo$/,
    'Use scripts/run-r1-integration.mjs, never the running database'
  )
  await migrations.migrate(pool)
  await seeds.seedDemo(pool)
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions,status FROM memberships WHERE user_id IN('a-admin','b-admin','a-manager-1','a-manager-2','a-employee')"
    )
  ).rows
  const codes = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((row) => row.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin','a-manager-1','a-manager-2','a-employee')",
    [JSON.stringify(codes)]
  )
  server = api.createServer(pool, (point) => {
    if (point === failPoint) {
      failPoint = ''
      throw new Error('Controlled messaging rollback')
    }
  })
  base = await server.listen({ host: '127.0.0.1', port: 0 })
})
after(async () => {
  if (server) await server.close()
  await pool.query(
    "UPDATE memberships SET status='disabled',deleted_at=now() WHERE user_id=ANY($1::text[])",
    [ownedMembers]
  )
  await pool.query(
    "UPDATE roles SET status='disabled',deleted_at=now() WHERE id=ANY($1::text[])",
    [ownedRoles]
  )
  for (const original of originals || [])
    await pool.query(
      'UPDATE memberships SET permissions=$3,status=$4 WHERE tenant_id=$1 AND user_id=$2',
      [
        original.tenant_id,
        original.user_id,
        JSON.stringify(original.permissions),
        original.status,
      ]
    )
  await pool.end()
})
const login = async (user) => {
  if (tokens.has(user)) return tokens.get(user)
  const response = await fetch(`${base}/api/user/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: user,
      password: passwords.get(user) || user,
    }),
  })
  assert.equal(response.status, 200)
  const token = (await response.json()).data.token
  tokens.set(user, token)
  return token
}
const call = async (
  path,
  {
    user = 'a-admin',
    tenant = user.startsWith('b-') ? 'tenant-b' : 'tenant-a',
    method = 'GET',
    body,
    key = randomUUID(),
  } = {}
) => {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      'x-access-token': await login(user),
      'x-tenant-id': tenant,
      'idempotency-key': key,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, ...(await response.json()) }
}
const ok = (response) => {
  assert.equal(
    response.status,
    200,
    `${response.businessCode}: ${response.message}`
  )
  return response.data
}
const templateSchema = (extra = {}) => ({
  name: `合成消息-${randomUUID()}`,
  channel: 'message',
  title: '提醒 {{name}}',
  content: '已确认 {{name}} 的消息',
  variables: [{ key: 'name', label: '显示文字', required: true }],
  reviewerId: 'a-manager-1',
  deliveryModes: ['in-app', 'websocket'],
  ...extra,
})
const draft = async (schema = templateSchema()) =>
  ok(await call('/messaging/templates', { method: 'POST', body: { schema } }))
const submit = async (template) =>
  ok(
    await call(`/messaging/templates/${template.id}/submit`, {
      method: 'POST',
      body: { expectedRevision: template.revision },
    })
  )
const approve = async (template) => {
  const submitted = await submit(template),
    review = submitted.reviews.find((value) => value.status === 'pending')
  ok(
    await call(`/messaging/reviews/${review.id}/decision`, {
      user: 'a-manager-1',
      method: 'POST',
      body: {
        expectedRevision: review.revision,
        decision: 'approve',
        reason: '',
      },
    })
  )
  return ok(await call(`/messaging/templates/${template.id}`))
}
const approved = async (schema) => approve(await draft(schema))
const send = async (template, extra = {}, options = {}) =>
  ok(
    await call('/messaging/send-jobs', {
      ...options,
      method: 'POST',
      body: {
        templateVersionId: template.activeVersionId,
        variables: { name: '合成内容' },
        audience: { scope: 'users', userIds: ['a-employee'] },
        deliveryModes: ['in-app', 'websocket'],
        scheduledAt: null,
        ...extra,
      },
    })
  )
const job = async (id) => ok(await call(`/messaging/send-jobs/${id}`))
const effects = async (id) =>
  Number(
    (
      await pool.query(
        'SELECT count(*) AS count FROM notifications n JOIN message_recipients r ON r.tenant_id=n.tenant_id AND r.notification_id=n.id WHERE r.job_id=$1',
        [id]
      )
    ).rows[0].count
  )
const due = async (id) =>
  pool.query(
    "UPDATE message_recipients SET next_attempt_at=now()-interval '1 second',lease_until=CASE WHEN status='processing' THEN now()-interval '1 second' ELSE lease_until END WHERE job_id=$1",
    [id]
  )
const createScopedSender = async (
  permissions = Object.values(contracts.MESSAGING_PERMISSIONS).filter((code) =>
    code.startsWith('message:send:')
  )
) => {
  const username = `message-user-${randomUUID().slice(0, 8)}`,
    password = 'Messaging-test-private-2026'
  const member = ok(
    await call('/system/users', {
      method: 'POST',
      body: {
        username,
        name: '合成消息发送者',
        phone: '',
        email: '',
        initialPassword: password,
        status: 'enabled',
      },
    })
  )
  passwords.set(username, password)
  ownedMembers.push(member.id)
  const role = ok(
    await call('/system/roles', {
      method: 'POST',
      body: {
        roleName: '消息范围测试',
        roleKey: `message-${randomUUID().slice(0, 8)}`,
        roleSort: 0,
        status: 'enabled',
        remark: '',
        permissions,
      },
    })
  )
  ownedRoles.push(role.id)
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='all' WHERE tenant_id='tenant-a' AND role_id=$1",
    [role.id]
  )
  ok(
    await call(`/system/users/${member.id}/authorization`, {
      method: 'POST',
      body: {
        roleIds: [role.id],
        directPermissions: [],
        expectedRevision: member.revision,
      },
    })
  )
  return { ...member, username, roleId: role.id }
}

test('named non-author review creates immutable snapshots; rejected/new drafts do not replace the usable approved version', async () => {
  const template = await draft(),
    submitted = await submit(template),
    review = submitted.reviews[0]
  assert.equal(
    (
      await call(`/messaging/reviews/${review.id}/decision`, {
        user: 'a-admin',
        method: 'POST',
        body: {
          expectedRevision: review.revision,
          decision: 'approve',
          reason: '',
        },
      })
    ).status,
    404
  )
  assert.equal(
    (
      await call(`/messaging/reviews/${review.id}/decision`, {
        user: 'a-manager-2',
        method: 'POST',
        body: {
          expectedRevision: review.revision,
          decision: 'approve',
          reason: '',
        },
      })
    ).status,
    404
  )
  assert.equal(
    (
      await call(`/messaging/templates/${template.id}`, {
        method: 'PUT',
        body: {
          expectedRevision: submitted.revision,
          schema: templateSchema(),
        },
      })
    ).status,
    409
  )
  ok(
    await call(`/messaging/reviews/${review.id}/decision`, {
      user: 'a-manager-1',
      method: 'POST',
      body: {
        expectedRevision: review.revision,
        decision: 'approve',
        reason: '',
      },
    })
  )
  const published = ok(await call(`/messaging/templates/${template.id}`)),
    first = published.versions[0]
  await assert.rejects(
    pool.query(
      "UPDATE message_template_versions SET schema_snapshot='{}'::jsonb WHERE id=$1",
      [first.id]
    ),
    (error) => error.code === '23514'
  )
  const edited = ok(
    await call(`/messaging/templates/${template.id}`, {
      method: 'PUT',
      body: {
        expectedRevision: published.revision,
        schema: templateSchema({ content: '新草稿 {{name}}' }),
      },
    })
  )
  assert.equal(edited.activeVersionId, first.id)
  const pending = await submit(edited),
    pendingReview = pending.reviews.find((value) => value.status === 'pending')
  const oldJob = await send(pending)
  assert.equal(oldJob.content, '已确认 合成内容 的消息')
  ok(
    await call(`/messaging/reviews/${pendingReview.id}/decision`, {
      user: 'a-manager-1',
      method: 'POST',
      body: {
        expectedRevision: pendingReview.revision,
        decision: 'reject',
        reason: '请修订内容',
      },
    })
  )
  const rejected = ok(await call(`/messaging/templates/${template.id}`))
  assert.equal(rejected.draftState, 'draft')
  assert.equal(rejected.activeVersionId, first.id)
  assert.equal(rejected.versions.length, 1)
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(await effects(oldJob.id), 1)
  const otherTenant = await call(`/messaging/templates/${template.id}`, {
    user: 'b-admin',
  })
  assert.equal(otherTenant.status, 404)
})

test('strict preview and sending reject missing variables, arbitrary expressions, email and unapproved modes', async () => {
  const template = await approved(templateSchema({ deliveryModes: ['in-app'] }))
  const preview = ok(
    await call(`/messaging/templates/${template.id}/preview`, {
      method: 'POST',
      body: {
        versionId: template.activeVersionId,
        variables: {},
        audience: { scope: 'self' },
      },
    })
  )
  assert.deepEqual(preview.missingVariables, ['name'])
  assert.equal(preview.recipientCount, 1)
  const missing = await call('/messaging/send-jobs', {
    method: 'POST',
    body: {
      templateVersionId: template.activeVersionId,
      variables: {},
      audience: { scope: 'self' },
      deliveryModes: ['in-app'],
      scheduledAt: null,
    },
  })
  assert.equal(missing.businessCode, 'MESSAGING_VARIABLES_MISSING')
  const email = await call('/messaging/send-jobs', {
    method: 'POST',
    body: {
      templateVersionId: template.activeVersionId,
      variables: { name: '示例' },
      audience: { scope: 'self' },
      deliveryModes: ['email'],
      scheduledAt: null,
    },
  })
  assert.equal(email.businessCode, 'MESSAGING_EMAIL_UNAVAILABLE')
  const mode = await call('/messaging/send-jobs', {
    method: 'POST',
    body: {
      templateVersionId: template.activeVersionId,
      variables: { name: '示例' },
      audience: { scope: 'self' },
      deliveryModes: ['in-app', 'websocket'],
      scheduledAt: null,
    },
  })
  assert.equal(mode.businessCode, 'MESSAGING_MODE_NOT_APPROVED')
  assert.equal(
    (
      await call('/messaging/templates', {
        method: 'POST',
        body: { schema: templateSchema({ title: '{{process.exit()}}' }) },
      })
    ).status,
    422
  )
  assert.equal(
    (
      await call('/messaging/templates', {
        method: 'POST',
        body: { schema: templateSchema({ reviewerId: 'a-admin' }) },
      })
    ).businessCode,
    'MESSAGING_SELF_REVIEW'
  )
})

test('creation is atomic and idempotent, payload conflicts fail, and cancelled schedules cannot deliver', async () => {
  const template = await approved(),
    before = Number(
      (await pool.query('SELECT count(*) AS n FROM message_send_jobs')).rows[0]
        .n
    )
  const body = {
      templateVersionId: template.activeVersionId,
      variables: { name: '原子测试' },
      audience: { scope: 'users', userIds: ['a-employee'] },
      deliveryModes: ['in-app'],
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    },
    key = randomUUID()
  failPoint = 'messaging:job-created'
  assert.equal(
    (await call('/messaging/send-jobs', { method: 'POST', body, key })).status,
    500
  )
  assert.equal(
    Number(
      (await pool.query('SELECT count(*) AS n FROM message_send_jobs')).rows[0]
        .n
    ),
    before
  )
  const first = ok(
      await call('/messaging/send-jobs', { method: 'POST', body, key })
    ),
    replay = ok(
      await call('/messaging/send-jobs', { method: 'POST', body, key })
    )
  assert.equal(first.id, replay.id)
  assert.equal(
    (
      await call('/messaging/send-jobs', {
        method: 'POST',
        body: { ...body, variables: { name: '不同内容' } },
        key,
      })
    ).businessCode,
    'IDEMPOTENCY_CONFLICT'
  )
  assert.equal(await worker.processMessaging(pool, undefined, 1000), 0)
  const cancelled = ok(
    await call(`/messaging/send-jobs/${first.id}/cancel`, {
      method: 'POST',
      body: { expectedRevision: first.revision },
    })
  )
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.counts.cancelled, 1)
  await due(first.id)
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(await effects(first.id), 0)
})

test('own subscriptions have honest absent revision and skip opted-out recipients without altering workflow delivery', async () => {
  const previous = (
    await pool.query(
      "SELECT * FROM message_subscriptions WHERE tenant_id='tenant-a' AND user_id='a-employee' AND channel='message'"
    )
  ).rows[0]
  const initial = ok(
    await call('/messaging/subscriptions', { user: 'a-employee' })
  ).find((value) => value.channel === 'message')
  assert.equal(initial.stored, !!previous)
  if (!previous) assert.equal(initial.revision, 0)
  const subscription = ok(
    await call('/messaging/subscriptions/message', {
      user: 'a-employee',
      method: 'PUT',
      body: {
        expectedRevision: initial.revision,
        subscribed: false,
        deliveryModes: ['in-app', 'websocket'],
      },
    })
  )
  assert.equal(subscription.subscribed, false)
  assert.equal(subscription.stored, true)
  try {
    const template = await approved(),
      sending = await send(template)
    await worker.processMessaging(pool, undefined, 1000)
    assert.equal(
      (await job(sending.id)).recipients[0].errorCode,
      'MESSAGING_UNSUBSCRIBED'
    )
    assert.equal(await effects(sending.id), 0)
    const eventId = randomUUID()
    await pool.query(
      "INSERT INTO outbox(tenant_id,id,recipient_id,payload) VALUES('tenant-a',$1,'a-employee',$2)",
      [
        eventId,
        JSON.stringify({
          title: '工作流合成提醒',
          content: '查看流程',
          category: 'message',
          link: '/leave/application',
        }),
      ]
    )
    await notifications.processOutbox(pool, undefined, 1000)
    assert.equal(
      Number(
        (
          await pool.query(
            'SELECT count(*) AS n FROM notifications WHERE event_id=$1',
            [eventId]
          )
        ).rows[0].n
      ),
      1
    )
  } finally {
    ok(
      await call('/messaging/subscriptions/message', {
        user: 'a-employee',
        method: 'PUT',
        body: {
          expectedRevision: subscription.revision,
          subscribed: true,
          deliveryModes: ['in-app', 'websocket'],
        },
      })
    )
  }
})

test('per-recipient rollback, after-commit faults and concurrent workers cause one canonical effect', async () => {
  const template = await approved(),
    sending = await send(template),
    recipientId = sending.recipients[0].id
  let faulted = false
  await worker.processMessaging(
    pool,
    (point, id) => {
      if (
        !faulted &&
        id === recipientId &&
        point === 'messaging:after-effects'
      ) {
        faulted = true
        throw new Error('Fail before transaction commit')
      }
    },
    1000
  )
  assert.equal(await effects(sending.id), 0)
  assert.equal((await job(sending.id)).recipients[0].status, 'pending')
  await due(sending.id)
  await Promise.all([
    worker.processMessaging(
      pool,
      (point, id) => {
        if (id === recipientId && point === 'messaging:after-commit')
          throw new Error('Lost response after commit')
      },
      1000
    ),
    worker.processMessaging(pool, undefined, 1000),
  ])
  const delivered = await job(sending.id)
  assert.equal(delivered.recipients[0].status, 'sent')
  assert.equal(delivered.counts.sent, 1)
  assert.equal(await effects(sending.id), 1)
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM message_delivery_events WHERE recipient_id=$1 AND action='sent'",
          [recipientId]
        )
      ).rows[0].n
    ),
    1
  )
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(await effects(sending.id), 1)
  const payload = (
    await pool.query('SELECT payload FROM outbox WHERE id=$1', [recipientId])
  ).rows[0].payload
  assert.equal(payload.source, 'template')
  assert.equal('requestId' in payload, false)
  assert.equal('access' in payload, false)
})

test('a process killed after claim recovers its durable lease after restart and last-attempt death becomes failed', async () => {
  const template = await approved(),
    sending = await send(template, { deliveryModes: ['in-app'] })
  const workerUrl = new URL(
      '../../services/reference-api/dist/messaging-worker.js',
      import.meta.url
    ).href,
    databaseUrl = new URL(
      '../../services/reference-api/dist/database.js',
      import.meta.url
    ).href
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import d from ${JSON.stringify(
        databaseUrl
      )};import w from ${JSON.stringify(
        workerUrl
      )};const p=d.createPool();await w.processMessaging(p,point=>{if(point==='messaging:claimed')process.exit(73)},1);await p.end();`,
    ],
    { env: process.env, stdio: 'pipe' }
  )
  const [exitCode] = await once(child, 'exit')
  assert.equal(exitCode, 73)
  assert.equal((await job(sending.id)).recipients[0].status, 'processing')
  await due(sending.id)
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(await effects(sending.id), 1)
  const exhausted = await send(template, { deliveryModes: ['in-app'] })
  await pool.query(
    "UPDATE message_recipients SET status='processing',attempts=5,claimed_by='stopped-worker',lease_until=now()-interval '1 second' WHERE job_id=$1",
    [exhausted.id]
  )
  await assert.rejects(
    worker.processMessaging(
      pool,
      (point, id) => {
        if (
          point === 'messaging:lease-exhausted' &&
          id === exhausted.recipients[0].id
        )
          throw new Error('Stopped during terminal fact transaction')
      },
      1000
    )
  )
  assert.equal((await job(exhausted.id)).recipients[0].status, 'processing')
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM message_delivery_events WHERE recipient_id=$1 AND action='failed'",
          [exhausted.recipients[0].id]
        )
      ).rows[0].n
    ),
    0
  )
  await worker.processMessaging(pool, undefined, 1000)
  const failed = await job(exhausted.id)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.recipients[0].errorCode, 'MESSAGING_LEASE_EXHAUSTED')
  assert.equal(await effects(exhausted.id), 0)
})

test('send-only approved library is separate from creator metadata; scope and role revocation rechecked at execution and retry', async () => {
  const template = await approved(),
    sender = await createScopedSender()
  const library = ok(
    await call('/messaging/templates/approved?pageSize=100', {
      user: sender.username,
    })
  )
  assert.ok(library.list.some((value) => value.id === template.activeVersionId))
  assert.equal(
    (
      await call(`/messaging/templates/${template.id}`, {
        user: sender.username,
      })
    ).status,
    403
  )
  const sending = await send(
    template,
    { deliveryModes: ['in-app'] },
    { user: sender.username }
  )
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='self' WHERE role_id=$1",
    [sender.roleId]
  )
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(
    (await job(sending.id)).recipients[0].errorCode,
    'MESSAGING_AUDIENCE_FORBIDDEN'
  )
  assert.equal(await effects(sending.id), 0)
  const blockedJob = await job(sending.id)
  assert.equal(
    (
      await call(`/messaging/send-jobs/${sending.id}/retry`, {
        method: 'POST',
        body: { expectedRevision: blockedJob.revision },
      })
    ).businessCode,
    'MESSAGING_AUDIENCE_FORBIDDEN'
  )
  const deniedAll = await call('/messaging/send-jobs', {
    user: sender.username,
    method: 'POST',
    body: {
      templateVersionId: template.activeVersionId,
      variables: { name: '全员越界' },
      audience: { scope: 'all' },
      deliveryModes: ['in-app'],
      scheduledAt: null,
    },
  })
  assert.equal(deniedAll.businessCode, 'MESSAGING_AUDIENCE_FORBIDDEN')
  await pool.query(
    "UPDATE role_member_scopes SET data_scope='all' WHERE role_id=$1",
    [sender.roleId]
  )
  ok(
    await call(`/messaging/send-jobs/${sending.id}/retry`, {
      method: 'POST',
      body: { expectedRevision: blockedJob.revision },
    })
  )
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(await effects(sending.id), 1)
  const second = await send(
    template,
    { deliveryModes: ['in-app'] },
    { user: sender.username }
  )
  await pool.query("UPDATE roles SET status='disabled' WHERE id=$1", [
    sender.roleId,
  ])
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(
    (await job(second.id)).recipients[0].errorCode,
    'MESSAGING_SENDER_UNAUTHORIZED'
  )
  assert.equal(await effects(second.id), 0)
  assert.equal(
    (await call(`/messaging/send-jobs/${second.id}`, { user: 'b-admin' }))
      .status,
    404
  )
})

test('disabled recipient and archived template block pending sends, restore preserves facts and approved versions', async () => {
  const template = await approved(),
    sending = await send(template, { deliveryModes: ['in-app'] })
  await pool.query(
    "UPDATE memberships SET status='disabled' WHERE tenant_id='tenant-a' AND user_id='a-employee'"
  )
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(
    (await job(sending.id)).recipients[0].errorCode,
    'MESSAGING_RECIPIENT_UNAVAILABLE'
  )
  await pool.query(
    "UPDATE memberships SET status='enabled' WHERE tenant_id='tenant-a' AND user_id='a-employee'"
  )
  const pending = await send(template, {
    scheduledAt: new Date(Date.now() + 60000).toISOString(),
    deliveryModes: ['in-app'],
  })
  const submittedDraft = ok(
      await call(`/messaging/templates/${template.id}`, {
        method: 'PUT',
        body: { expectedRevision: template.revision, schema: templateSchema() },
      })
    ),
    submitted = await submit(submittedDraft)
  const archived = ok(
    await call(`/messaging/templates/${template.id}`, {
      method: 'DELETE',
      body: { expectedRevision: submitted.revision },
    })
  )
  assert.ok(archived.archivedAt)
  assert.equal(archived.reviews[0].status, 'cancelled')
  assert.equal((await job(pending.id)).status, 'blocked')
  const restored = ok(
    await call(`/messaging/templates/${template.id}/restore`, {
      method: 'POST',
      body: { expectedRevision: archived.revision },
    })
  )
  assert.equal(restored.enabled, false)
  assert.equal(restored.activeVersionId, template.activeVersionId)
  assert.equal(restored.versions.length, 1)
  assert.equal(
    (
      await call('/messaging/send-jobs', {
        method: 'POST',
        body: {
          templateVersionId: template.activeVersionId,
          variables: { name: '禁用模板' },
          audience: { scope: 'self' },
          deliveryModes: ['in-app'],
          scheduledAt: null,
        },
      })
    ).businessCode,
    'MESSAGING_TEMPLATE_DISABLED'
  )
})

test('current department availability governs delayed sending and published announcement readership', async () => {
  const reader = await createScopedSender([
    contracts.MESSAGING_PERMISSIONS.announcementRead,
  ])
  const department = ok(
    await call('/system/departments', {
      method: 'POST',
      body: {
        departmentName: `消息范围部门-${randomUUID()}`,
        parentId: null,
        leader: '',
        sort: 0,
        status: 'enabled',
      },
    })
  )
  const member = ok(await call(`/system/users/${reader.id}`))
  ok(
    await call(`/system/organization-members/${reader.id}/assign`, {
      method: 'POST',
      body: {
        departmentId: department.id,
        positionId: null,
        expectedRevision: member.revision,
      },
    })
  )
  const audience = { scope: 'department', targetId: department.id }
  const template = await approved(),
    sending = await send(template, { audience, deliveryModes: ['in-app'] })
  const announcement = ok(
    await call('/messaging/announcements', {
      method: 'POST',
      body: {
        schema: {
          title: '部门可见公告',
          content: '合成内容',
          audience,
          expiresAt: null,
        },
      },
    })
  )
  const published = ok(
    await call(`/messaging/announcements/${announcement.id}/publish`, {
      method: 'POST',
      body: { expectedRevision: announcement.revision },
    })
  )
  assert.equal(
    ok(
      await call(
        `/messaging/announcements/published/${published.activeVersionId}/read`,
        { user: reader.username }
      )
    ).title,
    '部门可见公告'
  )
  await pool.query(
    "UPDATE departments SET status='disabled' WHERE tenant_id='tenant-a' AND id=$1",
    [department.id]
  )
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(await effects(sending.id), 0)
  assert.equal(
    (await job(sending.id)).recipients[0].errorCode,
    'MESSAGING_AUDIENCE_CHANGED'
  )
  assert.equal(
    (
      await call(
        `/messaging/announcements/published/${published.activeVersionId}/read`,
        { user: reader.username }
      )
    ).status,
    404
  )
})

test('published announcements preserve fixed content while editing, authorize readers freshly, and revoke pending deliveries', async () => {
  const original = {
    title: `私有公告-${randomUUID()}`,
    content: '合成秘密正文',
    audience: { scope: 'users', userIds: ['a-employee'] },
    expiresAt: null,
  }
  const created = ok(
      await call('/messaging/announcements', {
        method: 'POST',
        body: { schema: original },
      })
    ),
    published = ok(
      await call(`/messaging/announcements/${created.id}/publish`, {
        method: 'POST',
        body: { expectedRevision: created.revision },
      })
    )
  assert.equal(published.draftChanged, false)
  assert.equal(
    ok(
      await call(
        `/messaging/announcements/published/${published.activeVersionId}/read`,
        { user: 'a-employee' }
      )
    ).content,
    original.content
  )
  assert.equal(
    (
      await call(
        `/messaging/announcements/published/${published.activeVersionId}/read`,
        { user: 'a-manager-2' }
      )
    ).status,
    404
  )
  assert.equal(
    (
      await call(
        `/messaging/announcements/published/${published.activeVersionId}/read`,
        { user: 'b-admin' }
      )
    ).status,
    404
  )
  const edited = ok(
    await call(`/messaging/announcements/${created.id}`, {
      method: 'PUT',
      body: {
        expectedRevision: published.revision,
        schema: { ...original, content: '尚未再次发布的草稿' },
      },
    })
  )
  assert.equal(edited.status, 'published')
  assert.equal(edited.draftChanged, true)
  assert.equal(
    ok(
      await call(
        `/messaging/announcements/published/${published.activeVersionId}/read`,
        { user: 'a-employee' }
      )
    ).content,
    original.content
  )
  await worker.processMessaging(pool, undefined, 1000)
  const announcementJob = (
    await pool.query(
      'SELECT id FROM message_send_jobs WHERE announcement_version_id=$1',
      [published.activeVersionId]
    )
  ).rows[0].id
  const receipt = (await job(announcementJob)).recipients[0]
  const notification = (
    await pool.query('SELECT content FROM notifications WHERE id=$1', [
      receipt.notificationId,
    ])
  ).rows[0]
  assert.equal(notification.content.includes(original.content), false)
  const replacement = ok(
    await call(`/messaging/announcements/${created.id}/publish`, {
      method: 'POST',
      body: { expectedRevision: edited.revision },
    })
  )
  assert.notEqual(replacement.activeVersionId, published.activeVersionId)
  assert.equal(
    (
      await call(
        `/messaging/announcements/published/${published.activeVersionId}/read`,
        { user: 'a-employee' }
      )
    ).status,
    404
  )
  const pendingId = (
    await pool.query(
      'SELECT id FROM message_send_jobs WHERE announcement_version_id=$1',
      [replacement.activeVersionId]
    )
  ).rows[0].id
  const revoked = ok(
    await call(`/messaging/announcements/${created.id}/revoke`, {
      method: 'POST',
      body: { expectedRevision: replacement.revision },
    })
  )
  assert.equal(revoked.activeVersionId, null)
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal(await effects(pendingId), 0)
  assert.equal((await job(pendingId)).counts.cancelled, 1)
  assert.equal(
    (
      await call(
        `/messaging/announcements/published/${replacement.activeVersionId}/read`,
        { user: 'a-employee' }
      )
    ).status,
    404
  )
})

test('unsupported WebSocket upgrade paths and query credentials are promptly rejected', async () => {
  for (const endpoint of [
    '/api/unregistered-realtime',
    '/api/messaging/realtime?token=not-a-credential',
  ]) {
    const socket = new WebSocket(base.replace(/^http/, 'ws') + endpoint)
    socket.on('error', () => {})
    try {
      await assert.rejects(
        once(socket, 'open', { signal: AbortSignal.timeout(2000) }),
        /Unexpected server response: (400|404)/
      )
    } finally {
      socket.terminate()
    }
  }
})

const socketFor = async (user, tenant = 'tenant-a') => {
  const socket = new WebSocket(
      base.replace(/^http/, 'ws') + '/api/messaging/realtime'
    ),
    received = [],
    waiters = []
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    received.push(message)
    for (const waiter of [...waiters])
      if (waiter.predicate(message, received.length - 1)) {
        clearTimeout(waiter.timeout)
        waiters.splice(waiters.indexOf(waiter), 1)
        waiter.resolve(message)
      }
  })
  await once(socket, 'open')
  const wait = (predicate, timeout = 5000) => {
    const existing = received.find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timeout: setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1)
          reject(new Error('Realtime event timed out'))
        }, timeout),
      }
      waiters.push(waiter)
    })
  }
  socket.send(
    JSON.stringify({ type: 'auth', token: await login(user), tenantId: tenant })
  )
  await wait((message) => message.type === 'ready')
  return { socket, received, wait }
}
test('real WebSocket isolates tenants/recipients, authenticates ACKs, persists actual receipt and reauthenticates revocation', async () => {
  const template = await approved(),
    sending = await send(template),
    target = sending.recipients[0].id
  await worker.processMessaging(pool, undefined, 1000)
  assert.equal((await job(sending.id)).recipients[0].realtimeStatus, 'queued')
  const recipient = await socketFor('a-employee'),
    outsider = await socketFor('a-manager-2'),
    otherTenant = await socketFor('b-admin', 'tenant-b')
  try {
    const event = await recipient.wait(
      (message) =>
        message.type === 'message.receipt' && message.receiptId === target
    )
    assert.equal(
      event.notificationId,
      (await job(sending.id)).recipients[0].notificationId
    )
    recipient.socket.send(JSON.stringify({ type: 'ack', receiptId: target }))
    await recipient.wait(
      (message) =>
        message.type === 'acknowledged' && message.receiptId === target
    )
    assert.equal(
      (await job(sending.id)).recipients[0].realtimeStatus,
      'acknowledged'
    )
    assert.equal(
      outsider.received.some((message) => message.receiptId === target),
      false
    )
    assert.equal(
      otherTenant.received.some((message) => message.receiptId === target),
      false
    )
    const forged = once(outsider.socket, 'close')
    outsider.socket.send(JSON.stringify({ type: 'ack', receiptId: target }))
    await forged
    const revoked = once(recipient.socket, 'close')
    await pool.query(
      "UPDATE sessions SET revoked_at=now() WHERE user_id='a-employee' AND revoked_at IS NULL"
    )
    const [code] = await revoked
    assert.equal(code, 4401)
    tokens.delete('a-employee')
    assert.equal(
      Number(
        (
          await pool.query(
            "SELECT count(*) AS n FROM message_delivery_events WHERE recipient_id=$1 AND action='realtime.acknowledged'",
            [target]
          )
        ).rows[0].n
      ),
      1
    )
  } finally {
    recipient.socket.terminate()
    outsider.socket.terminate()
    otherTenant.socket.terminate()
  }
  const noAuth = new WebSocket(
    base.replace(/^http/, 'ws') + '/api/messaging/realtime'
  )
  await once(noAuth, 'open')
  const closed = once(noAuth, 'close')
  noAuth.send(JSON.stringify({ type: 'ack', receiptId: target }))
  const [code] = await closed
  assert.equal(code, 4401)
})

test('one hundred older actual muted receipts cannot starve a newer eligible live receipt', async () => {
  const reader = await createScopedSender([
    contracts.MESSAGING_PERMISSIONS.subscriptionRead,
    contracts.MESSAGING_PERMISSIONS.subscriptionUpdate,
  ])
  const audience = { scope: 'users', userIds: [reader.id] }
  const initial = ok(
    await call('/messaging/subscriptions', { user: reader.username })
  ).find((value) => value.channel === 'alert')
  let subscription = initial
  if (!initial.subscribed || !initial.deliveryModes.includes('websocket'))
    subscription = ok(
      await call('/messaging/subscriptions/alert', {
        user: reader.username,
        method: 'PUT',
        body: {
          expectedRevision: initial.revision,
          subscribed: true,
          deliveryModes: ['in-app', 'websocket'],
        },
      })
    )
  const alertTemplate = await approved(templateSchema({ channel: 'alert' })),
    oldJobs = []
  for (let index = 0; index < 100; index += 1)
    oldJobs.push(
      await send(alertTemplate, {
        audience,
        variables: { name: `较早合成回执${index}` },
      })
    )
  await worker.processMessaging(pool, undefined, 1000)
  const oldIds = oldJobs.map((value) => value.id)
  const persisted = (
    await pool.query(
      "SELECT count(*) AS total,count(notification_id) AS effects,count(realtime_ack_at) AS acknowledged FROM message_recipients WHERE job_id=ANY($1::text[]) AND status='sent'",
      [oldIds]
    )
  ).rows[0]
  assert.equal(Number(persisted.total), 100)
  assert.equal(Number(persisted.effects), 100)
  assert.equal(Number(persisted.acknowledged), 0)
  const muted = ok(
    await call('/messaging/subscriptions/alert', {
      user: reader.username,
      method: 'PUT',
      body: {
        expectedRevision: subscription.revision,
        subscribed: false,
        deliveryModes: ['in-app', 'websocket'],
      },
    })
  )
  let connection
  try {
    const template = await approved(),
      sending = await send(template, {
        audience,
        variables: { name: '较新的可接收回执' },
      }),
      target = sending.recipients[0].id
    await worker.processMessaging(pool, undefined, 1000)
    assert.equal(await effects(sending.id), 1)
    connection = await socketFor(reader.username)
    const event = await connection.wait(
      (message) =>
        message.type === 'message.receipt' && message.receiptId === target,
      3000
    )
    assert.equal(
      event.notificationId,
      (await job(sending.id)).recipients[0].notificationId
    )
    const mutedReceiptIds = new Set(
      oldJobs.map((value) => value.recipients[0].id)
    )
    assert.equal(
      connection.received.some((message) =>
        mutedReceiptIds.has(message.receiptId)
      ),
      false
    )
    assert.ok(
      ok(
        await call('/messages/notifications?pageSize=100', {
          user: reader.username,
        })
      ).list.some((value) => value.id === event.notificationId)
    )
    connection.socket.send(JSON.stringify({ type: 'ack', receiptId: target }))
    await connection.wait(
      (message) =>
        message.type === 'acknowledged' && message.receiptId === target
    )
    assert.equal(
      (await job(sending.id)).recipients[0].realtimeStatus,
      'acknowledged'
    )
  } finally {
    connection?.socket.terminate()
    ok(
      await call('/messaging/subscriptions/alert', {
        user: reader.username,
        method: 'PUT',
        body: {
          expectedRevision: muted.revision,
          subscribed: initial.subscribed,
          deliveryModes: initial.deliveryModes,
        },
      })
    )
  }
})

test('an unacknowledged stable receipt is advertised again after five seconds on the same authenticated socket', async () => {
  const template = await approved(),
    sending = await send(template, {
      variables: { name: `重复回执-${randomUUID()}` },
    }),
    target = sending.recipients[0].id
  await worker.processMessaging(pool, undefined, 1000)
  const connection = await socketFor('a-employee')
  try {
    const first = await connection.wait(
        (message) =>
          message.type === 'message.receipt' && message.receiptId === target
      ),
      firstIndex = connection.received.indexOf(first),
      receivedAt = Date.now()
    assert.equal((await job(sending.id)).recipients[0].realtimeStatus, 'queued')
    const repeated = await connection.wait(
      (message, index) =>
        index > firstIndex &&
        message.type === 'message.receipt' &&
        message.receiptId === target,
      7500
    )
    assert.ok(
      Date.now() - receivedAt >= 4500,
      'The same open connection must re-advertise after the retry interval'
    )
    assert.equal(connection.socket.readyState, WebSocket.OPEN)
    assert.equal(
      connection.received.filter((message) => message.type === 'ready').length,
      1
    )
    assert.equal(repeated.receiptId, first.receiptId)
    assert.equal(repeated.notificationId, first.notificationId)
    assert.equal(await effects(sending.id), 1)
    assert.ok(
      ok(
        await call('/messages/notifications?pageSize=100', {
          user: 'a-employee',
        })
      ).list.some((value) => value.id === repeated.notificationId)
    )
    connection.socket.send(
      JSON.stringify({ type: 'ack', receiptId: repeated.receiptId })
    )
    await connection.wait(
      (message) =>
        message.type === 'acknowledged' && message.receiptId === target
    )
    assert.equal(
      (await job(sending.id)).recipients[0].realtimeStatus,
      'acknowledged'
    )
  } finally {
    connection.socket.terminate()
  }
})

test('ordinary workflow notification replacement invalidates a live center when unread count and lexical max ID stay unchanged', async () => {
  // These are controlled legacy workflow outbox events. The actual workflow worker creates every notification.
  const lowerId = '00000000-0000-4000-8000-000000000001',
    removedId = '80000000-0000-4000-8000-000000000002',
    greatestId = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
  const eventIds = [randomUUID(), randomUUID(), randomUUID()]
  await pool.query(
    "INSERT INTO outbox(tenant_id,id,recipient_id,payload) VALUES('tenant-b',$1,'b-admin',$4),('tenant-b',$2,'b-admin',$5),('tenant-b',$3,'b-admin',$6)",
    [
      eventIds[0],
      eventIds[1],
      eventIds[2],
      JSON.stringify({
        title: '保留的较大标识',
        content: '查看合成工作流',
        category: 'message',
        link: '/leave/application',
      }),
      JSON.stringify({
        title: '将被标记已读',
        content: '查看合成工作流',
        category: 'message',
        link: '/leave/application',
      }),
      JSON.stringify({
        title: '随后出现的较小标识',
        content: '查看合成工作流',
        category: 'message',
        link: '/leave/application',
      }),
    ]
  )
  // Schedule the replacement event until the socket has observed the initial state.
  await pool.query(
    "UPDATE outbox SET next_attempt_at=now()+interval '1 hour' WHERE id=$1",
    [eventIds[2]]
  )
  await notifications.processOutbox(pool, undefined, 1000)
  const created = (
    await pool.query(
      'SELECT id,event_id FROM notifications WHERE event_id=ANY($1::text[])',
      [eventIds.slice(0, 2)]
    )
  ).rows
  assert.equal(created.length, 2)
  await pool.query(
    'UPDATE notifications SET id=CASE event_id WHEN $1 THEN $3 ELSE $4 END WHERE event_id=ANY($2::text[])',
    [eventIds[0], eventIds.slice(0, 2), greatestId, removedId]
  )
  const connection = await socketFor('b-admin', 'tenant-b')
  try {
    await connection.wait((message) => message.type === 'notifications.changed')
    const before = ok(
        await call('/messages/notifications?status=unread&pageSize=100', {
          user: 'b-admin',
        })
      ),
      beforeIndex = connection.received.length - 1
    assert.ok(before.list.some((value) => value.id === greatestId))
    assert.ok(before.list.some((value) => value.id === removedId))
    // Hold the actor tenant gate so no poll can observe a half-completed replacement.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        "SELECT id FROM tenants WHERE id='tenant-b' FOR UPDATE"
      )
      // Activate and process a real outbox effect while the gate blocks every authenticated WS poll.
      await pool.query(
        "UPDATE outbox SET next_attempt_at=now()-interval '1 second' WHERE id=$1",
        [eventIds[2]]
      )
      await notifications.processOutbox(pool, undefined, 1000)
      const replacement = (
        await client.query('SELECT id FROM notifications WHERE event_id=$1', [
          eventIds[2],
        ])
      ).rows[0]
      assert.ok(replacement, 'Replacement is a real workflow-worker effect')
      await client.query(
        "UPDATE notifications SET read_at=now() WHERE tenant_id='tenant-b' AND id=$1",
        [removedId]
      )
      await client.query('UPDATE notifications SET id=$2 WHERE event_id=$1', [
        eventIds[2],
        lowerId,
      ])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    const after = ok(
      await call('/messages/notifications?status=unread&pageSize=100', {
        user: 'b-admin',
      })
    )
    assert.equal(after.unreadTotal, before.unreadTotal)
    assert.equal(
      after.list
        .map((value) => value.id)
        .sort()
        .at(-1),
      greatestId
    )
    assert.equal(
      before.list
        .map((value) => value.id)
        .sort()
        .at(-1),
      greatestId
    )
    await connection.wait(
      (message, index) =>
        index > beforeIndex && message.type === 'notifications.changed'
    )
    assert.ok(after.list.some((value) => value.id === lowerId))
    assert.equal(
      after.list.some((value) => value.id === removedId),
      false
    )
  } finally {
    connection.socket.terminate()
  }
})
