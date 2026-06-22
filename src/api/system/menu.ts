import request from '@/api/request'
import { SYSTEM_MENU_PERMISSIONS } from '@/constants/system-menu'

export type SystemMenuStatus = 'enabled' | 'disabled'
export type SystemMenuType = 'catalog' | 'menu' | 'button'

export interface SystemMenuRecord {
  [key: string]: unknown
  id: string
  menuName: string
  menuType: SystemMenuType
  path: string
  permission: string
  sort: number
  status: SystemMenuStatus
  createdAt: string
  updatedAt: string
}

export interface SystemMenuQuery {
  current: number
  pageSize: number
  menuName?: string
  status?: SystemMenuStatus
}

export interface SystemMenuPayload {
  menuName: string
  menuType: SystemMenuType
  path: string
  permission: string
  sort: number
  status: SystemMenuStatus
}

export interface SystemMenuPageResult {
  list: SystemMenuRecord[]
  total: number
}

export { SYSTEM_MENU_PERMISSIONS }

export const fetchSystemMenus = async (params: SystemMenuQuery) => {
  const response = await request.get<SystemMenuPageResult>('/system/menus', {
    params,
  })
  return response.data
}

export const getSystemMenuDetail = async (id: string) => {
  const response = await request.get<SystemMenuRecord>(`/system/menus/${id}`)
  return response.data
}

export const createSystemMenu = async (payload: SystemMenuPayload) => {
  const response = await request.post<SystemMenuRecord>(
    '/system/menus',
    payload
  )
  return response.data
}

export const updateSystemMenu = async (
  id: string,
  payload: SystemMenuPayload
) => {
  const response = await request.put<SystemMenuRecord>(
    `/system/menus/${id}`,
    payload
  )
  return response.data
}

export const deleteSystemMenu = async (id: string) => {
  const response = await request.delete<null>(`/system/menus/${id}`)
  return response.data
}
