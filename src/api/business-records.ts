import request from './request'
import type {
  BusinessRecord,
  Release,
  HistoryRecord,
  JsonObject,
} from '@af-admin/contracts'

export const publishedBusinessApplications = async () =>
  (
    await request.get<{ id: string; name: string; activeReleaseId: string }[]>(
      '/business/applications'
    )
  ).data
export const listBusinessRecords = async (params: {
  current: number
  pageSize: number
  applicationId?: string
}) =>
  (
    await request.get<{ list: BusinessRecord[]; total: number }>(
      '/business/records',
      { params }
    )
  ).data
export interface BusinessDetail extends BusinessRecord {
  release: Release
  computedFields: JsonObject
  history: HistoryRecord[]
  tasks: { id: string; revision: number; status: string; nodeName?: string }[]
  activities?: {
    id: string
    nodeId: string
    nodeName: string
    kind: string
    status: string
    parentGroupId: string | null
    branchKey: string | null
    threshold: number | null
    expectedBranches: number | null
    arrivedBranches: number
    approved: number
    pending: number
    rejected: number
    revision: number
  }[]
}
export const businessApplication = async (id: string) =>
  (
    await request.get<{ applicationId: string; release: Release }>(
      `/business/applications/${encodeURIComponent(id)}`
    )
  ).data
export const businessRecord = async (id: string) =>
  (
    await request.get<BusinessDetail>(
      `/business/records/${encodeURIComponent(id)}`
    )
  ).data
export const createBusinessRecord = async (body: unknown, key: string) =>
  (
    await request.post<{ id: string; revision: number }>(
      '/business/records',
      body,
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const updateBusinessRecord = async (
  id: string,
  body: unknown,
  key: string
) =>
  (
    await request.patch(`/business/records/${encodeURIComponent(id)}`, body, {
      headers: { 'Idempotency-Key': key },
    })
  ).data
export const submitBusinessRecord = async (
  id: string,
  revision: number,
  key: string
) =>
  (
    await request.post(
      `/business/records/${encodeURIComponent(id)}/submit`,
      { expectedRevision: revision },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const withdrawBusinessRecord = async (
  id: string,
  revision: number,
  key: string
) =>
  (
    await request.post(
      `/business/records/${encodeURIComponent(id)}/withdraw`,
      { expectedRevision: revision },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
