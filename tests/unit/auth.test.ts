import { describe, expect, it } from 'vitest'
import {
  clearAuth,
  clearCurrentUser,
  clearToken,
  getRole,
  getToken,
  isAuthed,
  setRole,
  setToken,
} from '@/services/auth'

describe('auth storage', () => {
  it('stores and clears token', () => {
    expect(isAuthed()).toBe(false)

    setToken('token-123')

    expect(getToken()).toBe('token-123')
    expect(isAuthed()).toBe(true)

    clearToken()

    expect(getToken()).toBeNull()
    expect(isAuthed()).toBe(false)
  })

  it('clears token and role together', () => {
    setToken('token-123')
    setRole('admin')

    clearAuth()

    expect(getToken()).toBeNull()
    expect(getRole()).toBeNull()
  })

  it('stores and clears current user role', () => {
    setRole('operator')

    expect(getRole()).toBe('operator')

    clearCurrentUser()

    expect(getRole()).toBeNull()
  })
})
