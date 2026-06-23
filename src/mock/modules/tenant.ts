import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  SwitchTenantResult,
  TenantContext,
  TenantOrgNode,
  TenantPageResult,
  TenantQuery,
  TenantRecord,
  TenantRoleDataScope,
  TenantStatus,
} from '@/api/tenant'
import type { MockParams } from '../types'

const tenantSeeds: TenantRecord[] = [
  {
    id: 'tenant-a',
    name: 'Aheart 科技',
    code: 'AHEART',
    status: 'enabled',
    brandName: 'Aheart',
    themeColor: '#165dff',
    userCount: 12,
    departmentCount: 3,
    current: true,
  },
  {
    id: 'tenant-b',
    name: 'Ideal 数据',
    code: 'IDEAL',
    status: 'enabled',
    brandName: 'Ideal',
    themeColor: '#0e9f6e',
    userCount: 8,
    departmentCount: 2,
    current: false,
  },
  {
    id: 'tenant-c',
    name: 'Archive 演示租户',
    code: 'ARCHIVE',
    status: 'disabled',
    brandName: 'Archive',
    themeColor: '#667085',
    userCount: 2,
    departmentCount: 1,
    current: false,
  },
]

const orgTrees: Record<string, TenantOrgNode[]> = {
  'tenant-a': [
    {
      id: 'tenant-a-root',
      tenantId: 'tenant-a',
      name: 'Aheart 总部',
      type: 'company',
      leader: '系统管理员',
      dataScope: 'all',
      children: [
        {
          id: 'tenant-a-product',
          tenantId: 'tenant-a',
          name: '产品部',
          type: 'department',
          parentId: 'tenant-a-root',
          leader: '张三',
          dataScope: 'department-and-children',
          children: [
            {
              id: 'tenant-a-design',
              tenantId: 'tenant-a',
              name: '体验设计组',
              type: 'team',
              parentId: 'tenant-a-product',
              leader: '赵六',
              dataScope: 'department',
              children: [],
            },
          ],
        },
        {
          id: 'tenant-a-operation',
          tenantId: 'tenant-a',
          name: '运营部',
          type: 'department',
          parentId: 'tenant-a-root',
          leader: '李四',
          dataScope: 'tenant',
          children: [],
        },
      ],
    },
  ],
  'tenant-b': [
    {
      id: 'tenant-b-root',
      tenantId: 'tenant-b',
      name: 'Ideal 总部',
      type: 'company',
      leader: '运营人员',
      dataScope: 'tenant',
      children: [
        {
          id: 'tenant-b-data',
          tenantId: 'tenant-b',
          name: '数据服务部',
          type: 'department',
          parentId: 'tenant-b-root',
          leader: '王五',
          dataScope: 'department-and-children',
          children: [],
        },
      ],
    },
  ],
  'tenant-c': [
    {
      id: 'tenant-c-root',
      tenantId: 'tenant-c',
      name: 'Archive 演示组',
      type: 'company',
      leader: '受限用户',
      dataScope: 'self',
      children: [],
    },
  ],
}

const roleScopes: Record<string, TenantRoleDataScope[]> = {
  'tenant-a': [
    {
      roleId: 'role-admin',
      roleName: '平台管理员',
      tenantId: 'tenant-a',
      dataScope: 'all',
      departments: ['Aheart 总部'],
    },
    {
      roleId: 'role-operator',
      roleName: '运营人员',
      tenantId: 'tenant-a',
      dataScope: 'tenant',
      departments: ['运营部'],
    },
    {
      roleId: 'role-product',
      roleName: '产品负责人',
      tenantId: 'tenant-a',
      dataScope: 'department-and-children',
      departments: ['产品部', '体验设计组'],
    },
    {
      roleId: 'role-self',
      roleName: '普通成员',
      tenantId: 'tenant-a',
      dataScope: 'self',
      departments: ['体验设计组'],
    },
  ],
  'tenant-b': [
    {
      roleId: 'role-tenant-admin',
      roleName: '租户管理员',
      tenantId: 'tenant-b',
      dataScope: 'tenant',
      departments: ['Ideal 总部'],
    },
    {
      roleId: 'role-data-owner',
      roleName: '数据负责人',
      tenantId: 'tenant-b',
      dataScope: 'department-and-children',
      departments: ['数据服务部'],
    },
  ],
  'tenant-c': [
    {
      roleId: 'role-guest',
      roleName: '访客',
      tenantId: 'tenant-c',
      dataScope: 'self',
      departments: ['Archive 演示组'],
    },
  ],
}

const cloneTenant = (tenant: TenantRecord): TenantRecord => ({ ...tenant })

const cloneOrgTree = (nodes: TenantOrgNode[]): TenantOrgNode[] =>
  nodes.map((node) => ({
    ...node,
    children: node.children ? cloneOrgTree(node.children) : [],
  }))

const cloneRoleScope = (scope: TenantRoleDataScope): TenantRoleDataScope => ({
  ...scope,
  departments: [...scope.departments],
})

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseQuery = (url: string): TenantQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: toPositiveNumber(query.current, 1),
    pageSize: toPositiveNumber(query.pageSize, 20),
    keyword: readString(query.keyword) || '',
    status: (readString(query.status) || '') as TenantStatus | '',
  }
}

const parseBody = (body: string): { tenantId?: string } => {
  try {
    return JSON.parse(body || '{}') as { tenantId?: string }
  } catch {
    return {}
  }
}

const getTenantIdFromContextUrl = (url: string) => {
  const match = url.match(/\/api\/tenants\/([^/]+)\/context/)
  return decodeURIComponent(match?.[1] || '')
}

export const createTenantMockStore = () => {
  let currentTenantId = 'tenant-a'

  const getTenants = () =>
    tenantSeeds.map((tenant) => ({
      ...tenant,
      current: tenant.id === currentTenantId,
    }))

  const queryTenants = (params: TenantQuery): TenantPageResult => {
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const filtered = getTenants().filter((tenant) => {
      const matchedKeyword = keyword
        ? `${tenant.name}${tenant.code}${tenant.brandName}`
            .toLowerCase()
            .includes(keyword)
        : true
      const matchedStatus = params.status
        ? tenant.status === params.status
        : true

      return matchedKeyword && matchedStatus
    })
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(cloneTenant),
      total: filtered.length,
    }
  }

  const getTenantContext = (tenantId = currentTenantId): TenantContext => {
    const tenant = getTenants().find((item) => item.id === tenantId)
    if (!tenant) {
      throw new Error('tenant not found')
    }

    return {
      currentTenant: cloneTenant(tenant),
      orgTree: cloneOrgTree(orgTrees[tenant.id] || []),
      dataScopes: (roleScopes[tenant.id] || []).map(cloneRoleScope),
    }
  }

  const switchTenant = (tenantId: string): SwitchTenantResult => {
    const exists = tenantSeeds.some((tenant) => tenant.id === tenantId)
    if (!exists) {
      throw new Error('tenant not found')
    }

    currentTenantId = tenantId
    return { tenantId }
  }

  return {
    queryTenants,
    getTenantContext,
    switchTenant,
  }
}

const tenantStore = createTenantMockStore()

const setupTenantMock = () => {
  setupMock({
    setup() {
      Mock.mock(new RegExp('/api/tenants(\\?.*)?$'), 'get', (params) => {
        if (!isAuthed()) {
          return failedResponseWrap(null, '未登录', 50008)
        }

        return responseWrap(tenantStore.queryTenants(parseQuery(params.url)))
      })

      Mock.mock(
        new RegExp('/api/tenants/[^/]+/context$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          try {
            return responseWrap(
              tenantStore.getTenantContext(
                getTenantIdFromContextUrl(params.url)
              )
            )
          } catch {
            return failedResponseWrap(null, '租户不存在', 404)
          }
        }
      )

      Mock.mock(
        new RegExp('/api/tenants/switch$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          const { tenantId } = parseBody(params.body)

          try {
            return responseWrap(tenantStore.switchTenant(tenantId || ''))
          } catch {
            return failedResponseWrap(null, '租户不存在', 404)
          }
        }
      )
    },
  })
}

export default setupTenantMock
