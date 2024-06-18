import NProgress from 'nprogress'
import { useUserStore } from '@/store'
import { isAuthed } from '@/utils/auth'
import type { Router, LocationQueryRaw } from 'vue-router'

const setupLoginGuard = (router: Router) => {
  router.beforeEach(async (to, from, next) => {
    NProgress.start()

    const userStore = useUserStore()
    if (isAuthed()) {
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
