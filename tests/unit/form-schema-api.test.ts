import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  publishFormSchema,
  rollbackFormSchema,
  saveFormSchema,
} from '@/api/form-schema'
import { migrateFormSchema } from '@/components/form-designer/schema'

const requestMock = vi.hoisted(() => ({
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
