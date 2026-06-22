import { useUserStore } from '@/store'
import type { UserRole } from '@config'
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

type PermissionRoute = RouteLocationNormalized | RouteRecordRaw

export const canAccessRoute = (
  route: PermissionRoute,
  role: UserRole | string
) => {
  const roles = route.meta?.roles

  if (!route.meta?.requireAuth) return true
  if (!roles || roles.length === 0) return true
  if (roles.includes('*')) return true

  return roles.includes(role)
}

export const getFirstAccessibleRoute = (
  rs: RouteRecordRaw[],
  role: UserRole | string = 'admin'
) => {
  const routes = [...rs]

  while (routes.length) {
    const first = routes.shift()
    if (!first) continue

    if (canAccessRoute(first, role)) {
      return { name: first.name }
    }

    if (first.children) {
      routes.push(...first.children)
    }
  }

  return null
}

const usePermission = () => {
  const userStore = useUserStore()

  return {
    hasAccessToRoute(route: PermissionRoute) {
      return canAccessRoute(route, userStore.role)
    },
    getFirstAccessibleRoute(rs: RouteRecordRaw[], role = 'admin') {
      return getFirstAccessibleRoute(rs, role)
    },
  }
}

export default usePermission
