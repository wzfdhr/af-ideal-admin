import NProgress from 'nprogress'
import usePermission from '@/hooks/use-permission'
import { filterAccessibleMenus, flattenMenuNames } from '@/services/access'
import { useUserStore, useMenuStore } from '@/store'
import { menuFromServer, toNoPermissionPage } from '@config'
import { appRoutes } from '../routes'
import { whiteList } from '../constants'
import type { Router } from 'vue-router'

const setupPermissionGuard = (router: Router) => {
  router.beforeEach(async (to, from, next) => {
    const userStore = useUserStore()
    const menuStore = useMenuStore()
    const permission = usePermission()
    const permissionAllow = permission.hasAccessToRoute(to)

    if (menuFromServer) {
      if (
        !menuStore.asyncMenu.length &&
        !whiteList.find((el) => el.name === to.name)
      ) {
        await menuStore.fetchMenuConfig()
      }

      const accessibleServerMenus = filterAccessibleMenus(
        [...menuStore.asyncMenu, ...whiteList],
        {
          roles: userStore.role ? [userStore.role] : [],
          permissions: userStore.permissions,
        }
      )
      const serverMenuNames = flattenMenuNames(accessibleServerMenus)
      const existsInServerMenu = Boolean(
        to.name && serverMenuNames.has(to.name)
      )

      if (existsInServerMenu && permissionAllow) {
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
          ? permission.getFirstAccessibleRoute(
              appRoutes,
              userStore.role,
              userStore.permissions
            )
          : { name: 'not-allowed' }
        next(dest || { name: 'not-found' })
      }
    }
    NProgress.done()
  })
}

export default setupPermissionGuard
