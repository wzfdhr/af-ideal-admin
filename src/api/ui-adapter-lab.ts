import request from '@/api/request'

export type UiAdapterLabAdapter = 'arco' | 'aheart'
export type UiAdapterLabStatus = 'ready' | 'blocked'

export interface UiAdapterLabItem {
  id: string
  name: string
  component: string
  adapter: UiAdapterLabAdapter
  status: UiAdapterLabStatus
  owner: string
  updatedAt: string
  description: string
}

export interface UiAdapterLabQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: UiAdapterLabStatus | ''
}

export interface UiAdapterLabPageResult {
  list: UiAdapterLabItem[]
  total: number
}

export interface UiAdapterLabPayload {
  name: string
  component: string
  status: UiAdapterLabStatus
  description: string
}

export interface UiAdapterLabMutationResult {
  success: boolean
  record?: UiAdapterLabItem
  reason?: string
}

export interface UiAdapterLabErrorResult {
  success: false
  reason: string
  traceId: string
}

export const fetchUiAdapterLabItems = async (params: UiAdapterLabQuery) => {
  const response = await request.get<UiAdapterLabPageResult>(
    '/ui-adapter-lab/items',
    { params }
  )
  return response.data
}

export const createUiAdapterLabItem = async (payload: UiAdapterLabPayload) => {
  const response = await request.post<UiAdapterLabMutationResult>(
    '/ui-adapter-lab/items',
    payload
  )
  return response.data
}

export const updateUiAdapterLabItem = async (
  id: string,
  payload: UiAdapterLabPayload
) => {
  const response = await request.put<UiAdapterLabMutationResult>(
    `/ui-adapter-lab/items/${id}`,
    payload
  )
  return response.data
}

export const simulateUiAdapterLabError = async () => {
  const response = await request.post<UiAdapterLabErrorResult>(
    '/ui-adapter-lab/error'
  )
  return response.data
}
