import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { before, after, test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import worker from '../../services/reference-api/dist/workflow-timer-worker.js'
import contracts from '@af-admin/contracts'
const pool = db.createPool(),
  tokens = new Map()
let server, base, originals
before(async () => {
  await migrations.migrate(pool)
  await seeds.seedDemo(pool)
  originals = (
    await pool.query(
      "SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','a-employee','a-manager-1')"
    )
  ).rows
  const all = (
    await pool.query('SELECT code FROM permission_definitions')
  ).rows.map((row) => row.code)
  await pool.query(
    "UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",
    [JSON.stringify(all)]
  )
  await pool.query(
    "UPDATE memberships SET permissions=permissions||$1::jsonb WHERE user_id='a-employee'",
    [JSON.stringify(Object.values(contracts.BUSINESS_PERMISSIONS))]
  )
  await pool.query(
    "UPDATE memberships SET permissions=permissions||'[\"workflow:transfer\"]'::jsonb WHERE user_id='a-manager-1'"
  )
  server = api.createServer(pool)
  base = await server.listen({ host: '127.0.0.1', port: 0 })
})
after(async () => {
  await server.close()
  for (const r of originals)
    await pool.query(
      'UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',
      [r.tenant_id, r.user_id, JSON.stringify(r.permissions)]
    )
  await pool.end()
})
const call = async (
  path,
  {
    user = 'a-admin',
    method = 'GET',
    body,
    key = randomUUID(),
    origin = base,
  } = {}
) => {
  if (!tokens.has(user)) {
    const r = await fetch(`${base}/api/user/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: user, password: user }),
    })
    assert.equal(r.status, 200)
    tokens.set(user, (await r.json()).data.token)
  }
  const r = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      'x-access-token': tokens.get(user),
      'x-tenant-id': user.startsWith('b-') ? 'tenant-b' : 'tenant-a',
      'idempotency-key': key,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, ...(await r.json()) }
}
const ok = (r) => {
  assert.equal(r.status, 200, r.message)
  return r.data
}
const node = (id, type, config = {}) => ({ id, type, name: id, config }),
  edge = (source, target, extra = {}) => ({
    id: `${source}-${target}`,
    source,
    target,
    label: '',
    ...extra,
  })
const graph = () => ({
  version: 4,
  nodes: [
    node('start', 'start'),
    node('wait', 'wait', { delaySeconds: 1 }),
    node('approve', 'approval', {
      approvers: ['a-manager-1'],
      deadlineSeconds: 1,
    }),
    node('end', 'end'),
  ],
  edges: [
    edge('start', 'wait'),
    edge('wait', 'approve'),
    edge('approve', 'end'),
  ],
})
const app = async (schema = graph()) => {
  const a = ok(
      await call('/application-center', {
        method: 'POST',
        body: {
          name: '耐久定时设备',
          code: `timer-${randomUUID().slice(0, 8)}`,
          template: 'equipment',
        },
      })
    ),
    f = ok(await call(`/form-schemas/${a.formDraftId}`)),
    w = ok(await call(`/workflows/${a.workflowDraftId}`))
  const saved = ok(
    await call(`/workflows/${w.id}`, {
      method: 'PUT',
      body: { schema, expectedRevision: w.revision },
    })
  )
  const release = ok(
    await call(`/applications/${a.id}/releases`, {
      method: 'POST',
      body: {
        formDraftId: f.id,
        workflowDraftId: w.id,
        formRevision: f.revision,
        workflowRevision: saved.revision,
        expectedRevision: a.revision,
      },
    })
  )
  return { ...a, release }
}
const create = async (a) => {
  const r = ok(
    await call('/business/records', {
      user: 'a-employee',
      method: 'POST',
      body: {
        applicationReleaseId: a.release.id,
        fields: {
          itemName: '真实定时设备',
          quantity: 1,
          reason: '按固定版本唤起',
        },
      },
    })
  )
  return ok(
    await call(`/business/records/${r.id}/submit`, {
      user: 'a-employee',
      method: 'POST',
      body: { expectedRevision: r.revision },
    })
  )
}
const timers = async (r) =>
  ok(await call(`/business/records/${r.id}`, { user: 'a-employee' })).timers
const tasks = async (r, user) =>
  ok(await call('/workflow-todos?pageSize=100', { user })).list.filter(
    (t) => t.requestId === r.id
  )
const vote = (t, user) =>
  call(`/workflow-tasks/${t.id}/approve`, {
    user,
    method: 'POST',
    body: { expectedRevision: t.revision },
  })
const due = async (timer) => {
  const target = Math.max(new Date(timer.dueAt).getTime(), new Date(timer.nextAttemptAt).getTime())
  const remaining = target - Date.now()
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining + 30))
}
const tick = () => worker.processWorkflowTimers(pool)

test('a real due wait creates one actual reviewer task and a deadline reminds the transferred current owner without signing', async () => {
  const a = await app(),
    r = await create(a),
    wait = (await timers(r))[0]
  assert.equal(wait.kind, 'resume')
  assert.equal((await tasks(r, 'a-manager-1')).length, 0)
  await new Promise((resolve) => setTimeout(resolve, 1100))
  await Promise.all([tick(), tick()])
  const task = (await tasks(r, 'a-manager-1'))[0]
  assert.ok(task)
  assert.equal(task.nodeId, 'approve')
  let detail = ok(
    await call(`/business/records/${r.id}`, { user: 'a-employee' })
  )
  assert.equal(
    detail.history.filter((h) => h.action === 'timer-resume').length,
    1
  )
  assert.equal(
    detail.history.find((h) => h.action === 'timer-resume').operatorId,
    null
  )
  ok(
    await call(`/workflow-tasks/${task.id}/transfer`, {
      user: 'a-manager-1',
      method: 'POST',
      body: {
        expectedRevision: task.revision,
        targetUserId: 'a-admin',
        reason: '到期前转交',
      },
    })
  )
  const deadline = (await timers(r)).find((t) => t.kind === 'deadline')
  await due(deadline)
  await tick()
  await tick()
  const notifications = await pool.query(
    "SELECT recipient_id FROM outbox WHERE payload->>'requestId'=$1 AND payload->>'title'='审批已超过处理期限'",
    [r.id]
  )
  assert.deepEqual(
    notifications.rows.map((x) => x.recipient_id),
    ['a-admin']
  )
  detail = ok(await call(`/business/records/${r.id}`, { user: 'a-employee' }))
  assert.equal(detail.status, 'running')
  assert.equal(
    detail.history.filter((h) => h.action === 'timer-overdue').length,
    1
  )
  assert.equal(
    (
      await pool.query(
        "SELECT id FROM workflow_timer_events WHERE timer_id=$1 AND kind='deadline'",
        [deadline.id]
      )
    ).rowCount,
    1
  )
  const replacement = (await tasks(r, 'a-admin'))[0]
  ok(await vote(replacement, 'a-admin'))
  assert.equal(
    ok(await call(`/business/records/${r.id}`, { user: 'a-employee' })).status,
    'approved'
  )
  assert.equal(
    (await call('/workflow-timers', { user: 'a-employee' })).status,
    403
  )
  assert.equal(
    (
      await call(`/workflow-timers/${wait.id}/recovery-slots`, {
        user: 'b-admin',
      })
    ).status,
    404
  )
})
test('waiting branches retain their paired group and a last delayed branch joins once after independent signatures', async () => {
  const schema = {
    version: 4,
    nodes: [
      node('start', 'start'),
      node('fork', 'parallel', { joinId: 'join' }),
      node('wait', 'wait', { delaySeconds: 1 }),
      node('left', 'approval', { approvers: ['a-manager-1'] }),
      node('right', 'sign', {
        approvers: ['a-manager-2', 'a-admin'],
        voting: { mode: 'all' },
      }),
      node('join', 'join', { forkId: 'fork' }),
      node('end', 'end'),
    ],
    edges: [
      edge('start', 'fork'),
      edge('fork', 'wait', { channel: 'branch-1' }),
      edge('fork', 'right', { channel: 'branch-2' }),
      edge('wait', 'left'),
      edge('left', 'join'),
      edge('right', 'join'),
      edge('join', 'end'),
    ],
  }
  const a = await app(schema),
    r = await create(a)
  ok(await vote((await tasks(r, 'a-manager-2'))[0], 'a-manager-2'))
  ok(await vote((await tasks(r, 'a-admin'))[0], 'a-admin'))
  assert.equal(
    ok(await call(`/business/records/${r.id}`, { user: 'a-employee' })).status,
    'running'
  )
  await due((await timers(r))[0])
  await tick()
  ok(await vote((await tasks(r, 'a-manager-1'))[0], 'a-manager-1'))
  const detail = ok(
    await call(`/business/records/${r.id}`, { user: 'a-employee' })
  )
  assert.equal(detail.status, 'approved')
  assert.equal(detail.history.filter((h) => h.action === 'join').length, 1)
})
test('blocked next identity requires authorized recovery and the override keeps the published definition fixed', async () => {
  const a = await app(),
    r = await create(a),
    timer = (await timers(r))[0]
  const permissions = (
    await pool.query(
      "SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-manager-1'"
    )
  ).rows[0].permissions
  try {
    await pool.query(
      "UPDATE memberships SET permissions=permissions-'workflow:approve' WHERE tenant_id='tenant-a' AND user_id='a-manager-1'"
    )
    await due(timer)
    await tick()
    const blocked = (await timers(r))[0]
    assert.equal(blocked.status, 'blocked')
    assert.equal((await tasks(r, 'a-manager-1')).length, 0)
    const slots = ok(await call(`/workflow-timers/${timer.id}/recovery-slots`))
    assert.equal(slots[0].nodeId, 'approve')
    assert.equal(
      (
        await call(`/workflow-timers/${timer.id}/retry`, {
          user: 'b-admin',
          method: 'POST',
          body: { expectedRevision: blocked.revision, reason: '越权恢复' },
        })
      ).status,
      404
    )
    assert.equal(
      (
        await call(`/workflow-timers/${timer.id}/retry`, {
          method: 'POST',
          body: {
            expectedRevision: blocked.revision,
            reason: '非法自审',
            targetUserId: 'a-employee',
            nodeId: 'approve',
            originalAssigneeId: 'a-manager-1',
          },
        })
      ).businessCode,
      'SELF_APPROVAL'
    )
    const key = randomUUID(),
      body = {
        expectedRevision: blocked.revision,
        reason: '真实失权恢复',
        targetUserId: 'a-admin',
        nodeId: 'approve',
        originalAssigneeId: 'a-manager-1',
      }
    const receipt = ok(
      await call(`/workflow-timers/${timer.id}/retry`, {
        method: 'POST',
        body,
        key,
      })
    )
    assert.deepEqual(
      ok(
        await call(`/workflow-timers/${timer.id}/retry`, {
          method: 'POST',
          body,
          key,
        })
      ),
      receipt
    )
    await tick()
    const task = (await tasks(r, 'a-admin'))[0]
    assert.equal(task.nodeId, 'approve')
    ok(await vote(task, 'a-admin'))
    assert.deepEqual(
      ok(await call(`/applications/${a.id}`)).releases.find(
        (x) => x.id === a.release.id
      ).workflowSnapshot,
      a.release.workflowSnapshot
    )
  } finally {
    await pool.query(
      "UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",
      [JSON.stringify(permissions)]
    )
  }
})
test('effects roll back before completion and a retried expired lease produces one immutable system fact', async () => {
  const a = await app(),
    r = await create(a),
    timer = (await timers(r))[0]
  await due(timer)
  await worker.processWorkflowTimers(pool, (point, timerId) => {
    if (point === 'timer:after-effects' && timerId === timer.id)
      throw new Error('controlled timer rollback')
  })
  assert.equal((await tasks(r, 'a-manager-1')).length, 0)
  assert.equal(
    (
      await pool.query(
        "SELECT id FROM workflow_timer_events WHERE timer_id=$1 AND kind='resume'",
        [timer.id]
      )
    ).rowCount,
    0
  )
  const pending = (await timers(r))[0]
  assert.equal(pending.status, 'pending')
  await due(pending)
  await tick()
  assert.equal((await tasks(r, 'a-manager-1')).length, 1)
  const fact = (
    await pool.query(
      "SELECT id,source,actor_id FROM workflow_timer_events WHERE timer_id=$1 AND kind='resume'",
      [timer.id]
    )
  ).rows[0]
  assert.equal(fact.source, 'scheduler')
  assert.equal(fact.actor_id, null)
  await assert.rejects(
    pool.query('DELETE FROM workflow_timer_events WHERE id=$1', [fact.id]),
    (error) => error.code === '23514'
  )
  await assert.rejects(
    pool.query(
      "INSERT INTO workflow_history(tenant_id,id,instance_id,action,operator_id,operator_name,operator_kind,sequence) VALUES('tenant-a',$1,$2,'approve',NULL,'伪造调度批准','system',999)",
      [randomUUID(), r.instanceId]
    ),
    (error) => error.code === '23514'
  )
})
test('withdrawal racing a claimed timer cannot leave a live task or active timer on the withdrawn instance', async () => {
  const a = await app(),
    r = await create(a),
    timer = (await timers(r))[0]
  await due(timer)
  await Promise.all([
    tick(),
    call(`/business/records/${r.id}/withdraw`, {
      user: 'a-employee',
      method: 'POST',
      body: { expectedRevision: r.revision },
    }),
  ])
  const detail = ok(
    await call(`/business/records/${r.id}`, { user: 'a-employee' })
  )
  if (detail.status === 'running')
    ok(
      await call(`/business/records/${r.id}/withdraw`, {
        user: 'a-employee',
        method: 'POST',
        body: { expectedRevision: detail.revision },
      })
    )
  assert.equal((await tasks(r, 'a-manager-1')).length, 0)
  assert.equal(
    (await timers(r)).filter((t) =>
      ['pending', 'processing', 'blocked'].includes(t.status)
    ).length,
    0
  )
})
test('a killed timer worker is reclaimed by a new process while the actual API reads the original snapshot', async () => {
  const a = await app(),
    r = await create(a),
    timer = (await timers(r))[0]
  await due(timer)
  const childFile = fileURLToPath(
    new URL('./helpers/timer-worker-child.mjs', import.meta.url)
  )
  const child = spawn(process.execPath, [childFile], {
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      APP_MODE: 'demo',
      CRASH_POINT: 'timer:claimed', CRASH_TIMER_ID: timer.id,
    },
    stdio: 'ignore',
  })
  const [code, signal] = await once(child, 'exit')
  assert.equal(signal, 'SIGKILL')
  assert.equal(code, null)
  await pool.query(
    "UPDATE workflow_timers SET lease_until=now()-interval '1 second' WHERE id=$1",
    [timer.id]
  )
  const replacement = spawn(process.execPath, [childFile], {
    env: { DATABASE_URL: process.env.DATABASE_URL, APP_MODE: 'demo' },
    stdio: 'ignore',
  })
  const [status] = await once(replacement, 'exit')
  assert.equal(status, 0)
  const tasksNow = await tasks(r, 'a-manager-1')
  assert.equal(tasksNow.length, 1)
  assert.equal((await timers(r))[0].status, 'completed')
})

test('a portable v4 package declares timed capability and runs only target-owned timers and reviewer slots', async () => {
  const a = await app()
  const current = ok(await call(`/application-center/${a.id}`))
  const pkg = ok(await call(`/application-center/${a.id}/package`, { method: 'POST', body: { expectedRevision: current.revision } }))
  assert.equal(pkg.workflow.version, 4)
  assert.ok(pkg.dependencies.some((dependency) => dependency.key === 'timed-workflow'))
  assert.ok(!JSON.stringify(pkg).includes('a-manager-1'))
  const invalid = structuredClone(pkg)
  invalid.dependencies.find((dependency) => dependency.key === 'timed-workflow').key = 'parallel-workflow'
  assert.throws(() => contracts.parseApplicationPackage(invalid), (error) => error.businessCode === 'PACKAGE_DEPENDENCY_INVALID')
  const imported = ok(await call('/application-packages/import', { user: 'b-admin', method: 'POST', body: { package: pkg, name: '目标定时设备', code: `target-timer-${randomUUID().slice(0, 8)}`, bindings: Object.fromEntries(pkg.people.map((person) => [person.key, 'b-manager-1'])), sourceBindings: {} } })).application
  const f = ok(await call(`/form-schemas/${imported.formDraftId}`, { user: 'b-admin' })), w = ok(await call(`/workflows/${imported.workflowDraftId}`, { user: 'b-admin' }))
  const release = ok(await call(`/applications/${imported.id}/releases`, { user: 'b-admin', method: 'POST', body: { formDraftId: f.id, workflowDraftId: w.id, formRevision: f.revision, workflowRevision: w.revision, expectedRevision: imported.revision } }))
  const record = ok(await call('/business/records', { user: 'b-admin', method: 'POST', body: { applicationReleaseId: release.id, fields: { itemName: '目标定时资产', quantity: 1, reason: '真实重绑运行' } } }))
  const started = ok(await call(`/business/records/${record.id}/submit`, { user: 'b-admin', method: 'POST', body: { expectedRevision: record.revision } }))
  const timer = ok(await call(`/business/records/${record.id}`, { user: 'b-admin' })).timers[0]
  await assert.rejects(pool.query("UPDATE workflow_timers SET due_at=now() WHERE id=$1", [timer.id]), error => error.code === '23514')
  await due(timer); await tick()
  const task = (await tasks(record, 'b-manager-1'))[0]; assert.ok(task); ok(await vote(task, 'b-manager-1'))
  assert.equal(ok(await call(`/business/records/${record.id}`, { user: 'b-admin' })).status, 'approved')
  assert.equal((await call(`/workflow-timers/${timer.id}/retry`, { method: 'POST', body: { expectedRevision: timer.revision, reason: '跨租户恢复' } })).status, 404)
  assert.equal((await pool.query('SELECT release_id FROM workflow_timers WHERE id=$1', [timer.id])).rows[0].release_id, release.id)
  assert.ok(started.instanceId)
})

test('final exhausted leases are inspectable and only a current authorized retry can queue the fixed plan', async () => {
  const a = await app(), r = await create(a), timer = (await timers(r))[0]
  await pool.query("UPDATE workflow_timers SET status='processing',attempts=5,claimed_by='expired-claim',lease_until=now()-interval '1 second' WHERE id=$1", [timer.id])
  await tick()
  const failed = (await timers(r))[0]
  assert.equal(failed.status, 'failed'); assert.equal(failed.errorCode, 'TIMER_LEASE_EXHAUSTED')
  assert.equal((await pool.query("SELECT id FROM workflow_timer_events WHERE timer_id=$1 AND kind='failed'", [timer.id])).rowCount, 1)
  assert.equal((await call(`/workflow-timers/${timer.id}/retry`, { method: 'POST', body: { expectedRevision: failed.revision, reason: '修改计划', dueAt: 'now' } })).status, 422)
  const key = randomUUID(), body = { expectedRevision: failed.revision, reason: '恢复已确认的服务状态' }
  const receipt = ok(await call(`/workflow-timers/${timer.id}/retry`, { method: 'POST', body, key }))
  assert.equal(receipt.dueAt, timer.dueAt); assert.equal(receipt.status, 'pending')
  const permissions = (await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
  try {
    await pool.query("UPDATE memberships SET permissions=permissions-'workflow:timer:retry' WHERE tenant_id='tenant-a' AND user_id='a-admin'")
    assert.equal((await call(`/workflow-timers/${timer.id}/retry`, { method: 'POST', body, key })).status, 403)
  } finally { await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'", [JSON.stringify(permissions)]) }
  await due(receipt); await tick(); assert.equal((await tasks(r,'a-manager-1')).length,1)
})

for (const point of ['timer:after-effects', 'timer:after-commit']) {
  test(`actual worker SIGKILL at ${point} preserves exactly one wake-up fact and successor`, async () => {
    const a=await app(), r=await create(a), timer=(await timers(r))[0]; await due(timer)
    const childFile=fileURLToPath(new URL('./helpers/timer-worker-child.mjs', import.meta.url))
    const child=spawn(process.execPath,[childFile],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo',CRASH_POINT:point,CRASH_TIMER_ID:timer.id},stdio:'ignore'})
    const [,signal]=await once(child,'exit'); assert.equal(signal,'SIGKILL')
    const before=(await timers(r))[0]
    if(point==='timer:after-effects') {
      assert.equal((await tasks(r,'a-manager-1')).length,0)
      assert.equal(before.status,'processing')
      await pool.query("UPDATE workflow_timers SET lease_until=now()-interval '1 second' WHERE id=$1", [timer.id])
    } else assert.equal(before.status,'completed')
    const resumed=spawn(process.execPath,[childFile],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:'ignore'})
    assert.equal((await once(resumed,'exit'))[0],0)
    assert.equal((await tasks(r,'a-manager-1')).length,1)
    assert.equal((await pool.query("SELECT id FROM workflow_timer_events WHERE timer_id=$1 AND kind='resume'",[timer.id])).rowCount,1)
  })
}

test('invalid timed drafts are rejected by actual save and cannot alter the active release', async () => {
  const a=await app(), draft=ok(await call(`/workflows/${a.workflowDraftId}`))
  const bad=structuredClone(draft.schema); bad.nodes.find(node=>node.type==='wait').config.delaySeconds=0
  assert.equal((await call(`/workflows/${draft.id}`,{method:'PUT',body:{schema:bad,expectedRevision:draft.revision}})).status,422)
  assert.equal(ok(await call(`/applications/${a.id}`)).activeReleaseId,a.release.id)
  assert.equal(ok(await call(`/workflows/${draft.id}`)).revision,draft.revision)
})
