import { randomUUID } from 'node:crypto'
import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import {
  DomainError,
  REPORT_EXPORT_FORMATS,
  REPORT_EXPORT_MAX_FILE_BYTES,
} from '@af-admin/contracts'
import { transaction } from './database'
import { rows, audit, noFault, sequential } from './support'
import { LocalObjectStore, fileDigest } from './file-storage'
import { clamavScanner } from './file-scanner'
import {
  generateReportExport,
  reportExportFormatAvailable,
} from './report-export-generators'
import {
  appendReportExportEvent,
  assertReportExportOrigin,
  reportExportFactActor,
} from './report-export-access'
import type { Pool } from 'pg'
import type { VirusScanner } from './file-scanner'
import type { FaultInjector } from './support'
import type {
  ReportExportJobRow,
  ReportExportArtifactRow,
} from './report-export-access'
import type { ReportingExportCapability } from '@af-admin/contracts'

export interface ReportExportRuntime {
  storageRoot?: string
  scanner?: VirusScanner
}
export const REPORT_EXPORT_MAINTENANCE_SCOPE_VERSION = 1
// Trusted maintenance callers only; this value is never accepted from HTTP.
export interface ReportExportWorkerScope {
  readonly tenantId: string
  readonly jobIds: readonly string[]
}
type FrozenReportExportWorkerScope = Readonly<{
  tenantId: string
  jobIds: readonly string[]
}>
const maintenanceScope = (
  value: ReportExportWorkerScope | undefined
): FrozenReportExportWorkerScope | undefined => {
  if (value === undefined) return undefined
  const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== 2 ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== 'string' || !['tenantId', 'jobIds'].includes(key)
    )
  )
    throw new Error('Invalid report export maintenance scope')
  const tenant = Object.getOwnPropertyDescriptor(value, 'tenantId')
  const jobs = Object.getOwnPropertyDescriptor(value, 'jobIds')
  if (
    !tenant ||
    !('value' in tenant) ||
    typeof tenant.value !== 'string' ||
    !identifier.test(tenant.value) ||
    !jobs ||
    !('value' in jobs) ||
    !Array.isArray(jobs.value)
  )
    throw new Error('Invalid report export maintenance scope')
  const jobIds = [...jobs.value]
  if (
    jobIds.length < 1 ||
    jobIds.length > 200 ||
    jobIds.some((id) => typeof id !== 'string' || !identifier.test(id)) ||
    new Set(jobIds).size !== jobIds.length
  )
    throw new Error('Invalid report export maintenance scope')
  return Object.freeze({
    tenantId: tenant.value,
    jobIds: Object.freeze(jobIds),
  })
}
const validatedMaintenanceScope = async (
  pool: Pool,
  requested: ReportExportWorkerScope | undefined
) => {
  const scope = maintenanceScope(requested)
  if (!scope) return undefined
  const actual = (
    await rows<{ total: number }>(
      pool,
      'SELECT count(*)::int AS total FROM report_export_jobs WHERE tenant_id=$1 AND id=ANY($2::text[])',
      [scope.tenantId, scope.jobIds]
    )
  )[0]
  if (!actual || actual.total !== scope.jobIds.length)
    throw new Error(
      'Maintenance scope must reference existing report export jobs in the specified tenant'
    )
  return scope
}
export const reportExportStore = (runtime: ReportExportRuntime) => {
  const root = runtime.storageRoot || process.env.FILE_STORAGE_DIR
  if (!root)
    throw new DomainError(
      503,
      'REPORT_EXPORT_STORAGE_UNAVAILABLE',
      '导出对象存储未配置'
    )
  return new LocalObjectStore(root)
}
export const reportExportScanner = (runtime: ReportExportRuntime) =>
  runtime.scanner ||
  clamavScanner(
    process.env.CLAMAV_HOST || '127.0.0.1',
    Number(process.env.CLAMAV_PORT || 3310)
  )
export const reportExportCapabilities = async (
  runtime: ReportExportRuntime
): Promise<{ formats: ReportingExportCapability[] }> => {
  let reason: string | null = null
  try {
    const store = reportExportStore(runtime)
    await mkdir(store.root, { recursive: true, mode: 0o700 })
    await access(store.root, constants.W_OK)
    const scanned = await reportExportScanner(runtime)(
      Buffer.from('AF report export scanner readiness\n')
    )
    if (!scanned.clean || !scanned.engine.startsWith('ClamAV '))
      throw new Error('Scanner unavailable')
  } catch (error) {
    reason =
      error instanceof DomainError
        ? error.message
        : '对象存储或真实ClamAV扫描服务当前不可用'
  }
  const formats: ReportingExportCapability[] = []
  await sequential([...REPORT_EXPORT_FORMATS], async (format) => {
    const capability = await reportExportFormatAvailable(format)
    const formatReason = reason || capability.reason
    formats.push({
      format,
      available: !formatReason && capability.available,
      reason: formatReason,
    })
  })
  return { formats }
}

const stopped = (code: string, message: string) =>
  new DomainError(409, code, message)
const fenced = async (
  pool: Pool,
  job: ReportExportJobRow,
  claim: string,
  run: (
    client: import('pg').PoolClient,
    current: ReportExportJobRow
  ) => Promise<void>
) =>
  transaction(pool, async (client) => {
    // Shares the tenant ACL mutation gate with all current-right checks.
    await client.query('SELECT id FROM tenants WHERE id=$1 FOR SHARE', [
      job.tenant_id,
    ])
    const selected = await rows<ReportExportJobRow>(
      client,
      "SELECT * FROM report_export_jobs WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND status='processing' AND lease_until>now() AND retention_until>now() FOR UPDATE",
      [job.tenant_id, job.id, claim]
    )
    if (!selected.length)
      throw stopped('REPORT_EXPORT_FENCE_LOST', '导出租约已结束或任务已取消')
    await run(client, selected[0])
  })
const claimNext = (
  pool: Pool,
  fault: FaultInjector = noFault,
  scope: FrozenReportExportWorkerScope | undefined = undefined
) =>
  transaction(pool, async (client) => {
    const selected = await rows<ReportExportJobRow>(
      client,
      "SELECT * FROM report_export_jobs WHERE retention_until>now() AND ((status='queued' AND next_attempt_at<=now()) OR (status='processing' AND lease_until<=now())) AND ($1::text IS NULL OR (tenant_id=$1 AND id=ANY($2::text[]))) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
      [scope?.tenantId ?? null, scope?.jobIds ?? null]
    )
    if (!selected.length) return null
    const job = selected[0]
    const actor = reportExportFactActor(job, randomUUID())
    if (job.attempts >= 5) {
      await client.query(
        "UPDATE report_export_jobs SET status='failed',stage='stopped',claimed_by=NULL,lease_until=NULL,error_code='REPORT_EXPORT_ATTEMPTS_EXHAUSTED',error_message='导出执行已达到5次上限',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [job.tenant_id, job.id]
      )
      await appendReportExportEvent(
        client,
        actor,
        job.id,
        'attempts-exhausted',
        { code: 'REPORT_EXPORT_ATTEMPTS_EXHAUSTED', attempt: job.attempts }
      )
      await audit(
        client,
        actor,
        'report-export',
        'report-export.attempts-exhausted',
        'report-export',
        job.id,
        'failure',
        { attempt: job.attempts }
      )
      fault('report-export.attempts-exhausted.before-commit')
      return { exhausted: true as const, job, claim: '' }
    }
    const claim = randomUUID()
    const updated = (
      await rows<ReportExportJobRow>(
        client,
        "UPDATE report_export_jobs SET status='processing',stage='rendering',attempts=attempts+1,claimed_by=$3,lease_until=now()+interval '90 seconds',revision=revision+1,updated_at=now(),error_code=NULL,error_message=NULL WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [job.tenant_id, job.id, claim]
      )
    )[0]
    await appendReportExportEvent(client, actor, job.id, 'claimed', {
      stage: 'rendering',
      attempt: updated.attempts,
    })
    await audit(
      client,
      actor,
      'report-export',
      'report-export.claimed',
      'report-export',
      job.id,
      'success',
      { attempt: updated.attempts }
    )
    return { exhausted: false as const, job: updated, claim }
  })
const failClaim = (
  pool: Pool,
  job: ReportExportJobRow,
  claim: string,
  error: unknown
) =>
  transaction(pool, async (client) => {
    const selected = await rows<ReportExportJobRow>(
      client,
      "SELECT * FROM report_export_jobs WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND status='processing' FOR UPDATE",
      [job.tenant_id, job.id, claim]
    )
    if (!selected.length) return
    const current = selected[0]
    const domain = error instanceof DomainError ? error : null
    const blocked =
      domain &&
      (domain.status === 403 ||
        domain.status === 404 ||
        [
          'REPORT_DISABLED',
          'REPORT_SOURCE_UNAVAILABLE',
          'REPORT_EXPORT_SNAPSHOT_INVALID',
        ].includes(domain.businessCode))
    const permanent = !!domain && domain.status === 422
    const terminal = blocked || permanent || current.attempts >= 5
    const status = blocked ? 'blocked' : 'failed'
    const action = terminal ? status : 'retry-scheduled'
    const code = domain?.businessCode || 'REPORT_EXPORT_EXECUTION_FAILED'
    const message =
      domain?.message || '导出生成、存储或真实扫描失败，制品未获准下载'
    await client.query(
      "UPDATE report_export_jobs SET status=$4,stage=$5,claimed_by=NULL,lease_until=NULL,error_code=$6,error_message=$7,next_attempt_at=now()+($8::integer*interval '1 second'),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3",
      [
        job.tenant_id,
        job.id,
        claim,
        terminal ? status : 'queued',
        terminal ? 'stopped' : 'queued',
        code,
        message.slice(0, 300),
        Math.min(300, 5 * 2 ** current.attempts),
      ]
    )
    const actor = reportExportFactActor(job, claim)
    await appendReportExportEvent(client, actor, job.id, action, {
      code,
      attempt: current.attempts,
    })
    await audit(
      client,
      actor,
      'report-export',
      `report-export.${action}`,
      'report-export',
      job.id,
      'failure',
      { code, attempt: current.attempts }
    )
  })

const expireReportExportsInScope = async (
  pool: Pool,
  runtime: ReportExportRuntime,
  scope: FrozenReportExportWorkerScope | undefined
) => {
  const expired = await transaction(pool, async (client) => {
    const jobs = await rows<ReportExportJobRow>(
      client,
      "SELECT j.* FROM report_export_jobs j WHERE j.retention_until<=now() AND (j.status IN('queued','processing') OR EXISTS(SELECT 1 FROM report_export_artifacts a WHERE a.tenant_id=j.tenant_id AND a.job_id=j.id AND a.status<>'expired')) AND ($1::text IS NULL OR (j.tenant_id=$1 AND j.id=ANY($2::text[]))) ORDER BY j.retention_until,j.id FOR UPDATE SKIP LOCKED LIMIT 100",
      [scope?.tenantId ?? null, scope?.jobIds ?? null]
    )
    await sequential(jobs, async (job) => {
      const actor = reportExportFactActor(job, randomUUID())
      await client.query(
        "UPDATE report_export_artifacts SET status='expired',expired_at=now() WHERE tenant_id=$1 AND job_id=$2 AND status<>'expired'",
        [job.tenant_id, job.id]
      )
      if (['queued', 'processing'].includes(job.status))
        await client.query(
          "UPDATE report_export_jobs SET status='failed',stage='stopped',claimed_by=NULL,lease_until=NULL,error_code='REPORT_EXPORT_EXPIRED',error_message='导出任务保留期已结束',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [job.tenant_id, job.id]
        )
      await appendReportExportEvent(client, actor, job.id, 'expired', {
        code: 'REPORT_EXPORT_EXPIRED',
      })
      await audit(
        client,
        actor,
        'report-export',
        'report-export.expired',
        'report-export',
        job.id
      )
    })
    return jobs.length
  })
  const store = reportExportStore(runtime)
  const pending = await rows<ReportExportArtifactRow>(
    pool,
    "SELECT * FROM report_export_artifacts WHERE status='expired' AND purged_at IS NULL AND ($1::text IS NULL OR (tenant_id=$1 AND job_id=ANY($2::text[]))) ORDER BY expired_at,id LIMIT 100",
    [scope?.tenantId ?? null, scope?.jobIds ?? null]
  )
  await sequential(pending, async (artifact) => {
    await transaction(pool, async (client) => {
      await client.query(
        'SELECT id FROM report_export_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [artifact.tenant_id, artifact.job_id]
      )
      const current = await rows<ReportExportArtifactRow>(
        client,
        "SELECT * FROM report_export_artifacts WHERE tenant_id=$1 AND job_id=$2 AND id=$3 AND status='expired' AND purged_at IS NULL FOR UPDATE",
        [artifact.tenant_id, artifact.job_id, artifact.id]
      )
      if (!current.length) return
      await store.remove(current[0].object_key)
      await client.query(
        'UPDATE report_export_artifacts SET purged_at=now() WHERE tenant_id=$1 AND job_id=$2 AND id=$3',
        [artifact.tenant_id, artifact.job_id, artifact.id]
      )
    })
  })
  return expired
}

export const expireReportExports = async (
  pool: Pool,
  runtime: ReportExportRuntime = {},
  requestedScope: ReportExportWorkerScope | undefined = undefined
) =>
  expireReportExportsInScope(
    pool,
    runtime,
    await validatedMaintenanceScope(pool, requestedScope)
  )

export const processReportExports = async (
  pool: Pool,
  runtime: ReportExportRuntime = {},
  fault: FaultInjector = noFault,
  batchSize = 10,
  requestedScope: ReportExportWorkerScope | undefined = undefined
): Promise<number> => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error('Invalid report export batch size')
  const scope = await validatedMaintenanceScope(pool, requestedScope)
  if (!runtime.storageRoot && !process.env.FILE_STORAGE_DIR) return 0
  await expireReportExportsInScope(pool, runtime, scope)
  const store = reportExportStore(runtime)
  const scanner = reportExportScanner(runtime)
  let processed = 0
  let done = false
  await sequential(Array.from({ length: batchSize }), async () => {
    if (done) return
    const claimed = await claimNext(pool, fault, scope)
    if (!claimed) {
      done = true
      return
    }
    processed += 1
    if (claimed.exhausted) return
    const { job, claim } = claimed
    let renewing = false
    const heartbeat = setInterval(() => {
      if (renewing) return
      renewing = true
      pool
        .query(
          "UPDATE report_export_jobs SET lease_until=now()+interval '90 seconds' WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND status='processing' AND lease_until>now() AND retention_until>now()",
          [job.tenant_id, job.id, claim]
        )
        .catch(() => undefined)
        .finally(() => {
          renewing = false
        })
    }, 20000)
    heartbeat.unref()
    try {
      fault('report-export.after-claim')
      await fenced(pool, job, claim, async (client, current) => {
        await assertReportExportOrigin(client, current, claim)
      })
      fault('report-export.before-render')
      const generated = await generateReportExport(job.format, job.snapshot)
      if (
        !Buffer.isBuffer(generated.bytes) ||
        generated.bytes.length < 1 ||
        generated.bytes.length > REPORT_EXPORT_MAX_FILE_BYTES ||
        generated.fileName.length > 120 ||
        generated.fileName.includes('/') ||
        generated.fileName.includes('\\') ||
        Array.from(generated.fileName).some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        )
      )
        throw new DomainError(
          422,
          'REPORT_EXPORT_OUTPUT_INVALID',
          '导出生成字节或文件名无效'
        )
      await store.put(generated.bytes, job.object_key)
      fault('report-export.after-write')
      await fenced(pool, job, claim, async (client, current) => {
        await assertReportExportOrigin(client, current, claim)
        await client.query(
          "UPDATE report_export_jobs SET stage='scanning',processed_rows=total_rows,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3",
          [job.tenant_id, job.id, claim]
        )
        await appendReportExportEvent(
          client,
          reportExportFactActor(job, claim),
          job.id,
          'rendered',
          { stage: 'scanning', attempt: job.attempts }
        )
      })
      const scanned = await scanner(generated.bytes)
      if (!scanned.engine.startsWith('ClamAV '))
        throw new Error('Real ClamAV scan identity required')
      fault('report-export.after-scan')
      await fenced(pool, job, claim, async (client, current) => {
        await assertReportExportOrigin(client, current, claim)
        fault('report-export.before-completion')
        const artifactId = randomUUID()
        const actor = reportExportFactActor(job, claim)
        await client.query(
          'INSERT INTO report_export_artifacts(tenant_id,id,job_id,object_key,file_name,mime_type,size,sha256,status,scan_engine,scanned_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11)',
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
            current.retention_until,
          ]
        )
        await client.query(
          'UPDATE report_export_jobs SET status=$4,stage=$5,artifact_id=$6,completed_at=now(),processed_rows=total_rows,claimed_by=NULL,lease_until=NULL,error_code=$7,error_message=$8,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3',
          [
            job.tenant_id,
            job.id,
            claim,
            scanned.clean ? 'completed' : 'infected',
            scanned.clean ? 'completed' : 'stopped',
            artifactId,
            scanned.clean ? null : 'REPORT_EXPORT_INFECTED',
            scanned.clean ? null : '真实ClamAV检测到威胁，制品已隔离',
          ]
        )
        await appendReportExportEvent(
          client,
          actor,
          job.id,
          scanned.clean ? 'completed' : 'infected',
          {
            stage: scanned.clean ? 'completed' : 'stopped',
            size: generated.bytes.length,
            sha256: fileDigest(generated.bytes),
            engine: scanned.engine.slice(0, 200),
          }
        )
        await audit(
          client,
          actor,
          'report-export',
          scanned.clean ? 'report-export.completed' : 'report-export.infected',
          'report-export',
          job.id,
          scanned.clean ? 'success' : 'failure',
          {
            size: generated.bytes.length,
            sha256: fileDigest(generated.bytes),
            engine: scanned.engine.slice(0, 200),
          }
        )
        fault('report-export.before-commit')
      })
      fault('report-export.after-commit')
    } catch (error) {
      await failClaim(pool, job, claim, error)
    } finally {
      clearInterval(heartbeat)
    }
  })
  return processed
}
export const startReportExportWorker = (
  pool: Pool,
  runtime: ReportExportRuntime = {}
) => {
  let closed = false
  let pending: Promise<unknown> | undefined
  const tick = () => {
    if (closed || pending) return
    pending = processReportExports(pool, runtime)
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
