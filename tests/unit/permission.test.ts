import { describe, expect, it } from 'vitest'
import { canAccessRoute, getFirstAccessibleRoute } from '@/hooks/use-permission'
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

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

  it('allows protected routes without roles', () => {
    expect(
      canAccessRoute(
        {
          path: '/profile',
          name: 'profile',
          meta: { requireAuth: true },
        },
        'user'
      )
    ).toBe(true)
  })

  it('allows protected routes with empty roles', () => {
    expect(
      canAccessRoute(
        {
          path: '/profile',
          name: 'profile',
          meta: { requireAuth: true, roles: [] },
        },
        'user'
      )
    ).toBe(true)
  })

  it('returns the first accessible leaf route by role', () => {
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
      name: 'workplace',
    })
  })

  it('skips an accessible parent when its first child is denied and returns an accessible leaf', () => {
    const routes: RouteRecordRaw[] = [
      {
        path: '/settings',
        name: 'settings',
        redirect: '/settings/admin',
        meta: { requireAuth: true, roles: ['*'] },
        children: [
          {
            path: 'admin',
            name: 'settingsAdmin',
            meta: { requireAuth: true, roles: ['admin'] },
          },
          {
            path: 'profile',
            name: 'settingsProfile',
            meta: { requireAuth: true, roles: ['*'] },
          },
        ],
      },
    ]

    expect(getFirstAccessibleRoute(routes, 'user')).toEqual({
      name: 'settingsProfile',
    })
  })

  it('denies a route when a matched parent record denies the role', () => {
    const route = {
      path: '/permissions/front/button',
      name: 'button',
      meta: { requireAuth: true, roles: ['*'] },
      matched: [
        {
          path: '/permissions/front',
          name: 'front',
          meta: { requireAuth: true, roles: ['user'] },
        },
        {
          path: '/permissions/front/button',
          name: 'button',
          meta: { requireAuth: true, roles: ['*'] },
        },
      ],
    } as unknown as RouteLocationNormalized

    expect(canAccessRoute(route, 'admin')).toBe(false)
  })
})
