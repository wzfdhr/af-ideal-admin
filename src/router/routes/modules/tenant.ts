import { defaultLayout } from '@/router/constants'
import { TENANT_PERMISSIONS } from '@/constants/tenant'
import { AppRouteRecordRaw } from '../../types'

const tenantRoutes: AppRouteRecordRaw = {
  path: '/tenant',
  name: 'tenant',
  component: defaultLayout,
  meta: {
    locale: 'menu.tenant',
    requireAuth: true,
    order: 9,
    icon: 'icon-apps',
  },
  children: [
    {
      path: 'center',
      name: 'tenantCenter',
      component: () => import('@/views/tenant/center/index.vue'),
      meta: {
        locale: 'menu.tenant.center',
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [TENANT_PERMISSIONS.list],
        },
      },
    },
  ],
}

export default tenantRoutes
