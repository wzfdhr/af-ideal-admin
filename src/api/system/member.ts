import request from '@/api/request'
import type { UserCreate, UserUpdate } from '@af-admin/contracts'

export interface MemberRecord {
  id: string
  username: string
  name: string
  phone: string
  email: string
  contactsMasked: boolean
  dept: string
  role: string
  status: 'enabled' | 'disabled'
  revision: number
  credentialRevision: number
  createdAt: string
  updatedAt: string
}
export const queryMembers = async (params: {
  current: number
  pageSize: number
  username?: string
}) =>
  (
    await request.get<{ list: MemberRecord[]; total: number }>(
      '/system/users',
      { params }
    )
  ).data
export const memberDetail = async (id: string) =>
  (await request.get<MemberRecord>(`/system/users/${id}`)).data
export const createMember = async (body: UserCreate, key: string) =>
  (
    await request.post<MemberRecord>('/system/users', body, {
      headers: { 'Idempotency-Key': key },
    })
  ).data
export const updateMember = async (id: string, body: UserUpdate, key: string) =>
  (
    await request.put<MemberRecord>(`/system/users/${id}`, body, {
      headers: { 'Idempotency-Key': key },
    })
  ).data
export const deleteMember = async (value: MemberRecord, key: string) =>
  request.delete(`/system/users/${value.id}`, {
    data: { expectedRevision: value.revision },
    headers: { 'Idempotency-Key': key },
  })
export const resetMemberPassword = async (
  value: MemberRecord,
  initialPassword: string,
  key: string
) =>
  request.post(
    `/system/users/${value.id}/reset-password`,
    {
      initialPassword,
      expectedRevision: value.revision,
      expectedCredentialRevision: value.credentialRevision,
    },
    { headers: { 'Idempotency-Key': key } }
  )
