import { invalid, onlyKeys, record } from './schemas'
import { isCalendarDate } from './form-behavior'
import { parseReportingTimeZone } from './reporting'

export const AUDIT_QUERY_VERSION = 1 as const
export const AUDIT_PROJECTION_VERSION = 1 as const
export const AUDIT_PERMISSIONS = { read: 'audit:read' } as const
export const AUDIT_EVENT_TYPES = [
  'operation',
  'security',
  'permission',
  'export',
] as const
export const AUDIT_RESULTS = ['success', 'failure'] as const
export const AUDIT_DEFAULT_TIME_ZONE = 'Asia/Shanghai'
export const AUDIT_MAX_PAGE_SIZE = 100
export const AUDIT_MAX_CURRENT = 1000000
export const AUDIT_MAX_DATE_DAYS = 366
export const AUDIT_ACTOR_FIELDS = [
  'operator.id',
  'operator.name',
  'operator.role',
] as const

type AuditOption<T extends readonly string[]> = T[number]
export type AuditEventType = AuditOption<typeof AUDIT_EVENT_TYPES>
export type AuditResult = AuditOption<typeof AUDIT_RESULTS>
export type AuditActorField = AuditOption<typeof AUDIT_ACTOR_FIELDS>

/** A normalized filter, never a client-authored audit fact. Empty dates remain on their original side. */
export interface AuditQueryV1 {
  version: 1
  current: number
  pageSize: number
  module: string
  eventType: AuditEventType | ''
  result: AuditResult | ''
  operatorName: string
  targetId: string
  traceId: string
  from: string
  to: string
  timeZone: string
}

const keys = [
  'version',
  'current',
  'pageSize',
  'module',
  'eventType',
  'result',
  'operatorName',
  'targetId',
  'traceId',
  'from',
  'to',
  'timeZone',
]
const queryObject = (input: unknown) => {
  const body = record(input, 'query')
  const prototype = Object.getPrototypeOf(body)
  if (prototype !== Object.prototype && prototype !== null)
    invalid('query', '审计查询必须为明确的数据对象')
  Reflect.ownKeys(body).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(body, key)
    if (
      typeof key !== 'string' ||
      !keys.includes(key) ||
      !descriptor ||
      !('value' in descriptor)
    )
      invalid('query', '审计查询不接受未知字段、符号或访问器')
  })
  onlyKeys(body, keys)
  return body
}
const boundedInteger = (
  value: unknown,
  field: string,
  fallback: number,
  max: number
) => {
  if (value === undefined) return fallback
  const number =
    typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value
  if (
    typeof number !== 'number' ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > max
  )
    invalid(field, `${field}必须为1至${max}的整数`)
  return number as number
}
const optionalPlainText = (input: unknown, field: string, max: number) => {
  if (input === undefined || input === '') return ''
  if (typeof input !== 'string' || input.length > max)
    invalid(field, `${field}必须为不超过${max}字的纯文本`)
  const value = input as string
  if (
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || (code >= 127 && code <= 159)
    }) ||
    /<\s*\/?\s*[A-Za-z][^>]*>|<!--|-->|(?:java|vb)script\s*:|data\s*:\s*text\/html/iu.test(
      value
    )
  )
    invalid(field, '审计筛选不接受控制字符、HTML或脚本')
  return value.trim()
}
const identifier = (input: unknown, field: string, max = 100) => {
  const value = optionalPlainText(input, field, max)
  if (
    value &&
    (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) ||
      ['__proto__', 'prototype', 'constructor'].includes(value.toLowerCase()))
  )
    invalid(field, '必须为安全的精确标识')
  return value
}
const choice = <T extends string>(
  input: unknown,
  allowed: readonly T[],
  field: string
): T | '' => {
  if (input === undefined || input === '') return ''
  if (typeof input !== 'string' || !allowed.includes(input as T))
    invalid(field, '筛选值不属于登记格式')
  return input as T
}
const calendarDate = (input: unknown, field: string) => {
  if (input === undefined || input === '') return ''
  if (
    !isCalendarDate(input) ||
    (input as string) < '1900-01-01' ||
    (input as string) > '2200-12-31'
  )
    invalid(field, '日期必须为1900至2200年的真实YYYY-MM-DD日历日期')
  return input as string
}

export const parseAuditQuery = (input: unknown): AuditQueryV1 => {
  const body = queryObject(input)
  if (
    body.version !== undefined &&
    body.version !== AUDIT_QUERY_VERSION &&
    body.version !== '1'
  )
    invalid('version', '审计查询仅支持v1')
  const from = calendarDate(body.from, 'from')
  const to = calendarDate(body.to, 'to')
  if (from && to) {
    // Gregorian day ordinals only; SQL applies timezone boundaries to actual facts.
    const days =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86400000 +
      1
    if (days < 1 || days > AUDIT_MAX_DATE_DAYS)
      invalid(
        'dateRange',
        `起止日期必须按顺序且最多${AUDIT_MAX_DATE_DAYS}个日历日`
      )
  }
  const module = identifier(body.module, 'module', 64)
  if (module && !/^[A-Za-z]/.test(module))
    invalid('module', '模块标识必须以字母开始')
  return {
    version: AUDIT_QUERY_VERSION,
    current: boundedInteger(body.current, 'current', 1, AUDIT_MAX_CURRENT),
    pageSize: boundedInteger(
      body.pageSize,
      'pageSize',
      20,
      AUDIT_MAX_PAGE_SIZE
    ),
    module,
    eventType: choice(body.eventType, AUDIT_EVENT_TYPES, 'eventType'),
    result: choice(body.result, AUDIT_RESULTS, 'result'),
    operatorName: optionalPlainText(body.operatorName, 'operatorName', 100),
    targetId: identifier(body.targetId, 'targetId'),
    traceId: identifier(body.traceId, 'traceId'),
    from,
    to,
    timeZone: parseReportingTimeZone(
      body.timeZone === undefined || body.timeZone === ''
        ? AUDIT_DEFAULT_TIME_ZONE
        : body.timeZone
    ),
  }
}

/** Authoritative server projection only. No parser accepts these fields as facts. */
export interface AuditOperatorV1 {
  readonly id: string | null
  readonly name: string | null
  /** Existing or future role metadata is not limited to the demo role enum. */
  readonly role?: string | null
}
export interface AuditTargetV1 {
  readonly type: string
  readonly id: string | null
}
/** Keys, scalar types and lengths must be selected by the server's registered action whitelist. */
export type AuditSelectedDetailV1 = Readonly<
  Record<string, string | number | boolean | null>
>
export interface AuditEventRecordV1 {
  readonly id: string
  readonly source: 'server'
  readonly projectionVersion: 1
  readonly module: string
  readonly action: string
  readonly eventType: AuditEventType
  readonly result: AuditResult
  readonly operator: AuditOperatorV1
  readonly target: AuditTargetV1
  readonly occurredAt: string
  readonly traceId: string
  readonly detail: AuditSelectedDetailV1
  readonly visibleFields: readonly AuditActorField[]
  readonly hiddenFields: readonly AuditActorField[]
}
export interface AuditEventPageV1 {
  readonly version: 1
  readonly source: 'server'
  readonly projectionVersion: 1
  readonly query: AuditQueryV1
  readonly queriedAt: string
  readonly list: readonly AuditEventRecordV1[]
  readonly total: number
  readonly current: number
  readonly pageSize: number
}
