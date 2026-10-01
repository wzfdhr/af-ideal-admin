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
  const entries = [
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
  return entries
}

export default createR1Menu
