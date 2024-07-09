import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const aboutRoutes: AppRouteRecordRaw = {
  path: '/about',
  name: 'about',
  component: defaultLayout,
  meta: {
    locale: 'menu.about',
    requireAuth: true,
    order: 999,
    icon: 'icon-message',
  },
  children: [
    {
      path: 'index',
      name: 'index',
      component: () => import('@/views/audit/temp/temp.vue'),
      meta: {
        locale: 'menu.about.temp',
        icon: 'icon-question',
        roles: ['*'],
      },
    },
  ],
}

export default aboutRoutes
