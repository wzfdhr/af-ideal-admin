import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAuditEvent,
  type AuditEventPayload,
  type AuditEventRecord,
} from '@/api/audit'

const requestMock = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('audit api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates audit events with operator, object and result context', async () => {
    const payload: AuditEventPayload = {
      module: 'auth',
      action: 'login',
      eventType: 'security',
      result: 'success',
      operator: {
        id: 'u-001',
        name: 'Admin',
        role: 'admin',
      },
      target: {
        type: 'session',
        id: 'admin',
        name: 'admin',
      },
      occurredAt: '2026-06-23T10:00:00.000Z',
      traceId: 'trace-login',
      detail: {
        ip: '127.0.0.1',
      },
    }
    const record: AuditEventRecord = {
      id: 'audit-1',
      ...payload,
    }
    requestMock.post.mockResolvedValueOnce({ data: record })

    await expect(createAuditEvent(payload)).resolves.toEqual(record)

    expect(requestMock.post).toHaveBeenCalledWith('/audit/events', payload)
  })
})
