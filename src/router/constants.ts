export const defaultLayout = () => import('@/layout/default-layout.vue')
export const fullPageLayout = () => import('@/layout/full-page-layout.vue')
export const routeGroupLayout = () => import('@/layout/route-group-layout.vue')

export const whiteList = [
  { name: 'not-found', children: [] },
  { name: 'login', children: [] },
]
