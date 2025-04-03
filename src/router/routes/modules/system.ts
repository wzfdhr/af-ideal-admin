import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const aboutRoutes: AppRouteRecordRaw = {
  path: '/system',
  name: 'system',
  component: defaultLayout,
  meta: {
    locale: 'menu.system',
    requireAuth: true,
    order: 6,
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
    {
      path: 'roleSystem',
      name: 'roleSystem',
      component: () => import('@/views/system/roleSystem/index.vue'),
      meta: {
        locale: 'menu.system.role',
        // icon: 'icon-question',
        roles: ['*'],
      },
    },
    {
      path: 'menuSystem',
      name: 'menuSystem',
      component: () => import('@/views/system/menuSystem/index.vue'),
      meta: {
        locale: 'menu.system.menu',
        // icon: 'icon-question',
        roles: ['*'],
      },
    },
    {
      path: 'departmentSystem',
      name: 'departmentSystem',
      component: () => import('@/views/system/departmentSystem/index.vue'),
      meta: {
        locale: 'menu.system.department',
        // icon: 'icon-question',
        roles: ['*'],
      },
    },
    {
      path: 'dictSystem',
      name: 'dictSystem',
      component: () => import('@/views/system/dictSystem/index.vue'),
      meta: {
        locale: 'menu.system.dict',
        // icon: 'icon-question',
        roles: ['*'],
      },
    },
  ],
}

export default aboutRoutes
