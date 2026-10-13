import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAuditEvent,
  fetchAuditCatalogue,
  fetchAuditEventPage,
  type AuditEventPayload,
} from '@/api/audit'
import type {
  AuditCatalogueV1,
  AuditEventPageV1,
  AuditEventPageV2,
  AuditQueryV1,
  AuditQueryV2,
} from '@af-admin/contracts'

const requestMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api/request', () => ({ default: requestMock }))

const query: AuditQueryV1 = {
  version: 1,
  current: 3,
  pageSize: 50,
  module: 'workflow',
  eventType: 'operation',
  result: 'failure',
  operatorName: '操作人%_字面值',
  targetId: 'record:exact-1',
  traceId: 'trace:exact-1',
  from: '',
  to: '2026-10-13',
  timeZone: 'America/New_York',
}
const page: AuditEventPageV1 = {
  version: 1,
  source: 'server',
  projectionVersion: 1,
  query,
  queriedAt: '2026-10-13T10:00:00.000Z',
  list: [],
  total: 104,
  current: 3,
  pageSize: 50,
}
const queryV2: AuditQueryV2 = {
  ...query,
  version: 2,
  archiveState: 'archived',
}
const pageV2: AuditEventPageV2 = {
  ...page,
  version: 2,
  query: queryV2,
}
const catalogue: AuditCatalogueV1 = {
  version: 1,
  source: 'server',
  projectionVersion: 1,
  modules: [{ code: 'workflow', label: '审批流程' }],
  actions: [
    { module: 'workflow', action: 'workflow.approve', eventType: 'operation' },
  ],
  eventTypes: ['operation', 'security', 'permission', 'export'],
  results: ['success', 'failure'],
}

describe('audit v1 api', () => {
  beforeEach(() => vi.resetAllMocks())

  it('passes the closed query without collapsing single-sided dates or literal percent text', async () => {
    requestMock.get.mockResolvedValueOnce({ data: page })
    await expect(fetchAuditEventPage(query)).resolves.toBe(page)
    expect(requestMock.get).toHaveBeenCalledWith('/audit/events', {
      params: query,
    })
  })

  it('passes an explicit archive state as the closed v2 query without changing v1 callers', async () => {
    requestMock.get.mockResolvedValueOnce({ data: pageV2 })
    await expect(fetchAuditEventPage(queryV2)).resolves.toBe(pageV2)
    expect(requestMock.get).toHaveBeenCalledWith('/audit/events', {
      params: queryV2,
    })
    expect(query.version).toBe(1)
    expect(query).not.toHaveProperty('archiveState')
  })

  it('loads only current-scope classification metadata from the catalogue endpoint', async () => {
    requestMock.get.mockResolvedValueOnce({ data: catalogue })
    await expect(fetchAuditCatalogue()).resolves.toBe(catalogue)
    expect(requestMock.get).toHaveBeenCalledExactlyOnceWith('/audit/catalogue')
  })

  it('keeps the legacy POST telemetry payload API distinct from the server projection DTO', async () => {
    const payload: AuditEventPayload = {
      module: 'client',
      action: 'client.menu.open',
      eventType: 'operation',
      result: 'success',
      target: { type: 'menu', id: 'audit' },
      occurredAt: '2026-10-13T10:00:00.000Z',
    }
    const telemetry = { id: 'telemetry-1', ...payload }
    requestMock.post.mockResolvedValueOnce({ data: telemetry })
    await expect(createAuditEvent(payload)).resolves.toEqual(telemetry)
    expect(requestMock.post).toHaveBeenCalledWith('/audit/events', payload)
    expect(telemetry).not.toHaveProperty('source', 'server')
  })
})
