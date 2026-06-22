export interface AccessUser {
  roles: string[]
  permissions: string[]
}

export interface AccessRequirement {
  roles?: string[]
  permissions?: string[]
  mode?: 'all' | 'any'
}

const hasAny = (required: string[], owned: string[]) =>
  required.includes('*') || required.some((item) => owned.includes(item))

const hasAll = (required: string[], owned: string[]) =>
  required.includes('*') || required.every((item) => owned.includes(item))

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
