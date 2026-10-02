import { defaultLayout } from '@/router/constants'
import type { AppRouteRecordRaw } from '../../types'

const applications: AppRouteRecordRaw = {
  path: '/applications',
  name: 'applications',
  component: defaultLayout,
  redirect: '/applications/center',
  meta: {
    locale: 'menu.applications',
    requireAuth: true,
    order: 2,
    icon: 'icon-apps',
  },
  children: [
    {
      path: 'center',
      name: 'applicationCenter',
      component: () => import('@/views/applications/center.vue'),
      meta: {
        locale: 'menu.applications.center',
        requireAuth: true,
        access: { permissions: ['application:list'] },
      },
    },
    {
      path: ':id/configuration',
      name: 'applicationConfiguration',
      component: () => import('@/views/leave/application.vue'),
      meta: {
        locale: 'menu.applications.configuration',
        requireAuth: true,
        hideInMenu: true,
        activeMenu: 'applicationCenter',
        access: { permissions: ['application:configure'] },
      },
    },
  ],
}
export default applications
