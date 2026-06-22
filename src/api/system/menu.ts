import request from '@/api/request'
import { recordAuditEvent } from '@/services/audit'
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
  recordAuditEvent({
    module: 'system',
    action: 'menu.create',
    eventType: 'operation',
    result: 'success',
    target: {
      type: 'menu',
      id: response.data.id,
      name: response.data.menuName,
    },
    detail: {
      permission: response.data.permission,
    },
  })
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
  recordAuditEvent({
    module: 'system',
    action: 'menu.update',
    eventType: 'permission',
    result: 'success',
    target: {
      type: 'menu',
      id,
      name: response.data.menuName,
    },
    detail: {
      permission: response.data.permission,
    },
  })
  return response.data
}

export const deleteSystemMenu = async (id: string) => {
  const response = await request.delete<null>(`/system/menus/${id}`)
  recordAuditEvent({
    module: 'system',
    action: 'menu.delete',
    eventType: 'permission',
    result: 'success',
    target: {
      type: 'menu',
      id,
    },
  })
  return response.data
}
