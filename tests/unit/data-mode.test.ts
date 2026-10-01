import { describe, expect, it } from 'vitest'
import { resolveDataMode } from '../../config/data-mode'

describe('data mode boundary', () => {
  it('uses reference API for production even when a mock flag is supplied', () => {
    expect(resolveDataMode(false, 'mock')).toBe('reference')
  })
  it('allows explicit developer selection and rejects mistyped flags', () => {
    expect(resolveDataMode(true)).toBe('mock')
    expect(resolveDataMode(true, 'reference')).toBe('reference')
    expect(() => resolveDataMode(true, 'refernece')).toThrow()
  })
})
