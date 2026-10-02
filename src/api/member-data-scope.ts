import request from '@/api/request'
import type { MemberScopeInput, MemberScopeRule } from '@af-admin/contracts'

export const memberScopeRules = async (params: {
  current: number
  pageSize: number
}) =>
  (
    await request.get<{ list: MemberScopeRule[]; total: number }>(
      '/permissions/data-scopes',
      { params }
    )
  ).data
export const updateMemberScope = async (
  roleId: string,
  body: MemberScopeInput,
  key: string
) =>
  (
    await request.put<MemberScopeRule>(
      `/permissions/data-scopes/${roleId}`,
      body,
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const boundScopeMembers = async (roleId: string) =>
  (
    await request.get<{ id: string; name: string; username: string }[]>(
      `/permissions/data-scopes/${roleId}/members`
    )
  ).data
export const previewMemberScope = async (
  roleId: string,
  subjectUserId: string
) =>
  (
    await request.post<{
      visibleRows: Record<string, unknown>[]
      truncated: boolean
    }>('/permissions/data-scopes/preview', { roleId, subjectUserId })
  ).data
