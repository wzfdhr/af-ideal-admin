import { useUserStore } from '@/store'
import type { UserRole } from '@config'
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

type PermissionRoute = RouteLocationNormalized | RouteRecordRaw
type AccessibleRoute = { name: RouteRecordRaw['name'] } | null

const canAccessMeta = (
  meta: PermissionRoute['meta'],
  role: UserRole | string
) => {
  const roles = meta?.roles

  if (!meta?.requireAuth) return true
  if (!roles || roles.length === 0) return true
  if (roles.includes('*')) return true

  return roles.includes(role)
}

export const canAccessRoute = (
  route: PermissionRoute,
  role: UserRole | string
) => {
  if ('matched' in route && route.matched.length) {
    return route.matched.every((record) => canAccessMeta(record.meta, role))
  }

  return canAccessMeta(route.meta, role)
}

export const getFirstAccessibleRoute = (
  rs: RouteRecordRaw[],
  role: UserRole | string = ''
): AccessibleRoute => {
  for (const route of rs) {
    if (!canAccessRoute(route, role)) continue

    if (route.children?.length) {
      const child = getFirstAccessibleRoute(route.children, role)
      if (child) return child
      if (route.redirect) continue
    }

    return { name: route.name }
  }

  return null
}

const usePermission = () => {
  const userStore = useUserStore()

  return {
    hasAccessToRoute(route: PermissionRoute) {
      return canAccessRoute(route, userStore.role)
    },
    getFirstAccessibleRoute(rs: RouteRecordRaw[], role: UserRole | string = '') {
      return getFirstAccessibleRoute(rs, role)
    },
  }
}

export default usePermission
