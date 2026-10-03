import worker from '../../../services/reference-api/dist/workflow-timer-worker.js'
import db from '../../../services/reference-api/dist/database.js'
const pool = db.createPool()
try {
  await worker.processWorkflowTimers(pool, (point, timerId) => {
    if (point === process.env.CRASH_POINT && (!process.env.CRASH_TIMER_ID || timerId === process.env.CRASH_TIMER_ID)) process.kill(process.pid, 'SIGKILL')
  })
} finally {
  await pool.end()
}
