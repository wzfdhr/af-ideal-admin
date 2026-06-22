import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAuditEvent,
  fetchAuditEvents,
  type AuditEventPayload,
  type AuditEventRecord,
} from '@/api/audit'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
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

  it('fetches audit logs with user, module, result and time filters', async () => {
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await expect(
      fetchAuditEvents({
        current: 1,
        pageSize: 20,
        operatorName: '系统管理员',
        module: 'system',
        result: 'success',
        eventType: 'permission',
        dateRange: ['2026-06-01', '2026-06-23'],
      })
    ).resolves.toEqual({
      list: [],
      total: 0,
    })

    expect(requestMock.get).toHaveBeenCalledWith('/audit/events', {
      params: {
        current: 1,
        pageSize: 20,
        operatorName: '系统管理员',
        module: 'system',
        result: 'success',
        eventType: 'permission',
        dateRange: ['2026-06-01', '2026-06-23'],
      },
    })
  })
})
