import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    roles?: string[]
    requireAuth: boolean
    icon?: string
    locale?: string
    text?: string
    hideInMenu?: boolean
    hideChildrenInMenu?: boolean
    activeMenu?: string
    order?: number
    noAffix?: boolean
    ignoreCache?: boolean,
    openInNewWindow?: boolean
  }
}
