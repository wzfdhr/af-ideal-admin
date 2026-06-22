import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordAuditEvent, setAuditContextProvider } from '@/services/audit'
import { createAuditEvent } from '@/api/audit'
import { setActiveObservability } from '@/services/observability'

vi.mock('@/api/audit', () => ({
  createAuditEvent: vi.fn(),
}))

describe('audit service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuditContextProvider(undefined)
    setActiveObservability({
      reportVueError: vi.fn(),
      reportRouterError: vi.fn(),
      reportRequestError: vi.fn(),
      reportWhiteScreen: vi.fn(),
      reportAuditError: vi.fn(),
      startWhiteScreenDetection: vi.fn(() => vi.fn()),
    })
  })

  it('enriches audit events with operator and timestamp', async () => {
    vi.mocked(createAuditEvent).mockResolvedValueOnce({
      id: 'audit-1',
      module: 'auth',
      action: 'login',
      eventType: 'security',
      result: 'success',
      operator: {
        name: 'Admin',
        role: 'admin',
      },
      target: {
        type: 'session',
        id: 'admin',
      },
      occurredAt: '2026-06-23T10:00:00.000Z',
    })
    setAuditContextProvider({
      getOperator: () => ({
        name: 'Admin',
        role: 'admin',
      }),
      now: () => new Date('2026-06-23T10:00:00.000Z'),
    })

    await recordAuditEvent({
      module: 'auth',
      action: 'login',
      eventType: 'security',
      result: 'success',
      target: {
        type: 'session',
        id: 'admin',
      },
    })

    expect(createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'auth',
        action: 'login',
        eventType: 'security',
        result: 'success',
        operator: {
          name: 'Admin',
          role: 'admin',
        },
        target: {
          type: 'session',
          id: 'admin',
        },
        occurredAt: '2026-06-23T10:00:00.000Z',
      })
    )
  })

  it('does not block business flow when audit reporting fails', async () => {
    const reportAuditError = vi.fn()
    setActiveObservability({
      reportVueError: vi.fn(),
      reportRouterError: vi.fn(),
      reportRequestError: vi.fn(),
      reportWhiteScreen: vi.fn(),
      reportAuditError,
      startWhiteScreenDetection: vi.fn(() => vi.fn()),
    })
    vi.mocked(createAuditEvent).mockRejectedValueOnce(
      new Error('audit service unavailable')
    )

    await expect(
      recordAuditEvent({
        module: 'system',
        action: 'menu.update',
        eventType: 'operation',
        result: 'success',
        target: {
          type: 'menu',
          id: 'menu-1',
          name: '系统管理',
        },
      })
    ).resolves.toBeUndefined()

    expect(reportAuditError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        module: 'system',
        action: 'menu.update',
        target: {
          type: 'menu',
          id: 'menu-1',
          name: '系统管理',
        },
      })
    )
  })
})
