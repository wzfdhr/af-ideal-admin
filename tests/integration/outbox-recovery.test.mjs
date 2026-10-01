import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import notification from '../../services/reference-api/dist/notification.js'

const pool = db.createPool()
const childFile = fileURLToPath(new URL('./helpers/outbox-crash-child.mjs', import.meta.url))
before(async () => { await migrations.migrate(pool); await seeds.seedDemo(pool) })
after(() => pool.end())
const fixture = async () => {
  const requestId = randomUUID(), eventId = randomUUID()
  const app = await pool.query("SELECT active_release_id FROM applications WHERE tenant_id='tenant-a' AND id='leave'")
  await pool.query("INSERT INTO leave_requests (tenant_id,id,application_release_id,applicant_id,applicant_name,department_snapshot,fields,half_day_units) VALUES ('tenant-a',$1,$2,'a-employee','验收员工','验收部门',$3,1)", [requestId, app.rows[0].active_release_id, JSON.stringify({ leaveType: 'personal', startDate: '2026-10-01', startSlot: 'am', endDate: '2026-10-01', endSlot: 'am', reason: '恢复验收' })])
  await pool.query("INSERT INTO outbox (tenant_id,id,recipient_id,payload,next_attempt_at) VALUES ('tenant-a',$1,'a-employee',$2,'2000-01-01')", [eventId, JSON.stringify({ title: '恢复验收通知', content: '请查看授权记录', category: 'message', link: `/leave/requests/${requestId}` })])
  return eventId
}
const runChild = async (point) => {
  const child = spawn(process.execPath, [childFile], { env: { PATH: process.env.PATH, DATABASE_URL: process.env.DATABASE_URL, CRASH_POINT: point || '' }, stdio: ['ignore', 'ignore', 'pipe'] })
  let failed = false
  child.stderr.on('data', () => { failed = true })
  const result = await once(child, 'exit')
  return { code: result[0], signal: result[1], failed }
}
for (const point of ['outbox:before-insert', 'outbox:after-insert']) {
  test(`actual worker SIGKILL at ${point} recovers under a new worker without duplicated notification`, async () => {
    const eventId = await fixture()
    const crashed = await runChild(point)
    assert.equal(crashed.signal, 'SIGKILL')
    let result = await pool.query("SELECT status,attempts FROM outbox WHERE tenant_id='tenant-a' AND id=$1", [eventId])
    assert.equal(result.rows[0].status, 'processing')
    assert.equal(result.rows[0].attempts, 1)
    const before = await pool.query("SELECT count(*)::int AS total FROM notifications WHERE tenant_id='tenant-a' AND event_id=$1", [eventId])
    assert.equal(before.rows[0].total, 0)
    await pool.query("UPDATE outbox SET lease_until=now()-interval '1 second' WHERE tenant_id='tenant-a' AND id=$1", [eventId])
    const recovered = await runChild()
    assert.equal(recovered.code, 0)
    assert.equal(recovered.failed, false)
    result = await pool.query("SELECT status,attempts FROM outbox WHERE tenant_id='tenant-a' AND id=$1", [eventId])
    assert.equal(result.rows[0].status, 'sent')
    assert.equal(result.rows[0].attempts, 2)
    await notification.processOutbox(pool)
    const after = await pool.query("SELECT count(*)::int AS total FROM notifications WHERE tenant_id='tenant-a' AND event_id=$1", [eventId])
    assert.equal(after.rows[0].total, 1)
  })
}
test('expired lease on a final crashed attempt becomes an inspectable failed event', async () => {
  const eventId = await fixture()
  await pool.query("UPDATE outbox SET status='processing',attempts=5,lease_until=now()-interval '1 second',claimed_by='expired-fixture' WHERE tenant_id='tenant-a' AND id=$1", [eventId])
  await notification.processOutbox(pool)
  const result = await pool.query("SELECT status FROM outbox WHERE tenant_id='tenant-a' AND id=$1", [eventId])
  assert.equal(result.rows[0].status, 'failed')
})
