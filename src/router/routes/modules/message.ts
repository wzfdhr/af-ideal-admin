import { defaultLayout } from '@/router/constants'
import { MESSAGE_PERMISSIONS } from '@/constants/message'
import { AppRouteRecordRaw } from '../../types'

const messageRoutes: AppRouteRecordRaw = {
  path: '/message',
  name: 'message',
  component: defaultLayout,
  meta: {
    locale: 'menu.message',
    requireAuth: true,
    order: 7,
    icon: 'icon-message',
  },
  children: [
    {
      path: 'center',
      name: 'messageCenter',
      component: () => import('@/views/message/center/index.vue'),
      meta: {
        locale: 'menu.message.center',
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [MESSAGE_PERMISSIONS.list],
        },
      },
    },
    {
      path: 'subscriptions',
      name: 'messageSubscriptions',
      component: () => import('@/views/message/subscriptions/index.vue'),
      meta: {
        locale: 'menu.message.subscriptions',
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [MESSAGE_PERMISSIONS.subscribe],
        },
      },
    },
    {
      path: 'templates',
      name: 'messageTemplates',
      component: () => import('@/views/message/templates/index.vue'),
      meta: {
        locale: 'menu.message.templates',
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [MESSAGE_PERMISSIONS.template],
        },
      },
    },
  ],
}

export default messageRoutes
