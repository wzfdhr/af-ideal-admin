import { defaultLayout } from '@/router/constants'
import type { AppRouteRecordRaw } from '../../types'

const formRoutes: AppRouteRecordRaw = {
  path: '/form',
  name: 'form',
  component: defaultLayout,
  meta: {
    icon: 'icon-file',
    requireAuth: true,
    order: 2,
    locale: 'menu.form',
  },
  children: [
    {
      path: 'complex-step',
      name: 'complex-step',
      component: () => import('@/views/form/complex-step/index.vue'),
      meta: {
        locale: 'menu.form.complex-step',
        requireAuth: true,
        roles: ['*'],
      },
    },
    {
      path: 'advanced-form',
      name: 'advanced-form',
      component: () => import('@/views/form/advanced-form/index.vue'),
      meta: {
        locale: 'menu.form.advanced-form',
        requireAuth: true,
        roles: ['*'],
      },
    },
    {
      path: 'step',
      name: 'step',
      component: () => import('@/views/form/step/index.vue'),
      meta: {
        locale: 'menu.form.step',
        requireAuth: true,
        roles: ['*'],
      },
    },
  ],
}

export default formRoutes
