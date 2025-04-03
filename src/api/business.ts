import axios from 'axios'
import qs from 'query-string'

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
  axios.get<GroupedBusinessEntry[]>('/api/business/groups')
export const getRecords = async (params: PaginationParams) =>
  axios.get<{
    list: BusinessRecord[]
    total: number
  }>('/api/business/records', {
    params,
    paramsSerializer: (obj) => qs.stringify(obj),
  })
