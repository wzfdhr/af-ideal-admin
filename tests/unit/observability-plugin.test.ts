import { afterEach, describe, expect, it, vi } from 'vitest'
import { installObservability } from '@/plugins/observability'

describe('observability plugin', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

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

  it('renders a visible runtime notice for Vue and router crashes', async () => {
    const reporter = vi.fn()
    const onError = vi.fn()
    const app = {
      config: {},
    } as any
    const router = {
      currentRoute: {
        value: {
          name: 'dashboard',
          path: '/dashboard',
          fullPath: '/dashboard?token=route-secret',
        },
      },
      onError,
    }

    installObservability(app, {
      router,
      reporter,
      getVersion: () => '0.0.1-test',
      whiteScreen: {
        enabled: false,
      },
    })

    await app.config.errorHandler(
      new Error('Render failed token=secret-token'),
      null,
      'render'
    )

    let notice = document.querySelector('[data-testid="global-error-notice"]')
    expect(notice?.textContent).toContain('页面运行异常')
    expect(notice?.textContent).not.toContain('secret-token')

    const routerErrorHandler = onError.mock.calls[0][0]
    await routerErrorHandler(new Error('Route failed'), {
      name: 'settings',
      path: '/settings',
      fullPath: '/settings',
    })

    notice = document.querySelector('[data-testid="global-error-notice"]')
    expect(notice?.textContent).toContain('页面加载异常')
    expect(
      document.querySelectorAll('[data-testid="global-error-notice"]')
    ).toHaveLength(1)
  })

  it('renders a visible startup notice when white-screen detection fires', () => {
    const reporter = vi.fn()
    const onError = vi.fn()
    const scheduledCallbacks: Array<() => void> = []
    const app = {
      config: {},
    } as any
    const router = {
      currentRoute: {
        value: {
          name: 'dashboard',
          path: '/dashboard',
          fullPath: '/dashboard',
        },
      },
      onError,
    }

    installObservability(app, {
      router,
      reporter,
      getVersion: () => '0.0.1-test',
      whiteScreen: {
        enabled: true,
        delay: 10,
        rootSelector: '#blank-root',
        document: {
          querySelector: vi.fn(() => ({
            childElementCount: 0,
            textContent: '',
            innerHTML: '',
          })),
        },
        setTimeout: (callback) => {
          scheduledCallbacks.push(callback)
          return 100
        },
        clearTimeout: vi.fn(),
      },
    })

    scheduledCallbacks[0]()

    expect(
      document.querySelector('[data-testid="global-error-notice"]')?.textContent
    ).toContain('应用启动异常')
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'white-screen',
        severity: 'fatal',
      })
    )
  })
})
