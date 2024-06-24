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
  },
  children: [
    {
      path: 'workplace',
      name: 'workplace',
      component: () => import('@/views/dashboard/workplace/index.vue'),
      meta: {
        locale: 'menu.dashboard.workplace',
        requireAuth: true,
        roles: ['*'],
        activeMenu: 'dashboard',
      },
    },
    {
      path: 'analyse',
      name: 'analyse',
      component: () => import('@/views/dashboard/analyse/index.vue'),
      meta: {
        locale: 'menu.dashboard.analyse',
        requireAuth: true,
        roles: ['*'],
        activeMenu: 'dashboard',
      },
    },
  ],
}

export default dashboardRoutes
