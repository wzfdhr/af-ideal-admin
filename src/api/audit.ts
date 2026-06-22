import request from '@/api/request'

export type AuditEventType = 'operation' | 'security' | 'permission' | 'export'
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

export interface AuditEventQuery {
  current: number
  pageSize: number
  operatorName?: string
  module?: string
  result?: AuditResult | ''
  eventType?: AuditEventType | ''
  dateRange?: string[]
}

export interface AuditEventPageResult {
  list: AuditEventRecord[]
  total: number
}

export const createAuditEvent = async (payload: AuditEventPayload) => {
  const response = await request.post<AuditEventRecord>(
    '/audit/events',
    payload
  )
  return response.data
}

export const fetchAuditEvents = async (params: AuditEventQuery) => {
  const response = await request.get<AuditEventPageResult>('/audit/events', {
    params,
  })
  return response.data
}
