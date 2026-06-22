import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  SystemMenuPayload,
  SystemMenuRecord,
  SystemMenuStatus,
  SystemMenuType,
} from '@/api/system/menu'
import { mockSystemMenus } from '../seed'
import type { MockParams } from '../types'

let menus: SystemMenuRecord[] = mockSystemMenus.map((item) => ({ ...item }))

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

const parseBody = (body: string): Partial<SystemMenuPayload> => {
  try {
    return JSON.parse(body || '{}') as Partial<SystemMenuPayload>
  } catch {
    return {}
  }
}

const getIdFromUrl = (url: string) => {
  const pathname = url.split('?')[0]
  return decodeURIComponent(pathname.split('/').pop() || '')
}

const getNow = () => '2026-06-22 00:00:00'

const toMenuType = (value?: string): SystemMenuType => {
  if (value === 'menu' || value === 'button') {
    return value
  }
  return 'catalog'
}

const toPayload = (body: Partial<SystemMenuPayload>): SystemMenuPayload => ({
  menuName: body.menuName || '',
  menuType: toMenuType(body.menuType),
  path: body.path || '',
  permission: body.permission || '',
  sort: Number.isFinite(Number(body.sort)) ? Number(body.sort) : 1,
  status:
    body.status === 'disabled'
      ? ('disabled' as SystemMenuStatus)
      : ('enabled' as SystemMenuStatus),
})

const setupSystemMenuMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/system/menus(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const { query } = qs.parseUrl(params.url)
          const current = toPositiveNumber(query.current, 1)
          const pageSize = toPositiveNumber(query.pageSize, 10)
          const menuName = toQueryText(query.menuName)
          const status = toQueryText(query.status)
          const filtered = menus.filter((item) => {
            const matchedName = menuName
              ? item.menuName.includes(menuName)
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
        new RegExp('/api/system/menus/[^/?]+$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const record = menus.find(
            (item) => item.id === getIdFromUrl(params.url)
          )
          if (!record) {
            return failedResponseWrap(null, '菜单不存在', 404)
          }

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/menus$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const payload = toPayload(parseBody(params.body))
          const now = getNow()
          const record: SystemMenuRecord = {
            id: Mock.Random.guid(),
            ...payload,
            createdAt: now,
            updatedAt: now,
          }
          menus = [record, ...menus]

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/menus/[^/?]+$'),
        'put',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const index = menus.findIndex((item) => item.id === id)
          if (index < 0) {
            return failedResponseWrap(null, '菜单不存在', 404)
          }

          const record = {
            ...menus[index],
            ...toPayload(parseBody(params.body)),
            updatedAt: getNow(),
          }
          menus[index] = record

          return responseWrap(record)
        }
      )

      Mock.mock(
        new RegExp('/api/system/menus/[^/?]+$'),
        'delete',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const id = getIdFromUrl(params.url)
          const exists = menus.some((item) => item.id === id)
          if (!exists) {
            return failedResponseWrap(null, '菜单不存在', 404)
          }

          menus = menus.filter((item) => item.id !== id)

          return responseWrap(null)
        }
      )
    },
  })
}

export default setupSystemMenuMock
