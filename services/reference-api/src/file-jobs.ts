import { randomUUID } from 'node:crypto'
import { transaction } from './database'
import { LocalObjectStore, fileDigest } from './file-storage'
import { clamavScanner } from './file-scanner'
import { audit, rows } from './support'
import type { VirusScanner } from './file-scanner'
import type { Pool } from 'pg'
import type { Actor } from './auth'

export const processFileScan = async (
  pool: Pool,
  options: { storageRoot?: string; scanner?: VirusScanner } = {}
) => {
  const root = options.storageRoot || process.env.FILE_STORAGE_DIR
  if (!root) return false
  const claim = randomUUID()
  const file = await transaction(pool, async (client) => {
    const selected = await rows<{
      tenant_id: string
      id: string
      owner_id: string
      object_key: string
      sha256: string
      size: number
      attempts: number
    }>(
      client,
      "SELECT * FROM stored_files WHERE (status IN ('scanning','scan-failed') AND next_attempt_at<=now() AND attempts<5) OR (status='processing' AND lease_until<=now() AND attempts<5) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1"
    )
    if (!selected.length) return undefined
    const value = selected[0]
    await client.query(
      "UPDATE stored_files SET status='processing',attempts=attempts+1,lease_until=now()+interval '60 seconds',claimed_by=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
      [value.tenant_id, value.id, claim]
    )
    return value
  })
  if (!file) return false
  const actor: Actor = {
    tenantId: file.tenant_id,
    userId: file.owner_id,
    name: '文件扫描服务',
    department: '',
    role: '',
    permissions: [],
    traceId: claim,
    sessionEpoch: 0,
    sessionHash: '',
  }
  try {
    const bytes = await new LocalObjectStore(root).get(file.object_key)
    if (bytes.length !== file.size || fileDigest(bytes) !== file.sha256)
      throw new Error('Object integrity')
    const scanner =
      options.scanner ||
      clamavScanner(
        process.env.CLAMAV_HOST || '127.0.0.1',
        Number(process.env.CLAMAV_PORT || 3310)
      )
    const result = await scanner(bytes)
    await transaction(pool, async (client) => {
      const changed = await client.query(
        "UPDATE stored_files SET status=$4,scan_engine=$5,scan_error=$6,lease_until=NULL,claimed_by=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND status='processing'",
        [
          file.tenant_id,
          file.id,
          claim,
          result.clean ? 'ready' : 'infected',
          result.engine.slice(0, 200),
          result.clean ? null : (result.threat || '检测到威胁').slice(0, 120),
        ]
      )
      if (changed.rowCount)
        await audit(
          client,
          actor,
          'file',
          result.clean ? 'file.scan-clean' : 'file.scan-infected',
          'file',
          file.id,
          'success',
          { engine: result.engine.slice(0, 200) }
        )
    })
  } catch {
    await transaction(pool, async (client) => {
      const changed = await client.query(
        "UPDATE stored_files SET status='scan-failed',scan_error='扫描服务不可用或文件检查失败',next_attempt_at=now()+($4::integer*interval '1 second'),lease_until=NULL,claimed_by=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND status='processing'",
        [file.tenant_id, file.id, claim, Math.min(600, 30 * 2 ** file.attempts)]
      )
      if (changed.rowCount)
        await audit(
          client,
          actor,
          'file',
          'file.scan-failed',
          'file',
          file.id,
          'failure'
        )
    })
  }
  return true
}
export const cleanupFileObjects = async (
  pool: Pool,
  root = process.env.FILE_STORAGE_DIR
) => {
  if (!root) return { expired: 0, objects: 0 }
  const expired = await pool.query(
    "UPDATE file_uploads SET status='expired',revision=revision+1 WHERE status='uploading' AND expires_at<=now()"
  )
  // Cleanup uses the upload lock shared by part writers, and only terminal uploads.
  const terminal = await pool.query<{ tenant_id: string; id: string }>(
    "SELECT tenant_id,id FROM file_uploads WHERE status IN ('completed','cancelled','expired') AND created_at<now()-interval '1 hour' ORDER BY created_at LIMIT 100"
  )
  const store = new LocalObjectStore(root)
  await terminal.rows.reduce(async (previous, upload) => {
    await previous
    await transaction(pool, async (client) => {
      await client.query(
        'SELECT id FROM file_uploads WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [upload.tenant_id, upload.id]
      )
      const parts = await rows<{ object_key: string }>(
        client,
        'SELECT object_key FROM file_parts WHERE tenant_id=$1 AND upload_id=$2',
        [upload.tenant_id, upload.id]
      )
      await parts.reduce(async (before, part) => {
        await before
        await store.remove(part.object_key)
      }, Promise.resolve())
      await client.query(
        'DELETE FROM file_parts WHERE tenant_id=$1 AND upload_id=$2',
        [upload.tenant_id, upload.id]
      )
    })
  }, Promise.resolve())
  const referenced = await pool.query<{ object_key: string }>(
    "SELECT object_key FROM stored_files WHERE status<>'deleted' UNION SELECT object_key FROM file_parts"
  )
  const keys = new Set(referenced.rows.map((row) => row.object_key))
  const old = await store.objectsOlderThan(new Date(Date.now() - 86400000))
  const orphaned = old.filter((key) => !keys.has(key))
  await orphaned.reduce(async (previous, key) => {
    await previous
    await store.remove(key)
  }, Promise.resolve())
  await pool.query(
    "UPDATE stored_files SET status='scan-failed',claimed_by=NULL,lease_until=NULL,scan_error='扫描重试次数已用尽',revision=revision+1 WHERE status='processing' AND lease_until<=now() AND attempts>=5"
  )
  return { expired: expired.rowCount || 0, objects: orphaned.length }
}
export const startFileWorker = (pool: Pool) => {
  let pending: Promise<unknown> | undefined
  let stopped = false
  let nextCleanup = 0
  const tick = () => {
    if (stopped || pending) return
    pending = (async () => {
      try {
        await processFileScan(pool)
        if (Date.now() > nextCleanup) {
          await cleanupFileObjects(pool)
          nextCleanup = Date.now() + 3600000
        }
      } catch {
        // A failed external dependency must not stop the durable queue or log file contents.
      }
    })().finally(() => {
      pending = undefined
    })
  }
  const timer = setInterval(tick, 1000)
  tick()
  return async () => {
    stopped = true
    clearInterval(timer)
    await pending
  }
}
