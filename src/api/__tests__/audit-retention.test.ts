import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  commandAuditArchiveRun,
  createAuditArchiveRun,
  downloadAuditArchiveBatch,
  fetchAuditArchiveBatches,
  fetchAuditArchiveCapabilities,
  fetchAuditArchiveEvents,
  fetchAuditArchiveRuns,
  fetchAuditRetentionPolicy,
  getAuditArchiveBatch,
  getAuditArchiveRun,
  updateAuditRetentionPolicy,
} from '@/api/audit-retention'
import type {
  AuditArchiveRunCreateV1,
  AuditArchiveRunV1,
  AuditRetentionPolicyUpdateV1,
} from '@af-admin/contracts'

const request = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))
vi.mock('@/api/request', () => ({ default: request }))

const run: AuditArchiveRunV1 = {
  version: 1,
  id: '-run/with ?#中文',
  source: 'server',
  projectionVersion: 1,
  trigger: 'manual',
  policyRevision: null,
  occurrence: null,
  executor: { id: 'owner', name: 'Owner' },
  executorVisibleFields: ['operator.id', 'operator.name'],
  executorHiddenFields: [],
  query: null,
  format: 'csv',
  status: 'queued',
  revision: 4,
  queriedAt: null,
  dataCutoffAt: null,
  candidateHash: null,
  coverage: {
    candidateTotal: null,
    coveredTotal: null,
    remainingTotal: null,
    batchTotal: null,
    completedBatchTotal: null,
  },
  attempts: 0,
  nextAttemptAt: '2026-10-13T10:00:00.000Z',
  leaseUntil: null,
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-10-13T10:00:00.000Z',
  updatedAt: '2026-10-13T10:00:00.000Z',
  completedAt: null,
  restricted: false,
  allowedActions: ['cancel'],
}

describe('audit retention api', () => {
  beforeEach(() => vi.resetAllMocks())

  it('reads policy, capabilities and finite run pages from exact endpoints', async () => {
    const policy = { version: 1, source: 'server', revision: 2 }
    const capabilities = { formats: [] }
    const page = {
      version: 1,
      source: 'server',
      projectionVersion: 1,
      list: [run],
      total: 1,
      current: 2,
      pageSize: 50,
    }
    request.get
      .mockResolvedValueOnce({ data: policy })
      .mockResolvedValueOnce({ data: capabilities })
      .mockResolvedValueOnce({ data: page })
    await expect(fetchAuditRetentionPolicy()).resolves.toBe(policy)
    await expect(fetchAuditArchiveCapabilities()).resolves.toBe(capabilities)
    await expect(
      fetchAuditArchiveRuns({ current: 2, pageSize: 50 })
    ).resolves.toBe(page)
    expect(request.get.mock.calls).toEqual([
      ['/audit/retention-policy'],
      ['/audit/export-capabilities'],
      ['/audit/archive-runs', { params: { current: 2, pageSize: 50 } }],
    ])
  })

  it('uses revision commands and idempotency without accepting an executor', async () => {
    const update: AuditRetentionPolicyUpdateV1 = {
      version: 1,
      expectedRevision: 3,
      enabled: true,
      hotDays: 90,
      timeZone: 'America/New_York',
    }
    request.put.mockResolvedValueOnce({ data: { revision: 4 } })
    await updateAuditRetentionPolicy(update, 'policy-key')
    expect(request.put).toHaveBeenCalledWith(
      '/audit/retention-policy',
      update,
      { headers: { 'Idempotency-Key': 'policy-key' } }
    )

    request.post.mockResolvedValueOnce({ data: run })
    await commandAuditArchiveRun(run, 'cancel', 'cancel-key')
    expect(request.post).toHaveBeenCalledWith(
      '/audit/archive-runs/-run%2Fwith%20%3F%23%E4%B8%AD%E6%96%87/cancel',
      { version: 1, expectedRevision: 4 },
      { headers: { 'Idempotency-Key': 'cancel-key' } }
    )
  })

  it('creates one complete candidate run and reads detail collections independently', async () => {
    const input: AuditArchiveRunCreateV1 = {
      version: 1,
      format: 'xlsx',
      query: {
        version: 1,
        current: 1,
        pageSize: 100,
        module: 'workflow',
        eventType: '',
        result: '',
        operatorName: '',
        targetId: '-opaque',
        traceId: '_trace',
        from: '',
        to: '',
        timeZone: 'America/New_York',
      },
    }
    request.post.mockResolvedValueOnce({ data: run })
    await createAuditArchiveRun(input, 'create-key')
    expect(request.post).toHaveBeenCalledWith('/audit/archive-runs', input, {
      headers: { 'Idempotency-Key': 'create-key' },
    })

    request.get.mockResolvedValue({ data: { list: [] } })
    await getAuditArchiveRun(run.id)
    await fetchAuditArchiveBatches(run.id, { current: 1, pageSize: 100 })
    await getAuditArchiveBatch(run.id, '_batch')
    await fetchAuditArchiveEvents(run.id, { current: 1, pageSize: 100 })
    const path = '/audit/archive-runs/-run%2Fwith%20%3F%23%E4%B8%AD%E6%96%87'
    expect(request.get.mock.calls).toEqual([
      [path],
      [`${path}/batches`, { params: { current: 1, pageSize: 100 } }],
      [`${path}/batches/_batch`],
      [`${path}/events`, { params: { current: 1, pageSize: 100 } }],
    ])
  })

  it('downloads authenticated batch bytes and retains integrity response headers', async () => {
    request.get.mockResolvedValueOnce({
      data: new Uint8Array([65, 66]).buffer,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="archive.csv"',
        'x-content-sha256': 'abc123',
        'content-length': '2',
      },
    })
    const result = await downloadAuditArchiveBatch(run.id, '_batch')
    expect(result.blob.size).toBe(2)
    expect(result.sha256).toBe('abc123')
    expect(result.size).toBe('2')
    expect(request.get).toHaveBeenCalledWith(
      '/audit/archive-runs/-run%2Fwith%20%3F%23%E4%B8%AD%E6%96%87/batches/_batch/download',
      { responseType: 'arraybuffer' }
    )
  })
})
