import { defineStore } from 'pinia'
import {
  login as doLogin,
  logout as doLogout,
  LoginData,
  getUserInfo,
} from '@/api/user'
import { clearAuth, clearToken, setToken } from '@/services/auth'
import { recordAuditEvent } from '@/services/audit'
import { removeListener } from '@/utils/route-listener'
import useMenuStore from '@/store/modules/menu'
import {
  commitTenantContext,
  resetTenantContext,
  tenantScope,
} from '@/services/tenant-context'
import type { UserRole } from '@config'
import type { TenantContext } from '@af-admin/contracts'

export interface UserState {
  id?: string
  tenantId?: string
  tenants: TenantContext[]
  name?: string
  dept?: string
  role: UserRole
  avatar?: string
  job?: string
  email?: string
  permissions: string[]
}

const useUserStore = defineStore('user', {
  state: (): UserState => ({
    id: undefined,
    tenantId: undefined,
    name: undefined,
    dept: undefined,
    role: '',
    avatar: undefined,
    email: undefined,
    job: undefined,
    permissions: [],
    tenants: [],
  }),

  getters: {
    userInfo(state: UserState): UserState {
      return { ...state }
    },
  },

  actions: {
    setInfo(info: Partial<UserState>) {
      this.$patch(info)
    },
    resetInfo() {
      this.$reset()
    },
    async info() {
      const res = await getUserInfo()
      if (
        res.data.tenantId &&
        tenantScope.snapshot().tenantId !== res.data.tenantId
      )
        commitTenantContext(res.data.tenantId)
      this.setInfo(res.data)
    },
    async login(data: LoginData) {
      resetTenantContext()
      try {
        const res = await doLogin(data)
        setToken(res.data.token)
        recordAuditEvent({
          module: 'auth',
          action: 'login',
          eventType: 'security',
          result: 'success',
          target: {
            type: 'session',
            id: data.username,
            name: data.username,
          },
          detail: {
            username: data.username,
          },
        })
      } catch (err) {
        clearToken()
        recordAuditEvent({
          module: 'auth',
          action: 'login',
          eventType: 'security',
          result: 'failure',
          target: {
            type: 'session',
            id: data.username,
            name: data.username,
          },
          detail: {
            username: data.username,
            reason: err instanceof Error ? err.message : 'login failed',
          },
        })
        throw err
      }
    },
    async logout() {
      const operator = {
        name: this.name,
        role: this.role,
      }
      try {
        await doLogout()
        recordAuditEvent({
          module: 'auth',
          action: 'logout',
          eventType: 'security',
          result: 'success',
          operator,
          target: {
            type: 'session',
            id: this.name,
            name: this.name,
          },
        })
      } catch (err) {
        recordAuditEvent({
          module: 'auth',
          action: 'logout',
          eventType: 'security',
          result: 'failure',
          operator,
          target: {
            type: 'session',
            id: this.name,
            name: this.name,
          },
          detail: {
            reason: err instanceof Error ? err.message : 'logout failed',
          },
        })
        throw err
      } finally {
        const menuStore = useMenuStore()
        menuStore.clearAsyncMenu()
        clearAuth()
        resetTenantContext()
        removeListener()
        this.resetInfo()
      }
    },
  },
})

export default useUserStore
