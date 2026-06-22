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

export const setAuditContextProvider = (
  provider: AuditContextProvider | undefined
) => {
  auditContextProvider = provider
}

const getOccurredAt = () =>
  (auditContextProvider?.now?.() || new Date()).toISOString()

export const recordAuditEvent = async (input: AuditEventInput) => {
  const event: AuditEventPayload = {
    ...input,
    operator: input.operator || auditContextProvider?.getOperator?.(),
    occurredAt: input.occurredAt || getOccurredAt(),
  }

  try {
    await createAuditEvent(event)
  } catch (error) {
    const metadata: Record<string, unknown> = { ...event }
    await getActiveObservability()?.reportAuditError(error, metadata)
  }
}
