import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  SystemRolePayload,
  SystemRoleRecord,
  SystemRoleStatus,
} from '@/api/system/role'
import { mockSystemRoles } from '../seed'
import type { MockParams } from '../types'

let roles: SystemRoleRecord[] = mockSystemRoles.map((item) => ({ ...item }))

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

const parseBody = (body: string): Partial<SystemRolePayload> => {
  try {
    return JSON.parse(body || '{}') as Partial<SystemRolePayload>
  } catch {
    return {}
  }
}

const getIdFromUrl = (url: string) => {
  const pathname = url.split('?')[0]
  return decodeURIComponent(pathname.split('/').pop() || '')
}

const getNow = () => '2026-06-22 00:00:00'

const toPayload = (body: Partial<SystemRolePayload>): SystemRolePayload => ({
  roleName: body.roleName || '',
  roleKey: body.roleKey || '',
  roleSort: Number.isFinite(Number(body.roleSort)) ? Number(body.roleSort) : 1,
  dataScope: body.dataScope || '',
  status:
    body.status === 'disabled'
      ? ('disabled' as SystemRoleStatus)
      : ('enabled' as SystemRoleStatus),
  remark: body.remark || '',
})

const setupSystemRoleMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/system/roles(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const { query } = qs.parseUrl(params.url)
          const current = toPositiveNumber(query.current, 1)
          const pageSize = toPositiveNumber(query.pageSize, 10)
          const roleName = toQueryText(query.roleName)
          const roleKey = toQueryText(query.roleKey)
          const status = toQueryText(query.status)
          const filtered = roles.filter((item) => {
            const matchedName = roleName
              ? item.roleName.includes(roleName)
              : true
            const matchedKey = roleKey ? item.roleKey.includes(roleKey) : true
            const matchedStatus = status ? item.status === status : true

            return matchedName && matchedKey && matchedStatus
          })

          return responseWrap({
            list: filtered.slice((current - 1) * pageSize, current * pageSize),
            total: filtered.length,
          })
        }
      )

      Mock.mock(
        new RegExp('/api/system/roles/[^/?]+$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const record = roles.find(
            (item) => item.id === getIdFromUrl(params.url)
          )
          if (!record) {
            return failedResponseWrap(null, '角色不存在', 404)
          }

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/roles$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const payload = toPayload(parseBody(params.body))
          const now = getNow()
          const record: SystemRoleRecord = {
            id: Mock.Random.guid(),
            ...payload,
            createdAt: now,
            updatedAt: now,
          }
          roles = [record, ...roles]

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/roles/[^/?]+$'),
        'put',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const index = roles.findIndex((item) => item.id === id)
          if (index < 0) {
            return failedResponseWrap(null, '角色不存在', 404)
          }

          const record = {
            ...roles[index],
            ...toPayload(parseBody(params.body)),
            updatedAt: getNow(),
          }
          roles[index] = record

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/roles/[^/?]+$'),
        'delete',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const exists = roles.some((item) => item.id === id)
          if (!exists) {
            return failedResponseWrap(null, '角色不存在', 404)
          }

          roles = roles.filter((item) => item.id !== id)

          return responseWrap(null)
        }
      )
    },
  })
}

export default setupSystemRoleMock
