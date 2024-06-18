/**
 * 监听路由会对渲染造成性能影响。使用 发布者-订阅者 模式进行分发
 */
import mitt, { Handler } from 'mitt'
import type { RouteLocationNormalized } from 'vue-router'

const emitter = mitt()
const key = Symbol('route-change')

let lastVisitedRoute: RouteLocationNormalized | null = null

export const setRouteEmitter = (to: RouteLocationNormalized) => {
  emitter.emit(key, to)
  lastVisitedRoute = to
}

export const listenRouteChange = (
  handler: (route: RouteLocationNormalized) => void,
  immediate = true
) => {
  emitter.on(key, handler as Handler)
  if (immediate && lastVisitedRoute) {
    handler(lastVisitedRoute)
  }
}

export const removeListener = () => {
  emitter.off(key)
}
