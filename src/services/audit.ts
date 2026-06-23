import { createAuditEvent, type AuditEventPayload } from '@/api/audit'
import { getActiveObservability } from '@/services/observability'

export interface AuditContextProvider {
  getOperator?: () => AuditEventPayload['operator'] | undefined
  now?: () => Date
}

export type AuditEventInput = Omit<
  AuditEventPayload,
  'operator' | 'occurredAt'
> &
  Partial<Pick<AuditEventPayload, 'operator' | 'occurredAt'>>

let auditContextProvider: AuditContextProvider | undefined

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

const maskSensitiveString = (value: string) =>
  value
    .replace(
      /(authorization|password|token|x-access-token|access-token)\s*[:=]\s*[^,\s;&]+/gi,
      '$1=[redacted]'
    )
    .replace(/Bearer\s+[^,\s;&]+/gi, 'Bearer [redacted]')
    .replace(/\b\d{17}[\dXx]\b/g, '[redacted-id-card]')

const sanitizeValue = (value: unknown, key?: string): unknown => {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return '[redacted]'
  }

  if (typeof value === 'string') {
    return maskSensitiveString(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item))
  }

  if (isRecord(value)) {
    return Object.keys(value).reduce<Record<string, unknown>>(
      (result, itemKey) => {
        result[itemKey] = sanitizeValue(value[itemKey], itemKey)
        return result
      },
      {}
    )
  }

  return value
}

const sanitizeAuditEvent = (event: AuditEventPayload): AuditEventPayload =>
  sanitizeValue(event) as AuditEventPayload

export const setAuditContextProvider = (
  provider: AuditContextProvider | undefined
) => {
  auditContextProvider = provider
}

const getOccurredAt = () =>
  (auditContextProvider?.now?.() || new Date()).toISOString()

export const recordAuditEvent = async (input: AuditEventInput) => {
  const event = sanitizeAuditEvent({
    ...input,
    operator: input.operator || auditContextProvider?.getOperator?.(),
    occurredAt: input.occurredAt || getOccurredAt(),
  })

  try {
    await createAuditEvent(event)
  } catch (error) {
    const metadata: Record<string, unknown> = { ...event }
    try {
      await getActiveObservability()?.reportAuditError(error, metadata)
    } catch {
      // Audit and observability are both side channels for business flows.
    }
  }
}
