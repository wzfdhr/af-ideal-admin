import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditLogPage from '@/views/audit/log-list/index.vue'
import type { AuditEventRecord } from '@/api/audit'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  fetchAuditEvents: vi.fn(),
}))

vi.mock('@/api/audit', () => ({
  fetchAuditEvents: apiMocks.fetchAuditEvents,
}))

const records: AuditEventRecord[] = [
  {
    id: 'audit-login',
    module: 'auth',
    action: 'auth.login',
    eventType: 'security',
    result: 'success',
    operator: {
      name: '系统管理员',
      role: 'admin',
    },
    target: {
      type: 'session',
      id: 'admin',
      name: 'admin',
    },
    occurredAt: '2026-06-22T10:00:00.000Z',
    detail: {
      ip: '127.0.0.1',
      password: 'secret-password',
      authorization: 'Bearer secret-token',
    },
  },
  {
    id: 'audit-role',
    module: 'system',
    action: 'system.role.update',
    eventType: 'permission',
    result: 'success',
    operator: {
      name: '系统管理员',
      role: 'admin',
    },
    target: {
      type: 'role',
      id: 'role-2',
      name: '运营人员',
    },
    occurredAt: '2026-06-22T11:00:00.000Z',
    detail: {
      token: '[redacted]',
    },
  },
  {
    id: 'audit-export',
    module: 'report',
    action: 'report.export',
    eventType: 'export',
    result: 'failure',
    operator: {
      name: '运营人员',
      role: 'operator',
    },
    target: {
      type: 'report',
      id: 'order-detail',
      name: '订单明细报表',
    },
    occurredAt: '2026-06-22T12:00:00.000Z',
    detail: {
      reason: '导出超时',
    },
  },
]

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchAuditEvents.mockResolvedValue({
      list: records,
      total: records.length,
    })
  })

  it('loads Mock audit logs and renders event categories without sensitive data', async () => {
    const wrapper = mount(AuditLogPage)
    await flushPromises()

    expect(apiMocks.fetchAuditEvents).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      operatorName: '',
      module: '',
      result: '',
      eventType: '',
      dateRange: [],
    })
    expect(wrapper.find('[data-testid="audit-log-page"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('auth.login')
    expect(wrapper.text()).toContain('system.role.update')
    expect(wrapper.text()).toContain('report.export')
    expect(wrapper.text()).toContain('security')
    expect(wrapper.text()).toContain('permission')
    expect(wrapper.text()).toContain('export')
    expect(wrapper.text()).not.toContain('secret-token')
    expect(wrapper.text()).not.toContain('secret-password')
    expect(wrapper.text()).toContain('[redacted]')
  })

  it('queries logs with operator, module, time, event type and result filters', async () => {
    const wrapper = mount(AuditLogPage)
    await flushPromises()

    await wrapper.find('[data-testid="audit-operator"]').setValue('系统管理员')
    await wrapper.find('[data-testid="audit-module"]').setValue('system')
    await wrapper.find('[data-testid="audit-result"]').setValue('success')
    await wrapper
      .find('[data-testid="audit-event-type"]')
      .setValue('permission')
    await wrapper
      .find('[data-testid="audit-date-start"]')
      .setValue('2026-06-01')
    await wrapper.find('[data-testid="audit-date-end"]').setValue('2026-06-23')
    await wrapper.find('[data-testid="audit-query"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchAuditEvents).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      operatorName: '系统管理员',
      module: 'system',
      result: 'success',
      eventType: 'permission',
      dateRange: ['2026-06-01', '2026-06-23'],
    })
  })
})
