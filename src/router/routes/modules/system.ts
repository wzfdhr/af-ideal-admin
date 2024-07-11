import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const aboutRoutes: AppRouteRecordRaw = {
  path: '/system',
  name: 'system',
  component: defaultLayout,
  meta: {
    locale: 'menu.system',
    requireAuth: true,
    order: 999,
    icon: 'icon-settings',
  },
  children: [
    {
      path: 'userSystem',
      name: 'userSystem',
      component: () => import('@/views/system/userSystem/index.vue'),
      meta: {
        locale: 'menu.system.user',
        // icon: 'icon-question',
        roles: ['*'],
      },
    },
  ],
}

export default aboutRoutes
