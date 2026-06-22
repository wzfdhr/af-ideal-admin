import { describe, expect, it } from 'vitest'
import {
  clearAuth,
  clearToken,
  getToken,
  isAuthed,
  setToken,
} from '@/utils/auth'

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
    localStorage.setItem('userRole', 'admin')

    clearAuth()

    expect(getToken()).toBeNull()
    expect(localStorage.getItem('userRole')).toBeNull()
  })
})
