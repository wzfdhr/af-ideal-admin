import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import path from 'node:path'

const run = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
if (run(['status', '--porcelain'])) throw new Error('Pilot packaging requires a clean committed source tree')
const sourceCommit = run(['rev-parse', 'HEAD'])
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
const images = ['api', 'web'].map((service) => `af-admin-r1-${service}:local`)
const imageMetadata = images.map((name) => JSON.parse(execFileSync('docker', ['image', 'inspect', '--format', '{{json .}}', name], { encoding: 'utf8' })))
if (imageMetadata.some((item) => item.Config.Labels?.['org.opencontainers.image.revision'] !== sourceCommit)) throw new Error('Pilot images must be built from the clean source commit being packaged')
if (imageMetadata.some((item) => item.Config.Labels?.['org.opencontainers.image.version'] !== version)) throw new Error('Pilot image versions must match the source version')
await readFile('docs/quality/leave-approval-r1-delivery-report.md', 'utf8')
const directory = path.resolve(`test-results/r1-delivery/${version}-${sourceCommit.slice(0, 8)}`)
await mkdir(path.dirname(directory), { recursive: true })
await mkdir(directory, { recursive: false })
const source = path.join(directory, 'source.tar.gz')
execFileSync('git', ['archive', '--format=tar.gz', '--output', source, sourceCommit])
const exported = spawn('docker', ['save', ...images], { stdio: ['ignore', 'pipe', 'inherit'] })
const exportedStatus = new Promise((resolve, reject) => { exported.on('error', reject); exported.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Docker export failed'))) })
await Promise.all([pipeline(exported.stdout, createGzip(), createWriteStream(path.join(directory, 'images.tar.gz'))), exportedStatus])
await copyFile('docs/deployment/leave-approval-r1.md', path.join(directory, 'DEPLOYMENT.md'))
await copyFile('docs/quality/leave-approval-r1-delivery-report.md', path.join(directory, 'ACCEPTANCE.md'))
const checksum = async (name) => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path.join(directory, name))) hash.update(chunk)
  return { file: name, sha256: hash.digest('hex') }
}
const files = await Promise.all(['source.tar.gz', 'images.tar.gz', 'DEPLOYMENT.md', 'ACCEPTANCE.md'].map(checksum))
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version, sourceCommit, createdAt: new Date().toISOString(), images: imageMetadata.map((item, i) => ({ name: images[i], id: item.Id, os: item.Os, architecture: item.Architecture })), files, scope: 'R1 leave approval pilot; local package, no public release' }, null, 2))
process.stdout.write(`Local pilot package created: ${directory}\n`)
