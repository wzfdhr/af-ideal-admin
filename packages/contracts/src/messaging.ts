import { DomainError, record, onlyKeys, text, positiveInteger } from './schemas'

export const MESSAGING_PERMISSIONS = {
  templateList: 'message:template:list',
  templateCreate: 'message:template:create',
  templateUpdate: 'message:template:update',
  templateSubmit: 'message:template:submit',
  templateApprove: 'message:template:approve',
  templateDisable: 'message:template:disable',
  templateDelete: 'message:template:delete',
  announcementList: 'message:announcement:list',
  announcementCreate: 'message:announcement:create',
  announcementUpdate: 'message:announcement:update',
  announcementPublish: 'message:announcement:publish',
  announcementRevoke: 'message:announcement:revoke',
  announcementRead: 'message:announcement:read',
  subscriptionRead: 'message:subscription:read',
  subscriptionUpdate: 'message:subscription:update',
  sendList: 'message:send:list',
  sendCreate: 'message:send:create',
  sendCancel: 'message:send:cancel',
  sendRetry: 'message:send:retry',
} as const
export type MessagingChannel = 'notice' | 'message' | 'todo' | 'alert'
export type MessagingDeliveryMode = 'in-app' | 'websocket' | 'email'
export interface MessagingAudience {
  scope: 'all' | 'role' | 'department' | 'self' | 'users'
  targetId?: string
  userIds?: string[]
}
export interface MessagingVariable {
  key: string
  label: string
  required: boolean
  defaultValue?: string
}
export interface MessageTemplateDraft {
  name: string
  channel: MessagingChannel
  title: string
  content: string
  variables: MessagingVariable[]
  reviewerId: string
  deliveryModes: MessagingDeliveryMode[]
}
export interface MessageAnnouncementDraft {
  title: string
  content: string
  audience: MessagingAudience
  expiresAt: string | null
}
const bad = (code: string, message: string): never => {
  throw new DomainError(422, code, message)
}
const bounded = (value: unknown, key: string, max: number, empty = false) => {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    return bad('MESSAGING_INVALID', `${key}内容为空或过长`)
  return value
}
export const parseMessagingAudience = (input: unknown): MessagingAudience => {
  const body = record(input)
  onlyKeys(body, ['scope', 'targetId', 'userIds'])
  if (
    !['all', 'role', 'department', 'self', 'users'].includes(String(body.scope))
  )
    return bad('MESSAGING_AUDIENCE_INVALID', '收件范围无效')
  const scope = body.scope as MessagingAudience['scope']
  if (scope === 'role' || scope === 'department') {
    if (body.userIds !== undefined)
      return bad('MESSAGING_AUDIENCE_INVALID', '收件范围不能混用')
    return { scope, targetId: text(body.targetId, 'targetId', 100) }
  }
  if (scope === 'users') {
    if (
      body.targetId !== undefined ||
      !Array.isArray(body.userIds) ||
      !body.userIds.length ||
      body.userIds.length > 1000
    )
      return bad('MESSAGING_AUDIENCE_INVALID', '显式收件人需为1至1000个身份')
    const userIds = body.userIds.map((value) => text(value, 'userId', 100))
    if (new Set(userIds).size !== userIds.length)
      return bad('MESSAGING_AUDIENCE_INVALID', '收件人重复')
    return { scope, userIds }
  }
  if (body.targetId !== undefined || body.userIds !== undefined)
    return bad('MESSAGING_AUDIENCE_INVALID', '全租户及本人范围不接受额外身份')
  return { scope }
}
export const parseMessagingModes = (
  input: unknown
): MessagingDeliveryMode[] => {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > 3 ||
    input.some((mode) => !['in-app', 'websocket', 'email'].includes(mode)) ||
    new Set(input).size !== input.length
  )
    return bad('MESSAGING_MODE_INVALID', '投递方式无效')
  if (input.includes('websocket') && !input.includes('in-app'))
    return bad('MESSAGING_MODE_INVALID', '实时推送需要保留站内消息')
  return input as MessagingDeliveryMode[]
}
export const messagingPlaceholders = (value: string) => {
  const names = [
    ...value.matchAll(/\{\{([A-Za-z][A-Za-z0-9_]{0,39})\}\}/g),
  ].map((match) => match[1])
  if (
    /\{\{|\}\}/.test(value.replace(/\{\{([A-Za-z][A-Za-z0-9_]{0,39})\}\}/g, ''))
  )
    return bad(
      'MESSAGING_PLACEHOLDER_INVALID',
      '只允许已登记的 {{变量名}}，不支持表达式'
    )
  return names
}
export const parseMessageTemplateDraft = (
  input: unknown
): MessageTemplateDraft => {
  const body = record(input)
  onlyKeys(body, [
    'name',
    'channel',
    'title',
    'content',
    'variables',
    'reviewerId',
    'deliveryModes',
  ])
  if (!['notice', 'message', 'todo', 'alert'].includes(String(body.channel)))
    return bad('MESSAGING_CHANNEL_INVALID', '消息通道无效')
  if (!Array.isArray(body.variables) || body.variables.length > 30)
    return bad('MESSAGING_VARIABLE_INVALID', '模板最多30个变量')
  const variables = body.variables.map((raw) => {
    const variable = record(raw)
    onlyKeys(variable, ['key', 'label', 'required', 'defaultValue'])
    const key = text(variable.key, 'key', 40)
    if (
      !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) ||
      typeof variable.required !== 'boolean'
    )
      return bad('MESSAGING_VARIABLE_INVALID', '变量标识及必填状态无效')
    return {
      key,
      label: text(variable.label, 'label', 100),
      required: variable.required,
      ...(variable.defaultValue !== undefined
        ? {
            defaultValue: bounded(
              variable.defaultValue,
              'defaultValue',
              1000,
              true
            ),
          }
        : {}),
    }
  })
  if (new Set(variables.map((v) => v.key)).size !== variables.length)
    return bad('MESSAGING_VARIABLE_INVALID', '变量重复')
  const title = bounded(body.title, 'title', 200)
  const content = bounded(body.content, 'content', 5000)
  const used = new Set([
    ...messagingPlaceholders(title),
    ...messagingPlaceholders(content),
  ])
  if (
    [...used].some((key) => !variables.some((v) => v.key === key)) ||
    variables.some((v) => !used.has(v.key))
  )
    return bad('MESSAGING_VARIABLE_INVALID', '变量声明必须与实际占位引用一致')
  return {
    name: text(body.name, 'name', 100),
    channel: body.channel as MessagingChannel,
    title,
    content,
    variables,
    reviewerId: text(body.reviewerId, 'reviewerId', 100),
    deliveryModes: parseMessagingModes(body.deliveryModes),
  }
}
export const renderMessageTemplate = (
  schema: MessageTemplateDraft,
  input: unknown
) => {
  const values = record(input)
  const allowed = schema.variables.map((variable) => variable.key)
  onlyKeys(values, allowed)
  const resolved: Record<string, string> = {}
  const missing: string[] = []
  schema.variables.forEach((variable) => {
    const value =
      values[variable.key] === undefined
        ? variable.defaultValue || ''
        : bounded(values[variable.key], variable.key, 1000, true)
    if (variable.required && !value.trim()) missing.push(variable.key)
    resolved[variable.key] = value
  })
  const replace = (value: string) =>
    value.replace(
      /\{\{([A-Za-z][A-Za-z0-9_]{0,39})\}\}/g,
      (_, key: string) => resolved[key]
    )
  const title = replace(schema.title)
  const content = replace(schema.content)
  if (title.length > 200 || content.length > 5000)
    return bad('MESSAGING_RENDER_TOO_LARGE', '变量替换后的标题或正文过长')
  if (!missing.length && (!title.trim() || !content.trim()))
    bad('MESSAGING_RENDER_EMPTY', '替换后的消息标题和正文不能为空')
  return { title, content, missingVariables: missing, variables: resolved }
}
const parseMessagingDate = (value: unknown, key: string): string | null => {
  if (value === null || value === undefined) return null
  const date = text(value, key, 50)
  const match = date.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/
  )
  if (!match || !Number.isFinite(Date.parse(date)))
    return bad('MESSAGING_DATE_INVALID', '时间必须为含时区的有效ISO日期')
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const calendar = new Date(Date.UTC(y, m - 1, d))
  if (
    calendar.getUTCFullYear() !== y ||
    calendar.getUTCMonth() !== m - 1 ||
    calendar.getUTCDate() !== d ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6] || 0) > 59
  )
    return bad('MESSAGING_DATE_INVALID', '日期或时间无效')
  return new Date(date).toISOString()
}
export const parseMessageAnnouncementDraft = (
  input: unknown
): MessageAnnouncementDraft => {
  const body = record(input)
  onlyKeys(body, ['title', 'content', 'audience', 'expiresAt'])
  const expiresAt = parseMessagingDate(body.expiresAt, 'expiresAt')
  return {
    title: bounded(body.title, 'title', 200),
    content: bounded(body.content, 'content', 5000),
    audience: parseMessagingAudience(body.audience),
    expiresAt,
  }
}
export interface MessageSendInput {
  templateVersionId: string
  variables: Record<string, string>
  audience: MessagingAudience
  deliveryModes: MessagingDeliveryMode[]
  scheduledAt: string | null
}
export const parseMessageSendInput = (input: unknown): MessageSendInput => {
  const body = record(input)
  onlyKeys(body, [
    'templateVersionId',
    'variables',
    'audience',
    'deliveryModes',
    'scheduledAt',
  ])
  const values = record(body.variables)
  const variables: Record<string, string> = {}
  if (Object.keys(values).length > 30)
    return bad('MESSAGING_VARIABLE_INVALID', '变量数量过多')
  Object.entries(values).forEach(([key, value]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key))
      bad('MESSAGING_VARIABLE_INVALID', '变量标识无效')
    variables[key] = bounded(value, key, 1000, true)
  })
  const scheduledAt = parseMessagingDate(body.scheduledAt, 'scheduledAt')
  return {
    templateVersionId: text(body.templateVersionId, 'templateVersionId', 100),
    variables,
    audience: parseMessagingAudience(body.audience),
    deliveryModes: parseMessagingModes(body.deliveryModes),
    scheduledAt,
  }
}
export const parseMessageSubscription = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, ['expectedRevision', 'subscribed', 'deliveryModes'])
  if (
    typeof body.subscribed !== 'boolean' ||
    !Number.isSafeInteger(body.expectedRevision) ||
    Number(body.expectedRevision) < 0
  )
    return bad('MESSAGING_SUBSCRIPTION_INVALID', '订阅状态或版本无效')
  return {
    expectedRevision: Number(body.expectedRevision),
    subscribed: body.subscribed,
    deliveryModes: parseMessagingModes(body.deliveryModes),
  }
}
export const parseMessageRevision = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, ['expectedRevision'])
  return { expectedRevision: positiveInteger(body.expectedRevision) }
}
export interface MessageTemplateVersion {
  id: string
  templateId: string
  version: number
  schema: MessageTemplateDraft
  contentHash: string
  approvedBy: string
  approvedAt: string
}
export interface MessageTemplateRecord {
  id: string
  schema: MessageTemplateDraft
  name: string
  channel: MessagingChannel
  revision: number
  draftRevision: number
  draftState: 'draft' | 'pending' | 'approved'
  enabled: boolean
  activeVersionId: string | null
  createdBy: string
  updatedAt: string
  archivedAt: string | null
  versions?: MessageTemplateVersion[]
  reviews?: MessageTemplateReview[]
}
export interface MessageTemplateReview {
  id: string
  templateId: string
  templateName: string
  schema: MessageTemplateDraft
  draftRevision: number
  reviewerId: string
  requestedBy: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  revision: number
  reason: string
  requestedAt: string
  reviewedAt: string | null
}
export interface MessageAnnouncementRecord {
  id: string
  schema: MessageAnnouncementDraft
  revision: number
  status: 'draft' | 'published' | 'revoked'
  activeVersionId: string | null
  publishedRevision: number | null
  draftChanged: boolean
  createdBy: string
  updatedAt: string
}
export interface MessagePublishedAnnouncement {
  id: string
  announcementId: string
  version: number
  title: string
  content: string
  audience: MessagingAudience
  expiresAt: string | null
  publishedAt: string
  publishedBy: string
}
export interface MessageSubscriptionRecord {
  channel: MessagingChannel
  subscribed: boolean
  deliveryModes: MessagingDeliveryMode[]
  revision: number
  stored: boolean
  updatedAt: string | null
}
export interface MessageRecipientRecord {
  id: string
  jobId: string
  userId: string
  status:
    | 'pending'
    | 'processing'
    | 'sent'
    | 'skipped'
    | 'failed'
    | 'blocked'
    | 'cancelled'
  attempts: number
  nextAttemptAt: string
  leaseUntil: string | null
  errorCode: string | null
  errorMessage: string | null
  notificationId: string | null
  completedAt: string | null
  realtimeStatus: 'off' | 'queued' | 'acknowledged'
  realtimeAckAt: string | null
}
export interface MessageSendJobRecord {
  id: string
  sourceKind: 'template' | 'announcement'
  sourceVersionId: string
  title: string
  content: string
  channel: MessagingChannel
  audience: MessagingAudience
  deliveryModes: MessagingDeliveryMode[]
  scheduledAt: string
  status:
    | 'queued'
    | 'running'
    | 'sent'
    | 'partial'
    | 'failed'
    | 'blocked'
    | 'cancelled'
  revision: number
  createdBy: string
  createdAt: string
  counts: {
    pending: number
    processing: number
    sent: number
    skipped: number
    failed: number
    blocked: number
    cancelled: number
    realtimeAcknowledged: number
  }
  recipients?: MessageRecipientRecord[]
}
export interface MessagingRecipientCatalogue {
  people: { id: string; name: string; canApprove: boolean }[]
  roles: { id: string; name: string }[]
  departments: { id: string; name: string }[]
  deliveryModes: {
    mode: MessagingDeliveryMode
    available: boolean
    reason: string
  }[]
}
