import request from '@/api/request'
import { SYSTEM_DICT_PERMISSIONS } from '@/constants/system-dictionary'

export type SystemDictionaryStatus = 'enabled' | 'disabled'

export interface SystemDictionaryRecord {
  [key: string]: unknown
  id: string
  dictName: string
  dictType: string
  dictStatus: SystemDictionaryStatus
  description?: string
  createdAt: string
  updatedAt: string
}

export interface SystemDictionaryQuery {
  current: number
  pageSize: number
  dictName?: string
  dictType?: string
  dictStatus?: SystemDictionaryStatus
}

export interface SystemDictionaryPayload {
  dictName: string
  dictType: string
  dictStatus: SystemDictionaryStatus
  description?: string
}

export interface SystemDictionaryPageResult {
  list: SystemDictionaryRecord[]
  total: number
}

export { SYSTEM_DICT_PERMISSIONS }

export const fetchSystemDictionaries = async (
  params: SystemDictionaryQuery
) => {
  const response = await request.get<SystemDictionaryPageResult>(
    '/system/dictionaries',
    { params }
  )
  return response.data
}

export const getSystemDictionaryDetail = async (id: string) => {
  const response = await request.get<SystemDictionaryRecord>(
    `/system/dictionaries/${id}`
  )
  return response.data
}

export const createSystemDictionary = async (
  payload: SystemDictionaryPayload
) => {
  const response = await request.post<SystemDictionaryRecord>(
    '/system/dictionaries',
    payload
  )
  return response.data
}

export const updateSystemDictionary = async (
  id: string,
  payload: SystemDictionaryPayload
) => {
  const response = await request.put<SystemDictionaryRecord>(
    `/system/dictionaries/${id}`,
    payload
  )
  return response.data
}

export const deleteSystemDictionary = async (id: string) => {
  const response = await request.delete<null>(`/system/dictionaries/${id}`)
  return response.data
}
