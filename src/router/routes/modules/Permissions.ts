import { defaultLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const dashboardRoutes: AppRouteRecordRaw = {
  path: '/permissions',
  name: 'permissions',
  component: defaultLayout,
  redirect: '/permissions/front',
  meta: {
    locale: 'menu.permissions',
    requireAuth: true,
    order: 1,
    icon: 'icon-apps',
  },
  children: [
    {
      path: 'front',
      name: 'front',
      component: '',
      meta: {
        locale: 'menu.permissions.front',
        requireAuth: true,
        roles: ['*'],
        activeMenu: 'permissions',
      },
      children: [
        {
          path: 'page',
          name: 'page',
          component: () => import('@/views/permissions/page/index.vue'),
          meta: {
            locale: 'menu.permissions.page',
            requireAuth: true,
            roles: ['*'],
            activeMenu: 'permissions',
          },
        },
        {
          path: 'button',
          name: 'button',
          component: () => import('@/views/permissions/button/index.vue'),
          meta: {
            locale: 'menu.permissions.button',
            requireAuth: true,
            roles: ['*'],
            activeMenu: 'permissions',
          },
        },
        {
          path: 'testing',
          name: 'testing',
          component: () => import('@/views/permissions/testing/index.vue'),
          meta: {
            locale: 'menu.permissions.testing',
            requireAuth: true,
            roles: ['*'],
            activeMenu: 'permissions',
          },
        },
      ],
    },
    {
      path: 'backend',
      name: 'backend',
      component: '',
      meta: {
        locale: 'menu.permissions.backend',
        requireAuth: true,
        roles: ['*'],
        activeMenu: 'permissions',
      },
      children: [
        {
          path: 'page',
          name: 'page',
          component: () => import('@/views/backendPermissions/page/index.vue'),
          meta: {
            locale: 'menu.permissions.page',
            requireAuth: true,
            roles: ['*'],
            activeMenu: 'permissions',
          },
        },
        {
          path: 'button',
          name: 'button',
          component: () =>
            import('@/views/backendPermissions/button/index.vue'),
          meta: {
            locale: 'menu.permissions.button',
            requireAuth: true,
            roles: ['*'],
            activeMenu: 'permissions',
          },
        },
      ],
    },
  ],
}

export default dashboardRoutes
