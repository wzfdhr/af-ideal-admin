import { execFileSync, spawn } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
// Avoid ExFAT AppleDouble/xattr metadata and never send local credentials to Docker.
const context = await mkdtemp(path.join(os.tmpdir(), 'af-admin-r1-source-'))
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
try {
  for (const file of files) {
    if (file.endsWith('.local') || file.split('/').some((part) => part.startsWith('._'))) continue
    const source = path.resolve(root, file)
    if (!source.startsWith(root)) throw new Error('Invalid source path')
    const metadata = await lstat(source)
    if (!metadata.isFile()) continue
    const target = path.join(context, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, await readFile(source))
  }
  const build = (target) => new Promise((resolve, reject) => {
    const child = spawn('docker', ['build', '--build-arg', `R1_SOURCE_COMMIT=${revision}${dirty ? '-dirty' : ''}`, '-f', path.join(context, 'deploy/compose/Dockerfile.r1'), '--target', target, '-t', `af-admin-r1-${target}:local`, context], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`R1 ${target} image build failed`)))
  })
  const results = await Promise.allSettled([build('api'), build('web')])
  if (results.some((result) => result.status === 'rejected')) throw new Error('R1 image build failed; inspect build output')
} finally { await rm(context, { recursive: true, force: true }) }
