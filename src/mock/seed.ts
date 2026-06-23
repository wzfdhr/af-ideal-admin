import avatarExample from '@/assets/avatar-user.png'
import { SYSTEM_DEPARTMENT_PERMISSIONS } from '@/constants/system-department'
import { SYSTEM_DICT_PERMISSIONS } from '@/constants/system-dictionary'
import { SYSTEM_MENU_PERMISSIONS } from '@/constants/system-menu'
import { SYSTEM_ROLE_PERMISSIONS } from '@/constants/system-role'
import { SYSTEM_USER_PERMISSIONS } from '@/constants/system-user'
import { MESSAGE_PERMISSIONS } from '@/constants/message'
import { TENANT_PERMISSIONS } from '@/constants/tenant'
import { FILE_RESOURCE_PERMISSIONS } from '@/constants/file-resource'
import { PLUGIN_PERMISSIONS } from '@/constants/plugin'
import { THEME_PERMISSIONS } from '@/constants/theme'
import type { SystemDepartmentRecord } from '@/api/system/department'
import type { SystemDictionaryRecord } from '@/api/system/dictionary'
import type { SystemMenuRecord } from '@/api/system/menu'
import type { SystemRoleRecord } from '@/api/system/role'
import type { SystemUserRecord } from '@/api/system/user'

export type MockRole = 'admin' | 'user' | 'operator' | 'restricted'

export interface MockUserSeed {
  id: string
  username: string
  password: string
  role: MockRole
  permissions: string[]
  tenantId: string
  name: string
  email: string
  dept: string
  job: string
  avatar: string
}

export interface MockMenuNode {
  path?: string
  name?: string
  redirect?: string
  componentKey?: string
  meta?: {
    locale?: string
    requireAuth?: boolean
    roles?: string[]
    access?: {
      permissions?: string[]
      mode?: 'all' | 'any'
    }
    order?: number
    icon?: string
    hideChildrenInMenu?: boolean
    activeMenu?: string
  }
  children?: MockMenuNode[]
}

export const mockUsers: MockUserSeed[] = [
  {
    id: '1',
    username: 'admin',
    password: 'admin',
    role: 'admin',
    permissions: ['*'],
    tenantId: 'tenant-a',
    name: '系统管理员',
    avatar: avatarExample,
    email: 'admin@example.com',
    job: '平台管理员',
    dept: '平台运营部',
  },
  {
    id: '2',
    username: 'user',
    password: 'user',
    role: 'user',
    permissions: ['permission:page:view'],
    tenantId: 'tenant-a',
    name: '普通用户',
    avatar: avatarExample,
    email: 'user@example.com',
    job: '业务专员',
    dept: '业务部',
  },
  {
    id: '3',
    username: 'operator',
    password: 'operator',
    role: 'operator',
    permissions: ['user:list', 'workflow:todo', 'report:view'],
    tenantId: 'tenant-a',
    name: '运营人员',
    avatar: avatarExample,
    email: 'operator@example.com',
    job: '运营专员',
    dept: '运营部',
  },
  {
    id: '4',
    username: 'restricted',
    password: 'restricted',
    role: 'restricted',
    permissions: [],
    tenantId: 'tenant-b',
    name: '受限用户',
    avatar: avatarExample,
    email: 'restricted@example.com',
    job: '访客',
    dept: '外部协作',
  },
]

export const mockMenus: Record<MockRole, MockMenuNode[]> = {
  admin: [
    {
      path: '/dashboard',
      name: 'dashboard',
      redirect: '/dashboard/workplace',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.dashboard',
        requireAuth: true,
        order: 0,
        icon: 'icon-computer',
      },
      children: [
        {
          path: 'workplace',
          name: 'workplace',
          componentKey: 'DashboardWorkplace',
          meta: {
            locale: 'menu.dashboard.workplace',
            requireAuth: true,
            roles: ['*'],
          },
        },
        {
          path: 'analyse',
          name: 'analyse',
          componentKey: 'DashboardAnalyse',
          meta: {
            locale: 'menu.dashboard.analyse',
            requireAuth: true,
            roles: ['*'],
          },
        },
      ],
    },
    {
      path: '/visualization',
      name: 'visualization',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.visualization',
        requireAuth: true,
        order: 1,
        icon: 'icon-computer',
      },
      children: [
        {
          path: 'analysis',
          name: 'analysis',
          componentKey: 'VisualizationAnalysis',
          meta: {
            locale: 'menu.visualization.analysis',
            requireAuth: true,
            roles: ['*'],
          },
        },
        {
          path: 'multidimensionalAnalysis',
          name: 'multidimensionalAnalysis',
          componentKey: 'VisualizationMultidimensionalAnalysis',
          meta: {
            locale: 'menu.visualization.multidimensionalAnalysis',
            requireAuth: true,
            roles: ['*'],
          },
        },
        {
          path: 'dataScreen',
          name: 'dataScreen',
          componentKey: 'VisualizationDataScreen',
          meta: {
            locale: 'menu.visualization.dataScreen',
            requireAuth: true,
            roles: ['*'],
          },
        },
        {
          path: 'reportCenter',
          name: 'reportCenter',
          componentKey: 'VisualizationReportCenter',
          meta: {
            locale: 'menu.visualization.reportCenter',
            requireAuth: true,
            roles: ['*'],
          },
        },
      ],
    },
    {
      path: '/system',
      name: 'system',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.system',
        requireAuth: true,
        order: 6,
        icon: 'icon-settings',
      },
      children: [
        {
          path: 'userSystem',
          name: 'userSystem',
          componentKey: 'SystemUserPage',
          meta: {
            locale: 'menu.system.user',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [SYSTEM_USER_PERMISSIONS.list] },
          },
        },
        {
          path: 'roleSystem',
          name: 'roleSystem',
          componentKey: 'SystemRolePage',
          meta: {
            locale: 'menu.system.role',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [SYSTEM_ROLE_PERMISSIONS.list] },
          },
        },
        {
          path: 'menuSystem',
          name: 'menuSystem',
          componentKey: 'SystemMenuPage',
          meta: {
            locale: 'menu.system.menu',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [SYSTEM_MENU_PERMISSIONS.list] },
          },
        },
        {
          path: 'departmentSystem',
          name: 'departmentSystem',
          componentKey: 'SystemDepartmentPage',
          meta: {
            locale: 'menu.system.department',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [SYSTEM_DEPARTMENT_PERMISSIONS.list] },
          },
        },
        {
          path: 'dictSystem',
          name: 'dictSystem',
          componentKey: 'SystemDictPage',
          meta: {
            locale: 'menu.system.dict',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [SYSTEM_DICT_PERMISSIONS.list] },
          },
        },
      ],
    },
    {
      path: '/audit',
      name: 'audit',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.audit',
        requireAuth: true,
        order: 8,
        icon: 'icon-safe',
      },
      children: [
        {
          path: 'logs',
          name: 'auditLogs',
          componentKey: 'AuditLogPage',
          meta: {
            locale: 'menu.audit.logs',
            requireAuth: true,
            roles: ['*'],
          },
        },
      ],
    },
    {
      path: '/message',
      name: 'message',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.message',
        requireAuth: true,
        order: 7,
        icon: 'icon-message',
      },
      children: [
        {
          path: 'center',
          name: 'messageCenter',
          componentKey: 'MessageCenterPage',
          meta: {
            locale: 'menu.message.center',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [MESSAGE_PERMISSIONS.list] },
          },
        },
      ],
    },
    {
      path: '/Scalability',
      name: 'Scalability',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.Scalability',
        requireAuth: true,
        order: 5,
        icon: 'icon-scissor',
      },
      children: [
        {
          path: 'formDesign',
          name: 'formDesign',
          componentKey: 'FormDesignPage',
          meta: {
            locale: 'menu.Scalability.formDesign',
            requireAuth: true,
            roles: ['*'],
          },
        },
        {
          path: 'workflowDesign',
          name: 'workflowDesign',
          componentKey: 'WorkflowDesignPage',
          meta: {
            locale: 'menu.Scalability.workflowDesign',
            requireAuth: true,
            roles: ['*'],
          },
        },
        {
          path: 'workflowCenter',
          name: 'workflowCenter',
          componentKey: 'WorkflowCenterPage',
          meta: {
            locale: 'menu.Scalability.workflowCenter',
            requireAuth: true,
            roles: ['*'],
          },
        },
        {
          path: 'lowCodeBuilder',
          name: 'lowCodeBuilder',
          componentKey: 'LowCodeBuilderPage',
          meta: {
            locale: 'menu.Scalability.lowCodeBuilder',
            requireAuth: true,
            roles: ['*'],
          },
        },
      ],
    },
    {
      path: '/tenant',
      name: 'tenant',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.tenant',
        requireAuth: true,
        order: 9,
        icon: 'icon-apps',
      },
      children: [
        {
          path: 'center',
          name: 'tenantCenter',
          componentKey: 'TenantCenterPage',
          meta: {
            locale: 'menu.tenant.center',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [TENANT_PERMISSIONS.list] },
          },
        },
      ],
    },
    {
      path: '/resource',
      name: 'resource',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.resource',
        requireAuth: true,
        order: 10,
        icon: 'icon-file',
      },
      children: [
        {
          path: 'files',
          name: 'fileResourceCenter',
          componentKey: 'FileResourceCenterPage',
          meta: {
            locale: 'menu.resource.files',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [FILE_RESOURCE_PERMISSIONS.list] },
          },
        },
      ],
    },
    {
      path: '/theme',
      name: 'theme',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.theme',
        requireAuth: true,
        order: 11,
        icon: 'icon-brush',
      },
      children: [
        {
          path: 'center',
          name: 'themeCenter',
          componentKey: 'ThemeCenterPage',
          meta: {
            locale: 'menu.theme.center',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [THEME_PERMISSIONS.view] },
          },
        },
      ],
    },
    {
      path: '/plugin',
      name: 'plugin',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.plugin',
        requireAuth: true,
        order: 12,
        icon: 'icon-apps',
      },
      children: [
        {
          path: 'center',
          name: 'pluginCenter',
          componentKey: 'PluginCenterPage',
          meta: {
            locale: 'menu.plugin.center',
            requireAuth: true,
            roles: ['*'],
            access: { permissions: [PLUGIN_PERMISSIONS.view] },
          },
        },
      ],
    },
  ],
  user: [
    {
      path: '/dashboard',
      name: 'dashboard',
      redirect: '/dashboard/workplace',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.dashboard',
        requireAuth: true,
        order: 0,
        icon: 'icon-computer',
        hideChildrenInMenu: true,
      },
      children: [
        {
          path: 'workplace',
          name: 'workplace',
          componentKey: 'DashboardWorkplace',
          meta: {
            locale: 'menu.dashboard.workplace',
            requireAuth: true,
            roles: ['*'],
            activeMenu: 'dashboard',
          },
        },
      ],
    },
    {
      path: '/permissions',
      name: 'permissions',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.permissions',
        requireAuth: true,
        order: 1,
        icon: 'icon-apps',
      },
      children: [
        {
          path: 'front',
          name: 'front',
          componentKey: 'RouteGroupLayout',
          meta: {
            locale: 'menu.permissions.front',
            requireAuth: true,
            roles: ['user'],
          },
          children: [
            {
              path: 'page',
              name: 'page',
              componentKey: 'PermissionPage',
              meta: {
                locale: 'menu.permissions.front.page',
                requireAuth: true,
                access: { permissions: ['permission:page:view'] },
              },
            },
          ],
        },
      ],
    },
  ],
  operator: [
    {
      path: '/dashboard',
      name: 'dashboard',
      redirect: '/dashboard/workplace',
      componentKey: 'DefaultLayout',
      meta: {
        locale: 'menu.dashboard',
        requireAuth: true,
        order: 0,
        icon: 'icon-computer',
        hideChildrenInMenu: true,
      },
      children: [
        {
          path: 'workplace',
          name: 'workplace',
          componentKey: 'DashboardWorkplace',
          meta: {
            locale: 'menu.dashboard.workplace',
            requireAuth: true,
            roles: ['*'],
            activeMenu: 'dashboard',
          },
        },
      ],
    },
  ],
  restricted: [],
}

export const mockDictionaries = {
  dictStatus: [
    { label: '启用', value: 'enabled' },
    { label: '停用', value: 'disabled' },
  ],
  userStatus: [
    { label: '启用', value: 'enabled' },
    { label: '停用', value: 'disabled' },
  ],
  roleStatus: [
    { label: '启用', value: 'enabled' },
    { label: '停用', value: 'disabled' },
  ],
  menuStatus: [
    { label: '启用', value: 'enabled' },
    { label: '停用', value: 'disabled' },
  ],
  departmentStatus: [
    { label: '启用', value: 'enabled' },
    { label: '停用', value: 'disabled' },
  ],
  menuType: [
    { label: '目录', value: 'catalog' },
    { label: '菜单', value: 'menu' },
    { label: '按钮', value: 'button' },
  ],
  gender: [
    { label: '女', value: 0 },
    { label: '男', value: 1 },
  ],
  degree: [
    { value: 0, label: '高中及以下' },
    { value: 1, label: '大学专科' },
    { value: 2, label: '大学本科' },
    { value: 4, label: '硕士研究生' },
    { value: 5, label: '博士研究生' },
  ],
  diploma: [
    { value: 0, label: '无' },
    { value: 1, label: '学士' },
    { value: 2, label: '硕士' },
    { value: 4, label: '博士' },
  ],
  field: [
    { value: 0, label: '计算机科学' },
    { value: 1, label: '软件工程' },
    { value: 2, label: '人工智能' },
    { value: 4, label: '通信工程' },
  ],
}

export const mockSystemDictionaries: SystemDictionaryRecord[] = [
  {
    id: 'dict-1',
    dictName: '状态',
    dictType: 'sys_status',
    dictStatus: 'enabled',
    description: '系统通用启停状态',
    createdAt: '2026-06-01 10:00:00',
    updatedAt: '2026-06-01 10:00:00',
  },
  {
    id: 'dict-2',
    dictName: '性别',
    dictType: 'gender',
    dictStatus: 'enabled',
    description: '人员性别选项',
    createdAt: '2026-06-02 10:00:00',
    updatedAt: '2026-06-02 10:00:00',
  },
  {
    id: 'dict-3',
    dictName: '学历',
    dictType: 'degree',
    dictStatus: 'enabled',
    description: '教育经历学历选项',
    createdAt: '2026-06-03 10:00:00',
    updatedAt: '2026-06-03 10:00:00',
  },
  {
    id: 'dict-4',
    dictName: '废弃字段',
    dictType: 'legacy_field',
    dictStatus: 'disabled',
    description: '用于验证停用状态的虚拟字典',
    createdAt: '2026-06-04 10:00:00',
    updatedAt: '2026-06-04 10:00:00',
  },
]

export const mockSystemUsers: SystemUserRecord[] = [
  {
    id: 'user-1',
    username: 'admin',
    name: '系统管理员',
    phone: '17666666666',
    email: 'admin@example.com',
    dept: '平台运营部',
    status: 'enabled',
    role: 'admin',
    createdAt: '2026-06-01 10:00:00',
    updatedAt: '2026-06-01 10:00:00',
  },
  {
    id: 'user-2',
    username: 'operator',
    name: '运营人员',
    phone: '17655555555',
    email: 'operator@example.com',
    dept: '运营部',
    status: 'enabled',
    role: 'operator',
    createdAt: '2026-06-02 10:00:00',
    updatedAt: '2026-06-02 10:00:00',
  },
  {
    id: 'user-3',
    username: 'restricted',
    name: '受限用户',
    phone: '17644444444',
    email: 'restricted@example.com',
    dept: '外部协作',
    status: 'disabled',
    role: 'restricted',
    createdAt: '2026-06-03 10:00:00',
    updatedAt: '2026-06-03 10:00:00',
  },
]

export const mockSystemRoles: SystemRoleRecord[] = [
  {
    id: 'role-1',
    roleName: '超级管理员',
    roleKey: 'admin',
    roleSort: 1,
    dataScope: 'all',
    status: 'enabled',
    remark: '拥有平台全部权限',
    createdAt: '2026-06-01 10:00:00',
    updatedAt: '2026-06-01 10:00:00',
  },
  {
    id: 'role-2',
    roleName: '运营人员',
    roleKey: 'operator',
    roleSort: 2,
    dataScope: 'dept',
    status: 'enabled',
    remark: '负责运营数据和待办处理',
    createdAt: '2026-06-02 10:00:00',
    updatedAt: '2026-06-02 10:00:00',
  },
  {
    id: 'role-3',
    roleName: '外部访客',
    roleKey: 'restricted',
    roleSort: 3,
    dataScope: 'self',
    status: 'disabled',
    remark: '受限访问角色',
    createdAt: '2026-06-03 10:00:00',
    updatedAt: '2026-06-03 10:00:00',
  },
]

export const mockSystemMenus: SystemMenuRecord[] = [
  {
    id: 'menu-1',
    menuName: '系统管理',
    menuType: 'catalog',
    path: '/system',
    permission: 'system:view',
    sort: 1,
    status: 'enabled',
    createdAt: '2026-06-01 10:00:00',
    updatedAt: '2026-06-01 10:00:00',
  },
  {
    id: 'menu-2',
    menuName: '用户管理',
    menuType: 'menu',
    path: '/system/userSystem',
    permission: 'system:user:list',
    sort: 2,
    status: 'enabled',
    createdAt: '2026-06-02 10:00:00',
    updatedAt: '2026-06-02 10:00:00',
  },
  {
    id: 'menu-3',
    menuName: '角色管理',
    menuType: 'menu',
    path: '/system/roleSystem',
    permission: 'system:role:list',
    sort: 3,
    status: 'enabled',
    createdAt: '2026-06-03 10:00:00',
    updatedAt: '2026-06-03 10:00:00',
  },
  {
    id: 'menu-4',
    menuName: '废弃菜单',
    menuType: 'menu',
    path: '/system/legacy',
    permission: 'system:legacy:list',
    sort: 99,
    status: 'disabled',
    createdAt: '2026-06-04 10:00:00',
    updatedAt: '2026-06-04 10:00:00',
  },
]

export const mockSystemDepartments: SystemDepartmentRecord[] = [
  {
    id: 'department-1',
    departmentName: '平台运营部',
    leader: '系统管理员',
    sort: 1,
    status: 'enabled',
    createdAt: '2026-06-01 10:00:00',
    updatedAt: '2026-06-01 10:00:00',
  },
  {
    id: 'department-2',
    departmentName: '运营部',
    leader: '运营人员',
    sort: 2,
    status: 'enabled',
    createdAt: '2026-06-02 10:00:00',
    updatedAt: '2026-06-02 10:00:00',
  },
  {
    id: 'department-3',
    departmentName: '外部协作',
    leader: '受限用户',
    sort: 3,
    status: 'disabled',
    createdAt: '2026-06-03 10:00:00',
    updatedAt: '2026-06-03 10:00:00',
  },
]

export const mockBusinessGroups = [
  {
    name: '建立人才贡献奖励制度',
    items: [
      {
        id: 1,
        name: '龙头企业',
        active: true,
        startTime: '2022-08-01',
        endTime: '2022-12-01',
      },
      {
        id: 2,
        name: '重点企业',
        active: true,
        startTime: '2022-08-01',
        endTime: '2022-11-01',
      },
      {
        id: 3,
        name: '金融类企业',
        active: true,
      },
    ],
  },
  {
    name: '搭建高层次创新平台',
    items: [
      {
        id: 4,
        name: '博士后工作站扶持',
        active: false,
        startTime: '2022-09-01',
        endTime: '2023-09-01',
      },
      { id: 5, name: '博士后人员安家费', active: false },
      { id: 6, name: '院士工作站扶持', active: false },
      { id: 7, name: '院士工作站扶持', active: true },
    ],
  },
  {
    name: '鼓励引进高层次人才',
    items: [
      {
        id: 7,
        name: '外籍专家补贴',
        active: true,
      },
    ],
  },
]

const businessNames = [
  '龙头企业',
  '金融类企业',
  '女性托育补贴',
  '青年人才贷',
  '外籍专家补贴',
  '博士后人员安家费',
  '院士工作站扶持',
]

const businessCategories = [
  '建立人才贡献奖励制度',
  '搭建高层次创新平台',
  '鼓励引进高层次人才',
  '其他',
]

export const mockBusinessRecords = Array.from({ length: 55 }, (_, index) => ({
  serialNo: `MOCK-${String(index + 1).padStart(4, '0')}`,
  name: businessNames[index % businessNames.length],
  category: businessCategories[index % businessCategories.length],
  status: index % 3,
  time: `2024-01-${String((index % 28) + 1).padStart(2, '0')} 09:00:00`,
  updatedTime: `2024-02-${String((index % 28) + 1).padStart(2, '0')} 18:00:00`,
}))
