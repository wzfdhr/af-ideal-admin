import request from '@/api/request'
import {
  validateDataScreenSchema,
  type DataScreenSchema,
} from '@/components/data-screen/schema'

export type DataScreenStatus = 'draft' | 'published'
export type DataScreenScenario = 'realtime' | 'empty' | 'alert' | 'failure'

export interface DataScreenDefinition {
  id: string
  name: string
  schema: DataScreenSchema
  status: DataScreenStatus
  version: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

export interface DataScreenQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: DataScreenStatus
}

export interface DataScreenListResult {
  list: DataScreenDefinition[]
  total: number
}

export interface DataScreenMutationResult {
  id: string
  name?: string
  schema?: DataScreenSchema
  status?: DataScreenStatus
  version?: number
}

export interface DataScreenMetric {
  key: string
  label: string
  value: number
  unit?: string
  trend?: number
}

export interface DataScreenSeriesPoint {
  time?: string
  name?: string
  value: number
}

export interface DataScreenTableRow {
  id: string
  name: string
  amount: number
  status: string
}

export interface DataScreenAlert {
  id: string
  level: 'info' | 'warning' | 'critical'
  message: string
}

export interface DataScreenRealtimeData {
  metrics: DataScreenMetric[]
  trend: DataScreenSeriesPoint[]
  distribution: DataScreenSeriesPoint[]
  ranking: DataScreenSeriesPoint[]
  table: DataScreenTableRow[]
  alerts: DataScreenAlert[]
}

export interface DataScreenRealtimePayload {
  screenId?: string
  dataSourceKey: string
  scenario?: DataScreenScenario
}

export const fetchDataScreens = async (params: DataScreenQuery) => {
  const response = await request.get<DataScreenListResult>('/data-screens', {
    params,
  })
  return response.data
}

export const getDataScreen = async (id: string) => {
  const response = await request.get<DataScreenDefinition>(
    `/data-screens/${id}`
  )
  return response.data
}

export const saveDataScreen = async (id: string, schema: unknown) => {
  const validatedSchema = validateDataScreenSchema(schema)
  const response = await request.put<DataScreenMutationResult>(
    `/data-screens/${id}`,
    {
      schema: validatedSchema,
    }
  )

  return response.data
}

export const publishDataScreen = async (id: string, schema: unknown) => {
  const validatedSchema = validateDataScreenSchema(schema)
  const response = await request.post<DataScreenMutationResult>(
    `/data-screens/${id}/publish`,
    {
      schema: validatedSchema,
    }
  )

  return response.data
}

export const fetchDataScreenRealtimeData = async (
  payload: DataScreenRealtimePayload
) => {
  const response = await request.post<DataScreenRealtimeData>(
    '/data-screens/realtime',
    payload
  )
  return response.data
}
