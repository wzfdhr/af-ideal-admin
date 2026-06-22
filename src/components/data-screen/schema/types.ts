export const CURRENT_DATA_SCREEN_SCHEMA_VERSION = 1

export type DataScreenWidgetType =
  | 'LineChart'
  | 'BarChart'
  | 'PieChart'
  | 'RankingList'
  | 'MetricCard'
  | 'ScrollTable'

export interface DataScreenTheme {
  mode: 'dark' | 'light'
  brandColor: string
}

export interface DataScreenDataSource {
  key: string
  name: string
  url: string
  refreshInterval: number
}

export interface DataScreenWidget {
  id: string
  type: DataScreenWidgetType
  name: string
  x: number
  y: number
  w: number
  h: number
  dataSourceKey?: string
  permissionCode?: string
  props: Record<string, unknown>
}

export interface DataScreenSchema {
  version: number
  title: string
  width: number
  height: number
  theme: DataScreenTheme
  permissionCode?: string
  dataSources: DataScreenDataSource[]
  widgets: DataScreenWidget[]
}

export type LegacyDataScreenSchema = {
  version?: unknown
  title?: unknown
  width?: unknown
  height?: unknown
  theme?: unknown
  permissionCode?: unknown
  dataSources?: unknown
  widgets?: unknown
}

export type LegacyDataScreenDataSource = Record<string, unknown> & {
  key?: unknown
  name?: unknown
  url?: unknown
  refreshInterval?: unknown
}

export type LegacyDataScreenWidget = Record<string, unknown> & {
  id?: unknown
  type?: unknown
  name?: unknown
  x?: unknown
  y?: unknown
  w?: unknown
  h?: unknown
  dataSourceKey?: unknown
  permissionCode?: unknown
  props?: unknown
}
