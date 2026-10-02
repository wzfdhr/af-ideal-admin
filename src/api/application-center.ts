import request from './request'
import type { ManagedApplication } from '@af-admin/contracts'

export const updateApplicationMetadata = async (
  app: ManagedApplication,
  body: { name: string; description: string },
  key: string
) =>
  (
    await request.patch<ManagedApplication>(
      `/application-center/${encodeURIComponent(app.id)}`,
      { ...body, expectedRevision: app.revision },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data

export const listApplications = async (params: {
  current: number
  pageSize: number
  keyword?: string
  status?: string
}) =>
  (
    await request.get<{ list: ManagedApplication[]; total: number }>(
      '/application-center',
      { params }
    )
  ).data
export const createApplication = async (body: unknown, key: string) =>
  (
    await request.post<ManagedApplication>('/application-center', body, {
      headers: { 'Idempotency-Key': key },
    })
  ).data
export const copyApplication = async (id: string, body: unknown, key: string) =>
  (
    await request.post<ManagedApplication>(
      `/application-center/${encodeURIComponent(id)}/copy`,
      body,
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const changeApplicationState = async (
  app: ManagedApplication,
  status: 'enabled' | 'archived',
  key: string
) =>
  (
    await request.put<ManagedApplication>(
      `/application-center/${encodeURIComponent(app.id)}/state`,
      { status, expectedRevision: app.revision },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
