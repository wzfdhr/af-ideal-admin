import avatarExample from '@/assets/avatar-user.png'

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
          meta: { locale: 'menu.system.user', requireAuth: true, roles: ['*'] },
        },
        {
          path: 'roleSystem',
          name: 'roleSystem',
          componentKey: 'SystemRolePage',
          meta: { locale: 'menu.system.role', requireAuth: true, roles: ['*'] },
        },
        {
          path: 'dictSystem',
          name: 'dictSystem',
          componentKey: 'SystemDictPage',
          meta: { locale: 'menu.system.dict', requireAuth: true, roles: ['*'] },
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
