import { getUserId, isAuthed } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import { CredentialDemo } from '@af-admin/workflow-core'
import { DomainError, demoIdentities } from '@af-admin/contracts'
import { mockUsers } from './seed'
import type {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'

const credentials = new Map<string, CredentialDemo>()
const installCredentialMockAdapter = (client: AxiosInstance) => {
  client.interceptors.request.use((config) => {
    const path = new URL(config.url || '/', 'http://demo.local').pathname
    if (!['/user/credential-state', '/user/password'].includes(path))
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
        const tenantIds = demoIdentities.find((value) => value.id === user.id)
          ?.tenantIds || [user.tenantId]
        const tenant =
          request.headers['X-Tenant-Id'] ||
          tenantScope.snapshot().tenantId ||
          tenantIds[0]
        if (typeof tenant !== 'string' || !tenantIds.includes(tenant))
          throw new DomainError(403, 'TENANT_FORBIDDEN', '租户不可访问')
        let store = credentials.get(user.id)
        if (!store) {
          store = new CredentialDemo(user.password, (value) => {
            user.password = value
          })
          credentials.set(user.id, store)
        }
        let data: unknown
        if (path === '/user/credential-state' && request.method === 'get')
          data = store.state()
        else if (path === '/user/password' && request.method === 'post') {
          let body: unknown
          try {
            body =
              typeof request.data === 'string'
                ? JSON.parse(request.data)
                : request.data
          } catch {
            throw new DomainError(422, 'VALIDATION_ERROR', '请求格式无效')
          }
          data = store.change(
            body,
            request.headers['Idempotency-Key'] as string | undefined,
            tenant
          )
        } else throw new DomainError(404, 'NOT_FOUND', '演示接口不存在')
        response.data = { code: 20000, data, traceId }
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
export default installCredentialMockAdapter
