import { defaultLayout } from '@/router/constants'
import { SYSTEM_DICT_PERMISSIONS } from '@/constants/system-dictionary'
import { SYSTEM_USER_PERMISSIONS } from '@/constants/system-user'
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
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [SYSTEM_USER_PERMISSIONS.list],
        },
      },
    },
    {
      path: 'roleSystem',
      name: 'roleSystem',
      component: () => import('@/views/system/roleSystem/index.vue'),
      meta: {
        locale: 'menu.system.role',
        requireAuth: true,
        roles: ['*'],
      },
    },
    {
      path: 'menuSystem',
      name: 'menuSystem',
      component: () => import('@/views/system/menuSystem/index.vue'),
      meta: {
        locale: 'menu.system.menu',
        requireAuth: true,
        roles: ['*'],
      },
    },
    {
      path: 'departmentSystem',
      name: 'departmentSystem',
      component: () => import('@/views/system/departmentSystem/index.vue'),
      meta: {
        locale: 'menu.system.department',
        requireAuth: true,
        roles: ['*'],
      },
    },
    {
      path: 'dictSystem',
      name: 'dictSystem',
      component: () => import('@/views/system/dictSystem/index.vue'),
      meta: {
        locale: 'menu.system.dict',
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [SYSTEM_DICT_PERMISSIONS.list],
        },
      },
    },
  ],
}

export default aboutRoutes
