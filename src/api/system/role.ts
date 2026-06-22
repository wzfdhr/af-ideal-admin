import request from '@/api/request'
import { recordAuditEvent } from '@/services/audit'
import { SYSTEM_ROLE_PERMISSIONS } from '@/constants/system-role'

export type SystemRoleStatus = 'enabled' | 'disabled'

export interface SystemRoleRecord {
  [key: string]: unknown
  id: string
  roleName: string
  roleKey: string
  roleSort: number
  dataScope: string
  status: SystemRoleStatus
  remark?: string
  createdAt: string
  updatedAt: string
}

export interface SystemRoleQuery {
  current: number
  pageSize: number
  roleName?: string
  roleKey?: string
  status?: SystemRoleStatus
}

export interface SystemRolePayload {
  roleName: string
  roleKey: string
  roleSort: number
  dataScope: string
  status: SystemRoleStatus
  remark?: string
}

export interface SystemRolePageResult {
  list: SystemRoleRecord[]
  total: number
}

export { SYSTEM_ROLE_PERMISSIONS }

export const fetchSystemRoles = async (params: SystemRoleQuery) => {
  const response = await request.get<SystemRolePageResult>('/system/roles', {
    params,
  })
  return response.data
}

export const getSystemRoleDetail = async (id: string) => {
  const response = await request.get<SystemRoleRecord>(`/system/roles/${id}`)
  return response.data
}

export const createSystemRole = async (payload: SystemRolePayload) => {
  const response = await request.post<SystemRoleRecord>(
    '/system/roles',
    payload
  )
  recordAuditEvent({
    module: 'system',
    action: 'role.create',
    eventType: 'permission',
    result: 'success',
    target: {
      type: 'role',
      id: response.data.id,
      name: response.data.roleName,
    },
    detail: {
      roleKey: response.data.roleKey,
      dataScope: response.data.dataScope,
    },
  })
  return response.data
}

export const updateSystemRole = async (
  id: string,
  payload: SystemRolePayload
) => {
  const response = await request.put<SystemRoleRecord>(
    `/system/roles/${id}`,
    payload
  )
  recordAuditEvent({
    module: 'system',
    action: 'role.update',
    eventType: 'permission',
    result: 'success',
    target: {
      type: 'role',
      id,
      name: response.data.roleName,
    },
    detail: {
      roleKey: response.data.roleKey,
      dataScope: response.data.dataScope,
    },
  })
  return response.data
}

export const deleteSystemRole = async (id: string) => {
  const response = await request.delete<null>(`/system/roles/${id}`)
  recordAuditEvent({
    module: 'system',
    action: 'role.delete',
    eventType: 'permission',
    result: 'success',
    target: {
      type: 'role',
      id,
    },
  })
  return response.data
}
