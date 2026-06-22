import { computed } from 'vue'
import appClientMenus from '@/router/menu'
import { filterAccessibleMenus, type MenuLikeNode } from '@/services/access'
import { useMenuStore, useUserStore } from '@/store'
import { menuFromServer } from '@config'
import type { RouteRecordRaw } from 'vue-router'

const useMenuTree = () => {
  const menuStore = useMenuStore()
  const userStore = useUserStore()

  const appRoute = computed(() =>
    menuFromServer ? menuStore.asyncMenu : appClientMenus
  )

  const menuTree = computed(() => {
    const routerClone = filterAccessibleMenus(
      appRoute.value as MenuLikeNode[],
      {
        roles: userStore.role ? [userStore.role] : [],
        permissions: userStore.permissions,
      }
    ) as RouteRecordRaw[]

    routerClone.sort(
      (a, b) =>
        ((a.meta?.order as number) || 0) - ((b.meta?.order as number) || 0)
    )

    const travel = (
      _routes: RouteRecordRaw[],
      layer: number
    ): RouteRecordRaw[] => {
      if (!_routes) return []

      const collector = _routes.map((el): RouteRecordRaw | null => {
        if (el.meta?.hideChildrenInMenu || !el.children) {
          el.children = []
          return el
        }

        el.children = el.children.filter((e) => !e.meta?.hideInMenu)

        const subEntries = travel(el.children, layer + 1)
        if (subEntries.length) {
          el.children = subEntries
          return el
        }
        if (layer > 1) {
          el.children = subEntries
          return el
        }

        if (!el.meta?.hideInMenu) return el

        return null
      })

      return collector.filter((item): item is RouteRecordRaw => Boolean(item))
    }
    return travel(routerClone, 0)
  })

  return {
    menuTree,
  }
}

export default useMenuTree
