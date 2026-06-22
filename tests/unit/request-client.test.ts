import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import { Message } from '@arco-design/web-vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequestClient } from '@/api/request-client'

type RequestSuccessHandler = (
  config: AxiosRequestConfig
) => AxiosRequestConfig | Promise<AxiosRequestConfig>

type ResponseSuccessHandler = (
  response: AxiosResponse
) => unknown | Promise<unknown>

type ResponseErrorHandler = (error: AxiosError) => Promise<never>

const axiosMock = vi.hoisted(() => {
  const requestUse = vi.fn()
  const responseUse = vi.fn()
  const instance = {
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  }

  return {
    create: vi.fn(() => instance),
    instance,
    requestUse,
    responseUse,
    requestSuccessHandler: undefined as RequestSuccessHandler | undefined,
    responseSuccessHandler: undefined as ResponseSuccessHandler | undefined,
    responseErrorHandler: undefined as ResponseErrorHandler | undefined,
  }
})

vi.mock('axios', () => ({
  default: {
    create: axiosMock.create,
  },
}))

vi.mock('@arco-design/web-vue', () => ({
  Message: {
    error: vi.fn(),
  },
}))

describe('createRequestClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    axiosMock.requestSuccessHandler = undefined
    axiosMock.responseSuccessHandler = undefined
    axiosMock.responseErrorHandler = undefined
    axiosMock.requestUse.mockImplementation(
      (handler: RequestSuccessHandler) => {
        axiosMock.requestSuccessHandler = handler
        return 0
      }
    )
    axiosMock.responseUse.mockImplementation(
      (
        successHandler: ResponseSuccessHandler,
        errorHandler: ResponseErrorHandler
      ) => {
        axiosMock.responseSuccessHandler = successHandler
        axiosMock.responseErrorHandler = errorHandler
        return 0
      }
    )
  })

  it('creates an isolated axios instance', () => {
    const client = createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => null,
    })

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: '/api',
      timeout: 15000,
    })
    expect(client).toBe(axiosMock.instance)
  })

  it('injects the configured auth header when a token exists', async () => {
    createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => 'token-123',
    })

    const config = await axiosMock.requestSuccessHandler?.({
      headers: {},
    })

    expect(config?.headers?.['X-Access-Token']).toBe('token-123')
  })

  it('rejects business errors and shows the response message', async () => {
    createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => null,
    })

    await expect(
      axiosMock.responseSuccessHandler?.({
        data: {
          code: 50001,
          msg: '业务失败',
          data: null,
        },
      } as AxiosResponse)
    ).rejects.toThrow('业务失败')

    expect(Message.error).toHaveBeenCalledWith({
      content: '业务失败',
      duration: 5000,
    })
  })
})
