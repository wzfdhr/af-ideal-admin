import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import type {
  FileAccessResult,
  FilePermissionStatus,
  FileResourceCategory,
  FileResourcePageResult,
  FileResourceQuery,
  FileResourceRecord,
  FileUploadPayload,
  FileUploadResult,
} from '@/api/file-resource'
import type { MockParams } from '../types'

export interface FileResourceMockStoreOptions {
  now?: () => string
  id?: () => string
}

const MAX_FILE_SIZE = 20 * 1024 * 1024

const allowedMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
])

const getNow = () => '2026-06-23 10:00:00'

const getDefaultId = () => Mock.Random.guid()

const seedResources = (): FileResourceRecord[] => [
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
    id: 'file-customer-excel',
    fileName: '客户清单.xlsx',
    category: 'excel',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 4096,
    owner: '运营人员',
    tenantId: 'tenant-a',
    permissionStatus: 'allowed',
    createdAt: '2026-06-23 09:10:00',
    updatedAt: '2026-06-23 09:10:00',
  },
  {
    id: 'file-login-image',
    fileName: '登录页品牌图.png',
    category: 'image',
    mimeType: 'image/png',
    size: 8192,
    owner: '设计负责人',
    tenantId: 'tenant-b',
    permissionStatus: 'allowed',
    createdAt: '2026-06-23 09:20:00',
    updatedAt: '2026-06-23 09:20:00',
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
]

const cloneResource = (record: FileResourceRecord): FileResourceRecord => ({
  ...record,
})

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseQuery = (url: string): FileResourceQuery => {
  const { query } = qs.parseUrl(url)

  return {
    current: toPositiveNumber(query.current, 1),
    pageSize: toPositiveNumber(query.pageSize, 20),
    keyword: readString(query.keyword) || '',
    category: (readString(query.category) || '') as FileResourceCategory | '',
    permissionStatus: (readString(query.permissionStatus) || '') as
      | FilePermissionStatus
      | '',
  }
}

const parseBody = (body: string): FileUploadPayload => {
  try {
    return JSON.parse(body || '{}') as FileUploadPayload
  } catch {
    return {
      fileName: '',
      size: 0,
      mimeType: '',
      owner: '',
      tenantId: '',
    }
  }
}

const getIdFromActionUrl = (url: string, action: 'download' | 'preview') => {
  const match = url.match(new RegExp(`/api/files/resources/([^/]+)/${action}$`))
  return decodeURIComponent(match?.[1] || '')
}

const getCategoryByMimeType = (mimeType: string): FileResourceCategory => {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return 'excel'
  }
  if (mimeType.includes('word')) return 'word'
  if (mimeType === 'application/zip') return 'archive'
  return 'other'
}

export const createFileResourceMockStore = (
  options: FileResourceMockStoreOptions = {}
) => {
  const now = options.now || getNow
  const id = options.id || getDefaultId
  let resources = seedResources()

  const queryResources = (
    params: FileResourceQuery
  ): FileResourcePageResult => {
    const current = params.current || 1
    const pageSize = params.pageSize || 20
    const keyword = params.keyword?.trim().toLowerCase() || ''
    const filtered = resources.filter((item) => {
      const matchedKeyword = keyword
        ? `${item.fileName}${item.owner}${item.tenantId}`
            .toLowerCase()
            .includes(keyword)
        : true
      const matchedCategory = params.category
        ? item.category === params.category
        : true
      const matchedPermission = params.permissionStatus
        ? item.permissionStatus === params.permissionStatus
        : true

      return matchedKeyword && matchedCategory && matchedPermission
    })
    const start = (current - 1) * pageSize

    return {
      list: filtered.slice(start, start + pageSize).map(cloneResource),
      total: filtered.length,
    }
  }

  const uploadResource = (payload: FileUploadPayload): FileUploadResult => {
    if (payload.size > MAX_FILE_SIZE) {
      return {
        success: false,
        reason: '文件超过 20MB 限制',
      }
    }
    if (!allowedMimeTypes.has(payload.mimeType)) {
      return {
        success: false,
        reason: '文件类型不允许',
      }
    }

    const timestamp = now()
    const record: FileResourceRecord = {
      id: id(),
      fileName: payload.fileName,
      category: getCategoryByMimeType(payload.mimeType),
      mimeType: payload.mimeType,
      size: payload.size,
      owner: payload.owner,
      tenantId: payload.tenantId,
      permissionStatus: 'allowed',
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    resources = [record, ...resources]

    return {
      success: true,
      record: cloneResource(record),
    }
  }

  const createAccessResult = (
    resourceId: string,
    action: 'download' | 'preview'
  ): FileAccessResult => {
    const record = resources.find((item) => item.id === resourceId)

    if (!record) {
      return {
        denied: true,
        reason: '文件不存在',
      }
    }
    if (record.permissionStatus === 'denied') {
      return {
        denied: true,
        reason: '无资源访问权限',
      }
    }

    return {
      url: `/mock/files/${record.id}/${action}`,
      expiresAt: '2026-06-23 10:30:00',
    }
  }

  return {
    queryResources,
    uploadResource,
    createDownload: (resourceId: string) =>
      createAccessResult(resourceId, 'download'),
    createPreview: (resourceId: string) =>
      createAccessResult(resourceId, 'preview'),
  }
}

const fileResourceStore = createFileResourceMockStore()

const setupFileResourceMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/files/resources(\\?.*)?$'),
        'get',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            fileResourceStore.queryResources(parseQuery(params.url))
          )
        }
      )

      Mock.mock(
        new RegExp('/api/files/resources/upload$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            fileResourceStore.uploadResource(parseBody(params.body))
          )
        }
      )

      Mock.mock(
        new RegExp('/api/files/resources/[^/]+/download$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            fileResourceStore.createDownload(
              getIdFromActionUrl(params.url, 'download')
            )
          )
        }
      )

      Mock.mock(
        new RegExp('/api/files/resources/[^/]+/preview$'),
        'post',
        (params: MockParams) => {
          if (!isAuthed()) {
            return failedResponseWrap(null, '未登录', 50008)
          }

          return responseWrap(
            fileResourceStore.createPreview(
              getIdFromActionUrl(params.url, 'preview')
            )
          )
        }
      )
    },
  })
}

export default setupFileResourceMock
