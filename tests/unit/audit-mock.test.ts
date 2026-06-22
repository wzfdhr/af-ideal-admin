import { describe, expect, it } from 'vitest'
import { createAuditMockStore } from '@/mock/modules/audit'

describe('audit mock store', () => {
  it('records audit events and redacts sensitive detail fields', () => {
    const store = createAuditMockStore({
      seed: false,
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

  it('seeds login, operation, permission and export logs', () => {
    const store = createAuditMockStore()
    const result = store.queryEvents({ current: 1, pageSize: 50 })

    expect(result.list.map((item) => item.eventType)).toEqual(
      expect.arrayContaining(['security', 'operation', 'permission', 'export'])
    )
    expect(result.list.map((item) => item.action)).toEqual(
      expect.arrayContaining([
        'auth.login',
        'system.role.update',
        'workflow.publish',
        'form.publish',
        'data-screen.publish',
        'report.export',
      ])
    )
  })

  it('filters audit logs by user, module, time and result without leaking secrets', () => {
    const store = createAuditMockStore()
    const result = store.queryEvents({
      current: 1,
      pageSize: 20,
      operatorName: '系统管理员',
      module: 'system',
      result: 'success',
      dateRange: ['2026-06-01', '2026-06-23'],
    })

    expect(result.total).toBeGreaterThan(0)
    result.list.forEach((item) => {
      expect(item.operator?.name).toContain('系统管理员')
      expect(item.module).toBe('system')
      expect(item.result).toBe('success')
      expect(item.occurredAt >= '2026-06-01').toBe(true)
      expect(item.occurredAt <= '2026-06-23T23:59:59.999Z').toBe(true)
      expect(JSON.stringify(item)).not.toMatch(/secret-token|password=/)
    })
  })
})
