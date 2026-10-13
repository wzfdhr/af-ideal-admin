import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  archiveReportExport,
  commandReportExport,
  createReportExport,
  downloadReportExport,
  fetchReportExportCapabilities,
  fetchReportExports,
  getReportExport,
} from '@/api/reporting-exports'
import type { ReportingExportJob } from '@af-admin/contracts'

const request = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api/request', () => ({ default: request }))
const id = 'job/中文 ?#'
const job = { id, revision: 9 } as ReportingExportJob
const key = 'stable-command'
const headers = { headers: { 'Idempotency-Key': key } }
beforeEach(() => vi.resetAllMocks())
describe('real export API boundaries', () => {
  it('uses server capabilities, declared total and explicit filters', async () => {
    const capabilities = {
      formats: [{ format: 'pdf', available: false, reason: '字体不可用' }],
    }
    request.get.mockResolvedValueOnce({ data: capabilities })
    expect(await fetchReportExportCapabilities()).toBe(capabilities)
    expect(request.get).toHaveBeenLastCalledWith(
      '/reporting/exports/capabilities'
    )
    const params = {
      current: 3,
      pageSize: 20,
      keyword: '真实',
      status: 'failed' as const,
      archived: 'all' as const,
    }
    const page = { list: [job], total: 42, current: 3, pageSize: 20 }
    request.get.mockResolvedValueOnce({ data: page })
    expect(await fetchReportExports(params)).toBe(page)
    expect(request.get).toHaveBeenLastCalledWith('/reporting/exports', {
      params,
    })
  })
  it('encodes IDs as one path segment and receives current server events', async () => {
    request.get.mockResolvedValueOnce({ data: job })
    expect(await getReportExport(id)).toBe(job)
    expect(request.get).toHaveBeenLastCalledWith(
      `/reporting/exports/${encodeURIComponent(id)}`
    )
  })
  it('submits only fixed version, query and registered format with idempotency', async () => {
    const input = {
      definitionVersionId: 'version-1',
      query: {} as any,
      format: 'csv' as const,
    }
    request.post.mockResolvedValueOnce({ data: job })
    expect(await createReportExport(input, key)).toBe(job)
    expect(request.post).toHaveBeenLastCalledWith(
      '/reporting/exports',
      input,
      headers
    )
  })
  it.each(['cancel', 'retry'] as const)(
    'uses job revision for %s',
    async (action) => {
      request.post.mockResolvedValueOnce({ data: job })
      expect(await commandReportExport(job, action, key)).toBe(job)
      expect(request.post).toHaveBeenLastCalledWith(
        `/reporting/exports/${encodeURIComponent(id)}/${action}`,
        { expectedRevision: 9 },
        headers
      )
    }
  )
  it.each([true, false])(
    'archives=%s with current revision',
    async (archived) => {
      request.post.mockResolvedValueOnce({ data: job })
      expect(await archiveReportExport(job, archived, key)).toBe(job)
      expect(request.post).toHaveBeenLastCalledWith(
        `/reporting/exports/${encodeURIComponent(id)}/archive`,
        { archived, expectedRevision: 9 },
        headers
      )
    }
  )
  it('downloads actual authenticated bytes and creates a Blob without any token URL', async () => {
    request.get.mockResolvedValueOnce({
      data: new Uint8Array([65, 66]).buffer,
      headers: { 'content-type': 'text/csv; charset=utf-8' },
    })
    const content = await downloadReportExport(id)
    expect(content.blob.size).toBe(2)
    expect(content.mimeType).toBe('text/csv; charset=utf-8')
    expect(request.get).toHaveBeenLastCalledWith(
      `/reporting/exports/${encodeURIComponent(id)}/content`,
      { responseType: 'arraybuffer' }
    )
  })
  it('propagates denied content instead of generating a replacement file', async () => {
    const failure = new Error('REPORT_EXPORT_PERMISSION_DENIED')
    request.get.mockRejectedValueOnce(failure)
    await expect(downloadReportExport(id)).rejects.toBe(failure)
    expect(request.get).toHaveBeenCalledTimes(1)
  })
})
