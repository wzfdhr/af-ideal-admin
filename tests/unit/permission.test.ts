import { describe, expect, it } from 'vitest'
import { canAccessRoute, getFirstAccessibleRoute } from '@/hooks/use-permission'
import type { RouteRecordRaw } from 'vue-router'

describe('route permissions', () => {
  it('allows public routes without requireAuth', () => {
    expect(canAccessRoute({ path: '/login', name: 'login' }, '')).toBe(true)
  })

  it('allows wildcard roles', () => {
    expect(
      canAccessRoute(
        {
          path: '/dashboard',
          name: 'dashboard',
          meta: { requireAuth: true, roles: ['*'] },
        },
        'user'
      )
    ).toBe(true)
  })

  it('denies users whose role is not listed', () => {
    expect(
      canAccessRoute(
        {
          path: '/system',
          name: 'system',
          meta: { requireAuth: true, roles: ['admin'] },
        },
        'user'
      )
    ).toBe(false)
  })

  it('returns the first accessible nested route by role', () => {
    const routes: RouteRecordRaw[] = [
      {
        path: '/admin',
        name: 'admin',
        meta: { requireAuth: true, roles: ['admin'] },
      },
      {
        path: '/dashboard',
        name: 'dashboard',
        meta: { requireAuth: true, roles: ['*'] },
        children: [
          {
            path: 'workplace',
            name: 'workplace',
            meta: { requireAuth: true, roles: ['*'] },
          },
        ],
      },
    ]

    expect(getFirstAccessibleRoute(routes, 'user')).toEqual({
      name: 'dashboard',
    })
  })
})
