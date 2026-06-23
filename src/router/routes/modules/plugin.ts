import { defaultLayout } from '@/router/constants'
import { PLUGIN_PERMISSIONS } from '@/constants/plugin'
import { AppRouteRecordRaw } from '../../types'

const pluginRoutes: AppRouteRecordRaw = {
  path: '/plugin',
  name: 'plugin',
  component: defaultLayout,
  meta: {
    locale: 'menu.plugin',
    requireAuth: true,
    order: 12,
    icon: 'icon-apps',
  },
  children: [
    {
      path: 'center',
      name: 'pluginCenter',
      component: () => import('@/views/plugin/center/index.vue'),
      meta: {
        locale: 'menu.plugin.center',
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [PLUGIN_PERMISSIONS.view],
        },
      },
    },
  ],
}

export default pluginRoutes
