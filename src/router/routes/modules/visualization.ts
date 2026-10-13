import { defaultLayout } from '@/router/constants'
import { REPORT_PERMISSIONS } from '@/constants/report'
import {
  REPORTING_PERMISSIONS,
  REPORT_EXPORT_PERMISSIONS,
  REPORT_SCHEDULE_PERMISSIONS,
  DATA_SCREEN_PERMISSIONS,
} from '@af-admin/contracts'
import { dataMode } from '../../../../config/data-mode'
import { AppRouteRecordRaw } from '../../types'

const userRoutes: AppRouteRecordRaw = {
  path: '/visualization',
  name: 'visualization',
  component: defaultLayout,
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
      component: () => import('@/views/visualization/analysis/index.vue'),
      meta: {
        locale: 'menu.visualization.analysis',
        requireAuth: true,
        roles: ['*'],
      },
    },
    {
      path: 'multidimensionalAnalysis',
      name: 'multidimensionalAnalysis',
      component: () =>
        import('@/views/visualization/multidimensionalAnalysis/index.vue'),
      meta: {
        locale: 'menu.visualization.multidimensionalAnalysis',
        requireAuth: true,
        roles: ['*'],
      },
    },
    {
      path: 'dataScreen',
      name: 'dataScreen',
      component: () => import('@/views/visualization/dataScreen/index.vue'),
      meta: {
        locale: 'menu.visualization.dataScreen',
        requireAuth: true,
        roles: ['*'],
        ...(dataMode === 'reference'
          ? {
              access: {
                permissions: [
                  DATA_SCREEN_PERMISSIONS.list,
                  DATA_SCREEN_PERMISSIONS.run,
                ],
                mode: 'any' as const,
              },
            }
          : {}),
      },
    },
    {
      path: 'reportCenter',
      name: 'reportCenter',
      component: () => import('@/views/visualization/reportCenter/index.vue'),
      meta: {
        locale: 'menu.visualization.reportCenter',
        requireAuth: true,
        roles: ['*'],
        ...(dataMode === 'reference'
          ? {
              access: {
                permissions: [
                  REPORTING_PERMISSIONS.list,
                  REPORTING_PERMISSIONS.query,
                  REPORT_EXPORT_PERMISSIONS.list,
                ],
                mode: 'any' as const,
              },
            }
          : {}),
      },
    },
    {
      path: 'reportSchedules',
      name: 'reportSchedules',
      component: () =>
        import('@/views/visualization/reportSchedules/index.vue'),
      meta: {
        locale: 'menu.visualization.reportSchedules',
        requireAuth: true,
        roles: ['*'],
        access:
          dataMode === 'reference'
            ? {
                permissions: [
                  REPORT_SCHEDULE_PERMISSIONS.list,
                  REPORT_SCHEDULE_PERMISSIONS.runRead,
                ],
                mode: 'any' as const,
              }
            : { permissions: [REPORT_PERMISSIONS.schedule] },
      },
    },
  ],
}

export default userRoutes
