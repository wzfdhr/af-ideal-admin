import request from '@/api/request'

export type TenantStatus = 'enabled' | 'disabled'

export type TenantOrgNodeType = 'company' | 'department' | 'team'

export type TenantDataScope =
  | 'all'
  | 'tenant'
  | 'department-and-children'
  | 'department'
  | 'self'

export interface TenantRecord {
  id: string
  name: string
  code: string
  status: TenantStatus
  brandName: string
  themeColor: string
  userCount: number
  departmentCount: number
  current: boolean
}

export interface TenantQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: TenantStatus | ''
}

export interface TenantPageResult {
  list: TenantRecord[]
  total: number
}

export interface TenantOrgNode {
  id: string
  tenantId: string
  name: string
  type: TenantOrgNodeType
  leader: string
  dataScope: TenantDataScope
  parentId?: string
  children?: TenantOrgNode[]
}

export interface TenantRoleDataScope {
  roleId: string
  roleName: string
  tenantId: string
  dataScope: TenantDataScope
  departments: string[]
}

export interface TenantContext {
  currentTenant: TenantRecord
  orgTree: TenantOrgNode[]
  dataScopes: TenantRoleDataScope[]
}

export interface SwitchTenantResult {
  tenantId: string
}

export const fetchTenants = async (params: TenantQuery) => {
  const response = await request.get<TenantPageResult>('/tenants', {
    params,
  })
  return response.data
}

export const fetchTenantContext = async (tenantId: string) => {
  const response = await request.get<TenantContext>(
    `/tenants/${tenantId}/context`
  )
  return response.data
}

export const switchTenant = async (tenantId: string) => {
  const response = await request.post<SwitchTenantResult>('/tenants/switch', {
    tenantId,
  })
  return response.data
}
