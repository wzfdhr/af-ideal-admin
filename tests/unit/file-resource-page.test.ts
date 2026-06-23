import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileResourceCenter from '@/views/resource/files/index.vue'
import type {
  FileAccessResult,
  FileResourcePageResult,
  FileUploadResult,
} from '@/api/file-resource'

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const apiMocks = vi.hoisted(() => ({
  createFilePreviewTask: vi.fn(),
  createFileResourceDownload: vi.fn(),
  fetchFileResources: vi.fn(),
  uploadFileResource: vi.fn(),
}))

vi.mock('@/api/file-resource', () => ({
  createFilePreviewTask: apiMocks.createFilePreviewTask,
  createFileResourceDownload: apiMocks.createFileResourceDownload,
  fetchFileResources: apiMocks.fetchFileResources,
  uploadFileResource: apiMocks.uploadFileResource,
}))

const resourceResult: FileResourcePageResult = {
  list: [
    {
      id: 'file-contract-pdf',
      fileName: '合同审批.pdf',
      category: 'pdf',
      mimeType: 'application/pdf',
      size: 2048,
      owner: '系统管理员',
      tenantId: 'tenant-a',
      permissionStatus: 'allowed',
      createdAt: '2026-06-23 09:00:00',
      updatedAt: '2026-06-23 09:00:00',
    },
    {
      id: 'file-restricted-archive',
      fileName: '归档资料.zip',
      category: 'archive',
      mimeType: 'application/zip',
      size: 4096,
      owner: '审计员',
      tenantId: 'tenant-a',
      permissionStatus: 'denied',
      createdAt: '2026-06-23 09:30:00',
      updatedAt: '2026-06-23 09:30:00',
    },
  ],
  total: 2,
}

const accessResult: FileAccessResult = {
  url: '/mock/files/file-contract-pdf/download',
  expiresAt: '2026-06-23 10:30:00',
}

const uploadResult: FileUploadResult = {
  success: true,
  record: resourceResult.list[0],
}

describe('FileResourceCenter page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.fetchFileResources.mockResolvedValue(resourceResult)
    apiMocks.createFileResourceDownload.mockResolvedValue(accessResult)
    apiMocks.createFilePreviewTask.mockResolvedValue({
      ...accessResult,
      url: '/mock/files/file-contract-pdf/preview',
    })
    apiMocks.uploadFileResource.mockResolvedValue(uploadResult)
  })

  it('loads resources and supports keyword/category query', async () => {
    const wrapper = mount(FileResourceCenter)
    await flushPromises()

    expect(apiMocks.fetchFileResources).toHaveBeenCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '',
      category: '',
      permissionStatus: '',
    })
    expect(wrapper.find('[data-testid="file-resource-center"]').exists()).toBe(
      true
    )
    expect(wrapper.text()).toContain('合同审批.pdf')
    expect(wrapper.text()).toContain('归档资料.zip')

    await wrapper
      .find<HTMLInputElement>('[data-testid="file-keyword"]')
      .setValue('合同')
    await wrapper
      .find<HTMLSelectElement>('[data-testid="file-category"]')
      .setValue('pdf')
    await wrapper.find('[data-testid="file-query"]').trigger('click')
    await flushPromises()

    expect(apiMocks.fetchFileResources).toHaveBeenLastCalledWith({
      current: 1,
      pageSize: 20,
      keyword: '合同',
      category: 'pdf',
      permissionStatus: '',
    })
  })

  it('uploads metadata and creates preview and download access', async () => {
    const wrapper = mount(FileResourceCenter)
    await flushPromises()

    await wrapper
      .find<HTMLInputElement>('[data-testid="file-upload-name"]')
      .setValue('客户清单.xlsx')
    await wrapper
      .find<HTMLInputElement>('[data-testid="file-upload-size"]')
      .setValue('1024')
    await wrapper
      .find<HTMLInputElement>('[data-testid="file-upload-mime"]')
      .setValue(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    await wrapper.find('[data-testid="file-upload"]').trigger('click')
    await flushPromises()

    expect(apiMocks.uploadFileResource).toHaveBeenCalledWith({
      fileName: '客户清单.xlsx',
      size: 1024,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      owner: '系统管理员',
      tenantId: 'tenant-a',
    })

    await wrapper
      .find('[data-testid="file-preview-file-contract-pdf"]')
      .trigger('click')
    await wrapper
      .find('[data-testid="file-download-file-contract-pdf"]')
      .trigger('click')

    expect(apiMocks.createFilePreviewTask).toHaveBeenCalledWith(
      'file-contract-pdf'
    )
    expect(apiMocks.createFileResourceDownload).toHaveBeenCalledWith(
      'file-contract-pdf'
    )
  })
})
