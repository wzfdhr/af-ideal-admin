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

  it('redacts sensitive fields before audit events leave the frontend', async () => {
    vi.mocked(createAuditEvent).mockResolvedValueOnce({
      id: 'audit-1',
      module: 'auth',
      action: 'login',
      eventType: 'security',
      result: 'failure',
      target: {
        type: 'session',
        id: 'admin',
      },
      occurredAt: '2026-06-23T10:00:00.000Z',
    })
    setAuditContextProvider({
      now: () => new Date('2026-06-23T10:00:00.000Z'),
    })

    await recordAuditEvent({
      module: 'auth',
      action: 'login',
      eventType: 'security',
      result: 'failure',
      target: {
        type: 'session',
        id: 'admin',
      },
      detail: {
        password: 'secret-password',
        request: 'password=secret-password&token=secret-token',
        authorization: 'Bearer secret-token',
        idCard: '11010519491231002X',
        nested: {
          'X-Access-Token': 'header-secret-token',
        },
      },
    })

    const payload = vi.mocked(createAuditEvent).mock.calls[0][0]

    expect(payload.detail).toEqual({
      password: '[redacted]',
      request: 'password=[redacted]&token=[redacted]',
      authorization: '[redacted]',
      idCard: '[redacted-id-card]',
      nested: {
        'X-Access-Token': '[redacted]',
      },
    })
    expect(JSON.stringify(payload)).not.toMatch(
      /secret-password|secret-token|11010519491231002X/
    )
  })

  it('does not block business flow when audit failure reporting fails', async () => {
    const reportAuditError = vi
      .fn()
      .mockRejectedValue(new Error('observability unavailable'))
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
        action: 'role.update',
        eventType: 'permission',
        result: 'success',
        target: {
          type: 'role',
          id: 'role-admin',
          name: '管理员',
        },
      })
    ).resolves.toBeUndefined()

    expect(reportAuditError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        module: 'system',
        action: 'role.update',
      })
    )
  })
})
