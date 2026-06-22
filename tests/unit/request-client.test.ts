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

  it('returns successful api response data unchanged', async () => {
    createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => null,
    })

    const response = await axiosMock.responseSuccessHandler?.({
      data: {
        code: 20000,
        data: { id: 1 },
      },
    } as AxiosResponse)

    expect(response).toEqual({
      code: 20000,
      data: { id: 1 },
    })
  })

  it('includes traceId in business error messages', async () => {
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
          traceId: 'trace-123',
          data: null,
        },
      } as AxiosResponse)
    ).rejects.toThrow('业务失败')

    expect(Message.error).toHaveBeenCalledWith({
      content: '业务失败 (traceId: trace-123)',
      duration: 5000,
    })
  })

  it('calls onUnauthorized for 401 style api responses', async () => {
    const onUnauthorized = vi.fn()
    createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => null,
      onUnauthorized,
    })

    await expect(
      axiosMock.responseSuccessHandler?.({
        data: {
          code: 401,
          msg: '未登录',
          data: null,
        },
      } as AxiosResponse)
    ).rejects.toThrow('未登录')

    expect(onUnauthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 401,
        message: '未登录',
      })
    )
  })

  it('calls onForbidden for 403 api responses', async () => {
    const onForbidden = vi.fn()
    createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => null,
      onForbidden,
    })

    await expect(
      axiosMock.responseSuccessHandler?.({
        data: {
          code: 403,
          msg: '无权限',
          data: null,
        },
      } as AxiosResponse)
    ).rejects.toThrow('无权限')

    expect(onForbidden).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 403,
        message: '无权限',
      })
    )
  })

  it('handles server errors from axios responses', async () => {
    createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => null,
    })

    await expect(
      axiosMock.responseErrorHandler?.({
        response: {
          status: 500,
          data: {
            code: 500,
            msg: '服务异常',
            traceId: 'trace-500',
          },
        },
      } as AxiosError)
    ).rejects.toThrow('服务异常')

    expect(Message.error).toHaveBeenCalledWith({
      content: '服务异常 (traceId: trace-500)',
      duration: 5000,
    })
  })

  it('handles not found errors from axios responses', async () => {
    createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => null,
    })

    await expect(
      axiosMock.responseErrorHandler?.({
        response: {
          status: 404,
          data: {},
        },
      } as AxiosError)
    ).rejects.toThrow('请求资源不存在')

    expect(Message.error).toHaveBeenCalledWith({
      content: '请求资源不存在',
      duration: 5000,
    })
  })

  it('handles network errors without leaking request secrets', async () => {
    createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => null,
    })

    await expect(
      axiosMock.responseErrorHandler?.({
        message: 'Network Error token-123 password=secret',
        config: {
          headers: {
            'X-Access-Token': 'token-123',
          },
          data: JSON.stringify({ password: 'secret' }),
        },
      } as AxiosError)
    ).rejects.toThrow('网络异常，请稍后重试')

    expect(Message.error).toHaveBeenCalledWith({
      content: '网络异常，请稍后重试',
      duration: 5000,
    })
  })
})
