import { beforeEach, describe, expect, it } from 'vitest'
import { clearAuth, setRole, setUserId, getUserId } from '@/services/auth'
import { findCurrentMockUser } from '@/mock/modules/auth'

describe('Mock identity isolation', () => {
  beforeEach(clearAuth)

  it('keeps legacy role fallback and distinguishes two managers with one role', () => {
    setRole('admin')
    expect(findCurrentMockUser().id).toBe('1')
    setRole('operator')
    setUserId('a-manager-1')
    expect(findCurrentMockUser().id).toBe('a-manager-1')
    setUserId('a-manager-2')
    expect(findCurrentMockUser().id).toBe('a-manager-2')
  })

  it('clears current identity with logout', () => {
    setUserId('a-manager-1')
    clearAuth()
    expect(getUserId()).toBeNull()
    expect(findCurrentMockUser().id).toBe('1')
  })
})
