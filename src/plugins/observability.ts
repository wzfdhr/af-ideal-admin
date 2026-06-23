import {
  createObservability,
  setActiveObservability,
  type ErrorReporter,
  type ErrorUserLike,
  type ObservabilityMonitor,
  type WhiteScreenOptions,
} from '@/services/observability'
import type { App, ComponentPublicInstance } from 'vue'
import type { Router } from 'vue-router'

const GLOBAL_ERROR_NOTICE_ID = 'af-global-error-notice'
const GLOBAL_ERROR_NOTICE_TEST_ID = 'global-error-notice'

export interface InstallObservabilityOptions {
  router: Router
  reporter?: ErrorReporter
  getUser?: () => ErrorUserLike | undefined
  getVersion?: () => string
  whiteScreen?: WhiteScreenOptions
}

const getComponentName = (
  instance: ComponentPublicInstance | null
): string | undefined => {
  const componentType = instance?.$?.type
  if (!componentType || typeof componentType !== 'object') {
    return undefined
  }

  return 'name' in componentType && typeof componentType.name === 'string'
    ? componentType.name
    : undefined
}

const renderGlobalErrorNotice = (message: string) => {
  if (typeof document === 'undefined' || !document.body) {
    return
  }

  let notice = document.getElementById(GLOBAL_ERROR_NOTICE_ID)
  if (!notice) {
    notice = document.createElement('div')
    notice.id = GLOBAL_ERROR_NOTICE_ID
    notice.dataset.testid = GLOBAL_ERROR_NOTICE_TEST_ID
    notice.setAttribute('role', 'alert')
    notice.setAttribute('aria-live', 'assertive')
    Object.assign(notice.style, {
      position: 'fixed',
      left: '16px',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      padding: '12px 16px',
      border: '1px solid #ffa39e',
      borderRadius: '6px',
      background: '#fff1f0',
      color: '#a8071a',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
      fontSize: '14px',
      lineHeight: '1.5',
    })
    document.body.appendChild(notice)
  }

  notice.textContent = message
}

export const installObservability = (
  app: App,
  options: InstallObservabilityOptions
): ObservabilityMonitor => {
  const handleWhiteScreenDetected: WhiteScreenOptions['onDetected'] = (
    context
  ) => {
    try {
      options.whiteScreen?.onDetected?.(context)
    } finally {
      renderGlobalErrorNotice('应用启动异常，请刷新后重试或联系管理员。')
    }
  }

  const monitor = createObservability({
    reporter: options.reporter,
    getRoute: () => options.router.currentRoute.value,
    getUser: options.getUser,
    getVersion: options.getVersion,
    whiteScreen: {
      ...options.whiteScreen,
      onDetected: handleWhiteScreenDetected,
    },
  })

  app.config.errorHandler = (error, instance, info) => {
    monitor.reportVueError(error, {
      componentName: getComponentName(instance),
      info,
    })
    renderGlobalErrorNotice('页面运行异常，请刷新后重试或联系管理员。')
  }

  options.router.onError((error, to) => {
    monitor.reportRouterError(error, to)
    renderGlobalErrorNotice('页面加载异常，请刷新后重试或返回上一页。')
  })

  setActiveObservability(monitor)
  monitor.startWhiteScreenDetection()

  return monitor
}
