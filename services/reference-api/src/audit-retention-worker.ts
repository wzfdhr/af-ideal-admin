import { randomUUID } from 'node:crypto'
import { DomainError, parseAuditQuery } from '@af-admin/contracts'
import { transaction } from './database'
import {
  rows,
  one,
  sequential,
  contentCanonical,
  contentHash,
  noFault,
  audit,
} from './support'
import { auditExportPrincipal } from './audit-export-access'
import { auditExportStore } from './audit-export-jobs'
import { clamavScanner } from './file-scanner'
import { fileDigest } from './file-storage'
import { generateAuditArchiveBatch } from './audit-archive-generators'
import {
  archiveManifest,
  archiveCandidateRows,
  assertArchivePermissions,
  archiveEvent,
  createArchiveBatch,
  captureArchiveRun,
} from './audit-retention'
import { assertAuditIdentityQueryAccess } from './audit-query'
import type { ArchiveRunRow, ArchiveBatchRow } from './audit-retention'
import type { AuditArchiveBatchSnapshotV1 } from '@af-admin/contracts'
import type { Pool, PoolClient } from 'pg'
import type { Database, FaultInjector } from './support'
import type { FileRuntime } from './files'

export interface AuditRetentionWorkerScope {
  readonly tenantId: string
  readonly runIds: readonly string[]
}
const validateScope = async (
  pool: Pool,
  input: AuditRetentionWorkerScope | undefined
) => {
  if (input === undefined) return undefined
  const invalid = () => new Error('Invalid audit retention maintenance scope')
  if (
    !input ||
    typeof input !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw invalid()
  Reflect.ownKeys(input).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    if (
      typeof key !== 'string' ||
      !['tenantId', 'runIds'].includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      throw invalid()
  })
  if (
    typeof input.tenantId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.tenantId) ||
    !Array.isArray(input.runIds) ||
    Object.getPrototypeOf(input.runIds) !== Array.prototype ||
    !input.runIds.length ||
    input.runIds.length > 200
  )
    throw invalid()
  if (
    Reflect.ownKeys(input.runIds).some(
      (key) =>
        key !== 'length' &&
        (typeof key !== 'string' ||
          !/^(0|[1-9]\d*)$/.test(key) ||
          Number(key) >= input.runIds.length)
    )
  )
    throw invalid()
  const ids = Array.from({ length: input.runIds.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      input.runIds,
      String(index)
    )
    if (
      !descriptor?.enumerable ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'string' ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(descriptor.value)
    )
      throw invalid()
    return descriptor.value as string
  })
  if (new Set(ids).size !== ids.length) throw invalid()
  const scope = Object.freeze({
    tenantId: input.tenantId,
    runIds: Object.freeze(ids),
  })
  if (
    one(
      await rows<{ n: number }>(
        pool,
        'SELECT count(*)::int AS n FROM audit_archive_runs WHERE tenant_id=$1 AND id=ANY($2::text[])',
        [scope.tenantId, scope.runIds]
      )
    ).n !== ids.length
  )
    throw invalid()
  return scope
}
const origin = async (db: Database, run: ArchiveRunRow, trace: string) => {
  const actor = await auditExportPrincipal(
    db,
    run.tenant_id,
    run.executor_id,
    trace
  )
  assertArchivePermissions(actor)
  await assertAuditIdentityQueryAccess(db, actor, run.query, run.executor_id)
  if (run.trigger === 'policy') {
    const policy = (
      await rows(
        db,
        'SELECT tenant_id FROM audit_retention_policies WHERE tenant_id=$1 AND enabled AND executor_id=$2 FOR SHARE',
        [run.tenant_id, run.executor_id]
      )
    )[0]
    if (!policy)
      throw new DomainError(
        403,
        'AUDIT_ARCHIVE_POLICY_PAUSED',
        '策略已停用或执行者已变更'
      )
  }
  return actor
}
const fenceLost = () =>
  new DomainError(409, 'AUDIT_ARCHIVE_FENCE_LOST', '归档租约已失效')
const fenced = <T>(
  pool: Pool,
  claimed: { run: ArchiveRunRow; batch: ArchiveBatchRow; claim: string },
  action: (
    db: PoolClient,
    run: ArchiveRunRow,
    batch: ArchiveBatchRow
  ) => Promise<T>
) =>
  transaction(pool, async (db) => {
    const { run, batch, claim } = claimed
    const current = (
      await rows<ArchiveRunRow>(
        db,
        "SELECT * FROM audit_archive_runs WHERE tenant_id=$1 AND id=$2 AND status='processing' AND claimed_by=$3 AND lease_until>clock_timestamp() FOR UPDATE",
        [run.tenant_id, run.id, claim]
      )
    )[0]
    if (!current) throw fenceLost()
    const currentBatch = (
      await rows<ArchiveBatchRow>(
        db,
        "SELECT * FROM audit_archive_batches WHERE tenant_id=$1 AND id=$2 AND status='processing' AND claimed_by=$3 AND lease_until>clock_timestamp() AND retention_until>clock_timestamp() AND bytes_purged_at IS NULL FOR UPDATE",
        [run.tenant_id, batch.id, claim]
      )
    )[0]
    if (!currentBatch) throw fenceLost()
    const actor = await origin(db, current, claim)
    const manifest = archiveManifest(current)
    const records = await archiveCandidateRows(
      db,
      actor,
      current,
      manifest.candidates.slice(
        currentBatch.first_ordinal - 1,
        currentBatch.last_ordinal
      )
    )
    if (currentBatch.snapshot) {
      if (
        currentBatch.snapshot_canonical !==
          contentCanonical(currentBatch.snapshot) ||
        currentBatch.snapshot_hash !== contentHash(currentBatch.snapshot) ||
        contentHash(records) !==
          contentHash(currentBatch.snapshot.snapshot.rows)
      )
        throw new DomainError(
          403,
          'AUDIT_ARCHIVE_PROJECTION_CHANGED',
          '归档批次已捕获投影不再匹配当前授权'
        )
    }
    const result = await action(db, current, currentBatch)
    const { valid } = one(
      await rows<{ valid: boolean }>(
        db,
        "SELECT (status<>'processing' OR (claimed_by=$3 AND lease_until>clock_timestamp())) AND EXISTS(SELECT 1 FROM audit_archive_batches b WHERE b.tenant_id=$1 AND b.id=$4 AND b.retention_until>clock_timestamp() AND b.bytes_purged_at IS NULL) AS valid FROM audit_archive_runs WHERE tenant_id=$1 AND id=$2",
        [run.tenant_id, run.id, claim, batch.id]
      )
    )
    if (!valid) throw fenceLost()
    return result
  })
const claimNext = (pool: Pool, scope: AuditRetentionWorkerScope | undefined) =>
  transaction(pool, async (db) => {
    const run = (
      await rows<ArchiveRunRow>(
        db,
        "SELECT r.* FROM audit_archive_runs r JOIN tenants t ON t.id=r.tenant_id AND t.status='enabled' WHERE ((r.status='queued' AND r.next_attempt_at<=clock_timestamp()) OR (r.status='processing' AND r.lease_until<=clock_timestamp())) AND ($1::text IS NULL OR (r.tenant_id=$1 AND r.id=ANY($2::text[]))) ORDER BY r.created_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1",
        [scope?.tenantId ?? null, scope?.runIds ?? null]
      )
    )[0]
    if (!run) return null
    const claim = randomUUID()
    const batch = (
      await rows<ArchiveBatchRow>(
        db,
        "SELECT * FROM audit_archive_batches WHERE tenant_id=$1 AND run_id=$2 AND status IN('queued','processing') ORDER BY first_ordinal LIMIT 1 FOR UPDATE",
        [run.tenant_id, run.id]
      )
    )[0]
    if (!batch) {
      await db.query(
        "UPDATE audit_archive_runs SET status='failed',claimed_by=NULL,lease_until=NULL,error_code='AUDIT_ARCHIVE_BATCH_MISSING',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [run.tenant_id, run.id]
      )
      return { stopped: true as const }
    }
    const { live } = one(
      await rows<{ live: boolean }>(
        db,
        'SELECT retention_until>clock_timestamp() AND bytes_purged_at IS NULL AS live FROM audit_archive_batches WHERE tenant_id=$1 AND id=$2',
        [run.tenant_id, batch.id]
      )
    )
    if (!live) {
      await db.query(
        "UPDATE audit_archive_runs SET status='failed',claimed_by=NULL,lease_until=NULL,error_code='AUDIT_ARCHIVE_EXPIRED',revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
        [run.tenant_id, run.id]
      )
      await db.query(
        "UPDATE audit_archive_batches SET status='failed',claimed_by=NULL,lease_until=NULL,error_code='AUDIT_ARCHIVE_EXPIRED',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [run.tenant_id, batch.id]
      )
      return { stopped: true as const }
    }
    try {
      await origin(db, run, claim)
    } catch (error) {
      if (!(error instanceof DomainError)) throw error
      await db.query(
        "UPDATE audit_archive_runs SET status='blocked',claimed_by=NULL,lease_until=NULL,error_code='AUDIT_ARCHIVE_CURRENT_ACCESS_REQUIRED',revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
        [run.tenant_id, run.id]
      )
      await db.query(
        "UPDATE audit_archive_batches SET status='blocked',claimed_by=NULL,lease_until=NULL,error_code='AUDIT_ARCHIVE_CURRENT_ACCESS_REQUIRED',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [run.tenant_id, batch.id]
      )
      await archiveEvent(
        db,
        { tenantId: run.tenant_id, userId: null, name: '', traceId: claim },
        run.id,
        'run.blocked',
        batch.id,
        { code: 'AUDIT_ARCHIVE_CURRENT_ACCESS_REQUIRED' },
        true
      )
      return { stopped: true as const }
    }
    if (batch.attempts >= 5 || run.attempts >= 5) {
      await db.query(
        "UPDATE audit_archive_runs SET status='failed',claimed_by=NULL,lease_until=NULL,error_code='AUDIT_ARCHIVE_ATTEMPTS_EXHAUSTED',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [run.tenant_id, run.id]
      )
      await db.query(
        "UPDATE audit_archive_batches SET status='failed',claimed_by=NULL,lease_until=NULL,error_code='AUDIT_ARCHIVE_ATTEMPTS_EXHAUSTED',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [run.tenant_id, batch.id]
      )
      return { stopped: true as const }
    }
    const current = one(
      await rows<ArchiveRunRow>(
        db,
        "UPDATE audit_archive_runs SET status='processing',claimed_by=$3,lease_until=clock_timestamp()+interval '90 seconds',revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [run.tenant_id, run.id, claim]
      )
    )
    const currentBatch = one(
      await rows<ArchiveBatchRow>(
        db,
        "UPDATE audit_archive_batches SET status='processing',claimed_by=$3,lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1,revision=revision+1 WHERE tenant_id=$1 AND id=$2 RETURNING *",
        [run.tenant_id, batch.id, claim]
      )
    )
    await archiveEvent(
      db,
      await origin(db, current, claim),
      run.id,
      'batch.claimed',
      batch.id,
      { attempt: currentBatch.attempts, ordinal: batch.ordinal }
    )
    return { stopped: false as const, run: current, batch: currentBatch, claim }
  })
const failClaim = async (
  pool: Pool,
  claimed: { run: ArchiveRunRow; batch: ArchiveBatchRow; claim: string },
  error: unknown
) =>
  transaction(pool, async (db) => {
    const run = (
      await rows<ArchiveRunRow>(
        db,
        "SELECT * FROM audit_archive_runs WHERE tenant_id=$1 AND id=$2 AND status='processing' AND claimed_by=$3 AND lease_until>clock_timestamp() FOR UPDATE",
        [claimed.run.tenant_id, claimed.run.id, claimed.claim]
      )
    )[0]
    if (!run) return
    const blocked =
      error instanceof DomainError && [401, 403, 404].includes(error.status)
    const attempts = run.attempts + 1
    let status =
      attempts >= 5 || claimed.batch.attempts >= 5 ? 'failed' : 'queued'
    if (blocked) status = 'blocked'
    let code = blocked
      ? 'AUDIT_ARCHIVE_CURRENT_ACCESS_REQUIRED'
      : 'AUDIT_ARCHIVE_PROCESSING_FAILED'
    const { expired } = one(
      await rows<{ expired: boolean }>(
        db,
        'SELECT retention_until<=clock_timestamp() OR bytes_purged_at IS NOT NULL AS expired FROM audit_archive_batches WHERE tenant_id=$1 AND id=$2',
        [run.tenant_id, claimed.batch.id]
      )
    )
    if (expired) {
      status = 'failed'
      code = 'AUDIT_ARCHIVE_EXPIRED'
    }
    await db.query(
      'UPDATE audit_archive_runs SET status=$4,claimed_by=NULL,lease_until=NULL,attempts=$5,next_attempt_at=clock_timestamp()+make_interval(secs=>$6),error_code=$7,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3',
      [
        run.tenant_id,
        run.id,
        claimed.claim,
        status,
        attempts,
        Math.min(300, 2 ** attempts * 5),
        code,
      ]
    )
    await db.query(
      'UPDATE audit_archive_batches SET status=$4,claimed_by=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+make_interval(secs=>$5),error_code=$6,revision=revision+1 WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3',
      [
        run.tenant_id,
        claimed.batch.id,
        claimed.claim,
        status,
        Math.min(300, 2 ** attempts * 5),
        code,
      ]
    )
    // A failure is a server fact attributed to the original principal, not an execution grant.
    await archiveEvent(
      db,
      {
        tenantId: run.tenant_id,
        userId: null,
        name: '',
        traceId: claimed.claim,
      },
      run.id,
      'batch.failed',
      claimed.batch.id,
      { code, attempt: attempts },
      true
    )
  })
export const expireAuditArchiveArtifacts = async (
  pool: Pool,
  files: FileRuntime = {},
  requestedScope: AuditRetentionWorkerScope | undefined = undefined
) => {
  const scope = await validateScope(pool, requestedScope)
  const store = auditExportStore(files)
  const expired = await rows<{
    tenant_id: string
    id: string
    batch_id: string
  }>(
    pool,
    'SELECT a.tenant_id,a.id,a.batch_id FROM audit_archive_artifacts a JOIN audit_archive_batches b ON b.tenant_id=a.tenant_id AND b.id=a.batch_id WHERE a.expires_at<=clock_timestamp() AND a.purged_at IS NULL AND ($1::text IS NULL OR (a.tenant_id=$1 AND b.run_id=ANY($2::text[]))) ORDER BY a.expires_at,a.tenant_id,a.id LIMIT 100',
    [scope?.tenantId ?? null, scope?.runIds ?? null]
  )
  await sequential(expired, async (candidate) =>
    transaction(pool, async (db) => {
      // Backup/download and purge serialize on the owner, then its artifact.
      const owner = (
        await rows<{ id: string }>(
          db,
          'SELECT id FROM audit_archive_batches WHERE tenant_id=$1 AND id=$2 AND ($3::text IS NULL OR (tenant_id=$3 AND run_id=ANY($4::text[]))) FOR UPDATE',
          [
            candidate.tenant_id,
            candidate.batch_id,
            scope?.tenantId ?? null,
            scope?.runIds ?? null,
          ]
        )
      )[0]
      if (!owner) return
      const artifact = (
        await rows<{ object_key: string }>(
          db,
          'SELECT object_key FROM audit_archive_artifacts WHERE tenant_id=$1 AND id=$2 AND batch_id=$3 AND expires_at<=clock_timestamp() AND purged_at IS NULL FOR UPDATE',
          [candidate.tenant_id, candidate.id, candidate.batch_id]
        )
      )[0]
      if (!artifact) return
      await db.query(
        "UPDATE audit_archive_artifacts SET status='expired',expired_at=COALESCE(expired_at,clock_timestamp()) WHERE tenant_id=$1 AND id=$2",
        [candidate.tenant_id, candidate.id]
      )
      await store.remove(artifact.object_key)
      await db.query(
        "UPDATE audit_archive_artifacts SET purged_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND status='expired'",
        [candidate.tenant_id, candidate.id]
      )
      await db.query(
        'UPDATE audit_archive_batches SET bytes_purged_at=COALESCE(bytes_purged_at,clock_timestamp()) WHERE tenant_id=$1 AND id=$2',
        [candidate.tenant_id, candidate.batch_id]
      )
    })
  )

  return expired.length
}
/** Retire reserved bytes that never acquired an artifact; membership and source facts remain untouched. */
export const expireAuditArchiveReservations = async (
  pool: Pool,
  files: FileRuntime = {},
  requestedScope: AuditRetentionWorkerScope | undefined = undefined
) => {
  const scope = await validateScope(pool, requestedScope)
  const store = auditExportStore(files)
  const candidates = await rows<{
    tenant_id: string
    id: string
    run_id: string
  }>(
    pool,
    'SELECT b.tenant_id,b.id,b.run_id FROM audit_archive_batches b WHERE b.retention_until<=clock_timestamp() AND b.bytes_purged_at IS NULL AND NOT EXISTS(SELECT 1 FROM audit_archive_artifacts a WHERE a.tenant_id=b.tenant_id AND a.batch_id=b.id) AND ($1::text IS NULL OR (b.tenant_id=$1 AND b.run_id=ANY($2::text[]))) ORDER BY b.retention_until,b.tenant_id,b.id LIMIT 100',
    [scope?.tenantId ?? null, scope?.runIds ?? null]
  )
  let retired = 0
  await sequential(candidates, async (candidate) =>
    transaction(pool, async (db) => {
      // Completion/cancel/retry own run before batch; retain that order while fencing retirement.
      const run = (
        await rows<ArchiveRunRow>(
          db,
          'SELECT * FROM audit_archive_runs WHERE tenant_id=$1 AND id=$2 AND ($3::text IS NULL OR (tenant_id=$3 AND id=ANY($4::text[]))) FOR UPDATE',
          [
            candidate.tenant_id,
            candidate.run_id,
            scope?.tenantId ?? null,
            scope?.runIds ?? null,
          ]
        )
      )[0]
      if (!run) return
      const batch = (
        await rows<ArchiveBatchRow>(
          db,
          'SELECT * FROM audit_archive_batches WHERE tenant_id=$1 AND id=$2 AND run_id=$3 AND retention_until<=clock_timestamp() AND bytes_purged_at IS NULL FOR UPDATE',
          [candidate.tenant_id, candidate.id, run.id]
        )
      )[0]
      if (
        !batch ||
        (
          await rows(
            db,
            'SELECT id FROM audit_archive_artifacts WHERE tenant_id=$1 AND batch_id=$2 FOR SHARE',
            [candidate.tenant_id, candidate.id]
          )
        ).length
      )
        return
      await store.remove(batch.object_key)
      await db.query(
        "UPDATE audit_archive_batches SET bytes_purged_at=clock_timestamp(),status=CASE WHEN status IN('queued','processing','blocked') THEN 'failed' ELSE status END,claimed_by=NULL,lease_until=NULL,error_code='AUDIT_ARCHIVE_EXPIRED',revision=revision+1 WHERE tenant_id=$1 AND id=$2",
        [candidate.tenant_id, candidate.id]
      )
      // A completed/cancelled run remains terminal; partially archived memberships never move.
      if (!['completed', 'cancelled'].includes(run.status))
        await db.query(
          "UPDATE audit_archive_runs SET status='failed',claimed_by=NULL,lease_until=NULL,error_code='AUDIT_ARCHIVE_EXPIRED',revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",
          [candidate.tenant_id, run.id]
        )
      await archiveEvent(
        db,
        {
          tenantId: candidate.tenant_id,
          userId: null,
          name: '',
          traceId: randomUUID(),
        },
        run.id,
        'reservation.expired',
        batch.id,
        { code: 'AUDIT_ARCHIVE_EXPIRED' }
      )
      retired += 1
    })
  )
  return retired
}
export const processAuditRetention = async (
  pool: Pool,
  files: FileRuntime = {},
  fault: FaultInjector = noFault,
  batchSize = 10,
  requestedScope: AuditRetentionWorkerScope | undefined = undefined
) => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error('Invalid audit retention batch size')
  const scope = await validateScope(pool, requestedScope)
  if (!files.storageRoot && !process.env.FILE_STORAGE_DIR) return 0
  const store = auditExportStore(files)
  const scanner = clamavScanner(
    process.env.CLAMAV_HOST || '127.0.0.1',
    Number(process.env.CLAMAV_PORT || 3310)
  )
  await expireAuditArchiveArtifacts(pool, files, scope)
  await expireAuditArchiveReservations(pool, files, scope)
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
    const { run, batch, claim } = claimed
    let renewing: Promise<unknown> | undefined
    const timer = setInterval(() => {
      if (renewing) return
      renewing = transaction(pool, async (db) => {
        const renewed = await rows(
          db,
          "UPDATE audit_archive_runs SET lease_until=clock_timestamp()+interval '90 seconds' WHERE tenant_id=$1 AND id=$2 AND status='processing' AND claimed_by=$3 AND lease_until>clock_timestamp() RETURNING id",
          [run.tenant_id, run.id, claim]
        )
        if (renewed.length)
          await db.query(
            "UPDATE audit_archive_batches SET lease_until=clock_timestamp()+interval '90 seconds' WHERE tenant_id=$1 AND id=$2 AND status='processing' AND claimed_by=$3 AND lease_until>clock_timestamp() AND retention_until>clock_timestamp() AND bytes_purged_at IS NULL",
            [run.tenant_id, batch.id, claim]
          )
      })
        .catch(() => undefined)
        .finally(() => {
          renewing = undefined
        })
    }, 20000)
    timer.unref()
    try {
      await fault('audit-archive.after-claim')
      const initial = await fenced(
        pool,
        claimed,
        async (db, current, currentBatch) => {
          if (currentBatch.snapshot) return currentBatch.snapshot
          const manifest = archiveManifest(current)
          const actor = await origin(db, current, claim)
          const records = await archiveCandidateRows(
            db,
            actor,
            current,
            manifest.candidates.slice(
              currentBatch.first_ordinal - 1,
              currentBatch.last_ordinal
            )
          )
          return {
            version: 1,
            kind: 'archive-batch',
            producerVersion: 2,
            projectionVersion: 1,
            source: 'server',
            runId: run.id,
            ordinal: batch.ordinal,
            candidateTotal: run.candidate_total,
            candidateRange: {
              firstOrdinal: batch.first_ordinal,
              lastOrdinal: batch.last_ordinal,
            },
            snapshot: {
              version: 1,
              producerVersion: 1,
              projectionVersion: 1,
              source: 'server',
              query: run.query,
              queriedAt: manifest.queriedAt,
              dataCutoffAt: manifest.dataCutoffAt,
              rows: records,
              total: records.length,
            },
          } as AuditArchiveBatchSnapshotV1
        }
      )
      let snapshot = initial
      let generated:
        | Awaited<ReturnType<typeof generateAuditArchiveBatch>>
        | undefined
      // Only an unbound range can split. Once persisted, bytes and provenance are fixed on every retry.
      while (!generated) {
        try {
          // Each retry halves the unbound range and must await actual byte size.
          // eslint-disable-next-line no-await-in-loop
          generated = await generateAuditArchiveBatch(run.format, snapshot)
        } catch (error) {
          if (
            batch.snapshot ||
            !(error instanceof DomainError) ||
            ![
              'AUDIT_ARCHIVE_FILE_TOO_LARGE',
              'AUDIT_ARCHIVE_SNAPSHOT_TOO_LARGE',
              'AUDIT_EXPORT_FILE_TOO_LARGE',
              'AUDIT_EXPORT_SNAPSHOT_TOO_LARGE',
            ].includes(error.businessCode) ||
            snapshot.snapshot.total <= 1
          )
            throw error
          const count = Math.floor(snapshot.snapshot.total / 2)
          snapshot = {
            ...snapshot,
            candidateRange: {
              firstOrdinal: batch.first_ordinal,
              lastOrdinal: batch.first_ordinal + count - 1,
            },
            snapshot: {
              ...snapshot.snapshot,
              rows: snapshot.snapshot.rows.slice(0, count),
              total: count,
            },
          }
        }
      }
      await fenced(pool, claimed, async (db, current, currentBatch) => {
        if (!currentBatch.snapshot) {
          if (snapshot.candidateRange.lastOrdinal < currentBatch.last_ordinal)
            await createArchiveBatch(
              db,
              current,
              snapshot.candidateRange.lastOrdinal + 1,
              currentBatch.last_ordinal
            )
          await db.query(
            'UPDATE audit_archive_batches SET last_ordinal=$4,snapshot=$5,snapshot_canonical=$6,snapshot_hash=$7,revision=revision+1 WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3',
            [
              run.tenant_id,
              batch.id,
              claim,
              snapshot.candidateRange.lastOrdinal,
              JSON.stringify(snapshot),
              contentCanonical(snapshot),
              contentHash(snapshot),
            ]
          )
        }
      })
      const output = generated
      await fenced(pool, claimed, async () => {
        await store.put(output.bytes, batch.object_key)
        if (
          fileDigest(await store.get(batch.object_key)) !==
          fileDigest(output.bytes)
        )
          throw new Error('Archive storage digest mismatch')
        await fault('audit-archive.after-write')
      })
      const scanned = await fenced(pool, claimed, async () =>
        scanner(output.bytes)
      )
      if (!scanned.engine.startsWith('ClamAV '))
        throw new Error('Actual ClamAV identity required')
      await fault('audit-archive.after-scan')
      await fenced(pool, claimed, async (db, current, currentBatch) => {
        if (
          fileDigest(await store.get(batch.object_key)) !==
          fileDigest(output.bytes)
        )
          throw new Error('Archive storage changed')
        const actor = await origin(db, current, claim)
        const artifactId = randomUUID()
        await db.query(
          'INSERT INTO audit_archive_artifacts(tenant_id,id,batch_id,object_key,file_name,mime_type,size,sha256,status,scan_engine,scanned_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp())',
          [
            run.tenant_id,
            artifactId,
            batch.id,
            batch.object_key,
            output.fileName,
            output.mimeType,
            output.bytes.length,
            fileDigest(output.bytes),
            scanned.clean ? 'ready' : 'quarantined',
            scanned.engine.slice(0, 200),
          ]
        )
        const changed = await rows(
          db,
          'UPDATE audit_archive_batches SET status=$4,claimed_by=NULL,lease_until=NULL,completed_at=clock_timestamp(),error_code=$5,revision=revision+1 WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND lease_until>clock_timestamp() AND retention_until>clock_timestamp() AND bytes_purged_at IS NULL RETURNING id',
          [
            run.tenant_id,
            batch.id,
            claim,
            scanned.clean ? 'completed' : 'infected',
            scanned.clean ? null : 'AUDIT_ARCHIVE_INFECTED',
          ]
        )
        if (!changed.length) throw fenceLost()
        if (scanned.clean)
          await db.query(
            'INSERT INTO audit_archive_memberships(tenant_id,event_id,run_id,batch_id,artifact_id,snapshot_hash) SELECT tenant_id,event_id,run_id,$3,$4,$5 FROM audit_archive_candidates WHERE tenant_id=$1 AND run_id=$2 AND ordinal BETWEEN $6 AND $7 ON CONFLICT(tenant_id,event_id) DO NOTHING',
            [
              run.tenant_id,
              run.id,
              batch.id,
              artifactId,
              currentBatch.snapshot_hash,
              currentBatch.first_ordinal,
              currentBatch.last_ordinal,
            ]
          )
        const remaining = one(
          await rows<{ n: number }>(
            db,
            'SELECT count(*)::int AS n FROM audit_archive_candidates c WHERE tenant_id=$1 AND run_id=$2 AND NOT EXISTS(SELECT 1 FROM audit_archive_memberships m WHERE m.tenant_id=c.tenant_id AND m.event_id=c.event_id)',
            [run.tenant_id, run.id]
          )
        ).n
        let status = remaining ? 'queued' : 'completed'
        if (!scanned.clean) status = 'failed'
        const completed = await rows(
          db,
          "UPDATE audit_archive_runs SET status=$4,claimed_by=NULL,lease_until=NULL,completed_at=CASE WHEN $4='completed' THEN clock_timestamp() ELSE NULL END,error_code=$5,revision=revision+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND lease_until>clock_timestamp() RETURNING id",
          [
            run.tenant_id,
            run.id,
            claim,
            status,
            scanned.clean ? null : 'AUDIT_ARCHIVE_INFECTED',
          ]
        )
        if (!completed.length) throw fenceLost()
        await archiveEvent(
          db,
          actor,
          run.id,
          scanned.clean ? 'batch.completed' : 'batch.infected',
          batch.id,
          { ordinal: batch.ordinal },
          !scanned.clean
        )
        if (status === 'completed')
          await archiveEvent(db, actor, run.id, 'run.completed')
        await fault('audit-archive.before-commit')
      })
      await fault('audit-archive.after-commit')
    } catch (error) {
      await failClaim(pool, claimed, error)
    } finally {
      clearInterval(timer)
      await renewing
    }
  })
  return processed
}
/** Separate from exact-run maintenance; never materializes unrelated policy runs under a runIds scope. */
export const materializeAuditRetentionPolicies = async (
  pool: Pool,
  limit = 10
) => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid audit policy batch size')
  let count = 0
  await sequential(Array.from({ length: limit }), async () => {
    const created = await transaction(pool, async (db) => {
      // All paths use tenant → policy → principal. Policy PUT takes tenant UPDATE first.
      const selected = (
        await rows<{ id: string; revision: number; executor_id: string }>(
          db,
          "SELECT t.id,p.revision,p.executor_id FROM tenants t JOIN audit_retention_policies p ON p.tenant_id=t.id WHERE t.status='enabled' AND p.enabled AND p.next_run_at<=clock_timestamp() ORDER BY p.next_run_at,t.id FOR SHARE OF t SKIP LOCKED LIMIT 1"
        )
      )[0]
      if (!selected) return false
      const policy = (
        await rows<{
          tenant_id: string
          revision: number
          executor_id: string
          time_zone: string
          hot_days: number
          local_date: string
          boundary_at: Date
          query_to: string
        }>(
          db,
          "SELECT p.*,to_char(statement_timestamp() AT TIME ZONE p.time_zone,'YYYY-MM-DD') AS local_date,((statement_timestamp() AT TIME ZONE p.time_zone)::date-p.hot_days)::timestamp AT TIME ZONE p.time_zone AS boundary_at,to_char((statement_timestamp() AT TIME ZONE p.time_zone)::date-p.hot_days-1,'YYYY-MM-DD') AS query_to FROM audit_retention_policies p WHERE p.tenant_id=$1 AND p.revision=$2 AND p.executor_id=$3 AND p.enabled AND p.next_run_at<=clock_timestamp() FOR UPDATE",
          [selected.id, selected.revision, selected.executor_id]
        )
      )[0]
      if (!policy) return false
      await db.query('SAVEPOINT audit_policy_capture')
      try {
        const actor = await auditExportPrincipal(
          db,
          policy.tenant_id,
          policy.executor_id,
          randomUUID()
        )
        assertArchivePermissions(actor)
        const existing = (
          await rows<{ id: string }>(
            db,
            'SELECT id FROM audit_archive_runs WHERE tenant_id=$1 AND occurrence_date=$2',
            [policy.tenant_id, policy.local_date]
          )
        )[0]
        const id =
          existing?.id ??
          (await captureArchiveRun(
            db,
            actor,
            {
              version: 1,
              format: 'csv',
              query: parseAuditQuery({
                to: policy.query_to,
                timeZone: policy.time_zone,
              }),
            },
            {
              policyRevision: policy.revision,
              localDate: policy.local_date,
              timeZone: policy.time_zone,
              boundaryAt: policy.boundary_at.toISOString(),
            }
          ))
        await db.query(
          'UPDATE audit_retention_policies SET last_run_id=$2,next_run_at=((clock_timestamp() AT TIME ZONE time_zone)::date+1)::timestamp AT TIME ZONE time_zone WHERE tenant_id=$1',
          [policy.tenant_id, id]
        )
        return !existing
      } catch (error) {
        if (!(error instanceof DomainError)) throw error
        await db.query('ROLLBACK TO SAVEPOINT audit_policy_capture')
        await db.query(
          'UPDATE audit_retention_policies SET next_run_at=((clock_timestamp() AT TIME ZONE time_zone)::date+1)::timestamp AT TIME ZONE time_zone WHERE tenant_id=$1',
          [policy.tenant_id]
        )
        // Failure metadata is a system observation, never an impersonated successful capture.
        await audit(
          db,
          {
            tenantId: policy.tenant_id,
            userId: null,
            name: '',
            traceId: randomUUID(),
          },
          'audit-retention',
          'policy.capture-failed',
          'membership',
          policy.executor_id,
          'failure',
          { code: 'AUDIT_ARCHIVE_POLICY_CAPTURE_FAILED' }
        )
        return false
      }
    })
    if (created) count += 1
  })
  return count
}
