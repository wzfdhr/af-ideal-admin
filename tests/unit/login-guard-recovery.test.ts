import { beforeEach, describe, expect, it, vi } from 'vitest'
import setupLoginGuard from '@/router/guards/login-guard'
import type { Router } from 'vue-router'

const state = vi.hoisted(() => ({
  authed: true,
  user: { role: '', info: vi.fn(), resetInfo: vi.fn() },
  clearAuth: vi.fn(),
  reset: vi.fn(),
  retain: vi.fn(),
  clearMenu: vi.fn(),
}))
vi.mock('@/store', () => ({
  useUserStore: () => state.user,
  useMenuStore: () => ({ clearAsyncMenu: state.clearMenu }),
}))
vi.mock('@/services/auth', () => ({
  isAuthed: () => state.authed,
  clearAuth: () => {
    state.authed = false
    state.clearAuth()
  },
}))
vi.mock('@/services/tenant-context', () => ({
  resetTenantContext: state.reset,
}))
vi.mock('@/services/leave-draft-recovery', () => ({
  retainLeaveDrafts: state.retain,
}))
vi.mock('nprogress', () => ({ default: { start: vi.fn() } }))
describe('revoked bootstrap authentication recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.authed = true
    state.user.role = ''
    state.user.info.mockRejectedValue(new Error('成员已不可访问'))
  })
  const guard = () => {
    let run: (
      to: { name: string; query: object },
      from: object,
      next: ReturnType<typeof vi.fn>
    ) => Promise<void>
    setupLoginGuard({
      beforeEach: (value: typeof run) => {
        run = value
      },
    } as unknown as Router)
    return (...args: Parameters<typeof run>) => run(...args)
  }
  it('clears stale credentials before routing to login and does not query them repeatedly', async () => {
    const run = guard()
    const next = vi.fn()
    await run({ name: 'workplace', query: {} }, {}, next)
    expect(state.retain).toHaveBeenCalledOnce()
    expect(state.clearAuth).toHaveBeenCalledOnce()
    expect(state.reset).toHaveBeenCalledOnce()
    expect(state.user.resetInfo).toHaveBeenCalledOnce()
    expect(state.clearMenu).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith({
      name: 'login',
      query: { redirect: 'workplace' },
    })
    await run({ name: 'login', query: {} }, {}, next)
    expect(state.user.info).toHaveBeenCalledOnce()
    expect(next).toHaveBeenLastCalledWith()
  })
  it('permits the login form after an inaccessible identity rather than redirecting to itself', async () => {
    const next = vi.fn()
    await guard()({ name: 'login', query: {} }, {}, next)
    expect(next).toHaveBeenCalledWith()
    expect(state.authed).toBe(false)
  })
  it('refreshes permissions before protected navigation even when the display role was already loaded', async () => {
    state.user.role = 'user'
    state.user.info.mockResolvedValueOnce(undefined)
    const next = vi.fn()
    await guard()({ name: 'userSystem', query: {} }, {}, next)
    expect(state.user.info).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith()
  })
})
