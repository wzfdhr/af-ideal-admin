import qs from 'query-string'
import request from './request'

export interface Step {
  atpresent?: number
  name?: string
  data?: string | Date
  title?: string
  remark?: string
}
export interface BusinessEntry {
  id: number
  name: string
  active?: boolean
  startTime?: string
  endTime?: string
}
export interface InfoGroup {
  updateTime: string | Date
  groupsData: Array<{
    name: string
    supervisor: string
    time: string | Date
    dept: string
    code: string
    desc: string
  }>
}

export interface GroupedBusinessEntry {
  name: string
  items: BusinessEntry[]
}

export interface BusinessRecord {
  seriealNo: string
  name: string
  time: string
  updatedTime?: string
  category: string
  status: number
}

export interface PaginationParams {
  current: number
  pageSize: number
}

export const getGroups = async () =>
  request.get<GroupedBusinessEntry[]>('/business/groups')
export const getRecords = async (params: PaginationParams) =>
  request.get<{
    list: BusinessRecord[]
    total: number
  }>('/business/records', {
    params,
    paramsSerializer: (obj) => qs.stringify(obj),
  })
