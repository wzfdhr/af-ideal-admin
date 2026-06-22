import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  SystemUserPayload,
  SystemUserRecord,
  SystemUserStatus,
} from '@/api/system/user'
import { mockSystemUsers } from '../seed'
import type { MockParams } from '../types'

let users: SystemUserRecord[] = mockSystemUsers.map((item) => ({ ...item }))

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

const parseBody = (body: string): Partial<SystemUserPayload> => {
  try {
    return JSON.parse(body || '{}') as Partial<SystemUserPayload>
  } catch {
    return {}
  }
}

const getIdFromUrl = (url: string) => {
  const pathname = url.split('?')[0]
  return decodeURIComponent(pathname.split('/').pop() || '')
}

const getNow = () => '2026-06-22 00:00:00'

const toPayload = (body: Partial<SystemUserPayload>): SystemUserPayload => ({
  username: body.username || '',
  name: body.name || '',
  phone: body.phone || '',
  email: body.email || '',
  dept: body.dept || '',
  status:
    body.status === 'disabled'
      ? ('disabled' as SystemUserStatus)
      : ('enabled' as SystemUserStatus),
  role: body.role || '',
})

const setupSystemUserMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/system/users(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const { query } = qs.parseUrl(params.url)
          const current = toPositiveNumber(query.current, 1)
          const pageSize = toPositiveNumber(query.pageSize, 10)
          const username = toQueryText(query.username)
          const phone = toQueryText(query.phone)
          const status = toQueryText(query.status)
          const filtered = users.filter((item) => {
            const matchedUsername = username
              ? item.username.includes(username)
              : true
            const matchedPhone = phone ? item.phone.includes(phone) : true
            const matchedStatus = status ? item.status === status : true

            return matchedUsername && matchedPhone && matchedStatus
          })

          return responseWrap({
            list: filtered.slice((current - 1) * pageSize, current * pageSize),
            total: filtered.length,
          })
        }
      )

      Mock.mock(
        new RegExp('/api/system/users/[^/?]+$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const record = users.find(
            (item) => item.id === getIdFromUrl(params.url)
          )
          if (!record) {
            return failedResponseWrap(null, '用户不存在', 404)
          }

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/users$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const payload = toPayload(parseBody(params.body))
          const now = getNow()
          const record: SystemUserRecord = {
            id: Mock.Random.guid(),
            ...payload,
            createdAt: now,
            updatedAt: now,
          }
          users = [record, ...users]

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/users/[^/?]+$'),
        'put',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const index = users.findIndex((item) => item.id === id)
          if (index < 0) {
            return failedResponseWrap(null, '用户不存在', 404)
          }

          const record = {
            ...users[index],
            ...toPayload(parseBody(params.body)),
            updatedAt: getNow(),
          }
          users[index] = record

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/users/[^/?]+$'),
        'delete',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const exists = users.some((item) => item.id === id)
          if (!exists) {
            return failedResponseWrap(null, '用户不存在', 404)
          }

          users = users.filter((item) => item.id !== id)

          return responseWrap(null)
        }
      )
    },
  })
}

export default setupSystemUserMock
