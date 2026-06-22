import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const listRoutes: AppRouteRecordRaw = {
  path: '/list',
  name: 'list',
  component: defaultLayout,
  meta: {
    locale: 'menu.list',
    requireAuth: true,
    order: 2,
    icon: 'icon-list',
  },
  children: [
    {
      path: 'card',
      name: 'card',
      component: () => import('@/views/list/card/index.vue'),
      meta: {
        locale: 'menu.list.card',
        requireAuth: true,
        roles: ['*'],
      },
    },
    {
      path: 'normal',
      name: 'normal',
      component: () => import('@/views/list/normal/index.vue'),
      meta: {
        locale: 'menu.list.normal',
        requireAuth: true,
        roles: ['*'],
      },
    },
  ],
}

export default listRoutes
