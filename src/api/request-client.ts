import axios from 'axios'
import { Message } from '@arco-design/web-vue'
import { ContextChangedError } from '@/services/tenant-context'
import type { RequestScope } from '@/services/tenant-context'
import type {
  AxiosError,
  AxiosInstance,
  AxiosRequestHeaders,
  AxiosResponse,
  AxiosRequestConfig,
} from 'axios'

export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message?: string
  msg?: string
  traceId?: string
  errors?: Record<string, string[]>
  businessCode?: string
}

export interface RequestClientOptions {
  baseURL: string
  timeout: number
  authHeaderName: string
  getToken: () => string | null
  scope?: {
    snapshot: () => RequestScope
    isCurrent: (scope: RequestScope) => boolean
    track: (controller: AbortController) => () => unknown
    isTransitioning: () => boolean
  }
  onError?: (context: ApiErrorContext) => void | Promise<void>
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
  businessCode?: string
  errors?: Record<string, string[]>
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
    businessCode: toSafeString(data.businessCode),
    errors: isRecord(data.errors)
      ? (Object.fromEntries(
          Object.entries(data.errors).filter(
            ([, value]) =>
              Array.isArray(value) &&
              value.every((item) => typeof item === 'string')
          )
        ) as Record<string, string[]>)
      : undefined,
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
  businessCode,
  errors,
}: {
  code?: number
  httpStatus?: number
  hasResponse?: boolean
  message?: string
  traceId?: string
  businessCode?: string
  errors?: Record<string, string[]>
}): ApiErrorContext => {
  const kind = getErrorKind(code, httpStatus, hasResponse)
  const safeMessage = sanitizeMessage(message || getDefaultMessage(kind))

  return {
    kind,
    code,
    httpStatus,
    traceId,
    businessCode,
    errors,
    message: safeMessage,
    displayMessage: withTraceId(safeMessage, traceId),
  }
}

const handleErrorSideEffects = async (
  context: ApiErrorContext,
  options: RequestClientOptions
) => {
  const runSideEffect = async (
    sideEffect?: (apiErrorContext: ApiErrorContext) => void | Promise<void>
  ) => {
    try {
      await sideEffect?.(context)
    } catch {
      // Error reporting and auth redirects are side effects; they must not
      // replace the original API error that business code receives.
    }
  }

  await runSideEffect(options.onError)

  if (context.kind === 'unauthorized') {
    await runSideEffect(options.onUnauthorized)
  }
  if (context.kind === 'forbidden') {
    await runSideEffect(options.onForbidden)
  }

  try {
    Message.error({
      content: context.displayMessage,
      duration: ERROR_TIP_DURATION,
    })
  } catch {
    // UI notification failures should not change request error semantics.
  }
}

export const createRequestClient = (
  options: RequestClientOptions
): AxiosInstance => {
  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout,
  })
  interface ScopedConfig extends AxiosRequestConfig {
    requestScope?: RequestScope
    releaseScope?: () => void
  }
  const finishScope = (config?: AxiosRequestConfig) => {
    const scoped = config as ScopedConfig | undefined
    scoped?.releaseScope?.()
    if (
      scoped?.requestScope &&
      options.scope &&
      !options.scope.isCurrent(scoped.requestScope)
    )
      throw new ContextChangedError()
  }

  client.interceptors.request.use((config) => {
    if (options.scope) {
      const transitioning = options.scope.isTransitioning()
      const isRead = ['get', 'head', 'options'].includes(
        (config.method || 'get').toLowerCase()
      )
      if (
        transitioning &&
        !isRead &&
        !/^\/(?:user\/info|user\/login|user\/logout|tenants\/switch|audit\/events)$/.test(
          config.url || ''
        )
      )
        throw new ContextChangedError()
      const scoped = config as ScopedConfig
      scoped.requestScope = options.scope.snapshot()
      const controller = new AbortController()
      const originalSignal = config.signal
      const abort = () => controller.abort()
      if (originalSignal?.aborted) abort()
      originalSignal?.addEventListener?.('abort', abort)
      const release = options.scope.track(controller)
      scoped.releaseScope = () => {
        release()
        originalSignal?.removeEventListener?.('abort', abort)
      }
      config.signal = controller.signal
      const headers = (config.headers || {}) as AxiosRequestHeaders
      if (scoped.requestScope.tenantId && !headers['X-Tenant-Id'])
        headers['X-Tenant-Id'] = scoped.requestScope.tenantId
      config.headers = headers
    }
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
      finishScope(response.config)
      if (
        response.config?.responseType === 'arraybuffer' ||
        response.config?.responseType === 'blob'
      )
        return response
      const result = response.data
      if (result.code !== SUCCESS_CODE) {
        const context = createErrorContext({
          code: result.code,
          message: result.message || result.msg,
          traceId: result.traceId,
          businessCode: result.businessCode,
          errors: result.errors,
        })
        await handleErrorSideEffects(context, options)

        return Promise.reject(new ApiRequestError(context))
      }

      return result as unknown as AxiosResponse
    },
    async (error: AxiosError) => {
      if (error instanceof ContextChangedError) return Promise.reject(error)
      finishScope(error.config)
      let errorData = error.response?.data
      if (
        errorData instanceof ArrayBuffer &&
        String(error.response?.headers?.['content-type'] || '').includes(
          'application/json'
        )
      ) {
        try {
          errorData = JSON.parse(new TextDecoder().decode(errorData))
        } catch {
          errorData = undefined
        }
      }
      const payload = getPayload(errorData)
      const context = createErrorContext({
        code: payload.code,
        httpStatus: error.response?.status,
        hasResponse: !!error.response,
        message: payload.message,
        traceId: payload.traceId,
        businessCode: payload.businessCode,
        errors: payload.errors,
      })
      await handleErrorSideEffects(context, options)

      return Promise.reject(new ApiRequestError(context))
    }
  )

  return client
}
