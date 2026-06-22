import 'vue-router'
import type { AccessRequirement } from '@/services/access'

declare module 'vue-router' {
  interface RouteMeta {
    roles?: string[]
    access?: AccessRequirement
    requireAuth?: boolean
    icon?: string
    locale?: string
    text?: string
    hideInMenu?: boolean
    hideChildrenInMenu?: boolean
    activeMenu?: string
    order?: number
    noAffix?: boolean
    ignoreCache?: boolean
    openInNewWindow?: boolean
  }
}
