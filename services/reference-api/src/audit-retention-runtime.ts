import {
  materializeAuditRetentionPolicies,
  processAuditRetention,
} from './audit-retention-worker'
import type { Pool } from 'pg'
import type { FileRuntime } from './files'

export const startAuditRetentionWorker = (
  pool: Pool,
  files: FileRuntime = {}
) => {
  let closed = false
  let pending: Promise<void> | undefined
  const tick = () => {
    if (closed || pending) return
    pending = (async () => {
      await materializeAuditRetentionPolicies(pool)
      await processAuditRetention(pool, files)
    })()
      .catch(() => {
        // A bounded operational observation never includes driver errors or data.
        process.stderr.write(
          `${JSON.stringify({
            component: 'audit-retention',
            stage: 'worker.tick',
            code: 'AUDIT_ARCHIVE_WORKER_FAILED',
          })}\n`
        )
      })
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

export default startAuditRetentionWorker
