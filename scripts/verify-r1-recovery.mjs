import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Operates only on the isolated Compose demo created for acceptance. Never on a pilot database.
if (process.env.R1_RECOVERY_CONFIRM !== 'isolated-compose-demo') throw new Error('Explicit isolated acceptance environment required')
const envFile = process.env.R1_COMPOSE_ENV_FILE || '.env.r1-compose.local'
const config = Object.fromEntries((await readFile(envFile, 'utf8')).split(/\r?\n/).filter((line) => /^[A-Z0-9_]+?=/.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
assert.equal(config.R1_APP_MODE, 'demo')
assert.ok(config.R1_DB_PASSWORD)
const evidence = path.resolve('test-results/r1-recovery')
await mkdir(evidence, { recursive: true, mode: 0o700 })
await chmod(evidence, 0o700)
const composeArgs = ['compose', '--env-file', envFile, '-f', 'deploy/compose/compose.yml']
const command = (args, options = {}) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
  if (result.status !== 0) throw new Error(`Recovery command failed: ${args[0]}`)
  return result.stdout
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const base = `http://127.0.0.1:${config.R1_API_PORT || '11888'}`
const tokens = new Map()
const call = async (endpoint, user = 'a-employee', method = 'GET', body) => {
  if (!tokens.has(user)) {
    const result = await fetch(`${base}/api/user/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: user }) })
    assert.equal(result.status, 200)
    tokens.set(user, (await result.json()).data.token)
  }
  const response = await fetch(`${base}/api${endpoint}`, { method, headers: { 'x-access-token': tokens.get(user), 'x-tenant-id': 'tenant-a', ...(body ? { 'content-type': 'application/json', 'idempotency-key': randomUUID() } : {}) }, body: body ? JSON.stringify(body) : undefined })
  assert.equal(response.status, 200, `Acceptance API failed at ${endpoint}`)
  return (await response.json()).data
}
const fields = { leaveType: 'personal', startDate: '2026-10-01', startSlot: 'am', endDate: '2026-10-02', endSlot: 'pm', reason: '恢复演练合成申请' }
const app = await call('/applications/leave')
const draft = await call('/leave-requests', 'a-employee', 'POST', { applicationReleaseId: app.activeReleaseId, fields })
const runningDraft = await call('/leave-requests', 'a-employee', 'POST', { applicationReleaseId: app.activeReleaseId, fields })
const running = await call(`/leave-requests/${runningDraft.id}/submit`, 'a-employee', 'POST', { expectedRevision: runningDraft.revision })
const savedDetail = await call(`/leave-requests/${draft.id}`)
await call('/user/info') // persisted sessions are checked again after restart
command([...composeArgs, 'restart', 'api', 'worker', 'database'])
let ready = false
for (let attempt = 0; attempt < 60; attempt += 1) {
  try { if ((await fetch(`${base}/ready`)).ok) { ready = true; break } } catch { /* service is restarting */ }
  await pause(500)
}
assert.ok(ready, 'Compose did not become ready after restart')
assert.deepEqual(await call(`/leave-requests/${draft.id}`), savedDetail)
assert.equal((await call(`/leave-requests/${running.id}`)).status, 'running')
assert.equal((await call('/user/info')).id, 'a-employee')
const webBase = `http://127.0.0.1:${config.R1_WEB_PORT || '4185'}`
let webReady = false
for (let attempt = 0; attempt < 30; attempt += 1) {
  const response = await fetch(`${webBase}/api/user/info`, { headers: { 'x-access-token': tokens.get('a-employee'), 'x-tenant-id': 'tenant-a' } })
  if (response.ok && (await response.json()).data.id === 'a-employee') { webReady = true; break }
  await pause(500)
}
assert.ok(webReady, 'Nginx must resolve the API after a container restart')
const sql = (statement, database = 'af_admin_r1_demo') => command([...composeArgs, 'exec', '-T', 'database', 'psql', '-U', 'af_admin', '-d', database, '-At', '-c', statement]).trim()
for (let attempt = 0; attempt < 40; attempt += 1) {
  if (sql("SELECT count(*) FROM outbox WHERE status IN ('pending','processing')") === '0') break
  await pause(250)
}
assert.equal(sql("SELECT count(*) FROM outbox WHERE status IN ('pending','processing')"), '0')
command([...composeArgs, 'stop', 'worker'])
const tables = ['tenants', 'users', 'memberships', 'sessions', 'applications', 'form_drafts', 'workflow_drafts', 'application_releases', 'leave_requests', 'workflow_instances', 'workflow_tasks', 'workflow_history', 'audit_events', 'outbox', 'notifications', 'idempotency_records', 'client_telemetry', 'auth_failures', 'schema_migrations']
const fingerprint = (read) => Object.fromEntries(tables.map((table) => {
  const records = read(`SELECT row_to_json(t)::text FROM ${table} t ORDER BY row_to_json(t)::text`)
  return [table, { count: records ? records.split('\n').length : 0, sha256: createHash('sha256').update(records).digest('hex') }]
}))
const before = fingerprint(sql)
const dump = command([...composeArgs, 'exec', '-T', 'database', 'pg_dump', '-U', 'af_admin', '-d', 'af_admin_r1_demo', '-Fc'], { encoding: null })
const backup = path.join(evidence, `demo-${Date.now()}.dump`)
await writeFile(backup, dump, { mode: 0o600 })
const restoreId = `af-admin-r1-restore-${Date.now()}`
const privateEnv = path.join(evidence, 'restore.env.local')
await writeFile(privateEnv, `POSTGRES_USER=af_admin\nPOSTGRES_DB=af_admin_r1_restore_demo\nPOSTGRES_PASSWORD=${config.R1_DB_PASSWORD}\n`, { mode: 0o600 })
command(['run', '-d', '--name', restoreId, '--env-file', privateEnv, '-v', `${restoreId}:/var/lib/postgresql/data`, 'postgres:16-bookworm@sha256:92620daddcd947f8d5ab5ba66e848702fe443d87fed30c4cea8e389fd78dfc55'])
let restored
try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', ['exec', restoreId, 'psql', '-h', '127.0.0.1', '-U', 'af_admin', '-d', 'af_admin_r1_restore_demo', '-At', '-c', 'SELECT 1'], { stdio: 'ignore' })
    if (probe.status === 0) break
    await pause(250)
  }
  command(['exec', '-i', restoreId, 'pg_restore', '-U', 'af_admin', '-d', 'af_admin_r1_restore_demo', '--exit-on-error'], { input: dump })
  restored = fingerprint((statement) => command(['exec', restoreId, 'psql', '-U', 'af_admin', '-d', 'af_admin_r1_restore_demo', '-At', '-c', statement]).trim())
  assert.deepEqual(restored, before)
  // Use the same API image against a genuinely separate database container/volume.
  const network = command(['inspect', '-f', '{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{end}}', 'af-admin-r1-api-1']).trim()
  command(['network', 'connect', network, restoreId])
  const restoredEnv = path.join(evidence, 'restored-api.env.local')
  await writeFile(restoredEnv, `DATABASE_URL=postgresql://af_admin:${config.R1_DB_PASSWORD}@${restoreId}:5432/af_admin_r1_restore_demo\nAPP_MODE=demo\n`, { mode: 0o600 })
  const restoredApi = `${restoreId}-api`
  const compatibleImage = process.env.R1_RESTORE_API_IMAGE || 'af-admin-r1-api:local'
  command(['run', '-d', '--name', restoredApi, '--network', network, '--env-file', restoredEnv, compatibleImage])
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const probe = spawnSync('docker', ['exec', restoredApi, 'node', '-e', "fetch('http://127.0.0.1:10888/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], { stdio: 'ignore' })
      if (probe.status === 0) break
      await pause(250)
    }
    // Tokens/passwords never enter argv or stdout; only synthetic IDs and statuses do.
    const proof = `const assert=require('node:assert/strict');const call=async(path,user,body)=>{const login=await fetch('http://127.0.0.1:10888/api/user/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(login.status,200);const token=(await login.json()).data.token;const res=await fetch('http://127.0.0.1:10888/api'+path,{method:body?'POST':'GET',headers:{'x-access-token':token,'x-tenant-id':'tenant-a','content-type':'application/json','idempotency-key':crypto.randomUUID()},body:body?JSON.stringify(body):undefined});assert.equal(res.status,200);return(await res.json()).data};(async()=>{const detail=await call('/leave-requests/${running.id}','a-employee');assert.equal(detail.status,'running');for(const user of ['a-manager-1','a-manager-2']){const detail=await call('/leave-requests/${running.id}',user);const task=detail.tasks.find(t=>t.assigneeId===user&&t.status==='pending');assert.ok(task);await call('/workflow-tasks/'+task.id+'/approve',user,{expectedRevision:task.revision,comment:'恢复后继续审批'})}const done=await call('/leave-requests/${running.id}','a-employee');assert.equal(done.status,'approved');console.log(JSON.stringify({status:done.status,history:done.history.length,releaseId:done.release.id}))})().catch(()=>process.exit(1))`
    const continued = JSON.parse(command(['exec', '-i', restoredApi, 'node'], { input: proof }))
    const report = { recordedAt: new Date().toISOString(), environment: 'isolated Docker Compose demo, PostgreSQL 16, new restore container and volume', restart: { draftPreserved: true, runningPreserved: true, persistedSessionAccepted: true, nginxReconnected: webReady }, backup: { basename: path.basename(backup), sha256: createHash('sha256').update(dump).digest('hex') }, restoredTables: restored, continued, sourceUntouchedByRestoredApproval: (await call(`/leave-requests/${running.id}`)).status === 'running', compatibleImage: command(['image', 'inspect', '-f', '{{.Id}}', compatibleImage]).trim(), restoreVolume: restoreId }
    await writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2))
    process.stdout.write('Restart, 19-table restore fingerprints and continued approval verified; test-results/r1-recovery/report.json\n')
  } finally { command(['stop', restoredApi]) }
} finally {
  command(['stop', restoreId])
  command([...composeArgs, 'start', 'worker'])
}
