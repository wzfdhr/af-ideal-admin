import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, mkdir, writeFile, chmod } from 'node:fs/promises'
import path from 'node:path'

if (process.env.R1_RESET_CONFIRM !== 'reset-isolated-compose-demo') throw new Error('Explicit isolated demo confirmation required')
const envFile = process.env.R1_COMPOSE_ENV_FILE || '.env.r1-compose.local'
const config = Object.fromEntries((await readFile(envFile, 'utf8')).split(/\r?\n/).filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
assert.equal(config.R1_APP_MODE, 'demo')
const compose = ['compose', '--env-file', envFile, '-f', 'deploy/compose/compose.yml']
const run = (args, binary = false) => {
  const result = spawnSync('docker', [...compose, ...args], { encoding: binary ? null : 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error('Demo maintenance command refused or failed')
  return result.stdout
}
const sql = (statement) => run(['exec', '-T', 'database', 'psql', '-U', 'af_admin', '-d', 'af_admin_r1_demo', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement]).trim()
assert.equal(sql('SELECT current_database()'), 'af_admin_r1_demo')
assert.equal(sql("SELECT count(*) FROM tenants WHERE id NOT IN ('tenant-a','tenant-b')"), '0')
const directory = path.resolve('test-results/r1-demo-reset')
await mkdir(directory, { recursive: true, mode: 0o700 })
await chmod(directory, 0o700)
run(['stop', 'api', 'worker'])
try {
  const backup = path.join(directory, `before-reset-${Date.now()}.dump`)
  await writeFile(backup, run(['exec', '-T', 'database', 'pg_dump', '-U', 'af_admin', '-d', 'af_admin_r1_demo', '-Fc'], true), { mode: 0o600 })
  sql('BEGIN; TRUNCATE tenants,users,auth_failures CASCADE; COMMIT;')
  run(['--profile', 'demo', 'run', '--rm', '--no-deps', 'seed'])
  assert.equal(sql('SELECT count(*) FROM leave_requests'), '0')
  assert.equal(sql('SELECT count(*) FROM users'), '11')
  await writeFile(path.join(directory, 'report.json'), JSON.stringify({ recordedAt: new Date().toISOString(), explicitMode: 'demo', backup: path.basename(backup), requests: 0, users: 11, seeds: 'shared demoIdentities; no automatic restart reset' }, null, 2))
  process.stdout.write('Isolated demo reset; private pre-reset backup retained\n')
} finally {
  run(['start', 'api', 'worker'])
}
