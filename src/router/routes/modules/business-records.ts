import { defaultLayout } from '@/router/constants'
import type { AppRouteRecordRaw } from '../../types'

const business: AppRouteRecordRaw = {
  path: '/business',
  name: 'businessRecords',
  component: defaultLayout,
  meta: { locale: 'menu.business.records', requireAuth: true },
  children: [
    {
      path: 'records',
      name: 'businessRecordsList',
      component: () => import('@/views/business/records.vue'),
      meta: {
        locale: 'menu.business.records',
        requireAuth: true,
        access: { permissions: ['business:read:self'] },
      },
    },
    {
      path: 'records/:id',
      name: 'businessRecordDetail',
      component: () => import('@/views/business/record.vue'),
      meta: {
        locale: 'menu.business.record',
        requireAuth: true,
        hideInMenu: true,
        access: {
          permissions: [
            'business:read:self',
            'workflow:todo',
            'workflow:approve',
            'workflow:reject',
          ],
          mode: 'any',
        },
      },
    },
  ],
}
export default business
