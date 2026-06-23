import { describe, expect, it } from 'vitest'
import { createFileResourceMockStore } from '@/mock/modules/file-resource'

describe('file resource mock store', () => {
  it('seeds common resources and filters by category and permission', () => {
    const store = createFileResourceMockStore()
    const result = store.queryResources({
      current: 1,
      pageSize: 20,
      category: 'pdf',
      permissionStatus: 'allowed',
    })

    expect(result.total).toBeGreaterThan(0)
    result.list.forEach((item) => {
      expect(item.category).toBe('pdf')
      expect(item.permissionStatus).toBe('allowed')
    })
  })

  it('simulates upload success, oversized failure and invalid format failure', () => {
    const store = createFileResourceMockStore({
      now: () => '2026-06-23 10:00:00',
      id: () => 'file-uploaded',
    })

    const success = store.uploadResource({
      fileName: '客户清单.xlsx',
      size: 1024,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      owner: '系统管理员',
      tenantId: 'tenant-a',
    })
    const oversized = store.uploadResource({
      fileName: '超大视频.mp4',
      size: 100 * 1024 * 1024,
      mimeType: 'video/mp4',
      owner: '系统管理员',
      tenantId: 'tenant-a',
    })
    const invalid = store.uploadResource({
      fileName: '脚本.sh',
      size: 100,
      mimeType: 'text/x-shellscript',
      owner: '系统管理员',
      tenantId: 'tenant-a',
    })

    expect(success.success).toBe(true)
    expect(success.record?.id).toBe('file-uploaded')
    expect(oversized).toEqual({
      success: false,
      reason: '文件超过 20MB 限制',
    })
    expect(invalid).toEqual({
      success: false,
      reason: '文件类型不允许',
    })
  })

  it('simulates download, preview and permission denied access', () => {
    const store = createFileResourceMockStore({
      now: () => '2026-06-23 10:00:00',
    })

    const download = store.createDownload('file-contract-pdf')
    const preview = store.createPreview('file-contract-pdf')
    const denied = store.createDownload('file-restricted-archive')

    expect(download.url).toContain('/download')
    expect(preview.url).toContain('/preview')
    expect(denied).toEqual({
      denied: true,
      reason: '无资源访问权限',
    })
  })
})
