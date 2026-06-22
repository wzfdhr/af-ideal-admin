export const CURRENT_LOW_CODE_PAGE_SCHEMA_VERSION = 1

export type LowCodeMaterialType =
  | 'ProTable'
  | 'ProForm'
  | 'ChartCard'
  | 'StatCard'

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
  props: Record<string, unknown>
}

export interface LowCodePageSchema {
  version: number
  title: string
  dataSources: LowCodeDataSource[]
  materials: LowCodeMaterial[]
}

export type LegacyLowCodePageSchema = {
  version?: unknown
  title?: unknown
  dataSources?: unknown
  materials?: unknown
}

export type LegacyLowCodeMaterial = Record<string, unknown> & {
  id?: unknown
  type?: unknown
  name?: unknown
  props?: unknown
}

export type LegacyLowCodeDataSource = Record<string, unknown> & {
  key?: unknown
  name?: unknown
  url?: unknown
  method?: unknown
  responseAdapter?: unknown
}
