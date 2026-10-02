import NProgress from 'nprogress'
import { useUserStore, useMenuStore } from '@/store'
import { isAuthed, clearAuth } from '@/services/auth'
import { resetTenantContext } from '@/services/tenant-context'
import { retainLeaveDrafts } from '@/services/leave-draft-recovery'
import type { Router, LocationQueryRaw } from 'vue-router'

const setupLoginGuard = (router: Router) => {
  router.beforeEach(async (to, from, next) => {
    NProgress.start()

    const userStore = useUserStore()
    if (isAuthed()) {
      if (to.name === 'login' && userStore.role) {
        next()
        return
      }
      try {
        await userStore.info()
        next()
      } catch (error) {
        retainLeaveDrafts()
        clearAuth()
        resetTenantContext()
        userStore.resetInfo()
        useMenuStore().clearAsyncMenu()
        if (to.name === 'login') {
          next()
          return
        }
        next({
          name: 'login',
          query: { redirect: to.name, ...to.query } as LocationQueryRaw,
        })
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
