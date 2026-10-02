import { clearAuth, getToken } from '@/services/auth'
import { reportRequestError } from '@/services/observability'
import { tenantScope, resetTenantContext } from '@/services/tenant-context'
import { retainLeaveDrafts } from '@/services/leave-draft-recovery'
import { requestBaseUrl } from '@config'
import { createRequestClient } from './request-client'
import type { ApiErrorContext } from './request-client'

const getCurrentRedirect = () => {
  const { pathname, search, hash } = window.location
  if (pathname === '/login') {
    return undefined
  }

  return `${pathname}${search}${hash}`
}

const redirectToLogin = () => {
  retainLeaveDrafts()
  clearAuth()
  resetTenantContext()
  if (window.location.pathname === '/login') return
  const redirect = getCurrentRedirect()
  const search = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''
  window.location.assign(`/login${search}`)
}

const redirectToNoPermission = (context: ApiErrorContext) => {
  if (
    ['SCOPE_DELEGATION', 'SCOPE_AUTHORITY', 'FIELD_FORBIDDEN'].includes(
      context.businessCode || ''
    )
  )
    return
  retainLeaveDrafts()
  if (window.location.pathname === '/login') return
  if (window.location.pathname !== '/not-allowed') {
    window.location.assign('/not-allowed')
  }
}

const request = createRequestClient({
  baseURL: requestBaseUrl,
  timeout: 15000,
  authHeaderName: 'X-Access-Token',
  getToken,
  scope: tenantScope,
  onError: (context) => {
    reportRequestError(context)
  },
  onUnauthorized: redirectToLogin,
  onForbidden: redirectToNoPermission,
})

export default request
