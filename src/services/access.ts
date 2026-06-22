export interface AccessUser {
  roles: string[]
  permissions: string[]
}

export interface AccessRequirement {
  roles?: string[]
  permissions?: string[]
  mode?: 'all' | 'any'
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
