import db from '../../../services/reference-api/dist/database.js'
import notification from '../../../services/reference-api/dist/notification.js'
const pool = db.createPool()
try {
  await notification.processOutbox(pool, (point) => {
    if (point === process.env.CRASH_POINT) process.kill(process.pid, 'SIGKILL')
  }, 1)
} finally { await pool.end() }
