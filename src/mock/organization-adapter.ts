import { getUserId, isAuthed } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import {
  OrganizationDemoStore,
  R1DemoStore,
  requirePermission,
} from '@af-admin/workflow-core'
import {
  DEPARTMENT_PERMISSIONS,
  DomainError,
  demoIdentities,
  createR1Menu,
} from '@af-admin/contracts'
import { mockUsers } from './seed'
import {
  mockEffectivePermissions,
  mockPermissionVersion,
} from './authorization-state'
import type {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'

const organizationDemo = new OrganizationDemoStore(
  mockUsers.map((user) => ({
    id: user.id,
    name: user.name,
    tenantIds: demoIdentities.find((identity) => identity.id === user.id)
      ?.tenantIds || [user.tenantId],
  }))
)
/** Called only by src/mock/index.ts in explicit Mock mode. */
const installOrganizationMockAdapter = (
  client: AxiosInstance,
  r1: R1DemoStore
) => {
  client.interceptors.request.use((config) => {
    const uri = new URL(config.url || '/', 'http://demo.local')
    const organization =
      /^\/system\/(departments|positions|organization-members)(\/|$)/.test(
        uri.pathname
      ) || uri.pathname === '/sys/dic/departmentStatus'
    const identity = demoIdentities.find((user) => user.id === getUserId())
    const account =
      identity && ['/user/info', '/user/menu'].includes(uri.pathname)
    if (!organization && !account) return config
    config.adapter = async (
      request: InternalAxiosRequestConfig
    ): Promise<AxiosResponse> => {
      const response: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        config: request,
        headers: {},
        data: null,
      }
      const traceId = crypto.randomUUID()
      try {
        const user = mockUsers.find((value) => value.id === getUserId())
        if (!isAuthed() || !user)
          throw new DomainError(401, 'SESSION_INVALID', '请重新登录')
        const tenantIds = identity?.tenantIds || [user.tenantId]
        const requested =
          request.headers['X-Tenant-Id'] ||
          tenantScope.snapshot().tenantId ||
          tenantIds[0]
        if (typeof requested !== 'string' || !tenantIds.includes(requested))
          throw new DomainError(403, 'TENANT_FORBIDDEN', '租户不可访问')
        const permissions = mockEffectivePermissions(user.id, requested)
        let data: unknown
        if (uri.pathname === '/sys/dic/departmentStatus') {
          requirePermission(permissions, DEPARTMENT_PERMISSIONS.list)
          data = [
            { label: '启用', value: 'enabled' },
            { label: '停用', value: 'disabled' },
          ]
        } else if (account) {
          if (uri.pathname === '/user/menu') data = createR1Menu(permissions)
          else {
            const info = r1.request(
              'get',
              '/user/info',
              user.id,
              requested
            ) as { tenants: Record<string, unknown>[] }
            data = {
              ...info,
              permissions,
              tenants: info.tenants.map((tenant) => ({
                ...tenant,
                permissions: mockEffectivePermissions(
                  user.id,
                  String(tenant.tenantId)
                ),
                permissionVersion: mockPermissionVersion(
                  user.id,
                  String(tenant.tenantId)
                ),
              })),
            }
          }
        } else {
          Object.entries(request.params || {}).forEach(([key, value]) => {
            if (value !== undefined) uri.searchParams.set(key, String(value))
          })
          const body =
            typeof request.data === 'string'
              ? JSON.parse(request.data)
              : request.data
          data = organizationDemo.request(
            request.method || 'get',
            uri.pathname + uri.search,
            { userId: user.id, tenantId: requested, permissions },
            body,
            request.headers['Idempotency-Key'] as string | undefined
          )
        }
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
export default installOrganizationMockAdapter
