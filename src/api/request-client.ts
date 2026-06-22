import axios from 'axios'
import { Message } from '@arco-design/web-vue'
import type {
  AxiosError,
  AxiosInstance,
  AxiosRequestHeaders,
  AxiosResponse,
} from 'axios'

export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message?: string
  msg?: string
  traceId?: string
  errors?: Record<string, string[]>
}

export interface RequestClientOptions {
  baseURL: string
  timeout: number
  authHeaderName: string
  getToken: () => string | null
  onUnauthorized?: (context: ApiErrorContext) => void | Promise<void>
  onForbidden?: (context: ApiErrorContext) => void | Promise<void>
}

export type ApiErrorKind =
  | 'business'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'server'
  | 'network'

export interface ApiErrorContext {
  kind: ApiErrorKind
  message: string
  displayMessage: string
  code?: number
  httpStatus?: number
  traceId?: string
}

export class ApiRequestError extends Error {
  context: ApiErrorContext

  constructor(context: ApiErrorContext) {
    super(context.message)
    this.name = 'ApiRequestError'
    this.context = context
  }
}

const UNAUTHORIZED_CODES = new Set([401, 50008])
const FORBIDDEN_CODES = new Set([403])
const SUCCESS_CODE = 20000
const ERROR_TIP_DURATION = 5000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const toNumber = (value: unknown) =>
  typeof value === 'number' ? value : undefined

const toSafeString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const sanitizeMessage = (message: string) =>
  message
    .replace(
      /(token|authorization|password)\s*[:=]\s*[^,\s;]+/gi,
      '$1=[redacted]'
    )
    .replace(/X-Access-Token\s*[:=]\s*[^,\s;]+/gi, 'X-Access-Token=[redacted]')

const withTraceId = (message: string, traceId?: string) =>
  traceId ? `${message} (traceId: ${traceId})` : message

const getPayload = (data: unknown) => {
  if (!isRecord(data)) {
    return {}
  }

  return {
    code: toNumber(data.code),
    message:
      toSafeString(data.message) ||
      toSafeString(data.msg) ||
      toSafeString(data.error),
    traceId: toSafeString(data.traceId),
  }
}

const getDefaultMessage = (kind: ApiErrorKind) => {
  switch (kind) {
    case 'unauthorized':
      return '登录已过期，请重新登录'
    case 'forbidden':
      return '没有访问权限'
    case 'not-found':
      return '请求资源不存在'
    case 'server':
      return '服务异常，请稍后重试'
    case 'network':
      return '网络异常，请稍后重试'
    default:
      return 'Request Error'
  }
}

const getErrorKind = (
  code?: number,
  httpStatus?: number,
  hasResponse = true
): ApiErrorKind => {
  if (!hasResponse) {
    return 'network'
  }
  if (UNAUTHORIZED_CODES.has(code || 0) || httpStatus === 401) {
    return 'unauthorized'
  }
  if (FORBIDDEN_CODES.has(code || 0) || httpStatus === 403) {
    return 'forbidden'
  }
  if (httpStatus === 404) {
    return 'not-found'
  }
  if (httpStatus && httpStatus >= 500) {
    return 'server'
  }

  return 'business'
}

const createErrorContext = ({
  code,
  httpStatus,
  hasResponse = true,
  message,
  traceId,
}: {
  code?: number
  httpStatus?: number
  hasResponse?: boolean
  message?: string
  traceId?: string
}): ApiErrorContext => {
  const kind = getErrorKind(code, httpStatus, hasResponse)
  const safeMessage = sanitizeMessage(message || getDefaultMessage(kind))

  return {
    kind,
    code,
    httpStatus,
    traceId,
    message: safeMessage,
    displayMessage: withTraceId(safeMessage, traceId),
  }
}

const handleErrorSideEffects = async (
  context: ApiErrorContext,
  options: RequestClientOptions
) => {
  if (context.kind === 'unauthorized') {
    await options.onUnauthorized?.(context)
  }
  if (context.kind === 'forbidden') {
    await options.onForbidden?.(context)
  }

  Message.error({
    content: context.displayMessage,
    duration: ERROR_TIP_DURATION,
  })
}

export const createRequestClient = (
  options: RequestClientOptions
): AxiosInstance => {
  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout,
  })

  client.interceptors.request.use((config) => {
    const token = options.getToken()
    if (token) {
      const headers = (config.headers || {}) as AxiosRequestHeaders
      headers[options.authHeaderName] = token
      config.headers = headers
    }

    return config
  })

  client.interceptors.response.use(
    async (response: AxiosResponse<ApiResponse>) => {
      const result = response.data
      if (result.code !== SUCCESS_CODE) {
        const context = createErrorContext({
          code: result.code,
          message: result.message || result.msg,
          traceId: result.traceId,
        })
        await handleErrorSideEffects(context, options)

        return Promise.reject(new ApiRequestError(context))
      }

      return result as unknown as AxiosResponse
    },
    async (error: AxiosError) => {
      const payload = getPayload(error.response?.data)
      const context = createErrorContext({
        code: payload.code,
        httpStatus: error.response?.status,
        hasResponse: !!error.response,
        message: payload.message,
        traceId: payload.traceId,
      })
      await handleErrorSideEffects(context, options)

      return Promise.reject(new ApiRequestError(context))
    }
  )

  return client
}
