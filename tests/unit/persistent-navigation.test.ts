import { beforeEach, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import useMenuStore from '@/store/modules/menu'
import { useUserStore } from '@/store'
import { hasPermission } from '@/services/ui-permissions'
import { commitTenantContext } from '@/services/tenant-context'

const api = vi.hoisted(() => ({ state: vi.fn() }))
vi.mock('@/api/navigation', () => ({ navigationState: api.state }))
beforeEach(() => {
  setActivePinia(createPinia())
  api.state.mockReset()
  commitTenantContext('tenant-a')
})
it('refreshing persistent navigation replaces rendered data and failure clears the old tree', async () => {
  const menu = useMenuStore()
  api.state.mockResolvedValueOnce({
    menus: [{ name: 'dictSystem', meta: { text: '旧标题' } }],
    disabledButtons: [],
  })
  expect(await menu.fetchNavigationState()).toBe(true)
  expect(menu.asyncMenu[0].meta.text).toBe('旧标题')
  api.state.mockResolvedValueOnce({
    menus: [{ name: 'dictSystem', meta: { text: '新标题' } }],
    disabledButtons: [],
  })
  await menu.fetchNavigationState()
  expect(menu.asyncMenu[0].meta.text).toBe('新标题')
  api.state.mockRejectedValueOnce(new Error('transport unavailable'))
  expect(await menu.fetchNavigationState()).toBe(false)
  expect(menu.asyncMenu).toEqual([])
  expect(menu.navigationError).toBe('transport unavailable')
})
it('account or tenant reset discards an already pending tree and cannot recover old denied buttons', async () => {
  const menu = useMenuStore()
  let reply: ((value: unknown) => void) | undefined
  api.state.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        reply = resolve
      })
  )
  const pending = menu.fetchNavigationState()
  commitTenantContext('tenant-b')
  menu.clearAsyncMenu()
  reply?.({
    menus: [{ name: 'private-old-tenant' }],
    disabledButtons: [
      { parentRoute: 'dictSystem', permission: 'system:dict:create' },
    ],
  })
  expect(await pending).toBe(false)
  expect(menu.asyncMenu).toEqual([])
  expect(menu.disabledButtons).toEqual([])
})
it('per-page button visibility never rewrites grants and changes with the current page and current server resource state', () => {
  const user = useUserStore()
  const menu = useMenuStore()
  user.$patch({ permissions: ['business:create', 'system:dict:create'] })
  menu.currentRouteName = 'businessRecordsList'
  menu.disabledButtons = [
    { parentRoute: 'businessRecordsList', permission: 'business:create' },
  ]
  expect(user.permissions).toContain('business:create')
  expect(user.availablePermissions).not.toContain('business:create')
  expect(hasPermission(user.permissions, 'business:create')).toBe(false)
  menu.currentRouteName = 'dictSystem'
  expect(hasPermission(user.permissions, 'business:create')).toBe(true)
  menu.currentRouteName = 'businessRecordsList'
  menu.disabledButtons = []
  expect(hasPermission(user.permissions, 'business:create')).toBe(true)
})
