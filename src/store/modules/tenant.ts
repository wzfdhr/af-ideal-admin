import { defineStore } from 'pinia'
import request from '@/api/request'
import {
  beginTenantTransition,
  cancelTenantTransition,
  commitTenantContext,
} from '@/services/tenant-context'
import useUserStore from './user'
import useMenuStore from './menu'
import type { AuthUser, TenantContext } from '@af-admin/contracts'

export default defineStore('tenantContext', {
  state: () => ({ switching: false, generation: 0 }),
  actions: {
    async switchTo(tenantId: string) {
      const user = useUserStore()
      if (tenantId === user.tenantId) return
      beginTenantTransition()
      this.switching = true
      try {
        await request.post<TenantContext>('/tenants/switch', { tenantId })
        const result = await request.post<AuthUser>(
          '/user/info',
          {},
          { headers: { 'X-Tenant-Id': tenantId } }
        )
        this.generation = commitTenantContext(tenantId)
        useMenuStore().clearAsyncMenu()
        user.setInfo(result.data)
      } catch (error) {
        cancelTenantTransition()
        throw error
      } finally {
        this.switching = false
      }
    },
  },
})
