import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const dashboardRoutes: AppRouteRecordRaw = {
  path: '/Permissions',
  name: 'permissions',
  component: defaultLayout,
  redirect: '/Permissions/front',
  meta: {
    locale: 'menu.Permissions',
    requireAuth: true,
    order: 0,
    icon: 'icon-apps',
    hideChildrenInMenu: true,
  },
  children: [
    {
      path: 'front',
      name: 'front',
      component: () => import('@/views/Permissions/index.vue'),
      meta: {
        locale: 'menu.Permissions.front',
        requireAuth: true,
        roles: ['*'],
        activeMenu: 'Permissions',
      },
    },
  ],
}

export default dashboardRoutes
