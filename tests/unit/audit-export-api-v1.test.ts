import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  archiveAuditExport,
  commandAuditExport,
  createAuditExport,
  downloadAuditExport,
  fetchAuditExportCapabilities,
  fetchAuditExports,
  getAuditExport,
} from '@/api/audit-exports'
import type {
  AuditExportCreateV1,
  AuditExportJobV1,
  AuditQueryV1,
} from '@af-admin/contracts'

const request = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api/request', () => ({ default: request }))

const query: AuditQueryV1 = {
  version: 1,
  current: 1,
  pageSize: 100,
  module: 'workflow',
  eventType: 'operation',
  result: 'success',
  operatorName: 'literal%_',
  targetId: 'record:one',
  traceId: '',
  from: '',
  to: '2026-10-13',
  timeZone: 'America/New_York',
}
const job: AuditExportJobV1 = {
  version: 1,
  id: 'job/with ?#中文',
  source: 'server',
  producerVersion: 1,
  projectionVersion: 1,
  format: 'csv',
  query,
  status: 'completed',
  stage: 'completed',
  revision: 4,
  createdAt: '2026-10-13T10:00:00.000Z',
  updatedAt: '2026-10-13T10:01:00.000Z',
  queriedAt: '2026-10-13T10:00:01.000Z',
  dataCutoffAt: '2026-10-13T10:00:01.000Z',
  totalRows: 24,
  processedRows: 24,
  attempts: 1,
  nextAttemptAt: '2026-10-13T10:00:00.000Z',
  leaseUntil: null,
  errorCode: null,
  errorMessage: null,
  archivedAt: null,
  retentionUntil: '2026-10-20T10:00:00.000Z',
  expiredAt: null,
  restricted: false,
  allowedActions: ['archive', 'download'],
  operator: { id: 'owner', name: 'Owner' },
  visibleFields: ['operator.id', 'operator.name'],
  hiddenFields: [],
  artifact: null,
}

describe('audit export v1 api', () => {
  beforeEach(() => vi.resetAllMocks())

  it('reads the exact capability and finite server page endpoints', async () => {
    const capabilities = {
      formats: [{ format: 'csv', available: true, reason: null }],
    }
    request.get.mockResolvedValueOnce({ data: capabilities })
    await expect(fetchAuditExportCapabilities()).resolves.toBe(capabilities)
    expect(request.get).toHaveBeenCalledWith('/audit/export-capabilities')
    const params = {
      current: 2,
      pageSize: 50,
      status: 'completed' as const,
      archived: 'active' as const,
    }
    const page = {
      version: 1,
      source: 'server',
      projectionVersion: 1,
      list: [job],
      total: 51,
      current: 2,
      pageSize: 50,
    }
    request.get.mockResolvedValueOnce({ data: page })
    await expect(fetchAuditExports(params)).resolves.toBe(page)
    expect(request.get).toHaveBeenLastCalledWith('/audit/exports', { params })
  })

  it('encodes IDs and sends explicit v1 revision commands with idempotency', async () => {
    const path = '/audit/exports/job%2Fwith%20%3F%23%E4%B8%AD%E6%96%87'
    request.get.mockResolvedValueOnce({ data: job })
    await expect(getAuditExport(job.id)).resolves.toBe(job)
    expect(request.get).toHaveBeenCalledWith(path)
    request.post.mockResolvedValue({ data: job })
    await commandAuditExport(job, 'cancel', 'cancel-key')
    expect(request.post).toHaveBeenNthCalledWith(
      1,
      `${path}/cancel`,
      { version: 1, expectedRevision: 4 },
      { headers: { 'Idempotency-Key': 'cancel-key' } }
    )
    await archiveAuditExport(job, true, 'archive-key')
    expect(request.post).toHaveBeenNthCalledWith(
      2,
      `${path}/archive`,
      { version: 1, expectedRevision: 4, archived: true },
      { headers: { 'Idempotency-Key': 'archive-key' } }
    )
  })

  it('creates from the closed complete-match query and registered format', async () => {
    const input: AuditExportCreateV1 = { version: 1, query, format: 'xlsx' }
    request.post.mockResolvedValueOnce({ data: job })
    await expect(createAuditExport(input, 'create-key')).resolves.toBe(job)
    expect(request.post).toHaveBeenCalledWith('/audit/exports', input, {
      headers: { 'Idempotency-Key': 'create-key' },
    })
  })

  it('downloads authenticated bytes from /download with server MIME and disposition', async () => {
    request.get.mockResolvedValueOnce({
      data: new Uint8Array([65, 66]).buffer,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="audit.csv"',
      },
    })
    const result = await downloadAuditExport(job.id)
    expect(result.blob.size).toBe(2)
    expect(result.mimeType).toBe('text/csv; charset=utf-8')
    expect(result.contentDisposition).toContain('attachment')
    expect(request.get).toHaveBeenCalledWith(
      '/audit/exports/job%2Fwith%20%3F%23%E4%B8%AD%E6%96%87/download',
      { responseType: 'arraybuffer' }
    )
  })
})
