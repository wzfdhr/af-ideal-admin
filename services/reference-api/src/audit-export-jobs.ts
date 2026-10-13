import { randomUUID } from 'node:crypto'
import { mkdir, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import {
  DomainError,
  AUDIT_EXPORT_FORMATS,
  AUDIT_EXPORT_MAX_FILE_BYTES,
} from '@af-admin/contracts'
import { transaction } from './database'
import { one, rows, sequential, noFault } from './support'
import { LocalObjectStore, fileDigest } from './file-storage'
import { clamavScanner } from './file-scanner'
import {
  generateAuditExport,
  auditExportFormatAvailable,
} from './audit-export-generators'
import {
  assertAuditExportOrigin,
  auditExportFactActor,
  appendAuditExportEvent,
} from './audit-export-access'
import type { AuditExportJobRow } from './audit-export-access'
import type { Pool, PoolClient } from 'pg'
import type { FileRuntime } from './files'
import type { FaultInjector } from './support'

export interface AuditExportWorkerScope {
  readonly tenantId: string
  readonly jobIds: readonly string[]
}
export const auditExportStore = (files: FileRuntime) => {
  const root = files.storageRoot || process.env.FILE_STORAGE_DIR
  if (!root)
    throw new DomainError(
      503,
      'AUDIT_EXPORT_STORAGE_UNAVAILABLE',
      '审计导出存储未配置'
    )
  return new LocalObjectStore(root)
}
const scanner = () =>
  clamavScanner(
    process.env.CLAMAV_HOST || '127.0.0.1',
    Number(process.env.CLAMAV_PORT || 3310)
  )
export const auditExportCapabilities = async (files: FileRuntime = {}) => {
  let reason: string | null = null
  try {
    const store = auditExportStore(files)
    await mkdir(store.root, { recursive: true, mode: 0o700 })
    await access(store.root, constants.W_OK)
    const scan = await scanner()(
      Buffer.from('AF audit export scanner readiness\n')
    )
    if (!scan.clean || !scan.engine.startsWith('ClamAV '))
      throw new Error('Scan unavailable')
  } catch {
    reason = '审计导出存储或真实ClamAV扫描当前不可用'
  }
  const formats: {
    format: (typeof AUDIT_EXPORT_FORMATS)[number]
    available: boolean
    reason: string | null
  }[] = []
  await sequential([...AUDIT_EXPORT_FORMATS], async (format) => {
    const ability = await auditExportFormatAvailable(format)
    formats.push({
      format,
      available: !reason && ability.available,
      reason: reason || ability.reason,
    })
  })
  return { formats }
}
const validateScope = async (
  pool: Pool,
  input: AuditExportWorkerScope | undefined
) => {
  if (input === undefined) return undefined
  if (
    !input ||
    typeof input !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw new Error('Invalid audit export maintenance scope')
  Reflect.ownKeys(input).forEach((key) => {
    const d = Object.getOwnPropertyDescriptor(input, key)
    if (
      typeof key !== 'string' ||
      !['tenantId', 'jobIds'].includes(key) ||
      !d?.enumerable ||
      !('value' in d)
    )
      throw new Error('Invalid audit export maintenance scope')
  })
  const ids = input.jobIds
  if (
    typeof input.tenantId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(input.tenantId) ||
    !Array.isArray(ids) ||
    Object.getPrototypeOf(ids) !== Array.prototype ||
    !ids.length ||
    ids.length > 200 ||
    Reflect.ownKeys(ids).some(
      (key) =>
        key !== 'length' &&
        (typeof key !== 'string' ||
          !/^(0|[1-9]\d*)$/.test(key) ||
          Number(key) >= ids.length)
    )
  )
    throw new Error('Invalid audit export maintenance scope')
  const copied = Array.from({ length: ids.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(ids, String(index))
    if (
      !descriptor?.enumerable ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(descriptor.value)
    )
      throw new Error('Invalid audit export maintenance scope')
    return descriptor.value as string
  })
  if (new Set(copied).size !== copied.length)
    throw new Error('Invalid audit export maintenance scope')
  const scope = Object.freeze({
    tenantId: input.tenantId,
    jobIds: Object.freeze(copied),
  })
  const count = one(
    await rows<{ n: number }>(
      pool,
      'SELECT count(*)::int AS n FROM audit_export_jobs WHERE tenant_id=$1 AND id=ANY($2::text[])',
      [scope.tenantId, scope.jobIds]
    )
  ).n
  if (count !== scope.jobIds.length)
    throw new Error('Audit export scope must name existing same-tenant jobs')
  return scope
}
const fenced = <T>(
  pool: Pool,
  job: AuditExportJobRow,
  claim: string,
  run: (db: PoolClient, current: AuditExportJobRow) => Promise<T>
) =>
  transaction(pool, async (db) => {
    const current = (
      await rows<AuditExportJobRow>(
        db,
        "SELECT * FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2 AND status='processing' AND claimed_by=$3 AND lease_until>clock_timestamp() AND retention_until>clock_timestamp() FOR UPDATE",
        [job.tenant_id, job.id, claim]
      )
    )[0]
    if (!current)
      throw new DomainError(
        409,
        'AUDIT_EXPORT_FENCE_LOST',
        '审计导出租约已失效'
      )
    await assertAuditExportOrigin(db, current, claim)
    const result = await run(db, current)
    const valid = one(
      await rows<{ valid: boolean }>(
        db,
        'SELECT lease_until>clock_timestamp() AND retention_until>clock_timestamp() AS valid FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2',
        [job.tenant_id, job.id]
      )
    )
    // A successful terminal transition clears its lease; completion checks it in its own UPDATE.
    if (!valid.valid) {
      const state = one(
        await rows<{ status: string }>(
          db,
          'SELECT status FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2',
          [job.tenant_id, job.id]
        )
      )
      if (state.status === 'processing')
        throw new DomainError(
          409,
          'AUDIT_EXPORT_FENCE_LOST',
          '审计导出租约已失效'
        )
    }
    return result
  })
const claimNext = (pool: Pool, scope: AuditExportWorkerScope | undefined) =>
  transaction(pool, async (db) => {
    const job = (
      await rows<AuditExportJobRow>(
        db,
        "SELECT j.* FROM audit_export_jobs j JOIN tenants t ON t.id=j.tenant_id AND t.status='enabled' WHERE j.retention_until>clock_timestamp() AND ((j.status='queued' AND j.next_attempt_at<=clock_timestamp()) OR (j.status='processing' AND j.lease_until<=clock_timestamp())) AND ($1::text IS NULL OR (j.tenant_id=$1 AND j.id=ANY($2::text[]))) ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1",
        [scope?.tenantId || null, scope?.jobIds || null]
      )
    )[0]
    if (!job) return null
    const claim = randomUUID()
    const actor = auditExportFactActor(job, claim)
    let blocked = false
    try {
      await assertAuditExportOrigin(db, job, claim)
    } catch (error) {
      if (!(error instanceof DomainError)) throw error
      blocked = true
    }
    if (blocked || job.attempts >= 5) {
      const code = blocked
        ? 'AUDIT_EXPORT_CURRENT_ACCESS_REQUIRED'
        : 'AUDIT_EXPORT_ATTEMPTS_EXHAUSTED'
      await db.query(
        "UPDATE audit_export_jobs SET status=$3,stage='stopped',claimed_by=NULL,lease_until=NULL,error_code=$4,error_message='审计导出当前不能执行',revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
        [job.tenant_id, job.id, blocked ? 'blocked' : 'failed', code]
      )
      await appendAuditExportEvent(
        db,
        actor,
        job.id,
        blocked ? 'blocked' : 'attempts-exhausted',
        { code, attempt: job.attempts },
        true
      )
      return { job, claim, stopped: true }
    }
    const current = one(
      await rows<AuditExportJobRow>(
        db,
        "UPDATE audit_export_jobs SET status='processing',stage='rendering',attempts=attempts+1,claimed_by=$3,lease_until=clock_timestamp()+interval '90 seconds',revision=revision+1,updated_at=clock_timestamp(),error_code=NULL,error_message=NULL WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [job.tenant_id, job.id, claim]
      )
    )
    await appendAuditExportEvent(db, actor, job.id, 'claimed', {
      attempt: current.attempts,
      stage: 'rendering',
    })
    return { job: current, claim, stopped: false }
  })
const failClaim = (
  pool: Pool,
  job: AuditExportJobRow,
  claim: string,
  error: unknown
) =>
  transaction(pool, async (db) => {
    const current = (
      await rows<AuditExportJobRow>(
        db,
        "SELECT * FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND status='processing' AND lease_until>clock_timestamp() FOR UPDATE",
        [job.tenant_id, job.id, claim]
      )
    )[0]
    if (!current) return
    const domain = error instanceof DomainError ? error : null
    const blocked =
      !!domain &&
      ([403, 404].includes(domain.status) ||
        domain.businessCode === 'AUDIT_EXPORT_SNAPSHOT_INVALID')
    const terminal = blocked || domain?.status === 422 || current.attempts >= 5
    let code = 'AUDIT_EXPORT_EXECUTION_FAILED'
    if (blocked) code = 'AUDIT_EXPORT_CURRENT_ACCESS_REQUIRED'
    else if (domain?.status === 422) code = 'AUDIT_EXPORT_GENERATION_REJECTED'
    const terminalStatus = blocked ? 'blocked' : 'failed'
    await db.query(
      "UPDATE audit_export_jobs SET status=$4,stage=$5,claimed_by=NULL,lease_until=NULL,error_code=$6,error_message='审计导出生成、存储或扫描未完成，制品不可下载',next_attempt_at=clock_timestamp()+($7::integer*interval '1 second'),revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3",
      [
        job.tenant_id,
        job.id,
        claim,
        terminal ? terminalStatus : 'queued',
        terminal ? 'stopped' : 'queued',
        code,
        Math.min(300, 5 * 2 ** current.attempts),
      ]
    )
    await appendAuditExportEvent(
      db,
      auditExportFactActor(job, claim),
      job.id,
      terminal ? terminalStatus : 'retry-scheduled',
      { code, attempt: current.attempts },
      true
    )
  })
const expireScoped = async (
  pool: Pool,
  files: FileRuntime,
  scope: AuditExportWorkerScope | undefined
) => {
  const found = await rows<AuditExportJobRow>(
    pool,
    'SELECT * FROM audit_export_jobs WHERE retention_until<=clock_timestamp() AND bytes_purged_at IS NULL AND ($1::text IS NULL OR(tenant_id=$1 AND id=ANY($2::text[]))) ORDER BY created_at,id LIMIT 100',
    [scope?.tenantId || null, scope?.jobIds || null]
  )
  await sequential(found, async (job) => {
    const expired = await transaction(pool, async (db) => {
      const current = one(
        await rows<AuditExportJobRow>(
          db,
          'SELECT * FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [job.tenant_id, job.id]
        )
      )
      const { due } = one(
        await rows<{ due: boolean }>(
          db,
          'SELECT retention_until<=clock_timestamp() AS due FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2',
          [job.tenant_id, job.id]
        )
      )
      if (!due) return false
      if (!current.expired_at) {
        await db.query(
          "UPDATE audit_export_jobs SET status='expired',stage='stopped',expired_at=clock_timestamp(),claimed_by=NULL,lease_until=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
          [job.tenant_id, job.id]
        )
        await db.query(
          "UPDATE audit_export_artifacts SET status='expired',expired_at=clock_timestamp() WHERE tenant_id=$1 AND job_id=$2 AND status<>'expired'",
          [job.tenant_id, job.id]
        )
        await appendAuditExportEvent(
          db,
          auditExportFactActor(job, randomUUID()),
          job.id,
          'expired'
        )
      }
      return true
    })
    if (!expired) return
    // The durable expiry fence commits before irreversible byte deletion. A crash
    // after removal retries safely without reviving bytes or duplicating history.
    await transaction(pool, async (db) => {
      one(
        await rows(
          db,
          "SELECT id FROM audit_export_jobs WHERE tenant_id=$1 AND id=$2 AND status='expired' FOR UPDATE",
          [job.tenant_id, job.id]
        )
      )
      await auditExportStore(files).remove(job.object_key)
      await db.query(
        "UPDATE audit_export_artifacts SET purged_at=COALESCE(purged_at,clock_timestamp()) WHERE tenant_id=$1 AND job_id=$2 AND status='expired'",
        [job.tenant_id, job.id]
      )
      await db.query(
        'UPDATE audit_export_jobs SET bytes_purged_at=COALESCE(bytes_purged_at,clock_timestamp()) WHERE tenant_id=$1 AND id=$2',
        [job.tenant_id, job.id]
      )
    })
  })
  return found.length
}
export const expireAuditExports = async (
  pool: Pool,
  files: FileRuntime = {},
  requestedScope: AuditExportWorkerScope | undefined = undefined
) => expireScoped(pool, files, await validateScope(pool, requestedScope))
export const processAuditExports = async (
  pool: Pool,
  files: FileRuntime = {},
  fault: FaultInjector = noFault,
  batchSize = 10,
  requestedScope: AuditExportWorkerScope | undefined = undefined
): Promise<number> => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error('Invalid audit export batch size')
  const scope = await validateScope(pool, requestedScope)
  if (!files.storageRoot && !process.env.FILE_STORAGE_DIR) return 0
  await expireScoped(pool, files, scope)
  const store = auditExportStore(files)
  let processed = 0
  let done = false
  await sequential(Array.from({ length: batchSize }), async () => {
    if (done) return
    const claimed = await claimNext(pool, scope)
    if (!claimed) {
      done = true
      return
    }
    processed += 1
    if (claimed.stopped) return
    const { job, claim } = claimed
    let renewing: Promise<unknown> | undefined
    const heartbeat = setInterval(() => {
      if (renewing) return
      renewing = pool
        .query(
          "UPDATE audit_export_jobs SET lease_until=clock_timestamp()+interval '90 seconds' WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND status='processing' AND lease_until>clock_timestamp() AND retention_until>clock_timestamp()",
          [job.tenant_id, job.id, claim]
        )
        .catch(() => undefined)
        .finally(() => {
          renewing = undefined
        })
    }, 20000)
    heartbeat.unref()
    try {
      await fault('audit-export.after-claim')
      await fenced(pool, job, claim, async () => undefined)
      const generated = await generateAuditExport(job.format, job.snapshot)
      if (
        !Buffer.isBuffer(generated.bytes) ||
        generated.bytes.length < 1 ||
        generated.bytes.length > AUDIT_EXPORT_MAX_FILE_BYTES ||
        !/^[A-Za-z0-9_.-]{1,120}$/.test(generated.fileName)
      )
        throw new DomainError(
          422,
          'AUDIT_EXPORT_OUTPUT_INVALID',
          '审计导出字节无效'
        )
      await fenced(pool, job, claim, async (db) => {
        await store.put(generated.bytes, job.object_key)
        await fault('audit-export.after-write')
        await db.query(
          "UPDATE audit_export_jobs SET stage='scanning',processed_rows=total_rows,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3",
          [job.tenant_id, job.id, claim]
        )
        await appendAuditExportEvent(
          db,
          auditExportFactActor(job, claim),
          job.id,
          'rendered',
          { stage: 'scanning', attempt: job.attempts }
        )
      })
      const scanned = await fenced(pool, job, claim, async () =>
        scanner()(generated.bytes)
      )
      if (!scanned.engine.startsWith('ClamAV '))
        throw new Error('Real ClamAV identity required')
      await fault('audit-export.after-scan')
      await fenced(pool, job, claim, async (db) => {
        fault('audit-export.before-completion')
        const artifactId = randomUUID()
        await db.query(
          'INSERT INTO audit_export_artifacts(tenant_id,id,job_id,object_key,file_name,mime_type,size,sha256,status,scan_engine,scanned_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp(),(SELECT retention_until FROM audit_export_jobs WHERE tenant_id=$1 AND id=$3))',
          [
            job.tenant_id,
            artifactId,
            job.id,
            job.object_key,
            generated.fileName,
            generated.mimeType,
            generated.bytes.length,
            fileDigest(generated.bytes),
            scanned.clean ? 'ready' : 'quarantined',
            scanned.engine.slice(0, 200),
          ]
        )
        const changed = await rows(
          db,
          'UPDATE audit_export_jobs SET status=$4,stage=$5,artifact_id=$6,completed_at=clock_timestamp(),processed_rows=total_rows,claimed_by=NULL,lease_until=NULL,error_code=$7,error_message=$8,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND lease_until>clock_timestamp() AND retention_until>clock_timestamp() RETURNING id',
          [
            job.tenant_id,
            job.id,
            claim,
            scanned.clean ? 'completed' : 'infected',
            scanned.clean ? 'completed' : 'stopped',
            artifactId,
            scanned.clean ? null : 'AUDIT_EXPORT_INFECTED',
            scanned.clean ? null : '真实ClamAV检测到威胁，制品已隔离',
          ]
        )
        if (!changed.length)
          throw new DomainError(
            409,
            'AUDIT_EXPORT_FENCE_LOST',
            '审计导出租约已失效'
          )
        await appendAuditExportEvent(
          db,
          auditExportFactActor(job, claim),
          job.id,
          scanned.clean ? 'completed' : 'infected',
          { stage: scanned.clean ? 'completed' : 'stopped' },
          !scanned.clean
        )
        fault('audit-export.before-commit')
      })
      fault('audit-export.after-commit')
    } catch (error) {
      await failClaim(pool, job, claim, error)
    } finally {
      clearInterval(heartbeat)
      await renewing
    }
  })
  return processed
}
export const startAuditExportWorker = (pool: Pool, files: FileRuntime = {}) => {
  let closed = false
  let pending: Promise<unknown> | undefined
  const tick = () => {
    if (closed || pending) return
    pending = processAuditExports(pool, files)
      .catch(() => undefined)
      .finally(() => {
        pending = undefined
      })
  }
  const timer = setInterval(tick, 1000)
  timer.unref()
  tick()
  return async () => {
    closed = true
    clearInterval(timer)
    await pending
  }
}
