import axios from 'axios'
import { Message } from '@arco-design/web-vue'
import type {
  AxiosError,
  AxiosInstance,
  AxiosRequestHeaders,
  AxiosResponse,
} from 'axios'

export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message?: string
  msg?: string
  traceId?: string
  errors?: Record<string, string[]>
}

export interface RequestClientOptions {
  baseURL: string
  timeout: number
  authHeaderName: string
  getToken: () => string | null
}

const getBusinessMessage = (response: ApiResponse) =>
  response.message || response.msg || 'Request Error'

const getNetworkMessage = (error: AxiosError) =>
  error.message || 'Request Error'

export const createRequestClient = (
  options: RequestClientOptions
): AxiosInstance => {
  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout,
  })

  client.interceptors.request.use((config) => {
    const token = options.getToken()
    if (token) {
      const headers = (config.headers || {}) as AxiosRequestHeaders
      headers[options.authHeaderName] = token
      config.headers = headers
    }

    return config
  })

  client.interceptors.response.use(
    (response: AxiosResponse<ApiResponse>) => {
      const result = response.data
      if (result.code !== 20000) {
        const message = getBusinessMessage(result)
        Message.error({
          content: message,
          duration: 5000,
        })

        return Promise.reject(new Error(message))
      }

      return result as unknown as AxiosResponse
    },
    (error: AxiosError) => {
      Message.error({
        content: getNetworkMessage(error),
        duration: 5000,
      })
      return Promise.reject(error)
    }
  )

  return client
}
