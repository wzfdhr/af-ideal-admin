import type { TableColumnData } from '@arco-design/web-vue'

export interface ProTableFetchParams {
  current: number
  pageSize: number
  filters: Record<string, unknown>
}

export interface ProTableFetchResult<T> {
  list: T[]
  total: number
}

export interface ProTableProps<T = Record<string, unknown>> {
  columns: TableColumnData[]
  fetchData: (params: ProTableFetchParams) => Promise<ProTableFetchResult<T>>
  rowKey: string
  defaultPageSize?: number
  emptyText?: string
}

export interface ProTableExpose {
  reload: () => Promise<void>
  refresh: () => Promise<void>
  reset: (filters?: Record<string, unknown>) => Promise<void>
  setFilters: (filters: Record<string, unknown>) => Promise<void>
}
