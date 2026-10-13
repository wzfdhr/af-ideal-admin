import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyDataScreenDefinition,
  fetchDataScreenDefinitions,
  previewDataScreen,
  rollbackDataScreenDefinition,
  runDataScreen,
  updateDataScreenDefinition,
} from '@/api/data-screens'
import type {
  DataScreenDefinitionV1,
  DataScreenDetails,
} from '@af-admin/contracts'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))
vi.mock('@/api/request', () => ({ default: requestMock }))

const draft: DataScreenDefinitionV1 = {
  version: 1,
  title: '真实大屏',
  theme: { preset: 'dark', brandColor: '#165DFF' },
  sources: [],
  widgets: [],
  alert: {
    enabled: false,
    statuses: [],
    countThreshold: 1,
    scrollingPaused: false,
  },
}
const details: DataScreenDetails = {
  id: 'screen/with ?#中文',
  draft,
  revision: 7,
  enabled: true,
  archived: false,
  activeReleaseId: 'release/2',
  versions: [],
  allowedActions: ['update', 'rollback', 'run'],
  createdAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
}

describe('real data screen api', () => {
  beforeEach(() => vi.resetAllMocks())

  it('keeps paging server-authoritative and encodes resource IDs', async () => {
    const page = { list: [details], total: 51, current: 2, pageSize: 10 }
    requestMock.get.mockResolvedValue({ data: page })
    expect(
      await fetchDataScreenDefinitions({
        current: 2,
        pageSize: 10,
        keyword: '真%_',
      })
    ).toBe(page)
    expect(requestMock.get).toHaveBeenCalledWith('/data-screens/definitions', {
      params: { current: 2, pageSize: 10, keyword: '真%_' },
    })
  })

  it('uses revision commands and an idempotency key for durable mutations', async () => {
    requestMock.put.mockResolvedValue({ data: details })
    requestMock.post.mockResolvedValue({ data: details })
    await updateDataScreenDefinition(details, draft, 'save-key')
    await copyDataScreenDefinition(details.id, draft, 'copy-key')
    await rollbackDataScreenDefinition(details, 'release/old', 'rollback-key')
    expect(requestMock.put).toHaveBeenCalledWith(
      '/data-screens/definitions/screen%2Fwith%20%3F%23%E4%B8%AD%E6%96%87',
      { draft, expectedRevision: 7 },
      { headers: { 'Idempotency-Key': 'save-key' } }
    )
    expect(requestMock.post).toHaveBeenNthCalledWith(
      1,
      '/data-screens/definitions/screen%2Fwith%20%3F%23%E4%B8%AD%E6%96%87/copy',
      { draft },
      { headers: { 'Idempotency-Key': 'copy-key' } }
    )
    expect(requestMock.post).toHaveBeenNthCalledWith(
      2,
      '/data-screens/definitions/screen%2Fwith%20%3F%23%E4%B8%AD%E6%96%87/rollback',
      { releaseId: 'release/old', expectedRevision: 7 },
      { headers: { 'Idempotency-Key': 'rollback-key' } }
    )
  })

  it('separates draft preview from a fixed published release run', async () => {
    const response = {
      version: 1,
      dataScreenId: details.id,
      releaseId: 'preview',
      releaseVersion: 0,
      sources: [],
    }
    requestMock.post.mockResolvedValue({ data: response })
    await previewDataScreen(draft)
    await runDataScreen(details.id, 'release/2')
    expect(requestMock.post).toHaveBeenNthCalledWith(
      1,
      '/data-screens/preview',
      { draft }
    )
    expect(requestMock.post).toHaveBeenNthCalledWith(
      2,
      '/data-screens/definitions/screen%2Fwith%20%3F%23%E4%B8%AD%E6%96%87/run',
      { releaseId: 'release/2' }
    )
  })
})
