import { describe, expect, it, vi } from 'vitest'
import {
  createObservability,
  setActiveObservability,
  getActiveObservability,
} from '@/services/observability'

const createMonitor = (reporter = vi.fn()) =>
  createObservability({
    reporter,
    getRoute: () => ({
      name: 'dashboard',
      path: '/dashboard',
      fullPath: '/dashboard?token=route-secret',
    }),
    getUser: () => ({
      id: 'u-001',
      name: 'Admin',
      role: 'admin',
    }),
    getVersion: () => '0.0.1-test',
    now: () => new Date('2026-06-23T10:00:00.000Z'),
  })

describe('observability service', () => {
  it('reports Vue runtime errors with route user version and sanitized metadata', async () => {
    const reporter = vi.fn()
    const monitor = createMonitor(reporter)

    await monitor.reportVueError(
      new Error('render failed token=plain-secret 11010519491231002X'),
      {
        'componentName': 'RiskPanel',
        'password': 'secret-password',
        'authorization': 'Bearer secret-token',
        'X-Access-Token': 'header-secret-token',
      }
    )

    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'vue',
        severity: 'error',
        message: 'render failed token=[redacted] [redacted-id-card]',
        route: {
          name: 'dashboard',
          path: '/dashboard',
          fullPath: '/dashboard?token=[redacted]',
        },
        user: {
          id: 'u-001',
          name: 'Admin',
          role: 'admin',
        },
        version: '0.0.1-test',
        timestamp: '2026-06-23T10:00:00.000Z',
        metadata: expect.objectContaining({
          'componentName': 'RiskPanel',
          'password': '[redacted]',
          'authorization': '[redacted]',
          'X-Access-Token': '[redacted]',
        }),
      })
    )

    expect(JSON.stringify(reporter.mock.calls[0][0])).not.toContain(
      'secret-password'
    )
    expect(JSON.stringify(reporter.mock.calls[0][0])).not.toContain(
      'secret-token'
    )
    expect(JSON.stringify(reporter.mock.calls[0][0])).not.toContain(
      'header-secret-token'
    )
    expect(JSON.stringify(reporter.mock.calls[0][0])).not.toContain(
      '11010519491231002X'
    )
  })

  it('reports request errors with trace id and request context', async () => {
    const reporter = vi.fn()
    const monitor = createMonitor(reporter)

    await monitor.reportRequestError({
      kind: 'server',
      code: 500,
      httpStatus: 500,
      message: '服务异常',
      displayMessage: '服务异常 (traceId: trace-500)',
      traceId: 'trace-500',
    })

    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'request',
        severity: 'error',
        message: '服务异常',
        traceId: 'trace-500',
        metadata: expect.objectContaining({
          kind: 'server',
          code: 500,
          httpStatus: 500,
          displayMessage: '服务异常 (traceId: trace-500)',
        }),
      })
    )
  })

  it('can register the active monitor used by app integrations', () => {
    const monitor = createMonitor()

    setActiveObservability(monitor)

    expect(getActiveObservability()).toBe(monitor)
  })

  it('dispatches browser events when no custom reporter is provided', async () => {
    const listener = vi.fn()
    window.addEventListener('af:observability-error', listener)
    const monitor = createObservability({
      getVersion: () => '0.0.1-test',
      now: () => new Date('2026-06-23T10:00:00.000Z'),
    })

    await monitor.reportWhiteScreen('blank screen')

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          source: 'white-screen',
          message: 'blank screen',
          version: '0.0.1-test',
        }),
      })
    )
    window.removeEventListener('af:observability-error', listener)
  })

  it('schedules white screen detection and reports an empty app root', async () => {
    const reporter = vi.fn()
    const scheduledCallbacks: Array<() => void> = []
    const clearTimeout = vi.fn()
    const documentRef = {
      querySelector: vi.fn(() => ({
        childElementCount: 0,
        textContent: '',
        innerHTML: '',
      })),
    }
    const monitor = createObservability({
      reporter,
      getVersion: () => '0.0.1-test',
      now: () => new Date('2026-06-23T10:00:00.000Z'),
      whiteScreen: {
        enabled: true,
        delay: 10,
        rootSelector: '#app',
        document: documentRef,
        setTimeout: (callback) => {
          scheduledCallbacks.push(callback)
          return 100
        },
        clearTimeout,
      },
    })

    const stop = monitor.startWhiteScreenDetection()
    scheduledCallbacks[0]()
    stop()

    expect(documentRef.querySelector).toHaveBeenCalledWith('#app')
    expect(clearTimeout).toHaveBeenCalledWith(100)
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'white-screen',
        severity: 'fatal',
        message: 'App root #app has no visible content',
      })
    )
  })
})
