import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { login, logout } from '@/api/user'
import useUserStore from '@/store/modules/user'
import useMenuStore from '@/store/modules/menu'
import {
  clearAuth,
  getRole,
  getToken,
  setRole,
  setToken,
} from '@/services/auth'
import { removeListener } from '@/utils/route-listener'

vi.mock('@/api/user', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getUserInfo: vi.fn(),
  getMenu: vi.fn(),
}))

vi.mock('@/utils/route-listener', () => ({
  removeListener: vi.fn(),
}))

describe('user store auth lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearAuth()
    vi.clearAllMocks()
  })

  it('stores token through auth service after login succeeds', async () => {
    vi.mocked(login).mockResolvedValue({
      data: {
        token: 'token-123',
      },
    })

    const userStore = useUserStore()

    await userStore.login({
      username: 'admin',
      password: 'admin',
    })

    expect(getToken()).toBe('token-123')
  })

  it('clears token when login fails', async () => {
    setToken('stale-token')
    vi.mocked(login).mockRejectedValue(new Error('login failed'))

    const userStore = useUserStore()

    await expect(
      userStore.login({
        username: 'admin',
        password: 'wrong',
      })
    ).rejects.toThrow('login failed')

    expect(getToken()).toBeNull()
  })

  it('clears auth, user info, async menu, and route listener on logout', async () => {
    setToken('token-123')
    setRole('admin')
    vi.mocked(logout).mockResolvedValue({
      data: {},
    })

    const userStore = useUserStore()
    const menuStore = useMenuStore()
    userStore.setInfo({
      name: 'Admin',
      role: 'admin',
    })
    menuStore.$patch({
      asyncMenu: [{ name: 'dashboard' }] as never,
    })

    await userStore.logout()

    expect(getToken()).toBeNull()
    expect(getRole()).toBeNull()
    expect(userStore.role).toBe('')
    expect(userStore.name).toBeUndefined()
    expect(menuStore.asyncMenu).toEqual([])
    expect(removeListener).toHaveBeenCalled()
  })
})
