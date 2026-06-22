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

export const installObservability = (
  app: App,
  options: InstallObservabilityOptions
): ObservabilityMonitor => {
  const monitor = createObservability({
    reporter: options.reporter,
    getRoute: () => options.router.currentRoute.value,
    getUser: options.getUser,
    getVersion: options.getVersion,
    whiteScreen: options.whiteScreen,
  })

  app.config.errorHandler = (error, instance, info) => {
    monitor.reportVueError(error, {
      componentName: getComponentName(instance),
      info,
    })
  }

  options.router.onError((error, to) => {
    monitor.reportRouterError(error, to)
  })

  setActiveObservability(monitor)
  monitor.startWhiteScreenDetection()

  return monitor
}
