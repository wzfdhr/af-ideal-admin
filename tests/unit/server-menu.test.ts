import { describe, expect, it } from 'vitest'
import {
  filterAccessibleMenus,
  flattenMenuNames,
  type MenuLikeNode,
} from '@/services/access'

describe('server menu helpers', () => {
  it('flattens nested menu names and ignores invalid nodes', () => {
    const settingsSymbol = Symbol.for('settings')
    const names = flattenMenuNames([
      { name: 'dashboard' },
      {
        children: [
          { name: 'system:user' },
          { name: null },
          { children: [{ name: settingsSymbol }] },
        ],
      },
    ])

    expect(names.has('dashboard')).toBe(true)
    expect(names.has('system:user')).toBe(true)
    expect(names.has(settingsSymbol)).toBe(true)
    expect([...names]).toHaveLength(3)
  })

  it('filters server menus by role and permission code', () => {
    const menus: MenuLikeNode[] = [
      {
        name: 'dashboard',
        meta: { requireAuth: true, roles: ['*'] },
      },
      {
        name: 'system',
        meta: {
          requireAuth: true,
          access: { permissions: ['system:view'] },
        },
        children: [
          {
            name: 'system:user',
            meta: {
              requireAuth: true,
              access: { permissions: ['system:user:view'] },
            },
          },
          {
            name: 'system:role',
            meta: {
              requireAuth: true,
              access: { permissions: ['system:role:view'] },
            },
          },
        ],
      },
      {
        name: 'admin-only',
        meta: { requireAuth: true, roles: ['admin'] },
      },
    ]

    expect(
      filterAccessibleMenus(menus, {
        roles: ['operator'],
        permissions: ['system:view', 'system:user:view'],
      })
    ).toEqual([
      {
        name: 'dashboard',
        meta: { requireAuth: true, roles: ['*'] },
      },
      {
        name: 'system',
        meta: {
          requireAuth: true,
          access: { permissions: ['system:view'] },
        },
        children: [
          {
            name: 'system:user',
            meta: {
              requireAuth: true,
              access: { permissions: ['system:user:view'] },
            },
          },
        ],
      },
    ])
  })

  it('handles missing menu names without mutating the source tree', () => {
    const menus: MenuLikeNode[] = [
      {
        children: [
          {
            name: 'reports',
            meta: { requireAuth: true, roles: ['user'] },
          },
        ],
      },
    ]

    const filtered = filterAccessibleMenus(menus, {
      roles: ['user'],
      permissions: [],
    })

    expect(filtered).toEqual([
      {
        children: [
          {
            name: 'reports',
            meta: { requireAuth: true, roles: ['user'] },
          },
        ],
      },
    ])
    expect(filtered).not.toBe(menus)
    expect(filtered[0]).not.toBe(menus[0])
  })
})
