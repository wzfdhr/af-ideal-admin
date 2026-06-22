import { describe, expect, it } from 'vitest'
import { createAuditMockStore } from '@/mock/modules/audit'

describe('audit mock store', () => {
  it('records audit events and redacts sensitive detail fields', () => {
    const store = createAuditMockStore({
      now: () => '2026-06-23T10:00:00.000Z',
      id: () => 'audit-1',
    })

    const record = store.createEvent({
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
      detail: {
        token: 'secret-token',
        password: 'secret-password',
        username: 'admin',
      },
    })

    expect(record).toEqual(
      expect.objectContaining({
        id: 'audit-1',
        module: 'auth',
        action: 'login',
        result: 'success',
        detail: {
          token: '[redacted]',
          password: '[redacted]',
          username: 'admin',
        },
      })
    )
    expect(store.listEvents()).toHaveLength(1)
    expect(JSON.stringify(record)).not.toContain('secret-token')
    expect(JSON.stringify(record)).not.toContain('secret-password')
  })
})
