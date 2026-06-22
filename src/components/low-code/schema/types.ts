export const CURRENT_LOW_CODE_PAGE_SCHEMA_VERSION = 1

export type LowCodeMaterialType =
  | 'ProTable'
  | 'ProForm'
  | 'ChartCard'
  | 'StatCard'

export type LowCodeActionType =
  | 'query'
  | 'submit'
  | 'navigate'
  | 'openModal'
  | 'refreshBlock'

export interface LowCodeAction {
  id: string
  label: string
  type: LowCodeActionType
  target?: string
  permissionCode?: string
  params?: Record<string, unknown>
}

export interface LowCodeDataSource {
  key: string
  name: string
  url: string
  method: 'get' | 'post'
  responseAdapter?: {
    listPath?: string
    totalPath?: string
  }
}

export interface LowCodeMaterial {
  id: string
  type: LowCodeMaterialType
  name: string
  permissionCode?: string
  props: Record<string, unknown>
}

export interface LowCodePageSchema {
  version: number
  title: string
  permissionCode?: string
  dataSources: LowCodeDataSource[]
  materials: LowCodeMaterial[]
}

export type LegacyLowCodePageSchema = {
  version?: unknown
  title?: unknown
  permissionCode?: unknown
  dataSources?: unknown
  materials?: unknown
}

export type LegacyLowCodeMaterial = Record<string, unknown> & {
  id?: unknown
  type?: unknown
  name?: unknown
  permissionCode?: unknown
  props?: unknown
}

export type LegacyLowCodeDataSource = Record<string, unknown> & {
  key?: unknown
  name?: unknown
  url?: unknown
  method?: unknown
  responseAdapter?: unknown
}
