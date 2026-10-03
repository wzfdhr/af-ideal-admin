import { defaultLayout } from '@/router/constants'
import type { AppRouteRecordRaw } from '../../types'

const lowCode: AppRouteRecordRaw = {
  path: '/low-code',
  name: 'lowCode',
  component: defaultLayout,
  meta: {
    locale: 'menu.lowCode',
    requireAuth: true,
    order: 6,
    icon: 'icon-apps',
  },
  children: [
    {
      path: 'pages',
      name: 'lowCodeRuntimePages',
      component: () => import('@/views/lowCodeRuntime/index.vue'),
      meta: {
        locale: 'menu.lowCode.runtime',
        requireAuth: true,
        access: { permissions: ['low-code:page:run'] },
      },
    },
    {
      path: 'pages/:id/run',
      name: 'lowCodeRuntime',
      component: () => import('@/views/lowCodeRuntime/index.vue'),
      meta: {
        locale: 'menu.lowCode.runtime',
        requireAuth: true,
        hideInMenu: true,
        activeMenu: 'lowCodeRuntimePages',
        access: { permissions: ['low-code:page:run'] },
      },
    },
  ],
}
export default lowCode
