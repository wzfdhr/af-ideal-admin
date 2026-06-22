import { describe, expect, it, vi } from 'vitest'
import { installObservability } from '@/plugins/observability'

describe('observability plugin', () => {
  it('connects Vue errorHandler and router errors to the active monitor', async () => {
    const reporter = vi.fn()
    const onError = vi.fn()
    const app = {
      config: {},
    } as any
    const router = {
      currentRoute: {
        value: {
          name: 'home',
          path: '/home',
          fullPath: '/home',
        },
      },
      onError,
    }

    installObservability(app, {
      router,
      reporter,
      getVersion: () => '0.0.1-test',
      getUser: () => ({
        id: 'u-001',
        name: 'Admin',
        role: 'admin',
      }),
      whiteScreen: {
        enabled: false,
      },
    })

    expect(app.config.errorHandler).toEqual(expect.any(Function))
    expect(onError).toHaveBeenCalledWith(expect.any(Function))

    await app.config.errorHandler(
      new Error('Vue crash'),
      {
        $: {
          type: {
            name: 'DashboardPanel',
          },
        },
      },
      'render'
    )

    const routerErrorHandler = onError.mock.calls[0][0]
    await routerErrorHandler(new Error('Route crash'), {
      name: 'next',
      path: '/next',
      fullPath: '/next',
    })

    expect(reporter).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        source: 'vue',
        message: 'Vue crash',
        metadata: expect.objectContaining({
          componentName: 'DashboardPanel',
          info: 'render',
        }),
      })
    )
    expect(reporter).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: 'router',
        message: 'Route crash',
        route: {
          name: 'next',
          path: '/next',
          fullPath: '/next',
        },
      })
    )
  })
})
