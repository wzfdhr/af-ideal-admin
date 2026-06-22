import NProgress from 'nprogress'
import { useUserStore } from '@/store'
import { isAuthed } from '@/services/auth'
import type { Router, LocationQueryRaw } from 'vue-router'

const setupLoginGuard = (router: Router) => {
  router.beforeEach(async (to, from, next) => {
    NProgress.start()

    const userStore = useUserStore()
    if (isAuthed()) {
      // 如果 role 已存在，说明用户信息已加载，可以直接放行（next()）。
      // 如果 role 不存在，则尝试通过 userStore.info() 异步获取用户信息。如果成功获取，则放行；如果失败（例如 API 请求错误），则重定向到登录页面，并带上重定向信息。
      if (userStore.role) {
        // the userInfo is already quried and managed by store module
        next()
      } else {
        try {
          await userStore.info()
          next()
        } catch (error) {
          next({
            name: 'login',
            query: {
              redirect: to.name,
              ...to.query,
            } as LocationQueryRaw,
          })
        } // end of try-catch userInfo
      }
    } else {
      if (to.name === 'login') {
        next()
        return
      }

      next({
        name: 'login',
        query: {
          redirect: to.name,
          ...to.query,
        } as LocationQueryRaw,
      })
    }
  })
}

export default setupLoginGuard
