import request from '@/api/request'
import type {
  AuditCatalogueV1,
  AuditEventPageV1,
  AuditEventPageV2,
  AuditEventRecordV1,
  AuditQueryV1,
  AuditQueryV2,
} from '@af-admin/contracts'

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
  targetId?: string
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

export type ServerAuditEventRecord = AuditEventRecordV1
export type ServerAuditEventPage = AuditEventPageV1
export type ServerAuditQuery = AuditQueryV1

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

export function fetchAuditEventPage(
  params: AuditQueryV1
): Promise<AuditEventPageV1>
export function fetchAuditEventPage(
  params: AuditQueryV2
): Promise<AuditEventPageV2>
export function fetchAuditEventPage(
  params: AuditQueryV1 | AuditQueryV2
): Promise<AuditEventPageV1 | AuditEventPageV2>
export async function fetchAuditEventPage(
  params: AuditQueryV1 | AuditQueryV2
): Promise<AuditEventPageV1 | AuditEventPageV2> {
  return (
    await request.get<AuditEventPageV1 | AuditEventPageV2>('/audit/events', {
      params,
    })
  ).data
}

export const fetchAuditCatalogue = async () =>
  (await request.get<AuditCatalogueV1>('/audit/catalogue')).data
