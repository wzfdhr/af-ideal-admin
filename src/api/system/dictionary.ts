import request from '@/api/request'
import { SYSTEM_DICT_PERMISSIONS } from '@/constants/system-dictionary'
import type { DictionaryItem } from '@af-admin/contracts'

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
  revision?: number
  items?: DictionaryItem[]
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
  expectedRevision?: number
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
  payload: SystemDictionaryPayload,
  key?: string
) => {
  const response = key
    ? await request.post<SystemDictionaryRecord>(
        '/system/dictionaries',
        payload,
        { headers: { 'Idempotency-Key': key } }
      )
    : await request.post<SystemDictionaryRecord>(
        '/system/dictionaries',
        payload
      )
  return response.data
}

export const updateSystemDictionary = async (
  id: string,
  payload: SystemDictionaryPayload,
  key?: string
) => {
  const response = key
    ? await request.put<SystemDictionaryRecord>(
        `/system/dictionaries/${id}`,
        payload,
        { headers: { 'Idempotency-Key': key } }
      )
    : await request.put<SystemDictionaryRecord>(
        `/system/dictionaries/${id}`,
        payload
      )
  return response.data
}

export const deleteSystemDictionary = async (
  id: string,
  revision?: number,
  key?: string
) => {
  const response =
    revision === undefined
      ? await request.delete<null>(`/system/dictionaries/${id}`)
      : await request.delete<null>(`/system/dictionaries/${id}`, {
          data: { expectedRevision: revision },
          headers: { 'Idempotency-Key': key },
        })
  return response.data
}

export const updateDictionaryItems = async (
  id: string,
  expectedRevision: number,
  items: DictionaryItem[],
  key: string
) =>
  (
    await request.put<SystemDictionaryRecord>(
      `/system/dictionaries/${id}/items`,
      { expectedRevision, items },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
