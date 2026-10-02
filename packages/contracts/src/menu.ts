interface CapabilityMenuNode {
  path: string
  name: string
  componentKey: string
  meta: {
    requireAuth: boolean
    locale: string
    order?: number
    access?: { permissions: string[]; mode?: 'any' | 'all' }
  }
  children?: CapabilityMenuNode[]
}
export const createR1Menu = (permissions: string[]) => {
  const pages = [
    {
      name: 'leaveRequests',
      path: 'requests',
      permission: 'leave:read:self',
      componentKey: 'LeaveRequests',
      locale: 'menu.leave.requests',
    },
    {
      name: 'leaveApplication',
      path: 'application',
      permission: 'application:configure',
      componentKey: 'LeaveApplication',
      locale: 'menu.leave.application',
    },
  ].filter(
    (page) => permissions.includes(page.permission) || permissions.includes('*')
  )
  const children = pages.map((page) => ({
    path: page.path,
    name: page.name,
    componentKey: page.componentKey,
    meta: {
      requireAuth: true,
      locale: page.locale,
      access: { permissions: [page.permission] },
    },
  }))
  const entries: CapabilityMenuNode[] = [
    {
      path: '/dashboard',
      name: 'dashboard',
      componentKey: 'DefaultLayout',
      meta: { requireAuth: true, locale: 'menu.dashboard', order: 0 },
      children: [
        {
          path: 'workplace',
          name: 'workplace',
          componentKey: 'DashboardWorkplace',
          meta: { requireAuth: true, locale: 'menu.dashboard.workplace' },
        },
      ],
    },
    ...(children.length
      ? [
          {
            path: '/leave',
            name: 'leave',
            componentKey: 'DefaultLayout',
            meta: { requireAuth: true, locale: 'menu.leave', order: 1 },
            children,
          },
        ]
      : []),
    {
      path: '/message',
      name: 'message',
      componentKey: 'DefaultLayout',
      meta: { requireAuth: true, locale: 'menu.message', order: 7 },
      children: [
        {
          path: 'center',
          name: 'messageCenter',
          componentKey: 'MessageCenter',
          meta: {
            requireAuth: true,
            locale: 'menu.message.center',
            access: { permissions: ['message:list'] },
          },
        },
      ],
    },
  ]
  if (permissions.includes('workflow:todo') || permissions.includes('*'))
    entries.push({
      path: '/Scalability',
      name: 'Scalability',
      componentKey: 'FullPageLayout',
      meta: { requireAuth: true, locale: 'menu.Scalability', order: 5 },
      children: [
        {
          path: 'workflowCenter',
          name: 'workflowCenter',
          componentKey: 'WorkflowCenter',
          meta: {
            requireAuth: true,
            locale: 'menu.Scalability.workflowCenter',
            access: { permissions: ['workflow:todo'] },
          },
        },
      ],
    })
  if (permissions.includes('audit:read') || permissions.includes('*'))
    entries.push({
      path: '/audit',
      name: 'audit',
      componentKey: 'DefaultLayout',
      meta: { requireAuth: true, locale: 'menu.audit', order: 8 },
      children: [
        {
          path: 'logs',
          name: 'auditLogs',
          componentKey: 'AuditLogs',
          meta: {
            requireAuth: true,
            locale: 'menu.audit.logs',
            access: { permissions: ['audit:read'] },
          },
        },
      ],
    })
  if (
    permissions.includes('system:department:list') ||
    permissions.includes('*')
  )
    entries.push({
      path: '/system',
      name: 'system',
      componentKey: 'DefaultLayout',
      meta: { requireAuth: true, locale: 'menu.system', order: 6 },
      children: [
        {
          path: 'departmentSystem',
          name: 'departmentSystem',
          componentKey: 'SystemDepartmentPage',
          meta: {
            requireAuth: true,
            locale: 'menu.system.department',
            access: { permissions: ['system:department:list'] },
          },
        },
      ],
    })
  if (
    ['system:position:list', 'system:organization:assign'].some((permission) =>
      permissions.includes(permission)
    ) ||
    permissions.includes('*')
  ) {
    const system = entries.find((entry) => entry.name === 'system')
    const page = {
      path: 'positionSystem',
      name: 'positionSystem',
      componentKey: 'SystemPositionPage',
      meta: {
        requireAuth: true,
        locale: 'menu.system.position',
        access: {
          permissions: ['system:position:list', 'system:organization:assign'],
          mode: 'any' as const,
        },
      },
    }
    if (system) system.children?.push(page)
    else
      entries.push({
        path: '/system',
        name: 'system',
        componentKey: 'DefaultLayout',
        meta: { requireAuth: true, locale: 'menu.system', order: 6 },
        children: [page],
      })
  }
  if (permissions.includes('system:user:list') || permissions.includes('*')) {
    const system = entries.find((entry) => entry.name === 'system')
    const page = {
      path: 'userSystem',
      name: 'userSystem',
      componentKey: 'SystemUserPage',
      meta: {
        requireAuth: true,
        locale: 'menu.system.user',
        access: { permissions: ['system:user:list'] },
      },
    }
    if (system) system.children?.push(page)
    else
      entries.push({
        path: '/system',
        name: 'system',
        componentKey: 'DefaultLayout',
        meta: { requireAuth: true, locale: 'menu.system', order: 6 },
        children: [page],
      })
  }
  if (permissions.includes('system:role:list') || permissions.includes('*')) {
    const system = entries.find((entry) => entry.name === 'system')
    const page = {
      path: 'roleSystem',
      name: 'roleSystem',
      componentKey: 'SystemRolePage',
      meta: {
        requireAuth: true,
        locale: 'menu.system.role',
        access: { permissions: ['system:role:list'] },
      },
    }
    if (system) system.children?.push(page)
    else
      entries.push({
        path: '/system',
        name: 'system',
        componentKey: 'DefaultLayout',
        meta: { requireAuth: true, locale: 'menu.system', order: 6 },
        children: [page],
      })
  }
  if (
    permissions.includes('account:password:update') ||
    permissions.includes('*')
  )
    entries.push({
      path: '/user',
      name: 'user',
      componentKey: 'DefaultLayout',
      meta: { requireAuth: true, locale: 'menu.user', order: 2 },
      children: [
        {
          path: 'password',
          name: 'accountPassword',
          componentKey: 'AccountPassword',
          meta: {
            requireAuth: true,
            locale: 'menu.user.password',
            access: { permissions: ['account:password:update'] },
          },
        },
      ],
    })
  if (permissions.includes('data-permission:view') || permissions.includes('*'))
    entries.push({
      path: '/permissions',
      name: 'permissions',
      componentKey: 'DefaultLayout',
      meta: { requireAuth: true, locale: 'menu.permissions', order: 4 },
      children: [
        {
          path: 'backend',
          name: 'backend',
          componentKey: 'RouteGroupLayout',
          meta: { requireAuth: true, locale: 'menu.permissions.backend' },
          children: [
            {
              path: 'data-scope',
              name: 'dataPermissionCenter',
              componentKey: 'DataPermissionCenter',
              meta: {
                requireAuth: true,
                locale: 'menu.permissions.backend.dataScope',
                access: { permissions: ['data-permission:view'] },
              },
            },
          ],
        },
      ],
    })
  return entries
}

export default createR1Menu
