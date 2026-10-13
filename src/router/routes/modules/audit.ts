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
      path: 'exports',
      name: 'auditExportJobs',
      component: () => import('@/views/audit/export-jobs/index.vue'),
      meta: {
        locale: 'menu.audit.exports',
        requireAuth: true,
        access: {
          permissions: [
            'audit:export:list',
            'audit:export:create',
            'audit:export:cancel',
            'audit:export:retry',
            'audit:export:archive',
            'audit:export:download',
          ],
          mode: 'any',
        },
      },
    },
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
