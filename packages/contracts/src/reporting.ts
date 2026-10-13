import { record, onlyKeys, text, positiveInteger, invalid } from './schemas'
import { isCalendarDate } from './form-behavior'
import type { Json } from './schemas'

export const REPORTING_VERSION = 1 as const
export const REPORTING_PERMISSIONS = {
  list: 'report:list',
  create: 'report:create',
  update: 'report:update',
  publish: 'report:publish',
  disable: 'report:disable',
  query: 'report:query',
  fieldApplicant: 'report:field:applicant',
  fieldBusiness: 'report:field:business',
} as const
export const REPORTING_MAX_FIELDS = 50
export const REPORTING_MAX_DAYS = 366
export const REPORTING_MAX_CURRENT = 1000000
export const REPORTING_MAX_PAGE_SIZE = 100
export const REPORTING_METADATA_FIELDS = [
  'id',
  'status',
  'revision',
  'applicationReleaseId',
  'releaseVersion',
  'applicantId',
  'applicantName',
  'departmentSnapshot',
  'createdAt',
  'updatedAt',
] as const
export const REPORTING_BUSINESS_STATUSES = [
  'draft',
  'running',
  'approved',
  'rejected',
  'withdrawn',
] as const

export type BusinessRecordStatus = (typeof REPORTING_BUSINESS_STATUSES)[number]
export type ReportingKind = 'trend' | 'distribution' | 'detail'
export type ReportingMetadataField = (typeof REPORTING_METADATA_FIELDS)[number]
export type ReportingFieldReference =
  | { kind: 'metadata'; id: ReportingMetadataField }
  | { kind: 'field'; id: string }
export interface ReportingSource {
  kind: 'application-records'
  applicationId: string
}
export interface ReportingDefinitionV1 {
  version: 1
  name: string
  source: ReportingSource
  kind: ReportingKind
  metric: 'count'
  factTime: 'createdAt'
  timeZone: string
  fields: ReportingFieldReference[]
}
/** Inclusive calendar days in timeZone; the server derives actual zoned boundaries. */
export interface ReportingDateRange {
  from: string
  to: string
}
export interface ReportingSort {
  field: ReportingFieldReference
  direction: 'asc' | 'desc'
}
export interface ReportingQueryV1 {
  version: 1
  timeZone: string
  dateRange: ReportingDateRange
  statuses: BusinessRecordStatus[]
  keyword: string
  searchFields: ReportingFieldReference[]
  sort: ReportingSort
  current: number
  pageSize: number
}

const object = (input: unknown, field: string) => {
  const value = record(input, field)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype)
    invalid(field, '必须是明确的数据对象')
  return value
}
const enumValue = <T extends string>(
  input: unknown,
  allowed: readonly T[],
  field: string
): T => {
  if (typeof input !== 'string' || !allowed.includes(input as T))
    invalid(field, '值不属于当前受控格式')
  return input as T
}
const referenceId = (input: unknown, field: string) => {
  const id = text(input, field, 100)
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) ||
    ['__proto__', 'prototype', 'constructor'].includes(id.toLowerCase())
  )
    invalid(field, '只允许安全登记标识，不接受表达式或路径')
  return id
}
const fieldIdentity = (field: ReportingFieldReference) =>
  `${field.kind}:${field.id}`

/** A safe field registry ID is a reference, never a JSONPath or an authorization decision. */
export const parseReportingFieldReference = (
  input: unknown
): ReportingFieldReference => {
  const body = object(input, 'field')
  onlyKeys(body, ['kind', 'id'])
  const kind = enumValue(
    body.kind,
    ['metadata', 'field'] as const,
    'field.kind'
  )
  const id = referenceId(body.id, 'field.id')
  if (kind === 'metadata')
    return {
      kind,
      id: enumValue(id, REPORTING_METADATA_FIELDS, 'field.id'),
    }
  return { kind, id }
}
const references = (input: unknown, field: string, allowEmpty = false) => {
  if (
    !Array.isArray(input) ||
    (!allowEmpty && !input.length) ||
    input.length > REPORTING_MAX_FIELDS
  )
    invalid(
      field,
      `字段引用数量必须为${allowEmpty ? '0' : '1'}至${REPORTING_MAX_FIELDS}`
    )
  const parsed = Array.from(input as unknown[]).map(
    parseReportingFieldReference
  )
  if (new Set(parsed.map(fieldIdentity)).size !== parsed.length)
    invalid(field, '字段引用重复')
  return parsed
}
export const parseReportingTimeZone = (input: unknown): string => {
  const zone = text(input, 'timeZone', 100)
  // Named IANA locations and UTC only: offsets and ambiguous abbreviations are not business time zones.
  if (
    zone !== 'UTC' &&
    !/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+$/.test(zone)
  )
    invalid('timeZone', '必须明确指定IANA地区时区或UTC')
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions()
      .timeZone
  } catch {
    return invalid('timeZone', '时区不存在或当前运行时不支持')
  }
}
const calendarDate = (input: unknown, field: string) => {
  if (
    !isCalendarDate(input) ||
    (input as string) < '1900-01-01' ||
    (input as string) > '2200-12-31'
  )
    invalid(field, '日期必须为1900至2200年的真实YYYY-MM-DD日历日期')
  return input as string
}
export const parseReportingDateRange = (input: unknown): ReportingDateRange => {
  const body = object(input, 'dateRange')
  onlyKeys(body, ['from', 'to'])
  const from = calendarDate(body.from, 'dateRange.from')
  const to = calendarDate(body.to, 'dateRange.to')
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000 +
    1
  // UTC is used solely for Gregorian calendar ordinals, not local day duration or timestamp conversion.
  if (days < 1 || days > REPORTING_MAX_DAYS)
    invalid('dateRange', `日期闭区间必须为1至${REPORTING_MAX_DAYS}个日历日`)
  return { from, to }
}
const businessStatuses = (input: unknown): BusinessRecordStatus[] => {
  if (input === undefined) return []
  if (
    !Array.isArray(input) ||
    input.length > REPORTING_BUSINESS_STATUSES.length
  )
    invalid('statuses', '业务状态筛选必须为有界数组')
  const parsed = Array.from(input as unknown[]).map((value) =>
    enumValue(value, REPORTING_BUSINESS_STATUSES, 'statuses')
  )
  if (new Set(parsed).size !== parsed.length)
    invalid('statuses', '业务状态重复')
  return parsed
}
const boundedPositiveInteger = (input: unknown, field: string, max: number) => {
  const value = positiveInteger(input, field)
  if (value > max) invalid(field, `${field}不能超过${max}`)
  return value
}

export const parseReportingDefinition = (
  input: unknown
): ReportingDefinitionV1 => {
  const body = object(input, 'definition')
  onlyKeys(body, [
    'version',
    'name',
    'source',
    'kind',
    'metric',
    'factTime',
    'timeZone',
    'fields',
  ])
  if (body.version !== REPORTING_VERSION)
    invalid('version', '真实报表定义仅支持明确v1格式')
  const source = object(body.source, 'source')
  onlyKeys(source, ['kind', 'applicationId'])
  if (source.kind !== 'application-records')
    invalid('source.kind', '当前仅允许登记的通用应用记录来源')
  if (body.metric !== 'count') invalid('metric', 'v1仅支持记录数量口径')
  if (body.factTime !== 'createdAt')
    invalid('factTime', 'v1事实时间必须明确为记录createdAt')
  return {
    version: REPORTING_VERSION,
    name: text(body.name, 'name', 100),
    source: {
      kind: 'application-records',
      applicationId: referenceId(source.applicationId, 'applicationId'),
    },
    kind: enumValue(
      body.kind,
      ['trend', 'distribution', 'detail'] as const,
      'kind'
    ),
    metric: 'count',
    factTime: 'createdAt',
    timeZone: parseReportingTimeZone(body.timeZone),
    fields: references(body.fields, 'fields'),
  }
}
/** This parser validates v1 syntax. Current source, registry capabilities and ACLs remain server checks. */
export const parseReportingQuery = (
  input: unknown,
  definitionInput?: unknown
): ReportingQueryV1 => {
  const body = object(input, 'query')
  onlyKeys(body, [
    'version',
    'timeZone',
    'dateRange',
    'statuses',
    'keyword',
    'searchFields',
    'sort',
    'current',
    'pageSize',
  ])
  if (body.version !== REPORTING_VERSION)
    invalid('version', '真实报表查询仅支持明确v1格式')
  const timeZone = parseReportingTimeZone(body.timeZone)
  const dateRange = parseReportingDateRange(body.dateRange)
  const sortInput = object(body.sort, 'sort')
  onlyKeys(sortInput, ['field', 'direction'])
  const sort: ReportingSort = {
    field: parseReportingFieldReference(sortInput.field),
    direction: enumValue(
      sortInput.direction,
      ['asc', 'desc'] as const,
      'sort.direction'
    ),
  }
  const searchFields = references(
    body.searchFields === undefined ? [] : body.searchFields,
    'searchFields',
    true
  )
  if (
    body.keyword !== undefined &&
    (typeof body.keyword !== 'string' || body.keyword.length > 100)
  )
    invalid('keyword', '关键词必须为不超过100字的文本')
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''
  if (keyword && !searchFields.length)
    invalid('searchFields', '关键词必须明确选择允许搜索的登记字段')
  if (definitionInput !== undefined) {
    const definition = parseReportingDefinition(definitionInput)
    if (definition.timeZone !== timeZone)
      invalid('timeZone', '查询时区必须与报表定义口径一致')
    const chosen = new Set(definition.fields.map(fieldIdentity))
    if (
      [sort.field, ...searchFields].some(
        (field) => !chosen.has(fieldIdentity(field))
      )
    )
      invalid('fields', '搜索或排序字段不属于固定报表定义')
  }
  return {
    version: REPORTING_VERSION,
    timeZone,
    dateRange,
    statuses: businessStatuses(body.statuses),
    keyword,
    searchFields,
    sort,
    current: boundedPositiveInteger(
      body.current,
      'current',
      REPORTING_MAX_CURRENT
    ),
    pageSize: boundedPositiveInteger(
      body.pageSize,
      'pageSize',
      REPORTING_MAX_PAGE_SIZE
    ),
  }
}

export type ReportingValueType =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'coordinate'
  | 'date'
  | 'datetime'
  | 'status'
export interface ReportingVisibleField {
  reference: ReportingFieldReference
  key: string
  label: string
  valueType: ReportingValueType
  coordinateAxis?: 'longitude' | 'latitude'
  searchable: boolean
  sortable: boolean
}
export interface ReportingHiddenField {
  reference: ReportingFieldReference
  reason:
    | 'permission-denied'
    | 'scope-denied'
    | 'source-unavailable'
    | 'unsupported'
}
export interface ReportingSourceCatalogue {
  source: ReportingSource
  applicationName: string
  sourceReleaseId: string
  sourceReleaseVersion: number
  visibleFields: ReportingVisibleField[]
  hiddenFields: ReportingHiddenField[]
}
export interface ReportingSourceCataloguePage {
  list: ReportingSourceCatalogue[]
  total: number
  current: number
  pageSize: number
}
export interface ReportingDefinitionRecord {
  id: string
  schema: ReportingDefinitionV1
  revision: number
  enabled: boolean
  activeVersionId: string | null
  createdBy: string
  updatedAt: string
  versions?: ReportingDefinitionVersion[]
  draftChanged?: boolean
}
export interface ReportingDefinitionVersion {
  id: string
  definitionId: string
  version: number
  schema: ReportingDefinitionV1
  sourceReleaseId: string
  sourceReleaseVersion: number
  contentHash: string
  publishedBy: string
  publishedAt: string
}
/** Authoritative values below are produced only by an authorized server query, never request parsing. */
export interface ReportingQueryResultV1 {
  version: 1
  definitionId: string
  definitionVersion: number
  source: ReportingSource
  sourceReleaseId: string
  sourceReleaseVersion: number
  policyVersion: 1
  kind: ReportingKind
  metric: 'count'
  factTime: 'createdAt'
  timeZone: string
  dateRange: ReportingDateRange
  queriedAt: string
  dataCutoffAt: string
  scope: 'current-authorized-records'
  releaseScope: 'fixed-published-source'
  visibleFields: ReportingVisibleField[]
  hiddenFields: ReportingHiddenField[]
  current: number
  pageSize: number
  total: number
  rows: {
    id: string
    values: Record<string, Json>
    hiddenFieldKeys?: string[]
  }[]
  trend: { date: string; count: number }[]
  distribution: { status: BusinessRecordStatus; count: number }[]
}
