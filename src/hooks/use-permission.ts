import { useUserStore } from '@/store'
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

const usePermission = () => {
  const userStore = useUserStore()

  return {
    hasAccessToRoute(route: RouteLocationNormalized | RouteRecordRaw) {
      return (
        !route.meta?.requireAuth ||
        !route.meta?.roles ||
        (route.meta?.roles as string[] | undefined)?.includes('*') ||
        (route.meta?.roles as string[] | undefined)?.includes(userStore.role)
      )
    },
    getFirstAccessibleRoute(rs: any, role = 'admin') {
      const routes = [...rs]
      while (routes.length) {
        const first = routes.shift()

        if (
          first?.meta?.roles?.find(
            (el: string[]) => el.includes('*') || el.includes(role)
          )
        ) {
          return { name: first.name }
        }

        if (first?.children) {
          routes.push(...first.children)
        }
      }

      return null
    },
  }
}

export default usePermission
