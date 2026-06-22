import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFormSchema,
  fetchFormSchemas,
  getFormSchemaDetail,
  publishFormSchema,
  rollbackFormSchema,
  saveFormSchema,
  submitFormRuntime,
} from '@/api/form-schema'
import { migrateFormSchema } from '@/components/form-designer/schema'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: requestMock,
}))

describe('form schema api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches schema list and detail', async () => {
    requestMock.get
      .mockResolvedValueOnce({
        data: {
          list: [],
          total: 0,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'form-1',
          name: '客户登记',
        },
      })

    await expect(
      fetchFormSchemas({
        current: 2,
        pageSize: 20,
        keyword: '客户',
      })
    ).resolves.toEqual({
      list: [],
      total: 0,
    })
    expect(requestMock.get).toHaveBeenCalledWith('/form-schemas', {
      params: {
        current: 2,
        pageSize: 20,
        keyword: '客户',
      },
    })

    await expect(getFormSchemaDetail('form-1')).resolves.toEqual({
      id: 'form-1',
      name: '客户登记',
    })
    expect(requestMock.get).toHaveBeenLastCalledWith('/form-schemas/form-1')
  })

  it('creates form schema drafts and submits runtime data', async () => {
    const schema = migrateFormSchema({ widgetsConfig: [] })
    requestMock.post
      .mockResolvedValueOnce({
        data: {
          id: 'form-2',
          schema,
          status: 'draft',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'submit-1',
          status: 'submitted',
        },
      })

    await expect(createFormSchema({ name: '新表单', schema })).resolves.toEqual(
      {
        id: 'form-2',
        schema,
        status: 'draft',
      }
    )
    expect(requestMock.post).toHaveBeenCalledWith('/form-schemas', {
      name: '新表单',
      schema,
    })

    await expect(
      submitFormRuntime('form-2', {
        customerName: 'Alice',
      })
    ).resolves.toEqual({
      id: 'submit-1',
      status: 'submitted',
    })
    expect(requestMock.post).toHaveBeenLastCalledWith(
      '/form-runtime/form-2/submit',
      {
        values: {
          customerName: 'Alice',
        },
      }
    )
  })

  it('saves form schema drafts', async () => {
    const schema = migrateFormSchema({ widgetsConfig: [] })
    requestMock.put.mockResolvedValueOnce({
      data: {
        id: 'form-1',
        schema,
      },
    })

    await expect(saveFormSchema('form-1', schema)).resolves.toEqual({
      id: 'form-1',
      schema,
    })
    expect(requestMock.put).toHaveBeenCalledWith('/form-schemas/form-1', {
      schema,
    })
  })

  it('validates schema before publishing', async () => {
    await expect(
      publishFormSchema('form-1', {
        widgetsConfig: 'bad',
      })
    ).rejects.toThrow('非法表单 schema')

    expect(requestMock.post).not.toHaveBeenCalled()
  })

  it('publishes valid schemas and exposes a rollback endpoint', async () => {
    const schema = migrateFormSchema({ widgetsConfig: [] })
    requestMock.post
      .mockResolvedValueOnce({
        data: {
          id: 'form-1',
          status: 'published',
          version: 3,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'form-1',
          status: 'rolled-back',
          version: 2,
        },
      })

    await expect(publishFormSchema('form-1', schema)).resolves.toEqual({
      id: 'form-1',
      status: 'published',
      version: 3,
    })
    expect(requestMock.post).toHaveBeenCalledWith(
      '/form-schemas/form-1/publish',
      {
        schema,
      }
    )

    await expect(rollbackFormSchema('form-1', 2)).resolves.toEqual({
      id: 'form-1',
      status: 'rolled-back',
      version: 2,
    })
    expect(requestMock.post).toHaveBeenLastCalledWith(
      '/form-schemas/form-1/rollback',
      {
        version: 2,
      }
    )
  })
})
