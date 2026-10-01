import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const privateDirectory = await mkdtemp(path.join(os.tmpdir(), 'af-admin-r1-pilot-'))
const reportDirectory = 'test-results/r1-pilot'
await mkdir(reportDirectory, { recursive: true })
const members = ['admin', 'manager', 'manager', 'employee', 'auditor'].map((kind, i) => ({ username: `pilot-proof-${i}`, name: `试点合成成员 ${i}`, department: '验证部门', kind, password: randomBytes(24).toString('hex') }))
const jsonPath = path.join(privateDirectory, 'bootstrap.json')
const envPath = path.join(privateDirectory, 'pilot.env.local')
const project = `af-admin-r1-pilot-proof-${Date.now()}`
await writeFile(jsonPath, JSON.stringify({ tenantId: 'pilot-proof', tenantName: '试点合成环境', members }), { mode: 0o600 })
await writeFile(envPath, `R1_PROJECT_NAME=${project}\nR1_DB_NAME=af_admin_r1_pilot\nR1_DB_PASSWORD=${randomBytes(24).toString('hex')}\nR1_APP_MODE=pilot\nR1_API_PORT=12888\nR1_WEB_PORT=4285\nR1_BOOTSTRAP_FILE=${jsonPath}\n`, { mode: 0o600 })
const compose = ['compose', '--env-file', envPath, '-f', 'deploy/compose/compose.yml']
const run = (args, expected = 0) => {
  const result = spawnSync('docker', [...compose, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.status === 0, expected === 0, 'Pilot maintenance command returned an unexpected status')
}
const base = 'http://127.0.0.1:4285'
const tokens = new Map()
const call = async (endpoint, index = 0, body, expected = 200) => {
  if (!tokens.has(index)) {
    const response = await fetch(`${base}/api/user/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: members[index].username, password: members[index].password }) })
    assert.equal(response.status, 200)
    tokens.set(index, (await response.json()).data.token)
  }
  const response = await fetch(`${base}/api${endpoint}`, { method: body ? 'POST' : 'GET', headers: { 'x-access-token': tokens.get(index), 'x-tenant-id': 'pilot-proof', ...(body ? { 'content-type': 'application/json', 'idempotency-key': randomUUID() } : {}) }, body: body ? JSON.stringify(body) : undefined })
  assert.equal(response.status, expected, 'Pilot HTTP command returned an unexpected status')
  return (await response.json()).data
}
run(['up', '-d', '--no-build'])
try {
  run(['--profile', 'pilot', 'run', '--rm', 'initialize'])
  run(['--profile', 'pilot', 'run', '--rm', 'initialize'], 1)
  run(['--profile', 'demo', 'run', '--rm', 'seed'], 1)
  assert.equal((await (await fetch(`${base}/api/runtime-context`)).json()).data.mode, 'pilot')
  for (const endpoint of ['/demo/reset', '/reset', '/mock/reset']) await call(endpoint, 0, {}, 404)
  const before = await call('/applications/leave')
  assert.equal(before.activeReleaseId, null)
  const release = await call('/applications/leave/releases', 0, { formDraftId: 'form-leave', workflowDraftId: 'workflow-leave', formRevision: 1, workflowRevision: 1, expectedRevision: 1 })
  const fields = { leaveType: 'personal', startDate: '2026-10-01', startSlot: 'am', endDate: '2026-10-02', endSlot: 'pm', reason: '独立试点初始化验收' }
  const draft = await call('/leave-requests', 3, { applicationReleaseId: release.id, fields })
  await call(`/leave-requests/${draft.id}/submit`, 3, { expectedRevision: draft.revision })
  for (const manager of [1, 2]) {
    const detail = await call(`/leave-requests/${draft.id}`, manager)
    const user = await call('/user/info', manager)
    const task = detail.tasks.find((item) => item.assigneeId === user.id && item.status === 'pending')
    assert.ok(task)
    await call(`/workflow-tasks/${task.id}/approve`, manager, { expectedRevision: task.revision })
  }
  const complete = await call(`/leave-requests/${draft.id}`, 3)
  assert.equal(complete.status, 'approved')
  const audit = await call(`/audit/events?targetId=${draft.id}`, 4)
  assert.ok(audit.total >= 3)
  assert.ok(!JSON.stringify(audit).includes(fields.reason))
  await writeFile(`${reportDirectory}/report.json`, JSON.stringify({ recordedAt: new Date().toISOString(), project, mode: 'pilot', initializedOnce: true, publicDemoSeedRefused: true, resetRoutesAbsent: true, applicationPublishedExplicitly: true, finalStatus: complete.status, auditCount: audit.total, privateConfigurationDirectory: privateDirectory }, null, 2))
  process.stdout.write('Fresh pilot Compose initialization and two-reviewer business path verified\n')
} finally { run(['stop']) }
