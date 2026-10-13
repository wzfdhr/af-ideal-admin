import { defaultLayout } from '@/router/constants'
import { MESSAGE_PERMISSIONS } from '@/constants/message'
import { dataMode } from '../../../../config/data-mode'
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
          permissions:
            dataMode === 'reference'
              ? ['message:subscription:read']
              : [MESSAGE_PERMISSIONS.subscribe],
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
          permissions:
            dataMode === 'reference'
              ? [
                  'message:template:list',
                  'message:template:approve',
                  'message:send:list',
                  'message:send:create',
                ]
              : [MESSAGE_PERMISSIONS.template],
          mode: 'any',
        },
      },
    },
    {
      path: 'announcements',
      name: 'messageAnnouncements',
      component: () => import('@/views/message/announcements/index.vue'),
      meta: {
        locale: 'menu.message.announcements',
        requireAuth: true,
        access: {
          permissions: [
            'message:announcement:list',
            'message:announcement:read',
          ],
          mode: 'any',
        },
      },
    },
  ],
}

export default messageRoutes
