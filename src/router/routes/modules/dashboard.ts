import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const dashboardRoutes: AppRouteRecordRaw = {
  path: '/dashboard',
  name: 'dashboard',
  component: defaultLayout,
  redirect: '/dashboard/workplace',
  meta: {
    locale: 'menu.dashboard',
    requireAuth: true,
    order: 0,
    icon: 'icon-apps',
    hideChildrenInMenu: true,
  },
  children: [
    {
      path: 'workplace',
      name: 'workplace',
      component: () => import('@/views/dashboard/index.vue'),
      meta: {
        locale: 'menu.dashboard.workplace',
        requireAuth: true,
        roles: ['*'],
        activeMenu: 'dashboard',
      },
    },
  ],
}

export default dashboardRoutes
