import type { ApiErrorContext } from '@/api/request-client'

export type ErrorReportSource =
  | 'vue'
  | 'router'
  | 'request'
  | 'white-screen'
  | 'audit'
export type ErrorSeverity = 'warning' | 'error' | 'fatal'

export interface ErrorRouteSnapshot {
  name?: string
  path?: string
  fullPath?: string
}

export interface ErrorUserSnapshot {
  id?: string
  name?: string
  role?: string
}

export type ErrorMetadata = Record<string, unknown>

export interface ErrorReport {
  source: ErrorReportSource
  severity: ErrorSeverity
  message: string
  timestamp: string
  version: string
  route?: ErrorRouteSnapshot
  user?: ErrorUserSnapshot
  traceId?: string
  stack?: string
  metadata?: ErrorMetadata
}

export interface ErrorRouteLike {
  name?: string | symbol | null
  path?: string
  fullPath?: string
}

export interface ErrorUserLike {
  id?: string
  name?: string
  role?: string
}

export type ErrorReporter = (report: ErrorReport) => void | Promise<void>

export interface WhiteScreenDocument {
  querySelector: (selector: string) => {
    childElementCount?: number
    textContent?: string | null
    innerHTML?: string
  } | null
}

export interface WhiteScreenOptions {
  enabled?: boolean
  delay?: number
  rootSelector?: string
  document?: WhiteScreenDocument
  setTimeout?: (callback: () => void, delay: number) => number
  clearTimeout?: (timerId: number) => void
}

export interface ObservabilityOptions {
  reporter?: ErrorReporter
  getRoute?: () => ErrorRouteLike | undefined
  getUser?: () => ErrorUserLike | undefined
  getVersion?: () => string
  now?: () => Date
  whiteScreen?: WhiteScreenOptions
}

export interface ObservabilityMonitor {
  reportVueError: (
    error: unknown,
    metadata?: ErrorMetadata
  ) => Promise<ErrorReport>
  reportRouterError: (
    error: unknown,
    route?: ErrorRouteLike,
    metadata?: ErrorMetadata
  ) => Promise<ErrorReport>
  reportRequestError: (context: ApiErrorContext) => Promise<ErrorReport>
  reportAuditError: (
    error: unknown,
    metadata?: ErrorMetadata
  ) => Promise<ErrorReport>
  reportWhiteScreen: (
    message: string,
    metadata?: ErrorMetadata
  ) => Promise<ErrorReport>
  startWhiteScreenDetection: () => () => void
}

const DEFAULT_VERSION = 'unknown'
const DEFAULT_WHITE_SCREEN_DELAY = 3000
const DEFAULT_ROOT_SELECTOR = '#app'
export const OBSERVABILITY_EVENT_NAME = 'af:observability-error'

const SECRET_KEYS = new Set([
  'authorization',
  'password',
  'token',
  'x-access-token',
  'access-token',
  'accesstoken',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const maskSensitiveString = (value: string) =>
  value
    .replace(
      /(authorization|password|token|x-access-token|access-token)\s*[:=]\s*[^,\s;&]+/gi,
      '$1=[redacted]'
    )
    .replace(/Bearer\s+[^,\s;&]+/gi, 'Bearer [redacted]')
    .replace(/\b\d{17}[\dXx]\b/g, '[redacted-id-card]')

const sanitizeValue = (value: unknown, key?: string): unknown => {
  if (key && SECRET_KEYS.has(key.toLowerCase())) {
    return '[redacted]'
  }

  if (typeof value === 'string') {
    return maskSensitiveString(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item))
  }

  if (isRecord(value)) {
    return Object.keys(value).reduce<Record<string, unknown>>(
      (result, itemKey) => {
        result[itemKey] = sanitizeValue(value[itemKey], itemKey)
        return result
      },
      {}
    )
  }

  return value
}

const sanitizeReport = (report: ErrorReport): ErrorReport =>
  sanitizeValue(report) as ErrorReport

const normalizeMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message || error.name
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error'
}

const normalizeStack = (error: unknown) =>
  error instanceof Error ? error.stack : undefined

const normalizeRoute = (
  route?: ErrorRouteLike
): ErrorRouteSnapshot | undefined => {
  if (!route) {
    return undefined
  }

  return {
    name: typeof route.name === 'string' ? route.name : undefined,
    path: route.path,
    fullPath: route.fullPath,
  }
}

const normalizeUser = (user?: ErrorUserLike): ErrorUserSnapshot | undefined => {
  if (!user) {
    return undefined
  }

  return {
    id: user.id,
    name: user.name,
    role: user.role,
  }
}

const getDefaultReporter = (): ErrorReporter => (report) => {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(OBSERVABILITY_EVENT_NAME, {
        detail: report,
      })
    )
  }
}

export const createObservability = (
  options: ObservabilityOptions = {}
): ObservabilityMonitor => {
  const reporter = options.reporter || getDefaultReporter()
  const getNow = options.now || (() => new Date())
  const getVersion = options.getVersion || (() => DEFAULT_VERSION)

  const emit = async (
    source: ErrorReportSource,
    severity: ErrorSeverity,
    message: string,
    metadata?: ErrorMetadata,
    route?: ErrorRouteLike,
    traceId?: string,
    stack?: string
  ) => {
    const report = sanitizeReport({
      source,
      severity,
      message,
      timestamp: getNow().toISOString(),
      version: getVersion(),
      route: normalizeRoute(route || options.getRoute?.()),
      user: normalizeUser(options.getUser?.()),
      traceId,
      stack,
      metadata,
    })

    try {
      await reporter(report)
    } catch {
      // Reporter failures must not break the business flow that raised them.
    }

    return report
  }

  const reportVueError: ObservabilityMonitor['reportVueError'] = (
    error,
    metadata
  ) =>
    emit(
      'vue',
      'error',
      normalizeMessage(error),
      metadata,
      undefined,
      undefined,
      normalizeStack(error)
    )

  const reportRouterError: ObservabilityMonitor['reportRouterError'] = (
    error,
    route,
    metadata
  ) =>
    emit(
      'router',
      'error',
      normalizeMessage(error),
      metadata,
      route,
      undefined,
      normalizeStack(error)
    )

  const reportRequestError: ObservabilityMonitor['reportRequestError'] = (
    context
  ) =>
    emit(
      'request',
      'error',
      context.message,
      { ...context },
      undefined,
      context.traceId
    )

  const reportAuditError: ObservabilityMonitor['reportAuditError'] = (
    error,
    metadata
  ) =>
    emit(
      'audit',
      'warning',
      normalizeMessage(error),
      metadata,
      undefined,
      undefined,
      normalizeStack(error)
    )

  const reportWhiteScreen: ObservabilityMonitor['reportWhiteScreen'] = (
    message,
    metadata
  ) => emit('white-screen', 'fatal', message, metadata)

  const startWhiteScreenDetection = () => {
    const whiteScreen = options.whiteScreen || {}
    if (whiteScreen.enabled === false) {
      return () => undefined
    }

    const documentRef =
      whiteScreen.document ||
      (typeof document !== 'undefined' ? document : undefined)
    const setTimeoutRef =
      whiteScreen.setTimeout ||
      ((callback: () => void, delay: number) =>
        window.setTimeout(callback, delay))
    const clearTimeoutRef =
      whiteScreen.clearTimeout ||
      ((timerId: number) => window.clearTimeout(timerId))
    const rootSelector = whiteScreen.rootSelector || DEFAULT_ROOT_SELECTOR

    if (!documentRef || typeof window === 'undefined') {
      return () => undefined
    }

    const timerId = setTimeoutRef(() => {
      const root = documentRef.querySelector(rootSelector)
      const hasVisibleContent =
        !!root &&
        ((root.childElementCount || 0) > 0 ||
          !!root.textContent?.trim() ||
          !!root.innerHTML?.trim())

      if (!hasVisibleContent) {
        reportWhiteScreen(`App root ${rootSelector} has no visible content`, {
          rootSelector,
        })
      }
    }, whiteScreen.delay || DEFAULT_WHITE_SCREEN_DELAY)

    return () => clearTimeoutRef(timerId)
  }

  return {
    reportVueError,
    reportRouterError,
    reportRequestError,
    reportAuditError,
    reportWhiteScreen,
    startWhiteScreenDetection,
  }
}

let activeObservability: ObservabilityMonitor | undefined

export const setActiveObservability = (monitor: ObservabilityMonitor) => {
  activeObservability = monitor
}

export const getActiveObservability = () => activeObservability

export const reportRequestError = (context: ApiErrorContext) =>
  activeObservability?.reportRequestError(context)
