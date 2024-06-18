import NProgress from 'nprogress'
import usePermission from '@/hooks/use-permission'
import { useUserStore, useMenuStore } from '@/store'
import { menuFromServer, toNoPermissionPage } from '@config'
import { appRoutes } from '../routes'
import { whiteList } from '../constants'
import type { Router, RouteRecordNormalized } from 'vue-router'

const setupPermissionGuard = (router: Router) => {
  router.beforeEach(async (to, from, next) => {
    const userStore = useUserStore()
    const menuStore = useMenuStore()
    const permission = usePermission()
    const permissionAllow = permission.hasAccessToRoute(to)

    if (menuFromServer) {
      // TODO: implement permisison logic
      if (
        !menuStore.asyncMenu.length &&
        !whiteList.find((el) => el.name === to.name)
      ) {
        await menuStore.fetchMenuConfig()
      }

      const serverMenuConfig = [...menuStore.asyncMenu, ...whiteList]

      let exist = false
      while (serverMenuConfig.length && !exist) {
        const el = serverMenuConfig.shift()
        if (el?.name === to.name) exist = true
        if (el?.children) {
          serverMenuConfig.push(...(el.children as RouteRecordNormalized[]))
        }
      }

      if (exist && permissionAllow) {
        next()
      } else {
        next({ name: 'not-found' })
      }
    } else {
      // menu is not fetched from the server
      // eslint-disable-next-line no-lonely-if
      if (permissionAllow) {
        next()
      } else {
        const dest = !toNoPermissionPage
          ? permission.getFirstAccessibleRoute(appRoutes, userStore.role)
          : { name: 'not-allowed' }
        next(dest || { name: 'not-found' })
      }
    }
    NProgress.done()
  })
}

export default setupPermissionGuard
