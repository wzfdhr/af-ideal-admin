import Mock from 'mockjs'
import setupMock, { responseWrap } from '@/utils/mock'
import type {
  AuditDetail,
  AuditEventPayload,
  AuditEventRecord,
} from '@/api/audit'
import type { MockParams } from '../types'

export interface AuditMockStoreOptions {
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

export const createAuditMockStore = (options: AuditMockStoreOptions = {}) => {
  let events: AuditEventRecord[] = []

  const createEvent = (payload: AuditEventPayload): AuditEventRecord => {
    const record: AuditEventRecord = {
      ...payload,
      id: options.id?.() || Mock.Random.guid(),
      occurredAt:
        payload.occurredAt || options.now?.() || new Date().toISOString(),
      detail: payload.detail
        ? (redact(payload.detail) as AuditDetail)
        : undefined,
    }
    events = [record, ...events]
    return record
  }

  const listEvents = () => events.map((item) => ({ ...item }))

  return {
    createEvent,
    listEvents,
  }
}

const auditStore = createAuditMockStore()

const setupAuditMock = () => {
  setupMock({
    setup() {
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
