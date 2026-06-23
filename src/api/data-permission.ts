import request from '@/api/request'

export type DataScopeType =
  | 'all'
  | 'tenant'
  | 'department-and-children'
  | 'department'
  | 'self'

export interface DataPermissionRecord {
  roleId: string
  roleName: string
  roleKey: string
  tenantId: string
  tenantName: string
  dataScope: DataScopeType
  departmentIds: string[]
  departments: string[]
  ownerUserIds: string[]
  fieldPermissions: string[]
  updatedAt: string
}

export interface DataPermissionQuery {
  current: number
  pageSize: number
  keyword?: string
  tenantId?: string
  dataScope?: DataScopeType | ''
}

export interface DataPermissionPageResult {
  list: DataPermissionRecord[]
  total: number
}

export interface DataPermissionUpdatePayload {
  dataScope: DataScopeType
  departmentIds: string[]
  ownerUserIds: string[]
  fieldPermissions: string[]
}

export interface DataPermissionUpdateResult {
  success: boolean
  record?: DataPermissionRecord
  reason?: string
}

export interface DataScopePreviewPayload {
  roleId: string
  dataScope: DataScopeType
  departmentIds: string[]
  ownerUserIds: string[]
}

export interface DataScopeBusinessRow {
  id: string
  tenantId: string
  tenantName: string
  departmentId: string
  departmentName: string
  ownerUserId: string
  ownerName: string
  customerName: string
  amount: number
}

export interface DataScopePreviewResult {
  visibleRows: DataScopeBusinessRow[]
  hiddenRows: DataScopeBusinessRow[]
}

export const fetchDataPermissionRules = async (params: DataPermissionQuery) => {
  const response = await request.get<DataPermissionPageResult>(
    '/permissions/data-scopes',
    {
      params,
    }
  )
  return response.data
}

export const updateDataPermissionRule = async (
  roleId: string,
  payload: DataPermissionUpdatePayload
) => {
  const response = await request.put<DataPermissionUpdateResult>(
    `/permissions/data-scopes/${roleId}`,
    payload
  )
  return response.data
}

export const previewDataPermission = async (
  payload: DataScopePreviewPayload
) => {
  const response = await request.post<DataScopePreviewResult>(
    '/permissions/data-scopes/preview',
    payload
  )
  return response.data
}
