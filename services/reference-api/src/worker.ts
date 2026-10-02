import { createPool } from './database'
import { startWorker } from './notification'
import { startFileWorker } from './file-jobs'

const pool = createPool()
const stop = startWorker(pool)
const stopFiles = startFileWorker(pool)
const shutdown = async () => {
  await stop()
  await stopFiles()
  await pool.end()
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
