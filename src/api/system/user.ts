import request from '@/api/request'
import { SYSTEM_USER_PERMISSIONS } from '@/constants/system-user'

export type SystemUserStatus = 'enabled' | 'disabled'

export interface SystemUserRecord {
  [key: string]: unknown
  id: string
  username: string
  name: string
  phone: string
  email: string
  dept: string
  status: SystemUserStatus
  role: string
  createdAt: string
  updatedAt: string
}

export interface SystemUserQuery {
  current: number
  pageSize: number
  username?: string
  phone?: string
  status?: SystemUserStatus
}

export interface SystemUserPayload {
  username: string
  name: string
  phone: string
  email: string
  dept: string
  status: SystemUserStatus
  role: string
}

export interface SystemUserPageResult {
  list: SystemUserRecord[]
  total: number
}

export { SYSTEM_USER_PERMISSIONS }

export const fetchSystemUsers = async (params: SystemUserQuery) => {
  const response = await request.get<SystemUserPageResult>('/system/users', {
    params,
  })
  return response.data
}

export const getSystemUserDetail = async (id: string) => {
  const response = await request.get<SystemUserRecord>(`/system/users/${id}`)
  return response.data
}

export const createSystemUser = async (payload: SystemUserPayload) => {
  const response = await request.post<SystemUserRecord>(
    '/system/users',
    payload
  )
  return response.data
}

export const updateSystemUser = async (
  id: string,
  payload: SystemUserPayload
) => {
  const response = await request.put<SystemUserRecord>(
    `/system/users/${id}`,
    payload
  )
  return response.data
}

export const deleteSystemUser = async (id: string) => {
  const response = await request.delete<null>(`/system/users/${id}`)
  return response.data
}
