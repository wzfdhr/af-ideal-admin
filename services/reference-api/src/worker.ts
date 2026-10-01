import { createPool } from './database'
import { startWorker } from './notification'

const pool = createPool()
const stop = startWorker(pool)
const shutdown = async () => {
  await stop()
  await pool.end()
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
