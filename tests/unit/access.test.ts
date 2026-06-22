import { describe, expect, it } from 'vitest'
import { canAccessRoute } from '@/hooks/use-permission'
import { canAccessByRequirement } from '@/services/access'

describe('access service', () => {
  const user = {
    roles: ['operator'],
    permissions: ['user:create', 'user:update'],
  }

  it('allows wildcard access', () => {
    expect(canAccessByRequirement({ roles: ['*'] }, user)).toBe(true)
  })

  it('allows any matching permission by default', () => {
    expect(canAccessByRequirement({ permissions: ['user:create'] }, user)).toBe(
      true
    )
  })

  it('requires all permissions when mode is all', () => {
    expect(
      canAccessByRequirement(
        { permissions: ['user:create', 'user:delete'], mode: 'all' },
        user
      )
    ).toBe(false)
  })

  it('allows matching role requirements', () => {
    expect(canAccessByRequirement({ roles: ['operator'] }, user)).toBe(true)
  })

  it('denies missing role requirements', () => {
    expect(canAccessByRequirement({ roles: ['admin'] }, user)).toBe(false)
  })

  it('bridges route meta access requirements', () => {
    expect(
      canAccessRoute(
        {
          path: '/users',
          name: 'users',
          meta: {
            requireAuth: true,
            access: {
              permissions: ['user:create'],
            },
          },
        },
        'operator',
        ['user:create']
      )
    ).toBe(true)
  })
})
