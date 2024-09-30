import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const userRoutes: AppRouteRecordRaw = {
  path: '/visualization',
  name: 'visualization',
  component: defaultLayout,
  meta: {
    locale: 'menu.visualization',
    requireAuth: true,
    order: 2,
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
  ],
}

export default userRoutes
