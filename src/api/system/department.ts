import request from '@/api/request'
import { SYSTEM_DEPARTMENT_PERMISSIONS } from '@/constants/system-department'

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
}

export interface SystemDepartmentPageResult {
  list: SystemDepartmentRecord[]
  total: number
}

export { SYSTEM_DEPARTMENT_PERMISSIONS }

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
  payload: SystemDepartmentPayload
) => {
  const response = await request.post<SystemDepartmentRecord>(
    '/system/departments',
    payload
  )
  return response.data
}

export const updateSystemDepartment = async (
  id: string,
  payload: SystemDepartmentPayload
) => {
  const response = await request.put<SystemDepartmentRecord>(
    `/system/departments/${id}`,
    payload
  )
  return response.data
}

export const deleteSystemDepartment = async (id: string) => {
  const response = await request.delete<null>(`/system/departments/${id}`)
  return response.data
}
