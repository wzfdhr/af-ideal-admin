import { fullPageLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'

const exAbilityRoutes: AppRouteRecordRaw = {
  path: '/Scalability',
  name: 'Scalability',
  component: fullPageLayout,
  meta: {
    locale: 'menu.Scalability',
    order: 5,
    requireAuth: true,
    icon: 'icon-scissor',
    openInNewWindow: true,
  },
  children: [
    {
      path: 'formDesign',
      name: 'formDesign',
      component: () => import('@/views/formDesign/index.vue'),
      meta: {
        locale: 'menu.Scalability.formDesign',
        requireAuth: true,
        openInNewWindow: true,
      },
    },
    {
      path: 'workflowDesign',
      name: 'workflowDesign',
      component: () => import('@/views/workflowDesign/index.vue'),
      meta: {
        locale: 'menu.Scalability.workflowDesign',
        requireAuth: true,
        openInNewWindow: true,
      },
    },
    {
      path: 'workflowCenter',
      name: 'workflowCenter',
      component: () => import('@/views/workflowCenter/index.vue'),
      meta: {
        locale: 'menu.Scalability.workflowCenter',
        requireAuth: true,
        openInNewWindow: true,
      },
    },
    {
      path: 'lowCodeBuilder',
      name: 'lowCodeBuilder',
      component: () => import('@/views/lowCodeBuilder/index.vue'),
      meta: {
        locale: 'menu.Scalability.lowCodeBuilder',
        requireAuth: true,
        openInNewWindow: true,
      },
    },
  ],
}

export default exAbilityRoutes
