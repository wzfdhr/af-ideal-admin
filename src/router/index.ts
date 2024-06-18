/**
 * 本文件包含自动生成的路由路径，
 * 除非你确切知道自己需要做什么，否则建议不要更改。
 * 如果要新增或移除路由，请从 /routes 目录下新增或删除模块。
 */
import { createRouter, createWebHistory } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { appRoutes, subModuleRoutes } from './routes'
import createRouteGuards from './guards'

NProgress.configure({
  showSpinner: false,
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: 'login',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/index.vue'),
    },
    ...appRoutes,
    ...subModuleRoutes,
    {
      path: '/not-allowed',
      name: 'not-allowed',
      component: () => import('@/views/exception/not-allowed.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/exception/not-found.vue'),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

createRouteGuards(router)

export default router
