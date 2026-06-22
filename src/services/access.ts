export interface AccessUser {
  roles: string[]
  permissions: string[]
}

export interface AccessRequirement {
  roles?: string[]
  permissions?: string[]
  mode?: 'all' | 'any'
}

export interface MenuLikeMeta {
  requireAuth?: boolean
  roles?: string[]
  access?: AccessRequirement
}

export interface MenuLikeNode {
  name?: string | symbol | null
  meta?: MenuLikeMeta
  children?: MenuLikeNode[]
}

export type AccessInput = AccessRequirement | string | string[] | undefined

export const isPermissionCode = (value: string) =>
  value === '*' || value.includes(':')

export const toAccessRequirement = (
  input: AccessInput
): AccessRequirement | undefined => {
  if (!input) {
    return undefined
  }
  if (typeof input === 'string') {
    return isPermissionCode(input)
      ? { permissions: [input] }
      : { roles: [input] }
  }
  if (Array.isArray(input)) {
    if (!input.length) {
      return undefined
    }

    return input.some(isPermissionCode)
      ? { permissions: input }
      : { roles: input }
  }

  return input
}

const hasAny = (required: string[], owned: string[]) =>
  required.includes('*') ||
  owned.includes('*') ||
  required.some((item) => owned.includes(item))

const hasAll = (required: string[], owned: string[]) =>
  required.includes('*') ||
  owned.includes('*') ||
  required.every((item) => owned.includes(item))

const matchRequirement = (
  required: string[] | undefined,
  owned: string[],
  mode: AccessRequirement['mode']
) => {
  if (!required?.length) {
    return true
  }

  return mode === 'all' ? hasAll(required, owned) : hasAny(required, owned)
}

export const canAccessByRequirement = (
  requirement: AccessRequirement | undefined,
  user: AccessUser
) => {
  if (!requirement) {
    return true
  }

  const mode = requirement.mode || 'any'

  return (
    matchRequirement(requirement.roles, user.roles, mode) &&
    matchRequirement(requirement.permissions, user.permissions, mode)
  )
}

export const flattenMenuNames = (menus: MenuLikeNode[]) => {
  const names = new Set<string | symbol>()
  const queue = [...menus]

  while (queue.length) {
    const menu = queue.shift()

    if (menu) {
      if (menu.name) {
        names.add(menu.name)
      }
      if (menu.children?.length) {
        queue.push(...menu.children)
      }
    }
  }

  return names
}

const canAccessMenuMeta = (
  meta: MenuLikeMeta | undefined,
  user: AccessUser
) => {
  if (!meta?.requireAuth && !meta?.access) {
    return true
  }
  if (meta.access) {
    return canAccessByRequirement(meta.access, user)
  }
  if (!meta.roles?.length) {
    return true
  }

  return canAccessByRequirement({ roles: meta.roles }, user)
}

export const filterAccessibleMenus = (
  menus: MenuLikeNode[],
  user: AccessUser
): MenuLikeNode[] =>
  menus.reduce<MenuLikeNode[]>((collector, menu) => {
    if (!canAccessMenuMeta(menu.meta, user)) {
      return collector
    }

    const nextMenu: MenuLikeNode = { ...menu }

    if (menu.children) {
      nextMenu.children = filterAccessibleMenus(menu.children, user)
    }

    collector.push(nextMenu)
    return collector
  }, [])
