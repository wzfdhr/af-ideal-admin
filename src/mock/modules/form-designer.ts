import Mock from 'mockjs'
import qs from 'query-string'
import setupMock, { failedResponseWrap, responseWrap } from '@/utils/mock'
import { isAuthed } from '@/services/auth'
import { migrateFormSchema } from '@/components/form-designer/schema'
import type {
  FormRuntimeSubmitResult,
  FormSchemaPageResult,
  FormSchemaRecord,
} from '@/api/form-schema'
import type { MockParams } from '../types'

type FormOption = {
  label: string
  value: string
}

type CreateSchemaInput = {
  name: string
  schema: unknown
}

type SaveSchemaInput = {
  schema: unknown
}

const FORM_OPTION_SCENARIOS: Record<string, FormOption[]> = {
  users: [
    { label: '张三', value: 'u-1' },
    { label: '李四', value: 'u-2' },
  ],
  empty: [],
}

const getNow = () => '2026-06-22 00:00:00'

const createCustomerRegistrationSchema = () =>
  migrateFormSchema({
    dataSources: [
      {
        key: 'users',
        name: '用户选项',
        url: '/api/form-options/users',
        timeout: 2500,
        responseAdapter: {
          listPath: 'data.data',
          labelField: 'label',
          valueField: 'value',
        },
      },
      {
        key: 'empty',
        name: '空选项',
        url: '/api/form-options/empty',
        timeout: 2500,
        responseAdapter: {
          listPath: 'data.data',
          labelField: 'label',
          valueField: 'value',
        },
      },
      {
        key: 'failure',
        name: '失败选项',
        url: '/api/form-options/failure',
        timeout: 2500,
        responseAdapter: {
          listPath: 'data.data',
          labelField: 'label',
          valueField: 'value',
        },
      },
      {
        key: 'timeout',
        name: '超时选项',
        url: '/api/form-options/timeout',
        timeout: 10,
        responseAdapter: {
          listPath: 'data.data',
          labelField: 'label',
          valueField: 'value',
        },
      },
    ],
    widgetsConfig: [
      {
        type: 'input',
        uid: 'customerName',
        name: '客户名称',
        config: {
          label: '客户名称',
          width: '100%',
          required: true,
          placeholder: '请输入客户名称',
        },
      },
      {
        type: 'select',
        uid: 'owner',
        name: '负责人',
        config: {
          label: '负责人',
          width: '100%',
          optionsType: 'remote',
          optionsUrl: '/api/form-options/users',
          options: [],
        },
      },
    ],
  })

const seedFormSchemas = (): FormSchemaRecord[] => [
  {
    id: 'form-customer-registration',
    name: '客户登记',
    schema: createCustomerRegistrationSchema(),
    status: 'draft',
    version: 1,
    createdAt: getNow(),
    updatedAt: getNow(),
  },
]

const parseBody = <T>(body: string): Partial<T> => {
  try {
    return JSON.parse(body || '{}') as Partial<T>
  } catch {
    return {}
  }
}

const getIdFromUrl = (url: string) => {
  const pathname = url.split('?')[0]
  return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '')
}

const getRuntimeFormIdFromUrl = (url: string) => {
  const pathname = url.split('?')[0]
  const parts = pathname.split('/').filter(Boolean)
  return decodeURIComponent(parts[parts.length - 2] || '')
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

export const getFormDesignerRemoteOptions = (sourceKey: string) => {
  if (sourceKey === 'failure') {
    throw new Error('远程选项加载失败')
  }

  if (sourceKey === 'timeout') {
    throw new Error('远程选项加载超时')
  }

  return FORM_OPTION_SCENARIOS[sourceKey] || FORM_OPTION_SCENARIOS.empty
}

export const createFormDesignerMockStore = () => {
  let schemas = seedFormSchemas()
  const submissions: FormRuntimeSubmitResult[] = []

  const listSchemas = ({
    current = 1,
    pageSize = 10,
    keyword = '',
    status = '',
  }: {
    current?: number
    pageSize?: number
    keyword?: string
    status?: string
  }): FormSchemaPageResult => {
    const filtered = schemas.filter((item) => {
      const matchedKeyword = keyword ? item.name.includes(keyword) : true
      const matchedStatus = status ? item.status === status : true
      return matchedKeyword && matchedStatus
    })

    return {
      list: filtered.slice((current - 1) * pageSize, current * pageSize),
      total: filtered.length,
    }
  }

  const getSchema = (id: string) => {
    const record = schemas.find((item) => item.id === id)
    if (!record) {
      throw new Error('表单 schema 不存在')
    }

    return record
  }

  const createSchema = ({ name, schema }: CreateSchemaInput) => {
    const now = getNow()
    const record: FormSchemaRecord = {
      id: Mock.Random.guid(),
      name,
      schema: migrateFormSchema(schema),
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    }
    schemas = [record, ...schemas]

    return record
  }

  const saveSchema = (id: string, { schema }: SaveSchemaInput) => {
    const index = schemas.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('表单 schema 不存在')
    }

    const record: FormSchemaRecord = {
      ...schemas[index],
      schema: migrateFormSchema(schema),
      status: 'draft',
      updatedAt: `${getNow()} saved`,
    }
    schemas[index] = record

    return record
  }

  const publishSchema = (id: string, schema: unknown) => {
    const index = schemas.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('表单 schema 不存在')
    }

    const record: FormSchemaRecord = {
      ...schemas[index],
      schema: migrateFormSchema(schema),
      status: 'published',
      version: schemas[index].version + 1,
      publishedAt: getNow(),
      updatedAt: getNow(),
    }
    schemas[index] = record

    return record
  }

  const rollbackSchema = (id: string, version: number) => {
    const index = schemas.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('表单 schema 不存在')
    }

    const record: FormSchemaRecord = {
      ...schemas[index],
      status: 'rolled-back',
      version,
      updatedAt: getNow(),
    }
    schemas[index] = record

    return record
  }

  const submitForm = (
    formId: string,
    values: Record<string, unknown>
  ): FormRuntimeSubmitResult => {
    getSchema(formId)

    const submission: FormRuntimeSubmitResult = {
      id: Mock.Random.guid(),
      formId,
      status: 'submitted',
      values,
      submittedAt: getNow(),
    }
    submissions.push(submission)

    return submission
  }

  return {
    createSchema,
    getSchema,
    listSchemas,
    publishSchema,
    rollbackSchema,
    saveSchema,
    submitForm,
    submissions,
  }
}

const store = createFormDesignerMockStore()

const withMockError = <T>(handler: () => T) => {
  if (!isAuthed()) {
    return failedResponseWrap(null, '未登录', 50008)
  }

  try {
    return responseWrap(handler())
  } catch (error) {
    return failedResponseWrap(
      null,
      error instanceof Error ? error.message : '表单 Mock 接口异常'
    )
  }
}

const setupFormDesignerMock = () => {
  setupMock({
    setup() {
      Mock.mock(
        new RegExp('/api/form-schemas(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          withMockError(() => {
            const { query } = qs.parseUrl(params.url)
            return store.listSchemas({
              current: toPositiveNumber(query.current, 1),
              pageSize: toPositiveNumber(query.pageSize, 10),
              keyword: toQueryText(query.keyword),
              status: toQueryText(query.status),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/form-schemas/[^/?]+$'),
        'get',
        (params: MockParams) =>
          withMockError(() => store.getSchema(getIdFromUrl(params.url)))
      )

      Mock.mock(
        new RegExp('/api/form-schemas$'),
        'post',
        (params: MockParams) =>
          withMockError(() => {
            const body = parseBody<CreateSchemaInput>(params.body)
            return store.createSchema({
              name: typeof body.name === 'string' ? body.name : '未命名表单',
              schema: body.schema || {},
            })
          })
      )

      Mock.mock(
        new RegExp('/api/form-schemas/[^/?]+$'),
        'put',
        (params: MockParams) =>
          withMockError(() => {
            const body = parseBody<SaveSchemaInput>(params.body)
            return store.saveSchema(getIdFromUrl(params.url), {
              schema: body.schema || {},
            })
          })
      )

      Mock.mock(
        new RegExp('/api/form-schemas/[^/?]+/publish$'),
        'post',
        (params: MockParams) =>
          withMockError(() => {
            const body = parseBody<SaveSchemaInput>(params.body)
            return store.publishSchema(getRuntimeFormIdFromUrl(params.url), {
              ...(body.schema || {}),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/form-schemas/[^/?]+/rollback$'),
        'post',
        (params: MockParams) =>
          withMockError(() => {
            const body = parseBody<{ version: number }>(params.body)
            return store.rollbackSchema(
              getRuntimeFormIdFromUrl(params.url),
              typeof body.version === 'number' ? body.version : 1
            )
          })
      )

      Mock.mock(
        new RegExp('/api/form-runtime/[^/?]+/submit$'),
        'post',
        (params: MockParams) =>
          withMockError(() => {
            const body = parseBody<{ values: Record<string, unknown> }>(
              params.body
            )
            return store.submitForm(
              getRuntimeFormIdFromUrl(params.url),
              body.values || {}
            )
          })
      )

      Mock.mock(
        new RegExp('/api/form-options/[^/?]+$'),
        'get',
        (params: MockParams) => {
          const sourceKey = getIdFromUrl(params.url)
          try {
            return responseWrap(getFormDesignerRemoteOptions(sourceKey))
          } catch (error) {
            return failedResponseWrap(
              null,
              error instanceof Error ? error.message : '远程选项加载失败'
            )
          }
        }
      )
    },
  })
}

export default setupFormDesignerMock
