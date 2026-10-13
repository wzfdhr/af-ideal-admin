import NProgress from 'nprogress'
import { navigationAccess } from '@/api/navigation'
import usePermission from '@/hooks/use-permission'
import { filterAccessibleMenus, flattenMenuNames } from '@/services/access'
import { useUserStore, useMenuStore } from '@/store'
import { canVisitR1Page } from '@/services/r1-menu'
import { menuFromServer, toNoPermissionPage } from '@config'
import { dataMode } from '../../../config/data-mode'
import { appRoutes } from '../routes'
import { whiteList } from '../constants'
import type { Router } from 'vue-router'

const setupPermissionGuard = (router: Router) => {
  router.beforeEach(async (to, from, next) => {
    const userStore = useUserStore()
    const menuStore = useMenuStore()
    const permission = usePermission()
    menuStore.currentRouteName = typeof to.name === 'string' ? to.name : ''
    const permissionAllow = permission.hasAccessToRoute(to)
    if (
      userStore.tenants.length &&
      !whiteList.some((item) => item.name === to.name) &&
      !canVisitR1Page(to.name, userStore.permissions)
    ) {
      next({ name: 'not-allowed' })
      NProgress.done()
      return
    }
    if (
      dataMode === 'reference' &&
      userStore.tenants.length &&
      !whiteList.some((item) => item.name === to.name)
    ) {
      try {
        if (!canVisitR1Page(to.name, userStore.permissions)) {
          next({ name: 'not-allowed' })
          NProgress.done()
          return
        }
        const ready = await menuStore.fetchNavigationState()
        if (
          !ready ||
          typeof to.name !== 'string' ||
          !(await navigationAccess(to.name))
        ) {
          next({ name: 'not-allowed' })
          NProgress.done()
          return
        }
        if (!permissionAllow) {
          next({ name: 'not-allowed' })
          NProgress.done()
          return
        }
        next()
        NProgress.done()
        return
      } catch {
        next({ name: 'not-allowed' })
        NProgress.done()
        return
      }
    }

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
