import { defineStore } from 'pinia'
import {
  login as doLogin,
  logout as doLogout,
  LoginData,
  getUserInfo,
} from '@/api/user'
import { clearToken, setToken } from '@/utils/auth'
import { removeListener } from '@/utils/route-listener'
import useMenuStore from '@/store/modules/menu'
import type { UserRole } from '@config'

export interface UserState {
  name?: string
  dept?: string
  role: UserRole
  avatar?: string
  job?: string
  email?: string
}

const useUserStore = defineStore('user', {
  state: (): UserState => ({
    name: undefined,
    dept: undefined,
    role: '',
    avatar: undefined,
    email: undefined,
    job: undefined,
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
      this.setInfo(res.data)
    },
    async login(data: LoginData) {
      try {
        const res = await doLogin(data)
        setToken(res.data.token)
      } catch (err) {
        clearToken()
        throw err
      }
    },
    async logout() {
      try {
        await doLogout()
      } finally {
        const menuStore = useMenuStore()
        menuStore.clearAsyncMenu()
        clearToken()
        removeListener()
        this.resetInfo()
      }
    },
  },
})

export default useUserStore
