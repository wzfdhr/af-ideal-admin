import { clearAuth, getToken } from '@/services/auth'
import { requestBaseUrl } from '@config'
import { createRequestClient } from './request-client'

const getCurrentRedirect = () => {
  const { pathname, search, hash } = window.location
  if (pathname === '/login') {
    return undefined
  }

  return `${pathname}${search}${hash}`
}

const redirectToLogin = () => {
  clearAuth()
  const redirect = getCurrentRedirect()
  const search = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''
  window.location.assign(`/login${search}`)
}

const redirectToNoPermission = () => {
  if (window.location.pathname !== '/not-allowed') {
    window.location.assign('/not-allowed')
  }
}

const request = createRequestClient({
  baseURL: requestBaseUrl,
  timeout: 15000,
  authHeaderName: 'X-Access-Token',
  getToken,
  onUnauthorized: redirectToLogin,
  onForbidden: redirectToNoPermission,
})

export default request
