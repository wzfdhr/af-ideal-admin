import { describe, expect, it } from 'vitest'
import { getRuntimeConfig, resolveRuntimeValue } from '../../config/runtime'

describe('runtime config', () => {
  it('prefers window runtime config over build-time env values', () => {
    const runtimeGlobal = {
      AF_IDEAL_ADMIN_CONFIG: {
        API_BASE_URL: '/gateway-api',
        APP_TITLE: 'Runtime Admin',
      },
    }

    expect(
      getRuntimeConfig(runtimeGlobal, {
        VITE_API_BASE_URL: '/api',
        VITE_APP_TITLE: 'Build Admin',
      })
    ).toEqual({
      API_BASE_URL: '/gateway-api',
      APP_TITLE: 'Runtime Admin',
    })
  })

  it('falls back to Vite env values when runtime config is absent', () => {
    expect(
      getRuntimeConfig(
        {},
        {
          VITE_API_BASE_URL: '/api',
          VITE_APP_TITLE: 'AF-Ideal-Admin',
        }
      )
    ).toEqual({
      API_BASE_URL: '/api',
      APP_TITLE: 'AF-Ideal-Admin',
    })
  })

  it('ignores blank runtime values and keeps safe fallbacks', () => {
    expect(resolveRuntimeValue('', '/api')).toBe('/api')
    expect(resolveRuntimeValue('   ', 'AF-Ideal-Admin')).toBe('AF-Ideal-Admin')
    expect(resolveRuntimeValue('/prod-api', '/api')).toBe('/prod-api')
  })
})
