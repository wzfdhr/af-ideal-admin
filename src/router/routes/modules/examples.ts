import { defaultLayout } from '@/router/constants'
import { UI_ADAPTER_LAB_PERMISSIONS } from '@/constants/ui-adapter-lab'
import { AppRouteRecordRaw } from '../../types'

const examplesRoutes: AppRouteRecordRaw = {
  path: '/examples',
  name: 'examples',
  component: defaultLayout,
  meta: {
    locale: 'menu.examples',
    requireAuth: true,
    order: 13,
    icon: 'icon-experiment',
  },
  children: [
    {
      path: 'ui-adapter-lab',
      name: 'uiAdapterLab',
      component: () => import('@/views/examples/ui-adapter-lab/index.vue'),
      meta: {
        locale: 'menu.examples.uiAdapterLab',
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [UI_ADAPTER_LAB_PERMISSIONS.view],
        },
      },
    },
  ],
}

export default examplesRoutes
