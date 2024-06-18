import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const userRoutes: AppRouteRecordRaw = {
  path: '/user',
  name: 'user',
  component: defaultLayout,
  meta: {
    locale: 'menu.user',
    requireAuth: true,
    order: 2,
    icon: 'icon-user',
  },
  children: [
    {
      path: 'info',
      name: 'info',
      component: () => import('@/views/user/info/index.vue'),
      meta: {
        locale: 'menu.user.info',
        requireAuth: true,
        roles: ['*'],
      },
    },
  ],
}

export default userRoutes
