import request from '@/api/request'

export type PluginStatus = 'enabled' | 'disabled'

export type PluginExtensionType =
  | 'route'
  | 'menu'
  | 'permission'
  | 'mock'
  | 'material'

export interface PluginRouteRegistration {
  name: string
  path: string
}

export interface PluginMenuRegistration {
  name: string
  locale: string
}

export interface PluginLifecycle {
  installedAt: string
  enabledAt?: string
  disabledAt?: string
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  routes: PluginRouteRegistration[]
  menus: PluginMenuRegistration[]
  permissions: string[]
  mockModules: string[]
  materials: string[]
  lifecycle: PluginLifecycle
}

export interface PluginRecord {
  id: string
  name: string
  version: string
  description: string
  author: string
  status: PluginStatus
  extensionTypes: PluginExtensionType[]
  manifest: PluginManifest
  updatedAt: string
}

export interface PluginQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: PluginStatus | ''
  extensionType?: PluginExtensionType | ''
}

export interface PluginPageResult {
  list: PluginRecord[]
  total: number
}

export interface PluginToggleResult {
  success: boolean
  id?: string
  status?: PluginStatus
  changedAt?: string
  reason?: string
}

export const fetchPlugins = async (params: PluginQuery) => {
  const response = await request.get<PluginPageResult>('/plugins', {
    params,
  })
  return response.data
}

export const fetchPluginManifest = async (id: string) => {
  const response = await request.get<PluginManifest>(`/plugins/${id}/manifest`)
  return response.data
}

export const togglePluginStatus = async (id: string, enabled: boolean) => {
  const response = await request.post<PluginToggleResult>(
    `/plugins/${id}/toggle`,
    { enabled }
  )
  return response.data
}
