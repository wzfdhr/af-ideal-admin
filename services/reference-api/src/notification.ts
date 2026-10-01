import { randomUUID } from 'node:crypto'
import { DomainError, record } from '@af-admin/contracts'
import { transaction } from './database'
import { rows, one, pageQuery, sequential, noFault } from './support'
import type { Actor } from './auth'
import type { Database, FaultInjector } from './support'
import type { Pool } from 'pg'

interface OutboxRow {
  tenant_id: string
  id: string
  recipient_id: string
  payload: { title: string; content: string; category: string; link: string }
  attempts: number
  claimed_by: string | null
  status: string
}
interface NotificationRow {
  id: string
  title: string
  content: string
  category: string
  link: string
  read_at: Date | null
  created_at: Date
}
const notificationDto = (row: NotificationRow) => ({
  id: row.id,
  title: row.title,
  content: row.content,
  category: row.category,
  link: row.link,
  status: row.read_at ? 'read' : 'unread',
  priority: 'normal',
  source: 'workflow',
  createdAt: row.created_at.toISOString(),
  ...(row.read_at ? { readAt: row.read_at.toISOString() } : {}),
})
export const listNotifications = async (
  db: Database,
  actor: Actor,
  input: unknown
) => {
  const query = record(input || {})
  const page = pageQuery(input)
  const category = typeof query.category === 'string' ? query.category : ''
  const status = typeof query.status === 'string' ? query.status : ''
  const params = [
    actor.tenantId,
    actor.userId,
    category,
    status,
    `%${page.keyword}%`,
  ]
  const filter =
    "WHERE tenant_id=$1 AND recipient_id=$2 AND ($3='' OR category=$3) AND ($4='' OR ($4='read' AND read_at IS NOT NULL) OR ($4='unread' AND read_at IS NULL)) AND title ILIKE $5"
  const total = one(
    await rows<{ total: string }>(
      db,
      `SELECT count(*) AS total FROM notifications ${filter}`,
      params
    )
  )
  const items = await rows<NotificationRow>(
    db,
    `SELECT * FROM notifications ${filter} ORDER BY created_at DESC,id LIMIT $6 OFFSET $7`,
    [...params, page.pageSize, page.offset]
  )
  const unread = await rows<{ category: string; total: string }>(
    db,
    'SELECT category,count(*) AS total FROM notifications WHERE tenant_id=$1 AND recipient_id=$2 AND read_at IS NULL GROUP BY category',
    [actor.tenantId, actor.userId]
  )
  const categoryUnread: Record<string, number> = {
    notice: 0,
    message: 0,
    todo: 0,
    alert: 0,
  }
  unread.forEach((row) => {
    categoryUnread[row.category] = Number(row.total)
  })
  return {
    list: items.map(notificationDto),
    total: Number(total.total),
    unreadTotal: Object.values(categoryUnread).reduce(
      (sum, count) => sum + count,
      0
    ),
    categoryUnread,
  }
}
export const readNotification = async (
  db: Database,
  actor: Actor,
  id: string
) => {
  const updated = await rows<NotificationRow>(
    db,
    'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE tenant_id=$1 AND id=$2 AND recipient_id=$3 RETURNING *',
    [actor.tenantId, id, actor.userId]
  )
  return notificationDto(one(updated))
}
export const readAllNotifications = async (
  db: Database,
  actor: Actor,
  input: unknown
) => {
  const body = record(input || {})
  const category = typeof body.category === 'string' ? body.category : ''
  const result = await db.query(
    "UPDATE notifications SET read_at=now() WHERE tenant_id=$1 AND recipient_id=$2 AND read_at IS NULL AND ($3='' OR category=$3)",
    [actor.tenantId, actor.userId, category]
  )
  return { updated: result.rowCount || 0 }
}
export const processOutbox = async (
  pool: Pool,
  fault: FaultInjector = noFault,
  batchSize = 10
) => {
  const owner = randomUUID()
  const claimed = await transaction(pool, async (client) => {
    const events = await rows<OutboxRow>(
      client,
      "SELECT * FROM outbox WHERE attempts<5 AND ((status='pending' AND next_attempt_at<=now()) OR (status='processing' AND lease_until<=now())) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT $1",
      [batchSize]
    )
    await sequential(events, async (event) => {
      await client.query(
        "UPDATE outbox SET status='processing',claimed_by=$3,attempts=attempts+1,lease_until=now()+interval '30 seconds' WHERE tenant_id=$1 AND id=$2",
        [event.tenant_id, event.id, owner]
      )
    })
    return events
  })
  await sequential(claimed, async (event) => {
    try {
      await transaction(pool, async (client) => {
        const locked = one(
          await rows<OutboxRow>(
            client,
            'SELECT * FROM outbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [event.tenant_id, event.id]
          )
        )
        if (locked.status !== 'processing' || locked.claimed_by !== owner)
          return
        fault('outbox:before-insert')
        const members = await rows<{ user_id: string }>(
          client,
          "SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND u.status='enabled' AND t.status='enabled'",
          [event.tenant_id, event.recipient_id]
        )
        if (!members.length)
          throw new DomainError(
            409,
            'RECIPIENT_UNAVAILABLE',
            '通知接收人当前不可用'
          )
        if (
          !/^(?:\/leave\/requests\/[A-Za-z0-9%_-]+|\/audit\/logs\?targetId=[A-Za-z0-9%_-]+|\/leave\/application)$/.test(
            locked.payload.link
          )
        )
          throw new DomainError(422, 'INVALID_LINK', '通知目标无效')
        await client.query(
          'INSERT INTO notifications (tenant_id,id,event_id,recipient_id,title,content,category,link) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id,event_id,recipient_id) DO NOTHING',
          [
            event.tenant_id,
            randomUUID(),
            event.id,
            event.recipient_id,
            locked.payload.title,
            locked.payload.content,
            locked.payload.category,
            locked.payload.link,
          ]
        )
        fault('outbox:after-insert')
        await client.query(
          "UPDATE outbox SET status='sent',lease_until=NULL,claimed_by=NULL WHERE tenant_id=$1 AND id=$2",
          [event.tenant_id, event.id]
        )
      })
    } catch {
      await pool.query(
        "UPDATE outbox SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,next_attempt_at=now()+make_interval(secs=>LEAST(300,power(2,attempts)::int)),lease_until=NULL,claimed_by=NULL WHERE tenant_id=$1 AND id=$2 AND claimed_by=$3 AND status='processing'",
        [event.tenant_id, event.id, owner]
      )
    }
  })
  // A worker killed on its last claim is also terminal after its lease expires.
  await pool.query(
    "UPDATE outbox SET status='failed',lease_until=NULL,claimed_by=NULL WHERE status='processing' AND attempts>=5 AND lease_until<=now()"
  )
  return claimed.length
}

export const startWorker = (pool: Pool) => {
  let stopped = false
  let running: Promise<unknown> = Promise.resolve()
  let busy = false
  const timer = setInterval(() => {
    if (!stopped && !busy) {
      busy = true
      running = processOutbox(pool)
        .catch(() => undefined)
        .finally(() => {
          busy = false
        })
    }
  }, 500)
  return async () => {
    stopped = true
    clearInterval(timer)
    await running
  }
}
