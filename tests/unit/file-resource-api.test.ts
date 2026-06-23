import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFilePreviewTask,
  createFileResourceDownload,
  fetchFileResources,
  uploadFileResource,
  type FileResourceQuery,
  type FileUploadPayload,
} from '@/api/file-resource'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('file resource api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches file resources with keyword, category and permission filters', async () => {
    const query: FileResourceQuery = {
      current: 1,
      pageSize: 10,
      keyword: '合同',
      category: 'pdf',
      permissionStatus: 'allowed',
    }
    requestMock.get.mockResolvedValueOnce({
      data: {
        list: [],
        total: 0,
      },
    })

    await fetchFileResources(query)

    expect(requestMock.get).toHaveBeenCalledWith('/files/resources', {
      params: query,
    })
  })

  it('uploads metadata and creates download and preview access tasks', async () => {
    const payload: FileUploadPayload = {
      fileName: '合同审批.pdf',
      size: 2048,
      mimeType: 'application/pdf',
      owner: '系统管理员',
      tenantId: 'tenant-a',
    }

    requestMock.post
      .mockResolvedValueOnce({
        data: {
          success: true,
        },
      })
      .mockResolvedValueOnce({
        data: {
          url: '/mock/files/file-1/download',
          expiresAt: '2026-06-23 10:30:00',
        },
      })
      .mockResolvedValueOnce({
        data: {
          url: '/mock/files/file-1/preview',
          expiresAt: '2026-06-23 10:30:00',
        },
      })

    await uploadFileResource(payload)
    await createFileResourceDownload('file-1')
    await createFilePreviewTask('file-1')

    expect(requestMock.post).toHaveBeenNthCalledWith(
      1,
      '/files/resources/upload',
      payload
    )
    expect(requestMock.post).toHaveBeenNthCalledWith(
      2,
      '/files/resources/file-1/download'
    )
    expect(requestMock.post).toHaveBeenNthCalledWith(
      3,
      '/files/resources/file-1/preview'
    )
  })
})
