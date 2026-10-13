import { randomUUID } from 'node:crypto'
import {
  DomainError,
  MESSAGING_PERMISSIONS as P,
  parseMessageTemplateDraft,
  parseMessagingAudience,
  renderMessageTemplate,
  parseMessageAnnouncementDraft,
  parseMessageSendInput,
  parseMessageSubscription,
  parseMessageRevision,
  record,
  onlyKeys,
  positiveInteger,
  text,
} from '@af-admin/contracts'
import {
  assertRevision,
  hasPermission,
  requirePermission,
} from '@af-admin/workflow-core'
import { authenticate, scalarHeader } from './auth'
import {
  rows,
  one,
  audit,
  pageQuery,
  authorizedTransaction,
  idempotent,
  contentHash,
  sequential,
  noFault,
} from './support'
import type {
  MessageTemplateDraft,
  MessageAnnouncementDraft,
  MessagingAudience,
  MessagingDeliveryMode,
  MessagingChannel,
  MessageTemplateRecord,
  MessageTemplateVersion,
  MessageTemplateReview,
  MessageAnnouncementRecord,
  MessagePublishedAnnouncement,
  MessageSubscriptionRecord,
  MessageSendJobRecord,
  MessageRecipientRecord,
} from '@af-admin/contracts'
import type { Database, FaultInjector } from './support'
import type { Actor } from './auth'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'

export const messagingChannels: MessagingChannel[] = [
  'notice',
  'message',
  'todo',
  'alert',
]
const projectSequential = async <T, U>(
  values: T[],
  project: (value: T) => Promise<U>
) => {
  const output: U[] = []
  await sequential(values, async (value) => {
    output.push(await project(value))
  })
  return output
}
const unavailable = (code: string, message: string): never => {
  throw new DomainError(409, code, message)
}
export const assertMessagingModesAvailable = (
  modes: MessagingDeliveryMode[]
) => {
  if (modes.includes('email'))
    throw new DomainError(
      422,
      'MESSAGING_EMAIL_UNAVAILABLE',
      '邮件服务尚未配置，不能发送或启用邮件投递'
    )
}
export const assertMessagingMetadata = async (
  db: Database,
  actor: Pick<Actor, 'tenantId' | 'userId'>,
  permission: string,
  creator: string
) => {
  const visible = one(
    await rows<{ visible: boolean }>(
      db,
      'SELECT af_historical_member_scope_visible($1,$2,$3,$4) AS visible',
      [actor.tenantId, actor.userId, permission, creator]
    )
  )
  if (!visible.visible) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
}

const audiencePredicate = (audience: MessagingAudience, actorId: string) => {
  switch (audience.scope) {
    case 'self':
      return { sql: 'm.user_id=$2', target: actorId }
    case 'users':
      return {
        sql: 'm.user_id=ANY($2::text[])',
        target: audience.userIds || [],
      }
    case 'department':
      return {
        sql: "m.department_id=$2 AND EXISTS(SELECT 1 FROM departments d WHERE d.tenant_id=m.tenant_id AND d.id=$2 AND d.status='enabled' AND d.deleted_at IS NULL)",
        target: audience.targetId,
      }
    case 'role':
      return {
        sql: "EXISTS(SELECT 1 FROM member_roles mr JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id WHERE mr.tenant_id=m.tenant_id AND mr.user_id=m.user_id AND mr.role_id=$2 AND r.status='enabled' AND r.deleted_at IS NULL)",
        target: audience.targetId,
      }
    default:
      return { sql: '$2::text IS NULL', target: null }
  }
}
export const resolveMessagingAudience = async (
  db: Database,
  actor: Pick<Actor, 'tenantId' | 'userId'>,
  permission: string,
  audience: MessagingAudience
): Promise<string[]> => {
  if (audience.scope === 'role' || audience.scope === 'department') {
    const table = audience.scope === 'role' ? 'roles' : 'departments'
    one(
      await rows(
        db,
        `SELECT id FROM ${table} WHERE tenant_id=$1 AND id=$2 AND status='enabled' AND deleted_at IS NULL`,
        [actor.tenantId, audience.targetId]
      )
    )
  }
  const predicate = audiencePredicate(audience, actor.userId)
  const people = await rows<{ user_id: string; visible: boolean }>(
    db,
    `SELECT m.user_id,af_member_scope_visible($1,$3,$4,m.user_id) AS visible FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled' AND (${predicate.sql}) ORDER BY m.user_id`,
    [actor.tenantId, predicate.target, actor.userId, permission]
  )
  if (audience.scope === 'users' && people.length !== audience.userIds?.length)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  if (people.some((person) => !person.visible))
    throw new DomainError(
      403,
      'MESSAGING_AUDIENCE_FORBIDDEN',
      '请求的完整收件范围超出当前授权'
    )
  if (people.length > 1000)
    throw new DomainError(
      422,
      'MESSAGING_AUDIENCE_TOO_LARGE',
      '一次发送最多1000位接收人'
    )
  return people.map((person) => person.user_id)
}
export const messagingAudienceContains = async (
  db: Database,
  tenantId: string,
  originalSender: string,
  audience: MessagingAudience,
  recipientId: string
) => {
  const predicate = audiencePredicate(audience, originalSender)
  return (
    (
      await rows(
        db,
        `SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.user_id=$3 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled' AND (${predicate.sql})`,
        [tenantId, predicate.target, recipientId]
      )
    ).length > 0
  )
}

const deliveryAvailability = () => [
  { mode: 'in-app', available: true, reason: '持久化站内通知' },
  {
    mode: 'websocket',
    available: true,
    reason: '登录连接接收后确认回执；离线时保留站内通知',
  },
  { mode: 'email', available: false, reason: '邮件服务尚未配置' },
]
const recipientCatalogue = async (
  db: Database,
  actor: Actor,
  permission: string,
  subscriptionOnly = false
) => {
  if (subscriptionOnly)
    return {
      people: [],
      roles: [],
      departments: [],
      deliveryModes: deliveryAvailability(),
    }
  const people = await rows<{ id: string; name: string; canApprove: boolean }>(
    db,
    "SELECT m.user_id AS id,CASE WHEN af_member_field_visible($1,$2,$3,m.user_id,'name') THEN COALESCE(m.display_name,u.name) ELSE '姓名未授权' END AS name,(af_effective_permissions(m.tenant_id,m.user_id) ? $4 OR af_effective_permissions(m.tenant_id,m.user_id) ? '*') AS \"canApprove\" FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND af_member_scope_visible($1,$2,$3,m.user_id) ORDER BY m.user_id LIMIT 1000",
    [actor.tenantId, actor.userId, permission, P.templateApprove]
  )
  const roles = await rows<{ id: string; name: string }>(
    db,
    "SELECT r.id,r.role_name AS name FROM roles r WHERE r.tenant_id=$1 AND r.status='enabled' AND r.deleted_at IS NULL AND EXISTS(SELECT 1 FROM member_roles mr JOIN memberships m ON m.tenant_id=mr.tenant_id AND m.user_id=mr.user_id JOIN users u ON u.id=m.user_id WHERE mr.tenant_id=r.tenant_id AND mr.role_id=r.id AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled') AND NOT EXISTS(SELECT 1 FROM member_roles mr JOIN memberships m ON m.tenant_id=mr.tenant_id AND m.user_id=mr.user_id JOIN users u ON u.id=m.user_id WHERE mr.tenant_id=r.tenant_id AND mr.role_id=r.id AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND NOT af_member_scope_visible($1,$2,$3,m.user_id)) ORDER BY r.role_sort,r.id LIMIT 1000",
    [actor.tenantId, actor.userId, permission]
  )
  const departments = await rows<{ id: string; name: string }>(
    db,
    "SELECT d.id,d.department_name AS name FROM departments d WHERE d.tenant_id=$1 AND d.status='enabled' AND d.deleted_at IS NULL AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=d.tenant_id AND m.department_id=d.id AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled') AND NOT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=d.tenant_id AND m.department_id=d.id AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND NOT af_member_scope_visible($1,$2,$3,m.user_id)) ORDER BY d.sort,d.id LIMIT 1000",
    [actor.tenantId, actor.userId, permission]
  )
  return { people, roles, departments, deliveryModes: deliveryAvailability() }
}

export interface MessageTemplateRow {
  tenant_id: string
  id: string
  name: string
  channel: MessagingChannel
  draft_schema: MessageTemplateDraft
  draft_revision: number
  draft_state: MessageTemplateRecord['draftState']
  enabled: boolean
  revision: number
  active_version_id: string | null
  pending_review_id: string | null
  created_by: string
  updated_at: Date
  archived_at: Date | null
}
export interface MessageReviewRow {
  tenant_id: string
  id: string
  template_id: string
  draft_revision: number
  schema_snapshot: MessageTemplateDraft
  reviewer_id: string
  requested_by: string
  status: MessageTemplateReview['status']
  revision: number
  reason: string
  created_at: Date
  reviewed_at: Date | null
  template_name?: string
}
export interface MessageVersionRow {
  tenant_id: string
  id: string
  template_id: string
  version: number
  schema_snapshot: MessageTemplateDraft
  content_hash: string
  approved_by: string
  approved_at: Date
}
export interface MessageAnnouncementRow {
  tenant_id: string
  id: string
  draft_schema: MessageAnnouncementDraft
  revision: number
  status: MessageAnnouncementRecord['status']
  active_version_id: string | null
  published_revision: number | null
  created_by: string
  updated_at: Date
}
export interface MessageAnnouncementVersionRow {
  tenant_id: string
  id: string
  announcement_id: string
  version: number
  schema_snapshot: MessageAnnouncementDraft
  audience_snapshot: string[]
  content_hash: string
  published_by: string
  published_at: Date
}
export interface MessageJobRow {
  tenant_id: string
  id: string
  source_kind: MessageSendJobRecord['sourceKind']
  template_version_id: string | null
  announcement_version_id: string | null
  title: string
  content: string
  channel: MessagingChannel
  variables: Record<string, string>
  audience: MessagingAudience
  delivery_modes: MessagingDeliveryMode[]
  scheduled_at: Date
  authorization_code: string
  sender_id: string
  created_by: string
  created_at: Date
  status: MessageSendJobRecord['status']
  revision: number
}
export interface MessageRecipientRow {
  tenant_id: string
  id: string
  job_id: string
  user_id: string
  delivery_modes: MessagingDeliveryMode[]
  status: MessageRecipientRecord['status']
  attempts: number
  next_attempt_at: Date
  lease_until: Date | null
  claimed_by: string | null
  error_code: string | null
  error_message: string | null
  notification_id: string | null
  completed_at: Date | null
  realtime_ack_at: Date | null
}
const realtimeStatus = (
  row: MessageRecipientRow
): MessageRecipientRecord['realtimeStatus'] => {
  if (!row.delivery_modes.includes('websocket')) return 'off'
  return row.realtime_ack_at ? 'acknowledged' : 'queued'
}
export const messageRecipientDto = (
  row: MessageRecipientRow
): MessageRecipientRecord => ({
  id: row.id,
  jobId: row.job_id,
  userId: row.user_id,
  status: row.status,
  attempts: row.attempts,
  nextAttemptAt: row.next_attempt_at.toISOString(),
  leaseUntil: row.lease_until?.toISOString() || null,
  errorCode: row.error_code,
  errorMessage: row.error_message,
  notificationId: row.notification_id,
  completedAt: row.completed_at?.toISOString() || null,
  realtimeStatus: realtimeStatus(row),
  realtimeAckAt: row.realtime_ack_at?.toISOString() || null,
})
export const messageJobDto = async (
  db: Database,
  row: MessageJobRow,
  detail = false
): Promise<MessageSendJobRecord> => {
  const recipients = await rows<MessageRecipientRow>(
    db,
    'SELECT * FROM message_recipients WHERE tenant_id=$1 AND job_id=$2 ORDER BY user_id,id',
    [row.tenant_id, row.id]
  )
  const counts: MessageSendJobRecord['counts'] = {
    pending: 0,
    processing: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
    realtimeAcknowledged: 0,
  }
  recipients.forEach((recipient) => {
    counts[recipient.status] += 1
    if (recipient.realtime_ack_at) counts.realtimeAcknowledged += 1
  })
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceVersionId:
      row.template_version_id || row.announcement_version_id || '',
    title: row.title,
    content: row.content,
    channel: row.channel,
    audience: row.audience,
    deliveryModes: row.delivery_modes,
    scheduledAt: row.scheduled_at.toISOString(),
    status: row.status,
    revision: row.revision,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    counts,
    ...(detail ? { recipients: recipients.map(messageRecipientDto) } : {}),
  }
}
const reviewDto = (row: MessageReviewRow): MessageTemplateReview => ({
  id: row.id,
  templateId: row.template_id,
  templateName: row.template_name || row.schema_snapshot.name,
  schema: row.schema_snapshot,
  draftRevision: row.draft_revision,
  reviewerId: row.reviewer_id,
  requestedBy: row.requested_by,
  status: row.status,
  revision: row.revision,
  reason: row.reason,
  requestedAt: row.created_at.toISOString(),
  reviewedAt: row.reviewed_at?.toISOString() || null,
})
const versionDto = (row: MessageVersionRow): MessageTemplateVersion => ({
  id: row.id,
  templateId: row.template_id,
  version: row.version,
  schema: row.schema_snapshot,
  contentHash: row.content_hash,
  approvedBy: row.approved_by,
  approvedAt: row.approved_at.toISOString(),
})
const templateDto = async (
  db: Database,
  row: MessageTemplateRow,
  detail = false
): Promise<MessageTemplateRecord> => ({
  id: row.id,
  schema: row.draft_schema,
  name: row.name,
  channel: row.channel,
  revision: row.revision,
  draftRevision: row.draft_revision,
  draftState: row.draft_state,
  enabled: row.enabled,
  activeVersionId: row.active_version_id,
  createdBy: row.created_by,
  updatedAt: row.updated_at.toISOString(),
  archivedAt: row.archived_at?.toISOString() || null,
  ...(detail
    ? {
        versions: (
          await rows<MessageVersionRow>(
            db,
            'SELECT * FROM message_template_versions WHERE tenant_id=$1 AND template_id=$2 ORDER BY version DESC',
            [row.tenant_id, row.id]
          )
        ).map(versionDto),
        reviews: (
          await rows<MessageReviewRow>(
            db,
            'SELECT * FROM message_template_reviews WHERE tenant_id=$1 AND template_id=$2 ORDER BY created_at DESC,id',
            [row.tenant_id, row.id]
          )
        ).map(reviewDto),
      }
    : {}),
})
const announcementDto = (
  row: MessageAnnouncementRow
): MessageAnnouncementRecord => ({
  id: row.id,
  schema: row.draft_schema,
  revision: row.revision,
  status: row.status,
  activeVersionId: row.active_version_id,
  createdBy: row.created_by,
  updatedAt: row.updated_at.toISOString(),
  publishedRevision: row.published_revision,
  draftChanged:
    !!row.active_version_id && row.published_revision !== row.revision,
})
const publishedDto = (
  row: MessageAnnouncementVersionRow
): MessagePublishedAnnouncement => ({
  id: row.id,
  announcementId: row.announcement_id,
  version: row.version,
  ...row.schema_snapshot,
  publishedAt: row.published_at.toISOString(),
  publishedBy: row.published_by,
})
export const messagingSubscription = async (
  db: Database,
  tenantId: string,
  userId: string,
  channel: MessagingChannel
): Promise<MessageSubscriptionRecord> => {
  const subscriptions = await rows<{
    subscribed: boolean
    delivery_modes: MessagingDeliveryMode[]
    revision: number
    updated_at: Date
  }>(
    db,
    'SELECT * FROM message_subscriptions WHERE tenant_id=$1 AND user_id=$2 AND channel=$3',
    [tenantId, userId, channel]
  )
  const row = subscriptions[0]
  return {
    channel,
    subscribed: row?.subscribed ?? true,
    deliveryModes: row?.delivery_modes || ['in-app', 'websocket'],
    revision: row?.revision || 0,
    stored: !!row,
    updatedAt: row?.updated_at.toISOString() || null,
  }
}
const readTemplate = async (
  db: Database,
  actor: Actor,
  permission: string,
  id: string,
  lock = false
) => {
  const row = one(
    await rows<MessageTemplateRow>(
      db,
      `SELECT * FROM message_templates WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [actor.tenantId, id]
    )
  )
  await assertMessagingMetadata(db, actor, permission, row.created_by)
  return row
}
const readAnnouncement = async (
  db: Database,
  actor: Actor,
  permission: string,
  id: string,
  lock = false
) => {
  const row = one(
    await rows<MessageAnnouncementRow>(
      db,
      `SELECT * FROM message_announcements WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [actor.tenantId, id]
    )
  )
  await assertMessagingMetadata(db, actor, permission, row.created_by)
  return row
}
const readJob = async (
  db: Database,
  actor: Actor,
  permission: string,
  id: string,
  lock = false
) => {
  const row = one(
    await rows<MessageJobRow>(
      db,
      `SELECT * FROM message_send_jobs WHERE tenant_id=$1 AND id=$2${
        lock ? ' FOR UPDATE' : ''
      }`,
      [actor.tenantId, id]
    )
  )
  await assertMessagingMetadata(db, actor, permission, row.created_by)
  return row
}
export const messageDeliveryEvent = async (
  db: Database,
  actor: { tenantId: string; userId: string | null; name: string },
  jobId: string,
  recipientId: string | null,
  action: string,
  detail: Record<string, unknown> = {}
) => {
  await db.query(
    'INSERT INTO message_delivery_events(tenant_id,id,job_id,recipient_id,action,actor_id,actor_name,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      actor.tenantId,
      randomUUID(),
      jobId,
      recipientId,
      action,
      actor.userId,
      actor.name,
      JSON.stringify(detail),
    ]
  )
}
export const messagingAnnouncementVisible = async (
  db: Database,
  actor: Pick<Actor, 'tenantId' | 'userId'>,
  versionId: string
) => {
  const found = await rows<MessageAnnouncementVersionRow>(
    db,
    "SELECT v.* FROM message_announcement_versions v JOIN message_announcements a ON a.tenant_id=v.tenant_id AND a.id=v.announcement_id WHERE v.tenant_id=$1 AND v.id=$2 AND a.status='published' AND a.active_version_id=v.id AND (v.schema_snapshot->>'expiresAt' IS NULL OR (v.schema_snapshot->>'expiresAt')::timestamptz>now())",
    [actor.tenantId, versionId]
  )
  const row = found[0]
  if (!row || !row.audience_snapshot.includes(actor.userId)) return undefined
  return (await messagingAudienceContains(
    db,
    actor.tenantId,
    row.published_by,
    row.schema_snapshot.audience,
    actor.userId
  ))
    ? row
    : undefined
}

const assertReviewer = async (
  db: Database,
  actor: Actor,
  permission: string,
  reviewerId: string,
  authorId: string
) => {
  if (reviewerId === authorId || reviewerId === actor.userId)
    throw new DomainError(
      422,
      'MESSAGING_SELF_REVIEW',
      '模板作者及提交人不能审核自己的模板'
    )
  const candidates = await rows<{ permissions: string[]; visible: boolean }>(
    db,
    "SELECT af_effective_permissions(m.tenant_id,m.user_id) AS permissions,af_member_scope_visible($1,$3,$4,m.user_id) AS visible FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' FOR SHARE OF m,u",
    [actor.tenantId, reviewerId, actor.userId, permission]
  )
  if (!candidates.length || !candidates[0].visible)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  if (!hasPermission(candidates[0].permissions, P.templateApprove))
    unavailable(
      'MESSAGING_REVIEWER_UNAVAILABLE',
      '指定审核人当前没有模板审核权限'
    )
}
const assertTemplateUsable = (row: MessageTemplateRow) => {
  if (row.archived_at || !row.enabled)
    unavailable('MESSAGING_TEMPLATE_DISABLED', '模板已停用或归档')
}
const createJob = async (
  db: Database,
  actor: Actor,
  source: { kind: MessageJobRow['source_kind']; versionId: string },
  render: {
    title: string
    content: string
    channel: MessagingChannel
    variables?: Record<string, string>
  },
  audience: MessagingAudience,
  modes: MessagingDeliveryMode[],
  scheduledAt: string | null,
  permission: string,
  recipients: string[]
) => {
  if (!recipients.length)
    throw new DomainError(
      422,
      'MESSAGING_AUDIENCE_EMPTY',
      '没有可投递的授权接收人'
    )
  const id = randomUUID()
  await db.query(
    'INSERT INTO message_send_jobs(tenant_id,id,source_kind,template_version_id,announcement_version_id,title,content,channel,variables,audience,delivery_modes,scheduled_at,authorization_code,sender_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz,now()),$13,$14,$14)',
    [
      actor.tenantId,
      id,
      source.kind,
      source.kind === 'template' ? source.versionId : null,
      source.kind === 'announcement' ? source.versionId : null,
      render.title,
      render.content,
      render.channel,
      JSON.stringify(render.variables || {}),
      JSON.stringify(audience),
      JSON.stringify(modes),
      scheduledAt,
      permission,
      actor.userId,
    ]
  )
  await sequential(recipients, async (userId) => {
    await db.query(
      'INSERT INTO message_recipients(tenant_id,id,job_id,user_id,delivery_modes,next_attempt_at) VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()))',
      [
        actor.tenantId,
        randomUUID(),
        id,
        userId,
        JSON.stringify(modes),
        scheduledAt,
      ]
    )
  })
  await messageDeliveryEvent(db, actor, id, null, 'created', {
    recipientCount: recipients.length,
  })
  return id
}

export const refreshMessageJobStatus = async (
  db: Database,
  tenantId: string,
  id: string
) => {
  const job = one(
    await rows<MessageJobRow>(
      db,
      'SELECT * FROM message_send_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
      [tenantId, id]
    )
  )
  if (job.status === 'cancelled') return
  const counts = one(
    await rows<{
      pending: string
      processing: string
      sent: string
      failed: string
      blocked: string
      skipped: string
      cancelled: string
    }>(
      db,
      "SELECT count(*) FILTER(WHERE status='pending') AS pending,count(*) FILTER(WHERE status='processing') AS processing,count(*) FILTER(WHERE status='sent') AS sent,count(*) FILTER(WHERE status='failed') AS failed,count(*) FILTER(WHERE status='blocked') AS blocked,count(*) FILTER(WHERE status='skipped') AS skipped,count(*) FILTER(WHERE status='cancelled') AS cancelled FROM message_recipients WHERE tenant_id=$1 AND job_id=$2",
      [tenantId, id]
    )
  )
  let status: MessageSendJobRecord['status'] = 'failed'
  if (Number(counts.pending))
    status =
      Number(counts.sent) || Number(counts.processing) ? 'running' : 'queued'
  else if (Number(counts.processing)) status = 'running'
  else if (Number(counts.sent))
    status =
      Number(counts.failed) ||
      Number(counts.blocked) ||
      Number(counts.cancelled) ||
      Number(counts.skipped)
        ? 'partial'
        : 'sent'
  else if (Number(counts.blocked)) status = 'blocked'
  else if (
    Number(counts.cancelled) &&
    !Number(counts.failed) &&
    !Number(counts.skipped)
  )
    status = 'cancelled'
  if (job.status !== status)
    await db.query(
      'UPDATE message_send_jobs SET status=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
      [tenantId, id, status]
    )
}

export const assertMessagingJobSender = async (
  db: Database,
  job: MessageJobRow
) => {
  const required =
    job.source_kind === 'template' ? P.sendCreate : P.announcementPublish
  if (job.authorization_code !== required)
    unavailable('MESSAGING_PLAN_INVALID', '发送计划授权类型不一致')
  const sender = await rows<{ permissions: string[]; name: string }>(
    db,
    "SELECT af_effective_permissions(m.tenant_id,m.user_id) AS permissions,COALESCE(m.display_name,u.name) AS name FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled' AND t.status='enabled' FOR SHARE OF m,u,t",
    [job.tenant_id, job.sender_id]
  )
  if (!sender.length || !hasPermission(sender[0].permissions, required))
    unavailable('MESSAGING_SENDER_UNAUTHORIZED', '原发送者当前不可发送此消息')
  if (job.source_kind === 'template') {
    const template = one(
      await rows<MessageTemplateRow>(
        db,
        'SELECT t.* FROM message_template_versions v JOIN message_templates t ON t.tenant_id=v.tenant_id AND t.id=v.template_id WHERE v.tenant_id=$1 AND v.id=$2 FOR SHARE OF t',
        [job.tenant_id, job.template_version_id]
      )
    )
    assertTemplateUsable(template)
  } else {
    const parent = one(
      await rows<MessageAnnouncementRow & { expires_at: Date | null }>(
        db,
        "SELECT a.*,(v.schema_snapshot->>'expiresAt')::timestamptz AS expires_at FROM message_announcement_versions v JOIN message_announcements a ON a.tenant_id=v.tenant_id AND a.id=v.announcement_id WHERE v.tenant_id=$1 AND v.id=$2 FOR SHARE OF a",
        [job.tenant_id, job.announcement_version_id]
      )
    )
    if (
      parent.status !== 'published' ||
      parent.active_version_id !== job.announcement_version_id ||
      (parent.expires_at && parent.expires_at.getTime() <= Date.now())
    )
      unavailable(
        'MESSAGING_ANNOUNCEMENT_UNAVAILABLE',
        '公告已撤回、到期或被其他发布替代'
      )
    await assertMessagingMetadata(
      db,
      { tenantId: job.tenant_id, userId: job.sender_id },
      required,
      parent.created_by
    )
  }
  return sender[0]
}

export const registerMessaging = (
  server: FastifyInstance,
  pool: Pool,
  fault: FaultInjector = noFault
) => {
  const ok = (data: unknown, traceId: string) => ({
    code: 20000,
    data,
    traceId,
  })
  const idOf = (params: unknown) => text(record(params).id, 'id', 100)
  const templateResponse = async (
    db: Database,
    actor: Actor,
    permission: string,
    id: string
  ) => templateDto(db, await readTemplate(db, actor, permission, id), true)
  const announcementResponse = async (
    db: Database,
    actor: Actor,
    permission: string,
    id: string
  ) => announcementDto(await readAnnouncement(db, actor, permission, id))
  const jobResponse = async (
    db: Database,
    actor: Actor,
    permission: string,
    id: string
  ) => messageJobDto(db, await readJob(db, actor, permission, id), true)
  server.get('/api/messaging/recipients', async (request) => {
    const actor = await authenticate(pool, request)
    const purpose = record(request.query).purpose || 'send'
    if (
      !['send', 'review', 'announcement', 'subscription'].includes(
        String(purpose)
      )
    )
      throw new DomainError(
        422,
        'MESSAGING_PURPOSE_INVALID',
        '收件目录用途无效'
      )
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        let permission: string = P.sendCreate
        if (purpose === 'subscription') permission = P.subscriptionRead
        else if (purpose === 'announcement') permission = P.announcementPublish
        else if (purpose === 'review')
          permission =
            [P.templateSubmit, P.templateUpdate, P.templateCreate].find(
              (value) => hasPermission(current.permissions, value)
            ) || P.templateSubmit
        requirePermission(current.permissions, permission)
        return ok(
          await recipientCatalogue(
            db,
            current,
            permission,
            purpose === 'subscription'
          ),
          request.id
        )
      }
    )
  })
  server.get('/api/messaging/templates', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.templateList,
      async (db, current) => {
        const query = record(request.query)
        const page = pageQuery(query)
        const filter =
          "WHERE tenant_id=$1 AND af_historical_member_scope_visible($1,$2,$3,created_by) AND ($4::boolean OR archived_at IS NULL) AND name ILIKE $5 AND ($6='' OR channel=$6)"
        const params = [
          current.tenantId,
          current.userId,
          P.templateList,
          query.status === 'all' || query.includeArchived === 'true',
          `%${page.keyword}%`,
          typeof query.channel === 'string' ? query.channel : '',
        ]
        const total = one(
          await rows<{ total: string }>(
            db,
            `SELECT count(*) AS total FROM message_templates ${filter}`,
            params
          )
        )
        const found = await rows<MessageTemplateRow>(
          db,
          `SELECT * FROM message_templates ${filter} ORDER BY updated_at DESC,id LIMIT $7 OFFSET $8`,
          [...params, page.pageSize, page.offset]
        )
        return ok(
          {
            list: await Promise.all(found.map((row) => templateDto(db, row))),
            total: Number(total.total),
          },
          request.id
        )
      }
    )
  })
  server.get('/api/messaging/templates/approved', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.sendCreate,
      async (db, current) => {
        const query = record(request.query)
        const page = pageQuery(query)
        const filter =
          "FROM message_template_versions v JOIN message_templates t ON t.tenant_id=v.tenant_id AND t.id=v.template_id WHERE v.tenant_id=$1 AND t.enabled AND t.archived_at IS NULL AND (v.schema_snapshot->>'name') ILIKE $2"
        const total = one(
          await rows<{ total: string }>(
            db,
            `SELECT count(*) AS total ${filter}`,
            [current.tenantId, `%${page.keyword}%`]
          )
        )
        const found = await rows<MessageVersionRow>(
          db,
          `SELECT v.* ${filter} ORDER BY v.approved_at DESC,v.id LIMIT $3 OFFSET $4`,
          [current.tenantId, `%${page.keyword}%`, page.pageSize, page.offset]
        )
        return ok(
          { list: found.map(versionDto), total: Number(total.total) },
          request.id
        )
      }
    )
  })
  server.get('/api/messaging/templates/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.templateList,
      async (db, current) =>
        ok(
          await templateResponse(
            db,
            current,
            P.templateList,
            idOf(request.params)
          ),
          request.id
        )
    )
  })
  server.post('/api/messaging/templates', async (request) => {
    const actor = await authenticate(pool, request)
    const body = record(request.body)
    onlyKeys(body, ['schema'])
    const schema = parseMessageTemplateDraft(body.schema)
    return ok(
      await idempotent(
        pool,
        actor,
        P.templateCreate,
        'messaging.template.create',
        scalarHeader(request, 'idempotency-key'),
        schema,
        async (db, current) => {
          await assertReviewer(
            db,
            current,
            P.templateCreate,
            schema.reviewerId,
            current.userId
          )
          const id = randomUUID()
          await db.query(
            'INSERT INTO message_templates(tenant_id,id,name,channel,draft_schema,created_by) VALUES($1,$2,$3,$4,$5,$6)',
            [
              current.tenantId,
              id,
              schema.name,
              schema.channel,
              JSON.stringify(schema),
              current.userId,
            ]
          )
          await audit(
            db,
            current,
            'messaging',
            'template.create',
            'message-template',
            id
          )
          fault('messaging:template-created')
          return templateResponse(db, current, P.templateCreate, id)
        },
        true,
        '',
        (db, current, response) =>
          templateResponse(db, current, P.templateCreate, response.id)
      ),
      request.id
    )
  })
  server.put('/api/messaging/templates/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const body = record(request.body)
    onlyKeys(body, ['schema', 'expectedRevision'])
    const schema = parseMessageTemplateDraft(body.schema)
    const expectedRevision = positiveInteger(body.expectedRevision)
    return ok(
      await idempotent(
        pool,
        actor,
        P.templateUpdate,
        `messaging.template.update:${id}`,
        scalarHeader(request, 'idempotency-key'),
        { schema, expectedRevision },
        async (db, current) => {
          const old = await readTemplate(
            db,
            current,
            P.templateUpdate,
            id,
            true
          )
          assertRevision(old.revision, expectedRevision)
          if (old.archived_at || old.draft_state === 'pending')
            unavailable(
              'MESSAGING_TEMPLATE_STATE_CONFLICT',
              '归档或审核中的模板不能修改'
            )
          await assertReviewer(
            db,
            current,
            P.templateUpdate,
            schema.reviewerId,
            old.created_by
          )
          await db.query(
            "UPDATE message_templates SET name=$3,channel=$4,draft_schema=$5,draft_revision=draft_revision+1,draft_state='draft',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [
              current.tenantId,
              id,
              schema.name,
              schema.channel,
              JSON.stringify(schema),
            ]
          )
          await audit(
            db,
            current,
            'messaging',
            'template.update',
            'message-template',
            id
          )
          fault('messaging:template-updated')
          return templateResponse(db, current, P.templateUpdate, id)
        },
        true,
        '',
        (db, current, response) =>
          templateResponse(db, current, P.templateUpdate, response.id)
      ),
      request.id
    )
  })
  server.post('/api/messaging/templates/:id/submit', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const input = parseMessageRevision(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        P.templateSubmit,
        `messaging.template.submit:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (db, current) => {
          const old = await readTemplate(
            db,
            current,
            P.templateSubmit,
            id,
            true
          )
          assertRevision(old.revision, input.expectedRevision)
          if (old.archived_at || old.draft_state !== 'draft')
            unavailable(
              'MESSAGING_TEMPLATE_STATE_CONFLICT',
              '只有未归档草稿可以提交审核'
            )
          const schema = parseMessageTemplateDraft(old.draft_schema)
          await assertReviewer(
            db,
            current,
            P.templateSubmit,
            schema.reviewerId,
            old.created_by
          )
          const reviewId = randomUUID()
          await db.query(
            'INSERT INTO message_template_reviews(tenant_id,id,template_id,draft_revision,schema_snapshot,reviewer_id,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [
              current.tenantId,
              reviewId,
              id,
              old.draft_revision,
              JSON.stringify(schema),
              schema.reviewerId,
              current.userId,
            ]
          )
          await db.query(
            "UPDATE message_templates SET draft_state='pending',pending_review_id=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [current.tenantId, id, reviewId]
          )
          await audit(
            db,
            current,
            'messaging',
            'template.submit',
            'message-template',
            id,
            'success',
            { reviewId }
          )
          fault('messaging:template-submitted')
          return templateResponse(db, current, P.templateSubmit, id)
        },
        true,
        '',
        (db, current, response) =>
          templateResponse(db, current, P.templateSubmit, response.id)
      ),
      request.id
    )
  })
  server.get('/api/messaging/reviews', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.templateApprove,
      async (db, current) => {
        const query = record(request.query)
        const page = pageQuery(query)
        const params = [
          current.tenantId,
          current.userId,
          typeof query.status === 'string' ? query.status : '',
          `%${page.keyword}%`,
        ]
        const filter =
          "FROM message_template_reviews r JOIN message_templates t ON t.tenant_id=r.tenant_id AND t.id=r.template_id WHERE r.tenant_id=$1 AND r.reviewer_id=$2 AND ($3='' OR r.status=$3) AND (r.schema_snapshot->>'name') ILIKE $4"
        const total = one(
          await rows<{ total: string }>(
            db,
            `SELECT count(*) AS total ${filter}`,
            params
          )
        )
        const found = await rows<MessageReviewRow>(
          db,
          `SELECT r.* ${filter} ORDER BY r.created_at DESC,r.id LIMIT $5 OFFSET $6`,
          [...params, page.pageSize, page.offset]
        )
        return ok(
          { list: found.map(reviewDto), total: Number(total.total) },
          request.id
        )
      }
    )
  })
  server.post('/api/messaging/reviews/:id/decision', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision', 'decision', 'reason'])
    const expectedRevision = positiveInteger(body.expectedRevision)
    if (
      !['approve', 'reject'].includes(String(body.decision)) ||
      typeof body.reason !== 'string' ||
      body.reason.length > 500 ||
      (body.decision === 'reject' && body.reason.trim().length < 2)
    )
      throw new DomainError(
        422,
        'MESSAGING_REVIEW_INVALID',
        '拒绝需填写理由，审核意见最多500字'
      )
    const input = {
      expectedRevision,
      decision: body.decision as 'approve' | 'reject',
      reason: body.reason.trim(),
    }
    const response = async (db: Database, current: Actor) => {
      const review = one(
        await rows<MessageReviewRow>(
          db,
          'SELECT * FROM message_template_reviews WHERE tenant_id=$1 AND id=$2 AND reviewer_id=$3',
          [current.tenantId, id, current.userId]
        )
      )
      return reviewDto(review)
    }
    return ok(
      await idempotent(
        pool,
        actor,
        P.templateApprove,
        `messaging.review.decision:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (db, current) => {
          const located = one(
            await rows<MessageReviewRow>(
              db,
              'SELECT * FROM message_template_reviews WHERE tenant_id=$1 AND id=$2 AND reviewer_id=$3',
              [current.tenantId, id, current.userId]
            )
          )
          const template = one(
            await rows<MessageTemplateRow>(
              db,
              'SELECT * FROM message_templates WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
              [current.tenantId, located.template_id]
            )
          )
          const review = one(
            await rows<MessageReviewRow>(
              db,
              'SELECT * FROM message_template_reviews WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
              [current.tenantId, id]
            )
          )
          assertRevision(review.revision, input.expectedRevision)
          if (
            review.reviewer_id !== current.userId ||
            review.requested_by === current.userId ||
            template.created_by === current.userId
          )
            throw new DomainError(
              403,
              'MESSAGING_REVIEW_FORBIDDEN',
              '只有指定的非作者审核人可以决定'
            )
          if (
            review.status !== 'pending' ||
            template.archived_at ||
            template.pending_review_id !== id ||
            template.draft_revision !== review.draft_revision ||
            contentHash(template.draft_schema) !==
              contentHash(review.schema_snapshot)
          )
            unavailable(
              'MESSAGING_REVIEW_STATE_CONFLICT',
              '该审核已失效或草稿发生变化'
            )
          await db.query(
            'UPDATE message_template_reviews SET status=$3,revision=revision+1,reason=$4,reviewed_at=now(),decided_by=$5 WHERE tenant_id=$1 AND id=$2',
            [
              current.tenantId,
              id,
              input.decision === 'approve' ? 'approved' : 'rejected',
              input.reason,
              current.userId,
            ]
          )
          let versionId: string | null = null
          if (input.decision === 'approve') {
            versionId = randomUUID()
            await db.query(
              'INSERT INTO message_template_versions(tenant_id,id,template_id,version,review_id,schema_snapshot,content_hash,approved_by) SELECT $1,$2,$3,COALESCE(max(version),0)+1,$4,$5,$6,$7 FROM message_template_versions WHERE tenant_id=$1 AND template_id=$3',
              [
                current.tenantId,
                versionId,
                template.id,
                id,
                JSON.stringify(review.schema_snapshot),
                contentHash(review.schema_snapshot),
                current.userId,
              ]
            )
          }
          await db.query(
            'UPDATE message_templates SET draft_state=$3,pending_review_id=NULL,active_version_id=COALESCE($4,active_version_id),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [
              current.tenantId,
              template.id,
              input.decision === 'approve' ? 'approved' : 'draft',
              versionId,
            ]
          )
          await audit(
            db,
            current,
            'messaging',
            `template.${input.decision}`,
            'message-template-review',
            id,
            'success',
            { templateId: template.id, reason: input.reason, versionId }
          )
          fault('messaging:review-decided')
          return response(db, current)
        },
        true,
        '',
        (db, current) => response(db, current)
      ),
      request.id
    )
  })
  server.post('/api/messaging/templates/:id/enabled', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const body = record(request.body)
    onlyKeys(body, ['expectedRevision', 'enabled'])
    const expectedRevision = positiveInteger(body.expectedRevision)
    if (typeof body.enabled !== 'boolean')
      throw new DomainError(422, 'MESSAGING_INVALID', '启用状态无效')
    const input = { expectedRevision, enabled: body.enabled }
    return ok(
      await idempotent(
        pool,
        actor,
        P.templateDisable,
        `messaging.template.enabled:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (db, current) => {
          const old = await readTemplate(
            db,
            current,
            P.templateDisable,
            id,
            true
          )
          assertRevision(old.revision, expectedRevision)
          if (old.archived_at)
            unavailable('MESSAGING_TEMPLATE_ARCHIVED', '归档模板需先恢复')
          await db.query(
            'UPDATE message_templates SET enabled=$3,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
            [current.tenantId, id, input.enabled]
          )
          await audit(
            db,
            current,
            'messaging',
            input.enabled ? 'template.enable' : 'template.disable',
            'message-template',
            id
          )
          return templateResponse(db, current, P.templateDisable, id)
        },
        true,
        '',
        (db, current, response) =>
          templateResponse(db, current, P.templateDisable, response.id)
      ),
      request.id
    )
  })
  const archive =
    (restore: boolean) => async (request: import('fastify').FastifyRequest) => {
      const actor = await authenticate(pool, request)
      const id = idOf(request.params)
      const input = parseMessageRevision(request.body)
      return ok(
        await idempotent(
          pool,
          actor,
          P.templateDelete,
          `messaging.template.${restore ? 'restore' : 'archive'}:${id}`,
          scalarHeader(request, 'idempotency-key'),
          input,
          async (db, current) => {
            const old = await readTemplate(
              db,
              current,
              P.templateDelete,
              id,
              true
            )
            assertRevision(old.revision, input.expectedRevision)
            if (restore ? !old.archived_at : !!old.archived_at)
              unavailable(
                'MESSAGING_TEMPLATE_STATE_CONFLICT',
                '模板归档状态发生变化'
              )
            if (!restore) {
              await db.query(
                "UPDATE message_template_reviews SET status='cancelled',revision=revision+1,reviewed_at=now(),reason='模板已归档' WHERE tenant_id=$1 AND template_id=$2 AND status='pending'",
                [current.tenantId, id]
              )
              const jobs = await rows<MessageJobRow>(
                db,
                "SELECT j.* FROM message_send_jobs j JOIN message_template_versions v ON v.tenant_id=j.tenant_id AND v.id=j.template_version_id WHERE j.tenant_id=$1 AND v.template_id=$2 AND j.status IN('queued','running','blocked','partial') FOR UPDATE OF j",
                [current.tenantId, id]
              )
              await sequential(jobs, async (job) => {
                await db.query(
                  "UPDATE message_recipients SET status='blocked',error_code='MESSAGING_TEMPLATE_ARCHIVED',error_message='模板已归档',claimed_by=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND job_id=$2 AND status IN('pending','processing')",
                  [current.tenantId, job.id]
                )
                await refreshMessageJobStatus(db, current.tenantId, job.id)
                await messageDeliveryEvent(
                  db,
                  current,
                  job.id,
                  null,
                  'template.archived'
                )
              })
            }
            await db.query(
              "UPDATE message_templates SET archived_at=CASE WHEN $3 THEN NULL ELSE now() END,enabled=false,draft_state='draft',pending_review_id=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
              [current.tenantId, id, restore]
            )
            await audit(
              db,
              current,
              'messaging',
              restore ? 'template.restore' : 'template.archive',
              'message-template',
              id
            )
            return templateResponse(db, current, P.templateDelete, id)
          },
          true,
          '',
          (db, current, response) =>
            templateResponse(db, current, P.templateDelete, response.id)
        ),
        request.id
      )
    }
  server.delete('/api/messaging/templates/:id', archive(false))
  server.post('/api/messaging/templates/:id/restore', archive(true))
  server.post('/api/messaging/templates/:id/preview', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const body = record(request.body)
    onlyKeys(body, ['versionId', 'variables', 'audience'])
    const versionId = text(body.versionId, 'versionId', 100)
    const audience = parseMessagingAudience(body.audience)
    return authorizedTransaction(
      pool,
      actor,
      undefined,
      async (db, current) => {
        const permission = hasPermission(current.permissions, P.sendCreate)
          ? P.sendCreate
          : P.templateUpdate
        requirePermission(current.permissions, permission)
        const template =
          permission === P.sendCreate
            ? one(
                await rows<MessageTemplateRow>(
                  db,
                  'SELECT * FROM message_templates WHERE tenant_id=$1 AND id=$2',
                  [current.tenantId, id]
                )
              )
            : await readTemplate(db, current, permission, id)
        assertTemplateUsable(template)
        const version = one(
          await rows<MessageVersionRow>(
            db,
            'SELECT * FROM message_template_versions WHERE tenant_id=$1 AND template_id=$2 AND id=$3',
            [current.tenantId, id, versionId]
          )
        )
        const rendered = renderMessageTemplate(
          version.schema_snapshot,
          body.variables
        )
        const recipients = await resolveMessagingAudience(
          db,
          current,
          permission,
          audience
        )
        return ok(
          { ...rendered, recipientCount: recipients.length },
          request.id
        )
      }
    )
  })
  server.get('/api/messaging/send-jobs', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.sendList,
      async (db, current) => {
        const query = record(request.query)
        const page = pageQuery(query)
        const filter =
          "WHERE tenant_id=$1 AND af_historical_member_scope_visible($1,$2,$3,created_by) AND title ILIKE $4 AND ($5='' OR status=$5)"
        const params = [
          current.tenantId,
          current.userId,
          P.sendList,
          `%${page.keyword}%`,
          typeof query.status === 'string' ? query.status : '',
        ]
        const total = one(
          await rows<{ total: string }>(
            db,
            `SELECT count(*) AS total FROM message_send_jobs ${filter}`,
            params
          )
        )
        const found = await rows<MessageJobRow>(
          db,
          `SELECT * FROM message_send_jobs ${filter} ORDER BY created_at DESC,id LIMIT $6 OFFSET $7`,
          [...params, page.pageSize, page.offset]
        )
        return ok(
          {
            list: await projectSequential(found, (row) =>
              messageJobDto(db, row)
            ),
            total: Number(total.total),
          },
          request.id
        )
      }
    )
  })
  server.get('/api/messaging/send-jobs/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(pool, actor, P.sendList, async (db, current) =>
      ok(
        await jobResponse(db, current, P.sendList, idOf(request.params)),
        request.id
      )
    )
  })
  server.post('/api/messaging/send-jobs', async (request) => {
    const actor = await authenticate(pool, request)
    const input = parseMessageSendInput(request.body)
    assertMessagingModesAvailable(input.deliveryModes)
    return ok(
      await idempotent(
        pool,
        actor,
        P.sendCreate,
        'messaging.send.create',
        scalarHeader(request, 'idempotency-key'),
        input,
        async (db, current) => {
          const version = one(
            await rows<MessageVersionRow>(
              db,
              'SELECT * FROM message_template_versions WHERE tenant_id=$1 AND id=$2',
              [current.tenantId, input.templateVersionId]
            )
          )
          const template = one(
            await rows<MessageTemplateRow>(
              db,
              'SELECT * FROM message_templates WHERE tenant_id=$1 AND id=$2 FOR SHARE',
              [current.tenantId, version.template_id]
            )
          )
          assertTemplateUsable(template)
          if (
            input.deliveryModes.some(
              (mode) => !version.schema_snapshot.deliveryModes.includes(mode)
            )
          )
            throw new DomainError(
              422,
              'MESSAGING_MODE_NOT_APPROVED',
              '发送方式不在此固定审核版本中'
            )
          const rendered = renderMessageTemplate(
            version.schema_snapshot,
            input.variables
          )
          if (rendered.missingVariables.length)
            throw new DomainError(
              422,
              'MESSAGING_VARIABLES_MISSING',
              '必填模板变量尚未提供',
              Object.fromEntries(
                rendered.missingVariables.map((key) => [key, ['请提供此变量']])
              )
            )
          if (
            input.scheduledAt &&
            Date.parse(input.scheduledAt) > Date.now() + 366 * 86400000
          )
            throw new DomainError(
              422,
              'MESSAGING_SCHEDULE_INVALID',
              '计划时间不能超过一年'
            )
          const recipients = await resolveMessagingAudience(
            db,
            current,
            P.sendCreate,
            input.audience
          )
          const id = await createJob(
            db,
            current,
            { kind: 'template', versionId: version.id },
            { ...rendered, channel: version.schema_snapshot.channel },
            input.audience,
            input.deliveryModes,
            input.scheduledAt,
            P.sendCreate,
            recipients
          )
          await audit(
            db,
            current,
            'messaging',
            'send.create',
            'message-send-job',
            id,
            'success',
            { recipientCount: recipients.length, versionId: version.id }
          )
          fault('messaging:job-created')
          return jobResponse(db, current, P.sendCreate, id)
        },
        true,
        '',
        (db, current, response) =>
          jobResponse(db, current, P.sendCreate, response.id)
      ),
      request.id
    )
  })
  const jobCommand =
    (retry: boolean) => async (request: import('fastify').FastifyRequest) => {
      const actor = await authenticate(pool, request)
      const id = idOf(request.params)
      const input = parseMessageRevision(request.body)
      const permission = retry ? P.sendRetry : P.sendCancel
      return ok(
        await idempotent(
          pool,
          actor,
          permission,
          `messaging.send.${retry ? 'retry' : 'cancel'}:${id}`,
          scalarHeader(request, 'idempotency-key'),
          input,
          async (db, current) => {
            const old = await readJob(db, current, permission, id, true)
            assertRevision(old.revision, input.expectedRevision)
            if (retry) {
              if (!['failed', 'blocked', 'partial'].includes(old.status))
                unavailable(
                  'MESSAGING_JOB_STATE_CONFLICT',
                  '只有失败或阻塞的任务可以重试'
                )
              await assertMessagingJobSender(db, old)
              await resolveMessagingAudience(
                db,
                { tenantId: old.tenant_id, userId: old.sender_id },
                old.authorization_code,
                old.audience
              )
              const result = await db.query(
                "UPDATE message_recipients SET status='pending',attempts=0,next_attempt_at=now(),lease_until=NULL,claimed_by=NULL,error_code=NULL,error_message=NULL,completed_at=NULL,updated_at=now() WHERE tenant_id=$1 AND job_id=$2 AND status IN('blocked','failed') AND notification_id IS NULL",
                [current.tenantId, id]
              )
              if (!result.rowCount)
                unavailable(
                  'MESSAGING_JOB_NO_RETRY',
                  '没有可重试且尚未投递的接收人'
                )
              await db.query(
                "UPDATE message_send_jobs SET status='queued',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
                [current.tenantId, id]
              )
            } else {
              if (['sent', 'cancelled'].includes(old.status))
                unavailable(
                  'MESSAGING_JOB_STATE_CONFLICT',
                  '已完成或取消的任务不能再次取消'
                )
              await db.query(
                "UPDATE message_recipients SET status='cancelled',lease_until=NULL,claimed_by=NULL,error_code='MESSAGING_CANCELLED',error_message='发送任务已取消',completed_at=now(),updated_at=now() WHERE tenant_id=$1 AND job_id=$2 AND status IN('pending','processing','blocked','failed') AND notification_id IS NULL",
                [current.tenantId, id]
              )
              await db.query(
                "UPDATE message_send_jobs SET status='cancelled',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
                [current.tenantId, id]
              )
            }
            await messageDeliveryEvent(
              db,
              current,
              id,
              null,
              retry ? 'retry' : 'cancel'
            )
            await audit(
              db,
              current,
              'messaging',
              retry ? 'send.retry' : 'send.cancel',
              'message-send-job',
              id
            )
            fault(retry ? 'messaging:job-retried' : 'messaging:job-cancelled')
            return jobResponse(db, current, permission, id)
          },
          true,
          '',
          (db, current, response) =>
            jobResponse(db, current, permission, response.id)
        ),
        request.id
      )
    }
  server.post('/api/messaging/send-jobs/:id/cancel', jobCommand(false))
  server.post('/api/messaging/send-jobs/:id/retry', jobCommand(true))
  server.get('/api/messaging/announcements', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.announcementList,
      async (db, current) => {
        const query = record(request.query)
        const page = pageQuery(query)
        const filter =
          "WHERE tenant_id=$1 AND af_historical_member_scope_visible($1,$2,$3,created_by) AND (draft_schema->>'title') ILIKE $4 AND ($5='' OR status=$5)"
        const params = [
          current.tenantId,
          current.userId,
          P.announcementList,
          `%${page.keyword}%`,
          typeof query.status === 'string' ? query.status : '',
        ]
        const total = one(
          await rows<{ total: string }>(
            db,
            `SELECT count(*) AS total FROM message_announcements ${filter}`,
            params
          )
        )
        const found = await rows<MessageAnnouncementRow>(
          db,
          `SELECT * FROM message_announcements ${filter} ORDER BY updated_at DESC,id LIMIT $6 OFFSET $7`,
          [...params, page.pageSize, page.offset]
        )
        return ok(
          { list: found.map(announcementDto), total: Number(total.total) },
          request.id
        )
      }
    )
  })
  server.get('/api/messaging/announcements/published', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.announcementRead,
      async (db, current) => {
        const page = pageQuery(request.query)
        const versions = await rows<{ id: string }>(
          db,
          "SELECT v.id FROM message_announcement_versions v JOIN message_announcements a ON a.tenant_id=v.tenant_id AND a.id=v.announcement_id WHERE v.tenant_id=$1 AND a.status='published' AND a.active_version_id=v.id AND v.audience_snapshot ? $2 AND (v.schema_snapshot->>'title') ILIKE $3 ORDER BY v.published_at DESC,v.id",
          [current.tenantId, current.userId, `%${page.keyword}%`]
        )
        const visible: MessagePublishedAnnouncement[] = []
        await sequential(versions, async (candidate) => {
          const row = await messagingAnnouncementVisible(
            db,
            current,
            candidate.id
          )
          if (row) visible.push(publishedDto(row))
        })
        return ok(
          {
            list: visible.slice(page.offset, page.offset + page.pageSize),
            total: visible.length,
          },
          request.id
        )
      }
    )
  })
  server.get(
    '/api/messaging/announcements/published/:id/read',
    async (request) => {
      const actor = await authenticate(pool, request)
      const id = idOf(request.params)
      return authorizedTransaction(
        pool,
        actor,
        P.announcementRead,
        async (db, current) => {
          const row = await messagingAnnouncementVisible(db, current, id)
          if (!row) throw new DomainError(404, 'NOT_FOUND', '资源不存在')
          return ok(publishedDto(row), request.id)
        }
      )
    }
  )
  server.get('/api/messaging/announcements/:id', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.announcementList,
      async (db, current) =>
        ok(
          await announcementResponse(
            db,
            current,
            P.announcementList,
            idOf(request.params)
          ),
          request.id
        )
    )
  })
  server.post('/api/messaging/announcements', async (request) => {
    const actor = await authenticate(pool, request)
    const body = record(request.body)
    onlyKeys(body, ['schema'])
    const schema = parseMessageAnnouncementDraft(body.schema)
    return ok(
      await idempotent(
        pool,
        actor,
        P.announcementCreate,
        'messaging.announcement.create',
        scalarHeader(request, 'idempotency-key'),
        schema,
        async (db, current) => {
          await resolveMessagingAudience(
            db,
            current,
            P.announcementCreate,
            schema.audience
          )
          const id = randomUUID()
          await db.query(
            'INSERT INTO message_announcements(tenant_id,id,draft_schema,created_by) VALUES($1,$2,$3,$4)',
            [current.tenantId, id, JSON.stringify(schema), current.userId]
          )
          await audit(
            db,
            current,
            'messaging',
            'announcement.create',
            'message-announcement',
            id
          )
          fault('messaging:announcement-created')
          return announcementResponse(db, current, P.announcementCreate, id)
        },
        true,
        '',
        (db, current, response) =>
          announcementResponse(db, current, P.announcementCreate, response.id)
      ),
      request.id
    )
  })
  server.put('/api/messaging/announcements/:id', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const body = record(request.body)
    onlyKeys(body, ['schema', 'expectedRevision'])
    const schema = parseMessageAnnouncementDraft(body.schema)
    const expectedRevision = positiveInteger(body.expectedRevision)
    return ok(
      await idempotent(
        pool,
        actor,
        P.announcementUpdate,
        `messaging.announcement.update:${id}`,
        scalarHeader(request, 'idempotency-key'),
        { schema, expectedRevision },
        async (db, current) => {
          const old = await readAnnouncement(
            db,
            current,
            P.announcementUpdate,
            id,
            true
          )
          assertRevision(old.revision, expectedRevision)
          await resolveMessagingAudience(
            db,
            current,
            P.announcementUpdate,
            schema.audience
          )
          await db.query(
            "UPDATE message_announcements SET draft_schema=$3,status=CASE WHEN active_version_id IS NULL THEN 'draft' ELSE status END,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [current.tenantId, id, JSON.stringify(schema)]
          )
          await audit(
            db,
            current,
            'messaging',
            'announcement.update',
            'message-announcement',
            id
          )
          return announcementResponse(db, current, P.announcementUpdate, id)
        },
        true,
        '',
        (db, current, response) =>
          announcementResponse(db, current, P.announcementUpdate, response.id)
      ),
      request.id
    )
  })
  server.post('/api/messaging/announcements/:id/publish', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const input = parseMessageRevision(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        P.announcementPublish,
        `messaging.announcement.publish:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (db, current) => {
          const old = await readAnnouncement(
            db,
            current,
            P.announcementPublish,
            id,
            true
          )
          assertRevision(old.revision, input.expectedRevision)
          if (
            old.status === 'published' &&
            old.published_revision === old.revision
          )
            unavailable(
              'MESSAGING_ANNOUNCEMENT_STATE_CONFLICT',
              '当前发布版本与草稿相同'
            )
          const schema = parseMessageAnnouncementDraft(old.draft_schema)
          if (schema.expiresAt && Date.parse(schema.expiresAt) <= Date.now())
            throw new DomainError(
              422,
              'MESSAGING_ANNOUNCEMENT_EXPIRED',
              '公告到期时间必须晚于当前时间'
            )
          const recipients = await resolveMessagingAudience(
            db,
            current,
            P.announcementPublish,
            schema.audience
          )
          const versionId = randomUUID()
          if (!recipients.length)
            throw new DomainError(
              422,
              'MESSAGING_AUDIENCE_EMPTY',
              '没有授权读者可以收到公告'
            )
          await db.query(
            'INSERT INTO message_announcement_versions(tenant_id,id,announcement_id,version,schema_snapshot,audience_snapshot,content_hash,published_by) SELECT $1,$2,$3,COALESCE(max(version),0)+1,$4,$5,$6,$7 FROM message_announcement_versions WHERE tenant_id=$1 AND announcement_id=$3',
            [
              current.tenantId,
              versionId,
              id,
              JSON.stringify(schema),
              JSON.stringify(recipients),
              contentHash(schema),
              current.userId,
            ]
          )
          await db.query(
            "UPDATE message_announcements SET status='published',active_version_id=$3,published_revision=revision+1,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [current.tenantId, id, versionId]
          )
          const jobId = await createJob(
            db,
            current,
            { kind: 'announcement', versionId },
            {
              title: '有新公告，请打开查看',
              content: '请打开公告页查看当前授权内容',
              channel: 'notice',
            },
            schema.audience,
            ['in-app', 'websocket'],
            null,
            P.announcementPublish,
            recipients
          )
          await audit(
            db,
            current,
            'messaging',
            'announcement.publish',
            'message-announcement',
            id,
            'success',
            { versionId, jobId, recipientCount: recipients.length }
          )
          fault('messaging:announcement-published')
          return announcementResponse(db, current, P.announcementPublish, id)
        },
        true,
        '',
        (db, current, response) =>
          announcementResponse(db, current, P.announcementPublish, response.id)
      ),
      request.id
    )
  })
  server.post('/api/messaging/announcements/:id/revoke', async (request) => {
    const actor = await authenticate(pool, request)
    const id = idOf(request.params)
    const input = parseMessageRevision(request.body)
    return ok(
      await idempotent(
        pool,
        actor,
        P.announcementRevoke,
        `messaging.announcement.revoke:${id}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (db, current) => {
          const old = await readAnnouncement(
            db,
            current,
            P.announcementRevoke,
            id,
            true
          )
          assertRevision(old.revision, input.expectedRevision)
          if (old.status !== 'published')
            unavailable(
              'MESSAGING_ANNOUNCEMENT_STATE_CONFLICT',
              '只有已发布公告可以撤回'
            )
          await db.query(
            "UPDATE message_announcements SET status='revoked',active_version_id=NULL,published_revision=NULL,revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND id=$2",
            [current.tenantId, id]
          )
          const jobs = await rows<MessageJobRow>(
            db,
            'SELECT * FROM message_send_jobs WHERE tenant_id=$1 AND announcement_version_id=$2 FOR UPDATE',
            [current.tenantId, old.active_version_id]
          )
          await sequential(jobs, async (job) => {
            await db.query(
              "UPDATE message_recipients SET status='cancelled',claimed_by=NULL,lease_until=NULL,error_code='MESSAGING_ANNOUNCEMENT_REVOKED',error_message='公告已撤回',completed_at=now(),updated_at=now() WHERE tenant_id=$1 AND job_id=$2 AND status IN('pending','processing','blocked','failed') AND notification_id IS NULL",
              [current.tenantId, job.id]
            )
            await refreshMessageJobStatus(db, current.tenantId, job.id)
            await messageDeliveryEvent(
              db,
              current,
              job.id,
              null,
              'announcement.revoked'
            )
          })
          await audit(
            db,
            current,
            'messaging',
            'announcement.revoke',
            'message-announcement',
            id
          )
          return announcementResponse(db, current, P.announcementRevoke, id)
        },
        true,
        '',
        (db, current, response) =>
          announcementResponse(db, current, P.announcementRevoke, response.id)
      ),
      request.id
    )
  })
  server.get('/api/messaging/subscriptions', async (request) => {
    const actor = await authenticate(pool, request)
    return authorizedTransaction(
      pool,
      actor,
      P.subscriptionRead,
      async (db, current) =>
        ok(
          await projectSequential(messagingChannels, (channel) =>
            messagingSubscription(db, current.tenantId, current.userId, channel)
          ),
          request.id
        )
    )
  })
  server.put('/api/messaging/subscriptions/:channel', async (request) => {
    const actor = await authenticate(pool, request)
    const channel = text(
      record(request.params).channel,
      'channel',
      20
    ) as MessagingChannel
    const input = parseMessageSubscription(request.body)
    if (!messagingChannels.includes(channel))
      throw new DomainError(422, 'MESSAGING_CHANNEL_INVALID', '消息通道无效')
    assertMessagingModesAvailable(input.deliveryModes)
    return ok(
      await idempotent(
        pool,
        actor,
        P.subscriptionUpdate,
        `messaging.subscription:${channel}`,
        scalarHeader(request, 'idempotency-key'),
        input,
        async (db, current) => {
          const old = await messagingSubscription(
            db,
            current.tenantId,
            current.userId,
            channel
          )
          assertRevision(old.revision, input.expectedRevision)
          await db.query(
            'INSERT INTO message_subscriptions(tenant_id,user_id,channel,subscribed,delivery_modes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,user_id,channel) DO UPDATE SET subscribed=EXCLUDED.subscribed,delivery_modes=EXCLUDED.delivery_modes,revision=message_subscriptions.revision+1,updated_at=now()',
            [
              current.tenantId,
              current.userId,
              channel,
              input.subscribed,
              JSON.stringify(input.deliveryModes),
            ]
          )
          await audit(
            db,
            current,
            'messaging',
            'subscription.update',
            'message-subscription',
            channel,
            'success',
            { subscribed: input.subscribed, deliveryModes: input.deliveryModes }
          )
          return messagingSubscription(
            db,
            current.tenantId,
            current.userId,
            channel
          )
        },
        true,
        '',
        (db, current) =>
          messagingSubscription(db, current.tenantId, current.userId, channel)
      ),
      request.id
    )
  })
}
