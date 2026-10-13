import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, stat, readdir, readFile, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocalObjectStore, fileDigest } from '../../services/reference-api/dist/file-storage.js'

const modulePath = fileURLToPath(new URL('../../services/reference-api/dist/file-storage.js', import.meta.url))
const roots = [
  { name: 'system temporary filesystem', parent: tmpdir() },
  { name: 'workspace filesystem', parent: fileURLToPath(new URL('../../test-results/', import.meta.url)) },
]
const childCode = `
const fs = require('node:fs/promises');
const originalOpen = fs.open;
fs.open = async (...args) => {
  const handle = await originalOpen(...args);
  handle.writeFile = async (bytes) => {
    await handle.write(bytes.subarray(0,32768));
    await handle.sync();
    process.send({ stage: 'partial-written' });
    await new Promise(() => {});
  };
  return handle;
};
setInterval(() => {},1000);
const { LocalObjectStore } = require(process.argv[2]);
new LocalObjectStore(process.argv[3]).put(Buffer.alloc(8*1024*1024,91),process.argv[4]).catch(() => process.exit(2));
`

for (const environment of roots) {
  test(`atomic object publication preserves old files and rejects competing bytes on ${environment.name}`, async () => {
    const root = await mkdtemp(path.join(environment.parent, 'af-storage-atomic-'))
    const store = new LocalObjectStore(root)
    try {
      const legacy = Buffer.from('旧文件-unchanged')
      const oldKey = fileDigest(Buffer.from('old-key'))
      await writeFile(path.join(root, oldKey), legacy)
      await store.put(legacy, oldKey)
      assert.deepEqual(await store.get(oldKey), legacy)
      assert.equal((await stat(path.join(root, oldKey))).isFile(), true)
      await assert.rejects(store.put(Buffer.from('replacement'), oldKey), { businessCode: 'STORAGE_CONFLICT' })
      assert.deepEqual(await store.get(oldKey), legacy)

      const key = fileDigest(Buffer.from('same-bytes-key'))
      const bytes = Buffer.alloc(1024 * 1024, 87)
      await Promise.all(Array.from({ length: 5 }, () => store.put(bytes, key)))
      assert.deepEqual(await store.get(key), bytes)
      assert.equal((await stat(path.join(root, key))).isDirectory(), true)
      assert.deepEqual((await readdir(path.join(root, key))).filter((name) => !name.startsWith('._')), ['content'])
      assert.equal((await readdir(root)).filter((name) => /^\.[a-f0-9]{64}\.[a-f0-9-]{36}\.staging$/.test(name)).length, 0)

      const raceKey = fileDigest(Buffer.from('conflicting-key'))
      const candidates = [Buffer.alloc(1024 * 1024, 1), Buffer.alloc(1024 * 1024, 2)]
      const attempts = await Promise.allSettled(candidates.map((value) => store.put(value, raceKey)))
      const winner = attempts.findIndex((result) => result.status === 'fulfilled')
      assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1)
      assert.equal(attempts[1 - winner].reason.businessCode, 'STORAGE_CONFLICT')
      assert.deepEqual(await store.get(raceKey), candidates[winner])
      await store.remove(raceKey)
      await store.remove(oldKey)
      await assert.rejects(store.get(oldKey), { businessCode: 'STORAGE_UNAVAILABLE' })
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  test(`real SIGKILL during a partial write leaves no canonical object and the next process can publish on ${environment.name}`, { timeout: 30000 }, async () => {
    const root = await mkdtemp(path.join(environment.parent, 'af-storage-killed-'))
    const store = new LocalObjectStore(root)
    const key = fileDigest(Buffer.from('killed-key'))
    const childFile = path.join(root, 'writer.cjs')
    let child
    try {
      await writeFile(childFile, childCode)
      child = fork(childFile, [modulePath, root, key], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
      const timeout = setTimeout(() => child.kill('SIGKILL'), 15000)
      try {
        const [message] = await Promise.race([
          once(child, 'message', { signal: AbortSignal.timeout(15000) }),
          once(child, 'exit').then(() => { throw new Error('Writer exited before the physical partial-write checkpoint') }),
        ])
        assert.equal(message.stage, 'partial-written')
        const exited = once(child, 'exit')
        child.kill('SIGKILL')
        assert.deepEqual(await exited, [null, 'SIGKILL'])
      } finally { clearTimeout(timeout) }
      await assert.rejects(store.get(key), { businessCode: 'STORAGE_UNAVAILABLE' })
      const staging = (await readdir(root)).find((name) => /^\.[a-f0-9]{64}\.[a-f0-9-]{36}\.staging$/.test(name))
      assert.ok(staging)
      assert.equal((await readFile(path.join(root, staging, 'content'))).length, 32768)

      const recoveryFile = path.join(root, 'recovery.cjs')
      await writeFile(recoveryFile, `const {LocalObjectStore}=require(process.argv[2]);new LocalObjectStore(process.argv[3]).put(Buffer.alloc(8*1024*1024,91),process.argv[4]).catch(()=>process.exit(2));`)
      const recovery = fork(recoveryFile, [modulePath, root, key], { stdio: 'ignore' })
      const [code, signal] = await once(recovery, 'exit')
      assert.equal(code, 0)
      assert.equal(signal, null)
      assert.deepEqual(await store.get(key), Buffer.alloc(8 * 1024 * 1024, 91))
      assert.equal(await store.cleanupStaging(new Date(Date.now() - 86400000)), 0)
      await utimes(path.join(root, staging), new Date(0), new Date(0))
      assert.equal(await store.cleanupStaging(new Date(Date.now() - 86400000)), 1)
      assert.deepEqual(await store.get(key), Buffer.alloc(8 * 1024 * 1024, 91))
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await rm(root, { recursive: true, force: true })
    }
  })
}
