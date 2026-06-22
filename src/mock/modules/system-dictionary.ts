import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  SystemDictionaryPayload,
  SystemDictionaryRecord,
  SystemDictionaryStatus,
} from '@/api/system/dictionary'
import { mockSystemDictionaries } from '../seed'
import type { MockParams } from '../types'

let dictionaries: SystemDictionaryRecord[] = mockSystemDictionaries.map(
  (item) => ({ ...item })
)

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const toQueryText = (value: unknown) => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : ''
  }

  return typeof value === 'string' ? value : ''
}

const parseBody = (body: string): Partial<SystemDictionaryPayload> => {
  try {
    return JSON.parse(body || '{}') as Partial<SystemDictionaryPayload>
  } catch {
    return {}
  }
}

const getIdFromUrl = (url: string) => {
  const pathname = url.split('?')[0]
  return decodeURIComponent(pathname.split('/').pop() || '')
}

const getNow = () => '2026-06-22 00:00:00'

const toPayload = (
  body: Partial<SystemDictionaryPayload>
): SystemDictionaryPayload => ({
  dictName: body.dictName || '',
  dictType: body.dictType || '',
  dictStatus:
    body.dictStatus === 'disabled'
      ? ('disabled' as SystemDictionaryStatus)
      : ('enabled' as SystemDictionaryStatus),
  description: body.description || '',
})

const setupSystemDictionaryMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/system/dictionaries(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const { query } = qs.parseUrl(params.url)
          const current = toPositiveNumber(query.current, 1)
          const pageSize = toPositiveNumber(query.pageSize, 10)
          const dictName = toQueryText(query.dictName)
          const dictType = toQueryText(query.dictType)
          const dictStatus = toQueryText(query.dictStatus)
          const filtered = dictionaries.filter((item) => {
            const matchedName = dictName
              ? item.dictName.includes(dictName)
              : true
            const matchedType = dictType
              ? item.dictType.includes(dictType)
              : true
            const matchedStatus = dictStatus
              ? item.dictStatus === dictStatus
              : true

            return matchedName && matchedType && matchedStatus
          })

          return responseWrap({
            list: filtered.slice((current - 1) * pageSize, current * pageSize),
            total: filtered.length,
          })
        }
      )

      Mock.mock(
        new RegExp('/api/system/dictionaries/[^/?]+$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const record = dictionaries.find(
            (item) => item.id === getIdFromUrl(params.url)
          )
          if (!record) {
            return failedResponseWrap(null, '字典不存在', 404)
          }

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/dictionaries$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const payload = toPayload(parseBody(params.body))
          const now = getNow()
          const record: SystemDictionaryRecord = {
            id: Mock.Random.guid(),
            ...payload,
            createdAt: now,
            updatedAt: now,
          }
          dictionaries = [record, ...dictionaries]

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/dictionaries/[^/?]+$'),
        'put',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const index = dictionaries.findIndex((item) => item.id === id)
          if (index < 0) {
            return failedResponseWrap(null, '字典不存在', 404)
          }

          const record = {
            ...dictionaries[index],
            ...toPayload(parseBody(params.body)),
            updatedAt: getNow(),
          }
          dictionaries[index] = record

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/dictionaries/[^/?]+$'),
        'delete',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const exists = dictionaries.some((item) => item.id === id)
          if (!exists) {
            return failedResponseWrap(null, '字典不存在', 404)
          }

          dictionaries = dictionaries.filter((item) => item.id !== id)

          return responseWrap(null)
        }
      )
    },
  })
}

export default setupSystemDictionaryMock
