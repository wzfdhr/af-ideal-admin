import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import {
  createQueryTablePageSchema,
  validateLowCodePageSchema,
} from '@/components/low-code/schema'
import type {
  LowCodeDataSourcePreviewResult,
  LowCodePageRecord,
  LowCodePageResult,
  LowCodePageStatus,
} from '@/api/low-code'
import type { MockParams } from '../types'

interface CreateLowCodePageInput {
  name: string
  schema: unknown
}

interface SaveLowCodePageInput {
  schema: unknown
}

const getNow = () => '2026-06-23 00:00:00'

const LOW_CODE_DATA_SOURCES: Record<string, LowCodeDataSourcePreviewResult> = {
  customers: {
    columns: ['name', 'status', 'owner'],
    list: [
      {
        id: 'customer-1',
        name: 'Aheart 科技',
        status: 'enabled',
        owner: '张三',
      },
      {
        id: 'customer-2',
        name: 'Ideal 数据',
        status: 'enabled',
        owner: '李四',
      },
      {
        id: 'customer-3',
        name: 'Mock 实验室',
        status: 'disabled',
        owner: '王五',
      },
    ],
    total: 3,
  },
  empty: {
    columns: ['name', 'status', 'owner'],
    list: [],
    total: 0,
  },
}

const seedPages = (): LowCodePageRecord[] => [
  {
    id: 'low-code-customer-query',
    name: '客户查询页面',
    schema: createQueryTablePageSchema(),
    status: 'published',
    version: 1,
    createdAt: getNow(),
    updatedAt: getNow(),
    publishedAt: getNow(),
  },
]

const parseBody = <T>(body: string): Partial<T> => {
  try {
    return JSON.parse(body || '{}') as Partial<T>
  } catch {
    return {}
  }
}

const getPathParts = (url: string) =>
  url
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))

const getLastPathPart = (url: string) => {
  const parts = getPathParts(url)
  return parts[parts.length - 1] || ''
}

const getActionTargetId = (url: string) => {
  const parts = getPathParts(url)
  return parts[parts.length - 2] || ''
}

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const toQueryText = (value: unknown) => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : ''
  }

  return typeof value === 'string' ? value : ''
}

const getLowCodePageStatusText = (status?: string): LowCodePageStatus | '' =>
  status === 'draft' || status === 'published' || status === 'rolled-back'
    ? status
    : ''

const paginate = <T>(
  list: T[],
  current = 1,
  pageSize = 10
): { list: T[]; total: number } => ({
  list: list.slice((current - 1) * pageSize, current * pageSize),
  total: list.length,
})

export const getLowCodeMockDataSource = (
  key: string
): LowCodeDataSourcePreviewResult => {
  if (key === 'failure') {
    throw new Error('低代码数据源预览失败')
  }

  return LOW_CODE_DATA_SOURCES[key] || LOW_CODE_DATA_SOURCES.empty
}

export const createLowCodeMockStore = () => {
  let pages = seedPages()

  const listPages = ({
    current = 1,
    pageSize = 10,
    keyword = '',
    status = '',
  }: {
    current?: number
    pageSize?: number
    keyword?: string
    status?: LowCodePageStatus | ''
  }): LowCodePageResult => {
    const filtered = pages.filter((item) => {
      const matchedKeyword = keyword ? item.name.includes(keyword) : true
      const matchedStatus = status ? item.status === status : true
      return matchedKeyword && matchedStatus
    })

    return paginate(filtered, current, pageSize)
  }

  const getPage = (id: string) => {
    const record = pages.find((item) => item.id === id)
    if (!record) {
      throw new Error('低代码页面不存在')
    }

    return record
  }

  const createPage = ({ name, schema }: CreateLowCodePageInput) => {
    const now = getNow()
    const record: LowCodePageRecord = {
      id: Mock.Random.guid(),
      name,
      schema: validateLowCodePageSchema(schema),
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    }
    pages = [record, ...pages]

    return record
  }

  const savePage = (id: string, { schema }: SaveLowCodePageInput) => {
    const index = pages.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('低代码页面不存在')
    }

    const record: LowCodePageRecord = {
      ...pages[index],
      schema: validateLowCodePageSchema(schema),
      status: 'draft',
      updatedAt: `${getNow()} saved`,
    }
    pages[index] = record

    return record
  }

  const publishPage = (id: string, schema: unknown) => {
    const index = pages.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('低代码页面不存在')
    }

    const record: LowCodePageRecord = {
      ...pages[index],
      schema: validateLowCodePageSchema(schema),
      status: 'published',
      version: pages[index].version + 1,
      publishedAt: getNow(),
      updatedAt: getNow(),
    }
    pages[index] = record

    return record
  }

  const rollbackPage = (id: string, version: number) => {
    const index = pages.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('低代码页面不存在')
    }

    const record: LowCodePageRecord = {
      ...pages[index],
      status: 'rolled-back',
      version,
      updatedAt: getNow(),
    }
    pages[index] = record

    return record
  }

  const previewDataSource = (dataSourceKey: string) =>
    getLowCodeMockDataSource(dataSourceKey)

  return {
    createPage,
    getPage,
    listPages,
    pages,
    previewDataSource,
    publishPage,
    rollbackPage,
    savePage,
  }
}

const store = createLowCodeMockStore()

const withLowCodeMockError = <T>(handler: () => T) => {
  if (!isAuthed()) {
    return failedResponseWrap(null, '未登录', 50008)
  }

  try {
    return responseWrap(handler())
  } catch (error) {
    return failedResponseWrap(
      null,
      error instanceof Error ? error.message : '低代码 Mock 接口异常'
    )
  }
}

const setupLowCodeMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/low-code/pages(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          withLowCodeMockError(() => {
            const { query } = qs.parseUrl(params.url)
            return store.listPages({
              current: toPositiveNumber(query.current, 1),
              pageSize: toPositiveNumber(query.pageSize, 10),
              keyword: toQueryText(query.keyword),
              status: getLowCodePageStatusText(toQueryText(query.status)),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/low-code/pages/[^/?]+$'),
        'get',
        (params: MockParams) =>
          withLowCodeMockError(() => store.getPage(getLastPathPart(params.url)))
      )

      Mock.mock(
        new RegExp('/api/low-code/pages$'),
        'post',
        (params: MockParams) =>
          withLowCodeMockError(() => {
            const body = parseBody<CreateLowCodePageInput>(params.body)
            return store.createPage({
              name: typeof body.name === 'string' ? body.name : '未命名页面',
              schema: body.schema || {},
            })
          })
      )

      Mock.mock(
        new RegExp('/api/low-code/pages/[^/?]+$'),
        'put',
        (params: MockParams) =>
          withLowCodeMockError(() => {
            const body = parseBody<SaveLowCodePageInput>(params.body)
            return store.savePage(getLastPathPart(params.url), {
              schema: body.schema || {},
            })
          })
      )

      Mock.mock(
        new RegExp('/api/low-code/pages/[^/?]+/publish$'),
        'post',
        (params: MockParams) =>
          withLowCodeMockError(() => {
            const body = parseBody<SaveLowCodePageInput>(params.body)
            return store.publishPage(
              getActionTargetId(params.url),
              body.schema || {}
            )
          })
      )

      Mock.mock(
        new RegExp('/api/low-code/pages/[^/?]+/rollback$'),
        'post',
        (params: MockParams) =>
          withLowCodeMockError(() => {
            const body = parseBody<{ version: number }>(params.body)
            return store.rollbackPage(
              getActionTargetId(params.url),
              typeof body.version === 'number' ? body.version : 1
            )
          })
      )

      Mock.mock(
        new RegExp('/api/low-code/data-source/preview$'),
        'post',
        (params: MockParams) =>
          withLowCodeMockError(() => {
            const body = parseBody<{ dataSourceKey: string }>(params.body)
            return store.previewDataSource(
              typeof body.dataSourceKey === 'string'
                ? body.dataSourceKey
                : 'empty'
            )
          })
      )
    },
  })
}

export default setupLowCodeMock
