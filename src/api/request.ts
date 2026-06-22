import { getToken } from '@/utils/auth'
import { requestBaseUrl } from '@config'
import { createRequestClient } from './request-client'

const request = createRequestClient({
  baseURL: requestBaseUrl,
  timeout: 15000,
  authHeaderName: 'X-Access-Token',
  getToken,
})

export default request
