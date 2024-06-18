import type { RouteMeta, NavigationGuard } from 'vue-router'
import type { Component } from 'vue'

export interface AppRouteRecordRaw {
  path: string
  name?: string | symbol
  meta?: RouteMeta
  redirect?: string
  component: Component | string
  children?: AppRouteRecordRaw[]
  props?: Record<string, any> | boolean
  beforeEnter?: NavigationGuard | NavigationGuard[]
  fullPath?: string
}
