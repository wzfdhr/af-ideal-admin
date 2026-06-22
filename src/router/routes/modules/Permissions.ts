import { defaultLayout, routeGroupLayout } from '@/router/constants'
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
      component: routeGroupLayout,
      meta: {
        locale: 'menu.permissions.front',
        requireAuth: true,
        roles: ['user'],
      },
      children: [
        {
          path: 'page',
          name: 'page',
          component: () => import('@/views/permissions/page/index.vue'),
          meta: {
            locale: 'menu.permissions.front.page',
            requireAuth: true,
            roles: ['user'],
          },
        },
        {
          path: 'button',
          name: 'button',
          component: () => import('@/views/permissions/button/index.vue'),
          meta: {
            locale: 'menu.permissions.front.button',
            requireAuth: true,
            roles: ['*'],
          },
        },
        {
          path: 'testing',
          name: 'testing',
          component: () => import('@/views/permissions/testing/index.vue'),
          meta: {
            locale: 'menu.permissions.front.testing',
            requireAuth: true,
            roles: ['*'],
          },
        },
      ],
    },
    {
      path: 'backend',
      name: 'backend',
      component: routeGroupLayout,
      meta: {
        locale: 'menu.permissions.backend',
        requireAuth: true,
        roles: ['*'],
      },
      children: [
        {
          path: 'page',
          name: 'backendPage',
          component: () => import('@/views/backendPermissions/page/index.vue'),
          meta: {
            locale: 'menu.permissions.backend.page',
            requireAuth: true,
            roles: ['*'],
          },
        },
        {
          path: 'button',
          name: 'backendButton',
          component: () =>
            import('@/views/backendPermissions/button/index.vue'),
          meta: {
            locale: 'menu.permissions.backend.button',
            requireAuth: true,
            roles: ['*'],
          },
        },
      ],
    },
  ],
}

export default dashboardRoutes
