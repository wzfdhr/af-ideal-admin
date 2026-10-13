import { record, onlyKeys, text, positiveInteger, invalid } from './schemas'
import { REPORT_EXPORT_FORMATS } from './report-exports'
import { parseReportingTimeZone } from './reporting'
import type { ReportExportFormat } from './report-exports'
import type { ReportingQueryV1 } from './reporting'

export const REPORT_SCHEDULE_PERMISSIONS = {
  list: 'report:schedule:list',
  create: 'report:schedule:create',
  update: 'report:schedule:update',
  toggle: 'report:schedule:toggle',
  runRead: 'report:schedule:run:read',
  retry: 'report:schedule:run:retry',
  cancel: 'report:schedule:run:cancel',
} as const
export const REPORT_SCHEDULE_MAX_RECIPIENTS = 200
const scheduleObject = (input: unknown, field = 'body') => {
  const value = record(input, field)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null)
    invalid(field, '定时报表必须是明确的数据对象')
  return value
}
export type ReportScheduleTiming = {
  timeZone: string
  time: string
} & (
  | { frequency: 'daily' }
  | { frequency: 'weekly'; weekday: number }
  | { frequency: 'monthly'; dayOfMonth: number }
)
export type ReportScheduleWindow = 'previous-period' | 'current-period'
export type ReportScheduleRecipients =
  | { kind: 'tenant' }
  | { kind: 'role'; roleId: string }
  | { kind: 'department'; departmentId: string }
export interface ReportScheduleDefinitionV1 {
  version: 1
  name: string
  definitionVersionId: string
  timing: ReportScheduleTiming
  dataWindow: ReportScheduleWindow
  recipients: ReportScheduleRecipients
  format: ReportExportFormat
}
export const parseReportScheduleTiming = (
  input: unknown
): ReportScheduleTiming => {
  const body = scheduleObject(input, 'timing')
  const { frequency } = body
  if (!['daily', 'weekly', 'monthly'].includes(frequency as string))
    invalid('timing.frequency', '仅支持日、周、月闭合周期')
  onlyKeys(body, [
    'frequency',
    'timeZone',
    'time',
    ...(frequency === 'weekly' ? ['weekday'] : []),
    ...(frequency === 'monthly' ? ['dayOfMonth'] : []),
  ])
  const timeZone = parseReportingTimeZone(body.timeZone)
  if (
    typeof body.time !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.time)
  )
    invalid('timing.time', '执行时间必须为HH:mm')
  const base = { timeZone, time: body.time as string }
  if (frequency === 'weekly') {
    const weekday = positiveInteger(body.weekday, 'timing.weekday')
    if (weekday > 7) invalid('timing.weekday', '周几必须为1至7')
    return { ...base, frequency, weekday }
  }
  if (frequency === 'monthly') {
    const dayOfMonth = positiveInteger(body.dayOfMonth, 'timing.dayOfMonth')
    if (dayOfMonth > 31) invalid('timing.dayOfMonth', '月日必须为1至31')
    return { ...base, frequency, dayOfMonth }
  }
  return { ...base, frequency: 'daily' }
}
export const parseReportScheduleDefinition = (
  input: unknown
): ReportScheduleDefinitionV1 => {
  const body = scheduleObject(input)
  onlyKeys(body, [
    'version',
    'name',
    'definitionVersionId',
    'timing',
    'dataWindow',
    'recipients',
    'format',
  ])
  if (body.version !== 1) invalid('version', '仅支持定时报表v1')
  if (
    !['previous-period', 'current-period'].includes(body.dataWindow as string)
  )
    invalid('dataWindow', '数据窗必须来自闭合目录')
  if (!REPORT_EXPORT_FORMATS.includes(body.format as ReportExportFormat))
    invalid('format', '导出格式未登记')
  const target = scheduleObject(body.recipients, 'recipients')
  let recipients: ReportScheduleRecipients = { kind: 'tenant' }
  if (target.kind === 'tenant') {
    onlyKeys(target, ['kind'])
    recipients = { kind: 'tenant' }
  } else if (target.kind === 'role') {
    onlyKeys(target, ['kind', 'roleId'])
    recipients = {
      kind: 'role',
      roleId: text(target.roleId, 'recipients.roleId', 100),
    }
  } else if (target.kind === 'department') {
    onlyKeys(target, ['kind', 'departmentId'])
    recipients = {
      kind: 'department',
      departmentId: text(target.departmentId, 'recipients.departmentId', 100),
    }
  } else invalid('recipients.kind', '接收范围必须为当前租户、角色或部门')
  return {
    version: 1,
    name: text(body.name, 'name', 100),
    definitionVersionId: text(
      body.definitionVersionId,
      'definitionVersionId',
      100
    ),
    timing: parseReportScheduleTiming(body.timing),
    dataWindow: body.dataWindow as ReportScheduleWindow,
    recipients,
    format: body.format as ReportExportFormat,
  }
}
export const parseReportScheduleCreate = (input: unknown) => {
  const body = scheduleObject(input)
  onlyKeys(body, ['schema', 'enabled'])
  if (typeof body.enabled !== 'boolean') invalid('enabled', '启用状态必须明确')
  return {
    schema: parseReportScheduleDefinition(body.schema),
    enabled: body.enabled as boolean,
  }
}
export const parseReportScheduleUpdate = (input: unknown) => {
  const body = scheduleObject(input)
  onlyKeys(body, ['schema', 'expectedRevision'])
  return {
    schema: parseReportScheduleDefinition(body.schema),
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}
export const parseReportScheduleToggle = (input: unknown) => {
  const body = scheduleObject(input)
  onlyKeys(body, ['enabled', 'expectedRevision'])
  if (typeof body.enabled !== 'boolean') invalid('enabled', '启用状态必须明确')
  return {
    enabled: body.enabled as boolean,
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}
export const parseReportScheduleCommand = (input: unknown) => {
  const body = scheduleObject(input)
  onlyKeys(body, ['expectedRevision'])
  return { expectedRevision: positiveInteger(body.expectedRevision) }
}
export interface ReportScheduleVersion {
  id: string
  scheduleId: string
  version: number
  schema: ReportScheduleDefinitionV1
  createdBy: string
  createdAt: string
}
export interface ReportSchedule {
  id: string
  revision: number
  enabled: boolean
  schema: ReportScheduleDefinitionV1
  activeVersionId: string
  version: number
  nextRunAt: string | null
  lastRunAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  allowedActions: ('update' | 'toggle')[]
  versions?: ReportScheduleVersion[]
}
export interface ReportScheduleRecipientOptions {
  roles: { id: string; name: string; eligibleRecipientCount: number }[]
  departments: { id: string; name: string; eligibleRecipientCount: number }[]
  maxRecipients: number
}
export interface ReportSchedulePreview {
  nextRunAt: string
  timeZone: string
  dateRange: { from: string; to: string }
  recipientTotal: number
  recipients: { userId: string; name: string | null }[]
  unavailableRecipientCount: number
  maxRecipients: number
}
export type ReportScheduleRunStatus =
  | 'queued'
  | 'processing'
  | 'waiting-exports'
  | 'completed'
  | 'partial-failed'
  | 'failed'
  | 'blocked'
  | 'cancelled'
export type ReportScheduleRecipientStatus =
  | 'queued'
  | 'processing'
  | 'waiting-export'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'cancelled'
export interface ReportScheduleRunRecipient {
  id: string
  userId: string
  name: string | null
  status: ReportScheduleRecipientStatus
  exportJobId: string | null
  attempts: number
  errorCode: string | null
  errorMessage: string | null
  notifiedAt: string | null
}
export interface ReportScheduleRun {
  id: string
  scheduleId: string
  periodId: string
  ruleVersionId: string
  ruleVersion: number
  slotAt: string
  query: ReportingQueryV1 | null
  status: ReportScheduleRunStatus
  revision: number
  createdBy: string
  createdAt: string
  updatedAt: string
  attempts: number
  nextAttemptAt: string
  leaseUntil: string | null
  errorCode: string | null
  errorMessage: string | null
  recipientTotal: number
  completedRecipients: number
  failedRecipients: number
  blockedRecipients: number
  skippedRecipients: number
  cancelledRecipients: number
  allowedActions: ('retry' | 'cancel')[]
  recipients?: ReportScheduleRunRecipient[]
}
