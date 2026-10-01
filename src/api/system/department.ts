import request from '@/api/request'
import { SYSTEM_DEPARTMENT_PERMISSIONS } from '@/constants/system-department'
import type { DepartmentNode } from '@af-admin/contracts'

export type SystemDepartmentStatus = 'enabled' | 'disabled'

export interface SystemDepartmentRecord {
  [key: string]: unknown
  id: string
  departmentName: string
  leader: string
  sort: number
  status: SystemDepartmentStatus
  createdAt: string
  updatedAt: string
  revision?: number
  parentId?: string | null
}

export interface SystemDepartmentQuery {
  current: number
  pageSize: number
  departmentName?: string
  status?: SystemDepartmentStatus
}

export interface SystemDepartmentPayload {
  departmentName: string
  leader: string
  sort: number
  status: SystemDepartmentStatus
  expectedRevision?: number
  parentId?: string | null
}

export interface SystemDepartmentPageResult {
  list: SystemDepartmentRecord[]
  total: number
}

export { SYSTEM_DEPARTMENT_PERMISSIONS }
export const fetchDepartmentTree = async () =>
  (await request.get<DepartmentNode[]>('/system/departments/tree')).data

export const fetchSystemDepartments = async (params: SystemDepartmentQuery) => {
  const response = await request.get<SystemDepartmentPageResult>(
    '/system/departments',
    { params }
  )
  return response.data
}

export const getSystemDepartmentDetail = async (id: string) => {
  const response = await request.get<SystemDepartmentRecord>(
    `/system/departments/${id}`
  )
  return response.data
}

export const createSystemDepartment = async (
  payload: SystemDepartmentPayload,
  key?: string
) => {
  const response = key
    ? await request.post<SystemDepartmentRecord>(
        '/system/departments',
        payload,
        key ? { headers: { 'Idempotency-Key': key } } : undefined
      )
    : await request.post<SystemDepartmentRecord>('/system/departments', payload)
  return response.data
}

export const updateSystemDepartment = async (
  id: string,
  payload: SystemDepartmentPayload,
  key?: string
) => {
  const response = key
    ? await request.put<SystemDepartmentRecord>(
        `/system/departments/${id}`,
        payload,
        key ? { headers: { 'Idempotency-Key': key } } : undefined
      )
    : await request.put<SystemDepartmentRecord>(
        `/system/departments/${id}`,
        payload
      )
  return response.data
}

export const deleteSystemDepartment = async (
  id: string,
  revision?: number,
  key?: string
) => {
  const response =
    revision === undefined
      ? await request.delete<null>(`/system/departments/${id}`)
      : await request.delete<null>(`/system/departments/${id}`, {
          data: { expectedRevision: revision },
          headers: key ? { 'Idempotency-Key': key } : undefined,
        })
  return response.data
}
