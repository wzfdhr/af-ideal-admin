import request from '@/api/request'

export type AuditEventType = 'operation' | 'security' | 'permission'
export type AuditResult = 'success' | 'failure'

export interface AuditOperator {
  id?: string
  name?: string
  role?: string
}

export interface AuditTarget {
  type: string
  id?: string
  name?: string
}

export type AuditDetail = Record<string, unknown>

export interface AuditEventPayload {
  module: string
  action: string
  eventType: AuditEventType
  result: AuditResult
  operator?: AuditOperator
  target: AuditTarget
  occurredAt: string
  traceId?: string
  detail?: AuditDetail
}

export interface AuditEventRecord extends AuditEventPayload {
  id: string
}

export const createAuditEvent = async (payload: AuditEventPayload) => {
  const response = await request.post<AuditEventRecord>(
    '/audit/events',
    payload
  )
  return response.data
}
