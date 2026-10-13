import { startMessagingWorker } from './messaging-worker'
import { startReportExportWorker } from './report-export-jobs'
import { startReportScheduleWorker } from './report-schedules-worker'
import { startWorkflowTimerWorker } from './workflow-timer-worker'
import { createPool } from './database'
import { startWorker } from './notification'
import { startFileWorker } from './file-jobs'

const pool = createPool()
const stop = startWorker(pool)
const stopFiles = startFileWorker(pool)
const stopTimers = startWorkflowTimerWorker(pool)
const stopMessaging = startMessagingWorker(pool)
const stopExports = startReportExportWorker(pool)
const stopSchedules = startReportScheduleWorker(pool)
const shutdown = async () => {
  await stop()
  await stopFiles()
  await stopTimers()
  await stopMessaging()
  await stopSchedules()
  await stopExports()
  await pool.end()
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
