import { getUserId } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import { R1DemoStore } from '@af-admin/workflow-core'
import { DomainError } from '@af-admin/contracts'
import type {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'

export const r1Demo = new R1DemoStore()
export const installR1MockAdapter = (client: AxiosInstance) => {
  client.interceptors.request.use((config) => {
    if (typeof config.adapter === 'function') return config
    const userId = getUserId()
    if (!r1Demo.isIdentity(userId) || config.url === '/user/login')
      return config
    config.adapter = async (
      request: InternalAxiosRequestConfig
    ): Promise<AxiosResponse> => {
      const headers = request.headers || {}
      const selected =
        typeof headers['X-Tenant-Id'] === 'string'
          ? headers['X-Tenant-Id']
          : tenantScope.snapshot().tenantId
      const tenantId =
        selected || (userId?.startsWith('b-') ? 'tenant-b' : 'tenant-a')
      const url = new URL(request.url || '/', 'http://demo.local')
      Object.entries(request.params || {}).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, String(value))
      })
      const body =
        typeof request.data === 'string'
          ? (JSON.parse(request.data) as unknown)
          : request.data
      const response: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        config: request,
        headers: {},
        data: null,
      }
      const traceId = crypto.randomUUID()
      try {
        response.data = {
          code: 20000,
          traceId,
          data: r1Demo.request(
            request.method || 'get',
            url.pathname + url.search,
            userId as string,
            tenantId,
            body,
            typeof headers['Idempotency-Key'] === 'string'
              ? headers['Idempotency-Key']
              : undefined
          ),
        }
        return response
      } catch (error) {
        const failure =
          error instanceof DomainError
            ? error
            : new DomainError(500, 'INTERNAL_ERROR', '演示接口异常')
        response.status = failure.status
        response.data = {
          code: failure.status,
          data: null,
          message: failure.message,
          businessCode: failure.businessCode,
          errors: failure.errors,
          traceId,
        }
        return Promise.reject(
          Object.assign(new Error(failure.message), {
            isAxiosError: true,
            config: request,
            response,
          })
        )
      }
    }
    return config
  })
}
