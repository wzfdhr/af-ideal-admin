import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  DataPermissionPageResult,
  DataPermissionQuery,
  DataPermissionRecord,
  DataPermissionUpdatePayload,
  DataPermissionUpdateResult,
  DataScopeBusinessRow,
  DataScopePreviewPayload,
  DataScopePreviewResult,
  DataScopeType,
} from '@/api/data-permission'
import type { MockParams } from '../types'

export interface DataPermissionMockStoreOptions {
  now?: () => string
}

const getNow = () => '2026-06-23 10:00:00'

const departmentChildren: Record<string, string[]> = {
  'dept-product': ['dept-design'],
  'dept-operation': ['dept-operation-live'],
}

const seedRules = (): DataPermissionRecord[] => [
  {
    roleId: 'role-admin',
    roleName: '平台管理员',
    roleKey: 'admin',
    tenantId: 'tenant-a',
    tenantName: 'Aheart 科技',
    dataScope: 'all',
    departmentIds: [],
    departments: ['全部部门'],
    ownerUserIds: [],
    fieldPermissions: ['customerName', 'amount', 'ownerName', 'tenantName'],
    updatedAt: '2026-06-23 09:00:00',
  },
  {
    roleId: 'role-operator',
    roleName: '运营人员',
    roleKey: 'operator',
    tenantId: 'tenant-a',
    tenantName: 'Aheart 科技',
    dataScope: 'department-and-children',
    departmentIds: ['dept-operation'],
    departments: ['运营部', '直播运营组'],
    ownerUserIds: [],
    fieldPermissions: ['customerName', 'amount'],
    updatedAt: '2026-06-23 09:10:00',
  },
  {
    roleId: 'role-product',
    roleName: '产品负责人',
    roleKey: 'product-owner',
    tenantId: 'tenant-a',
    tenantName: 'Aheart 科技',
    dataScope: 'department',
    departmentIds: ['dept-product'],
    departments: ['产品部'],
    ownerUserIds: [],
    fieldPermissions: ['customerName', 'ownerName'],
    updatedAt: '2026-06-23 09:20:00',
  },
  {
    roleId: 'role-self',
    roleName: '普通成员',
    roleKey: 'member',
    tenantId: 'tenant-a',
    tenantName: 'Aheart 科技',
    dataScope: 'self',
    departmentIds: [],
    departments: ['体验设计组'],
    ownerUserIds: ['user-self'],
    fieldPermissions: ['customerName'],
    updatedAt: '2026-06-23 09:30:00',
  },
  {
    roleId: 'role-tenant-admin',
    roleName: '租户管理员',
    roleKey: 'tenant-admin',
    tenantId: 'tenant-b',
    tenantName: 'Ideal 数据',
    dataScope: 'tenant',
    departmentIds: [],
    departments: ['Ideal 总部'],
    ownerUserIds: [],
    fieldPermissions: ['customerName', 'amount', 'ownerName'],
    updatedAt: '2026-06-23 09:40:00',
  },
]

const businessRows: DataScopeBusinessRow[] = [
  {
    id: 'order-1',
    tenantId: 'tenant-a',
    tenantName: 'Aheart 科技',
    departmentId: 'dept-operation',
    departmentName: '运营部',
    ownerUserId: 'user-operator',
    ownerName: '运营人员',
    customerName: '上海客户',
    amount: 12000,
  },
  {
    id: 'order-2',
    tenantId: 'tenant-a',
    tenantName: 'Aheart 科技',
    departmentId: 'dept-operation-live',
    departmentName: '直播运营组',
    ownerUserId: 'user-live',
    ownerName: '直播运营',
    customerName: '杭州客户',
    amount: 8600,
  },
  {
    id: 'order-3',
    tenantId: 'tenant-a',
    tenantName: 'Aheart 科技',
    departmentId: 'dept-product',
    departmentName: '产品部',
    ownerUserId: 'user-product',
    ownerName: '产品负责人',
    customerName: '北京客户',
    amount: 4300,
  },
  {
    id: 'order-4',
    tenantId: 'tenant-a',
    tenantName: 'Aheart 科技',
    departmentId: 'dept-design',
    departmentName: '体验设计组',
    ownerUserId: 'user-self',
    ownerName: '普通成员',
    customerName: '深圳客户',
    amount: 2100,
  },
  {
    id: 'order-5',
    tenantId: 'tenant-b',
    tenantName: 'Ideal 数据',
    departmentId: 'dept-data',
    departmentName: '数据服务部',
    ownerUserId: 'user-tenant-admin',
    ownerName: '租户管理员',
    customerName: '广州客户',
    amount: 9800,
  },
]

const cloneRule = (record: DataPermissionRecord): DataPermissionRecord => ({
  ...record,
  departmentIds: [...record.departmentIds],
  departments: [...record.departments],
  ownerUserIds: [...record.ownerUserIds],
  fieldPermissions: [...record.fieldPermissions],
})

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseQuery = (url: string): DataPermissionQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: toPositiveNumber(query.current, 1),
    pageSize: toPositiveNumber(query.pageSize, 20),
    keyword: readString(query.keyword) || '',
    tenantId: readString(query.tenantId) || '',
    dataScope: (readString(query.dataScope) || '') as DataScopeType | '',
  }
}

const parseBody = <T>(body: string, fallback: T): T => {
  try {
    return JSON.parse(body || '{}') as T
  } catch {
    return fallback
  }
}

const getRoleIdFromUrl = (url: string) => {
  const pathname = url.split('?')[0]
  return decodeURIComponent(pathname.split('/').pop() || '')
}

const resolveDepartmentIds = (
  departmentIds: string[],
  dataScope: DataScopeType
) => {
  if (dataScope !== 'department-and-children') {
    return departmentIds
  }

  return Array.from(
    new Set(
      departmentIds.flatMap((id) => [id, ...(departmentChildren[id] || [])])
    )
  )
}

export const createDataPermissionMockStore = (
  options: DataPermissionMockStoreOptions = {}
) => {
  const now = options.now || getNow
  let rules = seedRules()

  const queryRules = (
    params: DataPermissionQuery
  ): DataPermissionPageResult => {
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const filtered = rules.filter((rule) => {
      const matchedKeyword = keyword
        ? `${rule.roleName}${rule.roleKey}${rule.tenantName}`
            .toLowerCase()
            .includes(keyword)
        : true
      const matchedTenant = params.tenantId
        ? rule.tenantId === params.tenantId
        : true
      const matchedScope = params.dataScope
        ? rule.dataScope === params.dataScope
        : true

      return matchedKeyword && matchedTenant && matchedScope
    })
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(cloneRule),
      total: filtered.length,
    }
  }

  const getRule = (roleId: string) =>
    rules.find((rule) => rule.roleId === roleId)

  const previewScope = (
    payload: DataScopePreviewPayload
  ): DataScopePreviewResult => {
    const rule = getRule(payload.roleId)
    const tenantId = rule?.tenantId || 'tenant-a'
    const departments = resolveDepartmentIds(
      payload.departmentIds,
      payload.dataScope
    )

    const visibleRows = businessRows.filter((row) => {
      if (payload.dataScope === 'all') return true
      if (payload.dataScope === 'tenant') return row.tenantId === tenantId
      if (
        payload.dataScope === 'department' ||
        payload.dataScope === 'department-and-children'
      ) {
        return (
          row.tenantId === tenantId && departments.includes(row.departmentId)
        )
      }
      if (payload.dataScope === 'self') {
        return payload.ownerUserIds.includes(row.ownerUserId)
      }

      return false
    })
    const visibleIds = new Set(visibleRows.map((row) => row.id))

    return {
      visibleRows: visibleRows.map((row) => ({ ...row })),
      hiddenRows: businessRows
        .filter((row) => !visibleIds.has(row.id))
        .map((row) => ({ ...row })),
    }
  }

  const updateRule = (
    roleId: string,
    payload: DataPermissionUpdatePayload
  ): DataPermissionUpdateResult => {
    const rule = getRule(roleId)
    if (!rule) {
      return {
        success: false,
        reason: '数据权限规则不存在',
      }
    }

    const updated: DataPermissionRecord = {
      ...rule,
      dataScope: payload.dataScope,
      departmentIds: [...payload.departmentIds],
      departments: payload.departmentIds.length
        ? payload.departmentIds
        : rule.departments,
      ownerUserIds: [...payload.ownerUserIds],
      fieldPermissions: [...payload.fieldPermissions],
      updatedAt: now(),
    }
    rules = rules.map((item) => (item.roleId === roleId ? updated : item))

    return {
      success: true,
      record: cloneRule(updated),
    }
  }

  return {
    queryRules,
    previewScope,
    updateRule,
  }
}

const dataPermissionStore = createDataPermissionMockStore()

const setupDataPermissionMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/permissions/data-scopes(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            dataPermissionStore.queryRules(parseQuery(params.url))
          )
        }
      )

      Mock.mock(
        new RegExp('/api/permissions/data-scopes/preview$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            dataPermissionStore.previewScope(
              parseBody<DataScopePreviewPayload>(params.body, {
                roleId: '',
                dataScope: 'self',
                departmentIds: [],
                ownerUserIds: [],
              })
            )
          )
        }
      )

      Mock.mock(
        new RegExp('/api/permissions/data-scopes/[^/]+$'),
        'put',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            dataPermissionStore.updateRule(
              getRoleIdFromUrl(params.url),
              parseBody<DataPermissionUpdatePayload>(params.body, {
                dataScope: 'self',
                departmentIds: [],
                ownerUserIds: [],
                fieldPermissions: [],
              })
            )
          )
        }
      )
    },
  })
}

export default setupDataPermissionMock
