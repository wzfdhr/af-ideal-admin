import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { responseWrap } from '@/utils/mock'
import type {
  AuditDetail,
  AuditEventPayload,
  AuditEventQuery,
  AuditEventRecord,
} from '@/api/audit'
import type { MockParams } from '../types'

export interface AuditMockStoreOptions {
  seed?: boolean
  now?: () => string
  id?: () => string
}

const SENSITIVE_KEYS = new Set([
  'authorization',
  'password',
  'token',
  'x-access-token',
  'access-token',
  'accesstoken',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const maskString = (value: string) =>
  value
    .replace(
      /(authorization|password|token|x-access-token|access-token)\s*[:=]\s*[^,\s;&]+/gi,
      '$1=[redacted]'
    )
    .replace(/Bearer\s+[^,\s;&]+/gi, 'Bearer [redacted]')
    .replace(/\b\d{17}[\dXx]\b/g, '[redacted-id-card]')

const redact = (value: unknown, key?: string): unknown => {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return '[redacted]'
  }
  if (typeof value === 'string') {
    return maskString(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item))
  }
  if (isRecord(value)) {
    return Object.keys(value).reduce<Record<string, unknown>>(
      (result, itemKey) => {
        result[itemKey] = redact(value[itemKey], itemKey)
        return result
      },
      {}
    )
  }

  return value
}

const parseBody = (body: string): AuditEventPayload => {
  try {
    return JSON.parse(body || '{}') as AuditEventPayload
  } catch {
    return {
      module: 'unknown',
      action: 'unknown',
      eventType: 'operation',
      result: 'failure',
      target: {
        type: 'unknown',
      },
      occurredAt: new Date().toISOString(),
    }
  }
}

const seedEvents: AuditEventPayload[] = [
  {
    module: 'auth',
    action: 'auth.login',
    eventType: 'security',
    result: 'success',
    operator: {
      id: '1',
      name: '系统管理员',
      role: 'admin',
    },
    target: {
      type: 'session',
      id: 'admin',
      name: 'admin',
    },
    occurredAt: '2026-06-22T09:15:00.000Z',
    traceId: 'mock-audit-login-success',
    detail: {
      ip: '127.0.0.1',
      userAgent: 'Mock Browser',
    },
  },
  {
    module: 'auth',
    action: 'auth.login',
    eventType: 'security',
    result: 'failure',
    operator: {
      id: '4',
      name: '受限用户',
      role: 'restricted',
    },
    target: {
      type: 'session',
      id: 'restricted',
      name: 'restricted',
    },
    occurredAt: '2026-06-22T09:20:00.000Z',
    traceId: 'mock-audit-login-failure',
    detail: {
      reason: '密码错误',
      password: 'secret-password',
      request: 'password=secret-password&token=secret-token',
    },
  },
  {
    module: 'system',
    action: 'system.user.update',
    eventType: 'operation',
    result: 'success',
    operator: {
      id: '1',
      name: '系统管理员',
      role: 'admin',
    },
    target: {
      type: 'user',
      id: '2',
      name: '普通用户',
    },
    occurredAt: '2026-06-22T10:05:00.000Z',
    traceId: 'mock-audit-user-update',
    detail: {
      fields: ['dept', 'job'],
      before: {
        dept: '业务部',
      },
      after: {
        dept: '运营部',
      },
    },
  },
  {
    module: 'system',
    action: 'system.role.update',
    eventType: 'permission',
    result: 'success',
    operator: {
      id: '1',
      name: '系统管理员',
      role: 'admin',
    },
    target: {
      type: 'role',
      id: 'role-operator',
      name: '运营人员',
    },
    occurredAt: '2026-06-22T10:30:00.000Z',
    traceId: 'mock-audit-role-update',
    detail: {
      permissionAdded: ['workflow:publish', 'report:export'],
      token: 'secret-token',
    },
  },
  {
    module: 'workflow',
    action: 'workflow.publish',
    eventType: 'operation',
    result: 'success',
    operator: {
      id: '1',
      name: '系统管理员',
      role: 'admin',
    },
    target: {
      type: 'workflow',
      id: 'leave-v2',
      name: '请假审批 V2',
    },
    occurredAt: '2026-06-22T11:10:00.000Z',
    traceId: 'mock-audit-workflow-publish',
    detail: {
      version: '2.0.0',
      nodes: 5,
    },
  },
  {
    module: 'form',
    action: 'form.publish',
    eventType: 'operation',
    result: 'success',
    operator: {
      id: '1',
      name: '系统管理员',
      role: 'admin',
    },
    target: {
      type: 'form',
      id: 'contract-apply',
      name: '合同申请表',
    },
    occurredAt: '2026-06-22T11:35:00.000Z',
    traceId: 'mock-audit-form-publish',
    detail: {
      version: '1.3.0',
      fields: 18,
    },
  },
  {
    module: 'visualization',
    action: 'data-screen.publish',
    eventType: 'operation',
    result: 'success',
    operator: {
      id: '1',
      name: '系统管理员',
      role: 'admin',
    },
    target: {
      type: 'data-screen',
      id: 'sales-overview',
      name: '销售经营大屏',
    },
    occurredAt: '2026-06-22T12:10:00.000Z',
    traceId: 'mock-audit-screen-publish',
    detail: {
      widgets: 12,
      dataSources: 4,
    },
  },
  {
    module: 'report',
    action: 'report.export',
    eventType: 'export',
    result: 'failure',
    operator: {
      id: '3',
      name: '运营人员',
      role: 'operator',
    },
    target: {
      type: 'report',
      id: 'order-detail',
      name: '订单明细报表',
    },
    occurredAt: '2026-06-22T13:20:00.000Z',
    traceId: 'mock-audit-report-export',
    detail: {
      reason: '导出超时',
      rows: 20000,
      authorization: 'Bearer secret-token',
    },
  },
]

type QueryValue = string | null | (string | null)[] | undefined

const cloneEvent = (event: AuditEventRecord): AuditEventRecord => ({
  ...event,
  operator: event.operator ? { ...event.operator } : undefined,
  target: { ...event.target },
  detail: event.detail ? ({ ...event.detail } as AuditDetail) : undefined,
})

const toAuditRecord = (
  payload: AuditEventPayload,
  id: string
): AuditEventRecord => ({
  ...payload,
  id,
  occurredAt: payload.occurredAt || new Date().toISOString(),
  detail: payload.detail ? (redact(payload.detail) as AuditDetail) : undefined,
})

const readString = (value: QueryValue) => {
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === 'string') || ''
  }

  return typeof value === 'string' ? value : ''
}

const readNumber = (value: QueryValue, fallback: number) => {
  const result = Number(readString(value))
  return Number.isFinite(result) && result > 0 ? result : fallback
}

const readDateRange = (
  value: QueryValue,
  bracketValue?: QueryValue
): string[] => {
  const source = value || bracketValue

  if (Array.isArray(source)) {
    return source.filter((item): item is string => typeof item === 'string')
  }

  if (typeof source === 'string' && source.includes(',')) {
    return source.split(',').filter(Boolean)
  }

  return typeof source === 'string' && source ? [source] : []
}

const toStartTime = (value?: string) => {
  if (!value) return undefined
  return new Date(
    value.includes('T') ? value : `${value}T00:00:00.000Z`
  ).getTime()
}

const toEndTime = (value?: string) => {
  if (!value) return undefined
  return new Date(
    value.includes('T') ? value : `${value}T23:59:59.999Z`
  ).getTime()
}

const parseQuery = (url: string): AuditEventQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: readNumber(query.current, 1),
    pageSize: readNumber(query.pageSize, 20),
    operatorName: readString(query.operatorName),
    module: readString(query.module),
    result: readString(query.result) as AuditEventQuery['result'],
    eventType: readString(query.eventType) as AuditEventQuery['eventType'],
    dateRange: readDateRange(query.dateRange, query['dateRange[]']),
  }
}

export const createAuditMockStore = (options: AuditMockStoreOptions = {}) => {
  let events: AuditEventRecord[] =
    options.seed === false
      ? []
      : seedEvents
          .map((event, index) =>
            toAuditRecord(event, `audit-seed-${index + 1}`)
          )
          .sort((left, right) =>
            right.occurredAt.localeCompare(left.occurredAt)
          )

  const createEvent = (payload: AuditEventPayload): AuditEventRecord => {
    const record = toAuditRecord(
      {
        ...payload,
        occurredAt: payload.occurredAt || options.now?.() || '',
      },
      options.id?.() || Mock.Random.guid()
    )
    events = [record, ...events]
    return cloneEvent(record)
  }

  const listEvents = () => events.map(cloneEvent)

  const queryEvents = (params: AuditEventQuery) => {
    const current = Math.max(Number(params.current) || 1, 1)
    const pageSize = Math.max(Number(params.pageSize) || 20, 1)
    const operatorName = params.operatorName?.trim()
    const module = params.module?.trim()
    const result = params.result || ''
    const eventType = params.eventType || ''
    const [start, end] = params.dateRange || []
    const startTime = toStartTime(start)
    const endTime = toEndTime(end)

    const filtered = events.filter((item) => {
      const occurredAt = new Date(item.occurredAt).getTime()

      if (operatorName && !item.operator?.name?.includes(operatorName)) {
        return false
      }
      if (module && item.module !== module) {
        return false
      }
      if (result && item.result !== result) {
        return false
      }
      if (eventType && item.eventType !== eventType) {
        return false
      }
      if (startTime !== undefined && occurredAt < startTime) {
        return false
      }
      if (endTime !== undefined && occurredAt > endTime) {
        return false
      }

      return true
    })

    const startIndex = (current - 1) * pageSize

    return {
      list: filtered.slice(startIndex, startIndex + pageSize).map(cloneEvent),
      total: filtered.length,
    }
  }

  return {
    createEvent,
    listEvents,
    queryEvents,
  }
}

const auditStore = createAuditMockStore()

const setupAuditMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/audit/events(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          responseWrap(auditStore.queryEvents(parseQuery(params.url)))
      )

      Mock.mock(
        new RegExp('/api/audit/events$'),
        'post',
        (params: MockParams) =>
          responseWrap(auditStore.createEvent(parseBody(params.body)))
      )
    },
  })
}

export default setupAuditMock
