import { getUserId, isAuthed } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import { DomainError, demoIdentities } from '@af-admin/contracts'
import { authorizationDemo } from './authorization-state'
import { mockUsers } from './seed'
import type {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'

const installRoleMockAdapter = (client: AxiosInstance) => {
  client.interceptors.request.use((config) => {
    const uri = new URL(config.url || '/', 'http://demo.local')
    if (
      !/^\/system\/(?:roles|permissions|authorization-members)(?:\/|$)/.test(
        uri.pathname
      ) &&
      !/^\/system\/users\/[^/]+\/authorization$/.test(uri.pathname)
    )
      return config
    config.adapter = async (
      request: InternalAxiosRequestConfig
    ): Promise<AxiosResponse> => {
      const traceId = crypto.randomUUID()
      const response: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        config: request,
        headers: {},
        data: null,
      }
      try {
        const user = mockUsers.find((value) => value.id === getUserId())
        if (!isAuthed() || !user)
          throw new DomainError(401, 'SESSION_INVALID', '请重新登录')
        const tenants = demoIdentities.find((value) => value.id === user.id)
          ?.tenantIds || [user.tenantId]
        const selected =
          request.headers['X-Tenant-Id'] ||
          tenantScope.snapshot().tenantId ||
          tenants[0]
        if (typeof selected !== 'string' || !tenants.includes(selected))
          throw new DomainError(403, 'TENANT_FORBIDDEN', '租户不可访问')
        Object.entries(request.params || {}).forEach(([key, value]) => {
          if (value !== undefined) uri.searchParams.set(key, String(value))
        })
        let body: unknown
        try {
          body =
            typeof request.data === 'string'
              ? JSON.parse(request.data)
              : request.data
        } catch {
          throw new DomainError(422, 'VALIDATION_ERROR', '请求格式无效')
        }
        response.data = {
          code: 20000,
          data: authorizationDemo.request(
            request.method || 'get',
            uri.pathname + uri.search,
            user.id,
            selected,
            body,
            request.headers['Idempotency-Key'] as string | undefined
          ),
          traceId,
        }
        return response
      } catch (error) {
        const failure =
          error instanceof DomainError
            ? error
            : new DomainError(500, 'INTERNAL_ERROR', '授权演示接口异常')
        response.status = failure.status
        response.data = {
          code: failure.status,
          data: null,
          message: failure.message,
          businessCode: failure.businessCode,
          errors: failure.errors,
          traceId,
        }
        throw Object.assign(new Error(failure.message), {
          isAxiosError: true,
          config: request,
          response,
        })
      }
    }
    return config
  })
}
export default installRoleMockAdapter
