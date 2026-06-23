import { defaultLayout } from '@/router/constants'
import { THEME_PERMISSIONS } from '@/constants/theme'
import { AppRouteRecordRaw } from '../../types'

const themeRoutes: AppRouteRecordRaw = {
  path: '/theme',
  name: 'theme',
  component: defaultLayout,
  meta: {
    locale: 'menu.theme',
    requireAuth: true,
    order: 11,
    icon: 'icon-brush',
  },
  children: [
    {
      path: 'center',
      name: 'themeCenter',
      component: () => import('@/views/theme/center/index.vue'),
      meta: {
        locale: 'menu.theme.center',
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [THEME_PERMISSIONS.view],
        },
      },
    },
  ],
}

export default themeRoutes
