import { defaultLayout } from '@/router/constants'
import type { AppRouteRecordRaw } from '../../types'

const leave: AppRouteRecordRaw = {
  path: '/leave',
  name: 'leave',
  component: defaultLayout,
  meta: {
    locale: 'menu.leave',
    requireAuth: true,
    order: 1,
    icon: 'icon-calendar',
  },
  children: [
    {
      path: 'requests',
      name: 'leaveRequests',
      component: () => import('@/views/leave/requests.vue'),
      meta: {
        locale: 'menu.leave.requests',
        requireAuth: true,
        access: { permissions: ['leave:read:self'] },
      },
    },
    {
      path: 'requests/:id',
      name: 'leaveDetail',
      component: () => import('@/views/leave/detail.vue'),
      meta: {
        locale: 'menu.leave.detail',
        requireAuth: true,
        hideInMenu: true,
        activeMenu: 'leaveRequests',
        access: {
          permissions: ['leave:read:self', 'workflow:todo'],
          mode: 'any',
        },
      },
    },
    {
      path: 'application',
      name: 'leaveApplication',
      component: () => import('@/views/leave/application.vue'),
      meta: {
        locale: 'menu.leave.application',
        requireAuth: true,
        access: { permissions: ['application:configure'] },
      },
    },
  ],
}

export default leave
