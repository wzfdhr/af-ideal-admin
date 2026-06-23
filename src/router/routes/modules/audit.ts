import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const auditRoutes: AppRouteRecordRaw = {
  path: '/audit',
  name: 'audit',
  component: defaultLayout,
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
      component: () => import('@/views/audit/log-list/index.vue'),
      meta: {
        locale: 'menu.audit.logs',
        requireAuth: true,
        roles: ['*'],
      },
    },
  ],
}

export default auditRoutes
