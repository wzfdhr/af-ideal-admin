import { randomUUID } from 'node:crypto'
import { DomainError } from '@af-admin/contracts'
import { transaction } from './database'
import { rows, one, sequential, noFault, audit } from './support'
import {
  assertMessagingJobSender,
  messagingAudienceContains,
  messagingSubscription,
  messageDeliveryEvent,
  refreshMessageJobStatus,
} from './messaging'
import type { MessageJobRow, MessageRecipientRow } from './messaging'
import type { Pool } from 'pg'

export type MessagingFaultInjector = (
  point: string,
  recipientId?: string
) => void
const actorFor = (tenantId: string, traceId: string) => ({
  tenantId,
  userId: null,
  name: '消息调度服务',
  traceId,
})
const blocked = new Set([
  'MESSAGING_SENDER_UNAUTHORIZED',
  'MESSAGING_PLAN_INVALID',
  'MESSAGING_TEMPLATE_DISABLED',
  'MESSAGING_ANNOUNCEMENT_UNAVAILABLE',
  'MESSAGING_AUDIENCE_FORBIDDEN',
  'MESSAGING_RECIPIENT_UNAVAILABLE',
  'MESSAGING_TENANT_UNAVAILABLE',
  'NOT_FOUND',
])

export const processMessaging = async (
  pool: Pool,
  fault: MessagingFaultInjector = noFault,
  batchSize = 10
) => {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    throw new Error('Invalid messaging batch size')
  const owner = randomUUID()
  const claimed = await transaction(pool, async (db) => {
    const found = await rows<MessageRecipientRow>(
      db,
      "SELECT r.* FROM message_recipients r JOIN message_send_jobs j ON j.tenant_id=r.tenant_id AND j.id=r.job_id WHERE j.status IN('queued','running') AND j.scheduled_at<=now() AND r.attempts<5 AND ((r.status='pending' AND r.next_attempt_at<=now()) OR (r.status='processing' AND r.lease_until<=now())) ORDER BY r.next_attempt_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT $1",
      [batchSize]
    )
    const result: MessageRecipientRow[] = []
    await sequential(found, async (row) => {
      result.push(
        one(
          await rows<MessageRecipientRow>(
            db,
            "UPDATE message_recipients SET status='processing',attempts=attempts+1,claimed_by=$3,lease_until=now()+interval '30 seconds',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *",
            [row.tenant_id, row.id, owner]
          )
        )
      )
    })
    return result
  })
  await sequential(claimed, async (recipient) => {
    // A process stopped here leaves a durable lease that another worker can reclaim.
    fault('messaging:claimed', recipient.id)
    const actor = actorFor(recipient.tenant_id, owner)
    try {
      const effected = await transaction(pool, async (db) => {
        const tenant = one(
          await rows<{ status: string }>(
            db,
            'SELECT status FROM tenants WHERE id=$1 FOR SHARE',
            [recipient.tenant_id]
          )
        )
        if (tenant.status !== 'enabled')
          throw new DomainError(
            409,
            'MESSAGING_TENANT_UNAVAILABLE',
            '租户当前不可接收消息'
          )
        const plan = one(
          await rows<MessageJobRow>(
            db,
            'SELECT * FROM message_send_jobs WHERE tenant_id=$1 AND id=$2',
            [recipient.tenant_id, recipient.job_id]
          )
        )
        await assertMessagingJobSender(db, plan)
        const job = one(
          await rows<MessageJobRow>(
            db,
            'SELECT * FROM message_send_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [recipient.tenant_id, recipient.job_id]
          )
        )
        const current = one(
          await rows<MessageRecipientRow>(
            db,
            'SELECT * FROM message_recipients WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [recipient.tenant_id, recipient.id]
          )
        )
        if (
          current.status !== 'processing' ||
          current.claimed_by !== owner ||
          job.status === 'cancelled'
        )
          return false
        const member = await rows<{ visible: boolean }>(
          db,
          "SELECT af_member_scope_visible($1,$3,$4,m.user_id) AS visible FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' FOR SHARE OF m,u",
          [
            job.tenant_id,
            current.user_id,
            job.sender_id,
            job.authorization_code,
          ]
        )
        if (!member.length)
          throw new DomainError(
            409,
            'MESSAGING_RECIPIENT_UNAVAILABLE',
            '接收成员当前不可用'
          )
        if (!member[0].visible)
          throw new DomainError(
            409,
            'MESSAGING_AUDIENCE_FORBIDDEN',
            '原发送者当前无权联系此成员'
          )
        if (
          !(await messagingAudienceContains(
            db,
            job.tenant_id,
            job.sender_id,
            job.audience,
            current.user_id
          ))
        ) {
          await db.query(
            "UPDATE message_recipients SET status='skipped',error_code='MESSAGING_AUDIENCE_CHANGED',error_message='成员已不在当前收件范围',completed_at=now(),claimed_by=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [job.tenant_id, current.id]
          )
          await messageDeliveryEvent(db, actor, job.id, current.id, 'skipped', {
            businessCode: 'MESSAGING_AUDIENCE_CHANGED',
            attempt: current.attempts,
          })
          await refreshMessageJobStatus(db, job.tenant_id, job.id)
          return false
        }
        const subscription = await messagingSubscription(
          db,
          job.tenant_id,
          current.user_id,
          job.channel
        )
        if (
          !subscription.subscribed ||
          !subscription.deliveryModes.includes('in-app') ||
          !current.delivery_modes.includes('in-app')
        ) {
          await db.query(
            "UPDATE message_recipients SET status='skipped',error_code='MESSAGING_UNSUBSCRIBED',error_message='成员未订阅此通道或站内方式',completed_at=now(),claimed_by=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [job.tenant_id, current.id]
          )
          await messageDeliveryEvent(db, actor, job.id, current.id, 'skipped', {
            businessCode: 'MESSAGING_UNSUBSCRIBED',
            attempt: current.attempts,
          })
          await refreshMessageJobStatus(db, job.tenant_id, job.id)
          return false
        }
        if (current.delivery_modes.includes('email'))
          throw new DomainError(
            409,
            'MESSAGING_PLAN_INVALID',
            '当前计划包含尚未配置的邮件服务'
          )
        fault('messaging:before-effects', current.id)
        const notificationId = randomUUID()
        const link =
          job.source_kind === 'announcement'
            ? `/message/announcements?announcementId=${encodeURIComponent(
                job.announcement_version_id || ''
              )}`
            : '/message/all'
        const payload = {
          title: job.title,
          content: job.content,
          category: job.channel,
          link,
          source: job.source_kind,
          messagingJobId: job.id,
          receiptId: current.id,
        }
        // A completed outbox event satisfies the existing notification FK; the workflow worker never claims it.
        await db.query(
          "INSERT INTO outbox(tenant_id,id,recipient_id,payload,status) VALUES($1,$2,$3,$4,'sent') ON CONFLICT(tenant_id,id) DO NOTHING",
          [job.tenant_id, current.id, current.user_id, JSON.stringify(payload)]
        )
        const notification = one(
          await rows<{ id: string }>(
            db,
            'INSERT INTO notifications(tenant_id,id,event_id,recipient_id,title,content,category,link) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,event_id,recipient_id) DO UPDATE SET event_id=EXCLUDED.event_id RETURNING id',
            [
              job.tenant_id,
              notificationId,
              current.id,
              current.user_id,
              job.title,
              job.content,
              job.channel,
              link,
            ]
          )
        )
        fault('messaging:after-effects', current.id)
        await db.query(
          "UPDATE message_recipients SET status='sent',notification_id=$3,completed_at=now(),claimed_by=NULL,lease_until=NULL,error_code=NULL,error_message=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2",
          [job.tenant_id, current.id, notification.id]
        )
        await messageDeliveryEvent(db, actor, job.id, current.id, 'sent', {
          notificationId: notification.id,
          attempt: current.attempts,
          canonicalMode: 'in-app',
        })
        await audit(
          db,
          actor,
          'messaging',
          'delivery.sent',
          'message-recipient',
          current.id,
          'success',
          { jobId: job.id, attempt: current.attempts }
        )
        await refreshMessageJobStatus(db, job.tenant_id, job.id)
        return true
      })
      if (effected) fault('messaging:after-commit', recipient.id)
    } catch (error) {
      const code =
        error instanceof DomainError
          ? error.businessCode
          : 'MESSAGING_DELIVERY_FAILED'
      const message =
        error instanceof DomainError
          ? error.message
          : '消息投递暂时失败，可安全重试'
      await transaction(pool, async (db) => {
        const job = one(
          await rows<MessageJobRow>(
            db,
            'SELECT * FROM message_send_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
            [recipient.tenant_id, recipient.job_id]
          )
        )
        const changed = await rows<MessageRecipientRow>(
          db,
          "UPDATE message_recipients SET status=CASE WHEN $4 THEN 'blocked' WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,error_code=$5,error_message=$6,next_attempt_at=now()+($7::integer*interval '1 second'),completed_at=CASE WHEN $4 OR attempts>=5 THEN now() ELSE NULL END,claimed_by=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='processing' AND claimed_by=$3 AND notification_id IS NULL RETURNING *",
          [
            recipient.tenant_id,
            recipient.id,
            owner,
            blocked.has(code),
            code,
            message,
            Math.min(300, 2 ** recipient.attempts),
          ]
        )
        if (changed.length) {
          await messageDeliveryEvent(
            db,
            actor,
            job.id,
            recipient.id,
            changed[0].status === 'pending'
              ? 'retry-scheduled'
              : changed[0].status,
            { businessCode: code, attempt: changed[0].attempts }
          )
          await audit(
            db,
            actor,
            'messaging',
            'delivery.failure',
            'message-recipient',
            recipient.id,
            'failure',
            { jobId: job.id, businessCode: code, attempt: changed[0].attempts }
          )
          await refreshMessageJobStatus(db, recipient.tenant_id, job.id)
        }
      })
    }
  })
  // Last-attempt process death must also produce a terminal durable result after lease expiry.
  const exhausted = await rows<MessageRecipientRow>(
    pool,
    "SELECT * FROM message_recipients WHERE status='processing' AND attempts>=5 AND lease_until<=now() AND notification_id IS NULL ORDER BY lease_until,id LIMIT $1",
    [batchSize]
  )
  await sequential(exhausted, async (recipient) => {
    await transaction(pool, async (db) => {
      one(
        await rows<MessageJobRow>(
          db,
          'SELECT * FROM message_send_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [recipient.tenant_id, recipient.job_id]
        )
      )
      const changed = await rows<MessageRecipientRow>(
        db,
        "UPDATE message_recipients SET status='failed',error_code='MESSAGING_LEASE_EXHAUSTED',error_message='最后一次执行租约已到期',claimed_by=NULL,lease_until=NULL,completed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='processing' AND attempts>=5 AND lease_until<=now() AND notification_id IS NULL RETURNING *",
        [recipient.tenant_id, recipient.id]
      )
      if (!changed.length) return
      fault('messaging:lease-exhausted', recipient.id)
      await messageDeliveryEvent(
        db,
        actorFor(recipient.tenant_id, owner),
        recipient.job_id,
        recipient.id,
        'failed',
        {
          businessCode: 'MESSAGING_LEASE_EXHAUSTED',
          attempt: recipient.attempts,
        }
      )
      await refreshMessageJobStatus(db, recipient.tenant_id, recipient.job_id)
    })
  })
  return claimed.length
}

export const startMessagingWorker = (pool: Pool) => {
  let stopped = false
  let running: Promise<unknown> | undefined
  const tick = () => {
    if (stopped || running) return
    running = processMessaging(pool)
      .catch(() => undefined)
      .finally(() => {
        running = undefined
      })
  }
  const timer = setInterval(tick, 500)
  tick()
  return async () => {
    stopped = true
    clearInterval(timer)
    await running
  }
}
