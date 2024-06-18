import { computed } from 'vue'
import { RouteRecordRaw, RouteRecordNormalized } from 'vue-router'
import usePermission from '@/hooks/use-permission'
import appClientMenus from '@/router/menu'
import { useMenuStore } from '@/store'
import { menuFromServer } from '@config'

const useMenuTree = () => {
  const permission = usePermission()
  const menuStore = useMenuStore()

  const appRoute = computed(() =>
    menuFromServer ? menuStore.asyncMenu : appClientMenus
  )

  const menuTree = computed(() => {
    // get a copy of the router
    const routerClone: RouteRecordNormalized[] = JSON.parse(
      JSON.stringify(appRoute.value)
    )
    routerClone.sort(
      (a, b) =>
        ((a.meta?.order as number) || 0) - ((b.meta?.order as number) || 0)
    )

    const travel = (_routes: RouteRecordRaw[], layer: number) => {
      if (!_routes) return null

      const collector: any = _routes.map((el) => {
        if (!permission.hasAccessToRoute(el)) return null
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

      return collector.filter(Boolean)
    }
    return travel(routerClone, 0)
  })

  return {
    menuTree,
  }
}

export default useMenuTree
