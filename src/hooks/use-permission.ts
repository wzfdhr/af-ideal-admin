import { useUserStore } from '@/store'
import { canAccessByRequirement } from '@/services/access'
import type { UserRole } from '@config'
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

type PermissionRoute = RouteLocationNormalized | RouteRecordRaw
type AccessibleRoute = { name: RouteRecordRaw['name'] } | null

const canAccessMeta = (
  meta: PermissionRoute['meta'],
  role: UserRole | string,
  permissions: string[] = []
) => {
  const roles = meta?.roles
  const accessUser = {
    roles: role ? [role] : [],
    permissions,
  }

  if (!meta?.requireAuth && !meta?.access) return true
  if (meta?.access) return canAccessByRequirement(meta.access, accessUser)
  if (!roles || roles.length === 0) return true
  if (roles.includes('*')) return true

  return roles.includes(role)
}

export const canAccessRoute = (
  route: PermissionRoute,
  role: UserRole | string,
  permissions: string[] = []
) => {
  if ('matched' in route && route.matched.length) {
    return route.matched.every((record) =>
      canAccessMeta(record.meta, role, permissions)
    )
  }

  return canAccessMeta(route.meta, role, permissions)
}

export const getFirstAccessibleRoute = (
  rs: RouteRecordRaw[],
  role: UserRole | string = '',
  permissions: string[] = []
): AccessibleRoute => {
  const routes = [...rs]

  while (routes.length) {
    const route = routes.shift()

    if (route && canAccessRoute(route, role, permissions)) {
      const child = getFirstAccessibleRoute(
        route.children || [],
        role,
        permissions
      )
      if (child) return child

      if (!route.redirect) {
        return { name: route.name }
      }
    }
  }

  return null
}

const usePermission = () => {
  const userStore = useUserStore()

  return {
    hasAccessToRoute(route: PermissionRoute) {
      return canAccessRoute(route, userStore.role, userStore.permissions)
    },
    getFirstAccessibleRoute(
      rs: RouteRecordRaw[],
      role: UserRole | string = '',
      permissions: string[] = []
    ) {
      return getFirstAccessibleRoute(rs, role, permissions)
    },
  }
}

export default usePermission
