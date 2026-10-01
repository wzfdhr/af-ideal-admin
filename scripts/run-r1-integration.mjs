import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { Pool } from 'pg'

const url = new URL(process.env.DATABASE_URL || '')
const sourceName = url.pathname.slice(1)
if (process.env.APP_MODE !== 'demo' || (!sourceName.endsWith('_demo') && sourceName !== 'af_admin_r1')) throw new Error('Integration tests require an explicit isolated demo connection')
const admin = new Pool({ connectionString: url.toString() })
const database = `af_admin_tests_${randomUUID().replaceAll('-', '')}_demo`
let created = false
try {
  await admin.query(`CREATE DATABASE ${database}`)
  created = true
  url.pathname = `/${database}`
  const files = (await readdir('tests/integration')).filter((file) => file.endsWith('.test.mjs') && !file.startsWith('._')).sort().map((file) => `tests/integration/${file}`)
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], { env: { ...process.env, DATABASE_URL: url.toString(), APP_MODE: 'demo' }, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (status) => resolve(status ?? 1))
  })
  process.exitCode = code
} finally {
  if (created) await admin.query(`DROP DATABASE ${database}`)
  await admin.end()
}
