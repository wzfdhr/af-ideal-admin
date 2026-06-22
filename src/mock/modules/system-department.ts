import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  SystemDepartmentPayload,
  SystemDepartmentRecord,
  SystemDepartmentStatus,
} from '@/api/system/department'
import { mockSystemDepartments } from '../seed'
import type { MockParams } from '../types'

let departments: SystemDepartmentRecord[] = mockSystemDepartments.map(
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

const parseBody = (body: string): Partial<SystemDepartmentPayload> => {
  try {
    return JSON.parse(body || '{}') as Partial<SystemDepartmentPayload>
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
  body: Partial<SystemDepartmentPayload>
): SystemDepartmentPayload => ({
  departmentName: body.departmentName || '',
  leader: body.leader || '',
  sort: Number.isFinite(Number(body.sort)) ? Number(body.sort) : 1,
  status:
    body.status === 'disabled'
      ? ('disabled' as SystemDepartmentStatus)
      : ('enabled' as SystemDepartmentStatus),
})

const setupSystemDepartmentMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/system/departments(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const { query } = qs.parseUrl(params.url)
          const current = toPositiveNumber(query.current, 1)
          const pageSize = toPositiveNumber(query.pageSize, 10)
          const departmentName = toQueryText(query.departmentName)
          const status = toQueryText(query.status)
          const filtered = departments.filter((item) => {
            const matchedName = departmentName
              ? item.departmentName.includes(departmentName)
              : true
            const matchedStatus = status ? item.status === status : true

            return matchedName && matchedStatus
          })

          return responseWrap({
            list: filtered.slice((current - 1) * pageSize, current * pageSize),
            total: filtered.length,
          })
        }
      )

      Mock.mock(
        new RegExp('/api/system/departments/[^/?]+$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const record = departments.find(
            (item) => item.id === getIdFromUrl(params.url)
          )
          if (!record) {
            return failedResponseWrap(null, '部门不存在', 404)
          }

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/departments$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const payload = toPayload(parseBody(params.body))
          const now = getNow()
          const record: SystemDepartmentRecord = {
            id: Mock.Random.guid(),
            ...payload,
            createdAt: now,
            updatedAt: now,
          }
          departments = [record, ...departments]

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/departments/[^/?]+$'),
        'put',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const index = departments.findIndex((item) => item.id === id)
          if (index < 0) {
            return failedResponseWrap(null, '部门不存在', 404)
          }

          const record = {
            ...departments[index],
            ...toPayload(parseBody(params.body)),
            updatedAt: getNow(),
          }
          departments[index] = record

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/departments/[^/?]+$'),
        'delete',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const exists = departments.some((item) => item.id === id)
          if (!exists) {
            return failedResponseWrap(null, '部门不存在', 404)
          }

          departments = departments.filter((item) => item.id !== id)

          return responseWrap(null)
        }
      )
    },
  })
}

export default setupSystemDepartmentMock
