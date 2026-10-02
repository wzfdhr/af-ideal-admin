import { defaultLayout } from '@/router/constants'
import { FILE_RESOURCE_PERMISSIONS } from '@/constants/file-resource'
import { dataMode } from '../../../../config/data-mode'
import { AppRouteRecordRaw } from '../../types'

const fileResourceRoutes: AppRouteRecordRaw = {
  path: '/resource',
  name: 'resource',
  component: defaultLayout,
  meta: {
    locale: 'menu.resource',
    requireAuth: true,
    order: 10,
    icon: 'icon-file',
  },
  children: [
    {
      path: 'files',
      name: 'fileResourceCenter',
      component:
        dataMode === 'reference'
          ? () => import('@/views/resource/files/reference.vue')
          : () => import('@/views/resource/files/index.vue'),
      meta: {
        locale: 'menu.resource.files',
        requireAuth: true,
        roles: ['*'],
        access: {
          permissions: [FILE_RESOURCE_PERMISSIONS.list],
        },
      },
    },
  ],
}

export default fileResourceRoutes
