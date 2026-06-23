import { defaultLayout } from '@/router/constants'
import { REPORT_PERMISSIONS } from '@/constants/report'
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
        access: {
          permissions: [REPORT_PERMISSIONS.schedule],
        },
      },
    },
  ],
}

export default userRoutes
