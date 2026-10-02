import request from '@/api/request'
import type { ManagedRole, RoleInput } from '@af-admin/contracts'

export interface PermissionDefinition {
  code: string
  title: string
  module: string
  delegatable: boolean
}
export interface AuthorizationMember {
  id: string
  username?: string
  name?: string
  status?: string
  revision: number
}
export interface MemberAuthorization {
  id: string
  revision: number
  roles: { id: string; roleName: string; status: string }[]
  directPermissions: string[]
  effectivePermissions: string[]
}
export const permissionCatalogue = async () =>
  (await request.get<PermissionDefinition[]>('/system/permissions')).data
export const managedRoles = async (params: {
  current: number
  pageSize: number
  roleName?: string
}) =>
  (
    await request.get<{ list: ManagedRole[]; total: number }>('/system/roles', {
      params,
    })
  ).data
export const saveManagedRole = async (
  id: string | undefined,
  body: RoleInput,
  key: string
) =>
  (id
    ? await request.put<ManagedRole>(`/system/roles/${id}`, body, {
        headers: { 'Idempotency-Key': key },
      })
    : await request.post<ManagedRole>('/system/roles', body, {
        headers: { 'Idempotency-Key': key },
      })
  ).data
export const deleteManagedRole = async (value: ManagedRole, key: string) =>
  request.delete(`/system/roles/${value.id}`, {
    data: { expectedRevision: value.revision },
    headers: { 'Idempotency-Key': key },
  })
export const authorizationMembers = async (params: {
  current: number
  pageSize: number
  keyword?: string
}) =>
  (
    await request.get<{ list: AuthorizationMember[]; total: number }>(
      '/system/authorization-members',
      { params }
    )
  ).data
export const memberAuthorization = async (id: string) =>
  (await request.get<MemberAuthorization>(`/system/users/${id}/authorization`))
    .data
export const saveMemberAuthorization = async (
  value: MemberAuthorization,
  roleIds: string[],
  directPermissions: string[],
  key: string
) =>
  (
    await request.post<MemberAuthorization>(
      `/system/users/${value.id}/authorization`,
      { roleIds, directPermissions, expectedRevision: value.revision },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
