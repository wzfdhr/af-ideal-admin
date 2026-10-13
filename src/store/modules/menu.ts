/**
 * 此文件包含所有应用层级的状态管理，通常情况下你无需更改这些逻辑
 */
import { defineStore } from 'pinia'
import { navigationState } from '@/api/navigation'
import { tenantScope } from '@/services/tenant-context'
import { getMenu } from '@/api/user'
import { MENU_ROUTE_ALIASES } from '@af-admin/contracts'
import { namesRouteCached } from '@config'
import type { RouteRecordNormalized } from 'vue-router'

type MenuState = {
  asyncMenu: RouteRecordNormalized[]
  isMenuCollapsed: boolean
  cachedRoutes: Set<string>
  navigationTicket: number
  currentRouteName: string
  disabledButtons: { parentRoute: string; permission: string }[]
  navigationError: string
}

const menuStore = defineStore('menu', {
  state: (): MenuState => ({
    asyncMenu: [],
    isMenuCollapsed: false,
    cachedRoutes: new Set(namesRouteCached),
    navigationTicket: 0,
    currentRouteName: '',
    disabledButtons: [],
    navigationError: '',
  }),

  getters: {
    getAsyncMnu(state: MenuState) {
      return state.asyncMenu
    },
    hiddenPermissions(state: MenuState): string[] {
      const base =
        MENU_ROUTE_ALIASES[state.currentRouteName]?.routeKey ||
        state.currentRouteName
      return state.disabledButtons
        .filter((row) => row.parentRoute === base)
        .map((row) => row.permission)
    },
    getCachedRoutes(state: MenuState) {
      return state.cachedRoutes
    },
  },

  actions: {
    async fetchMenuConfig() {
      try {
        const { data } = await getMenu()
        this.asyncMenu = data
      } catch {
        this.asyncMenu = []
      }
    },
    async fetchNavigationState() {
      const ticket = ++this.navigationTicket
      const scope = tenantScope.snapshot()
      this.navigationError = ''
      try {
        const state = await navigationState()
        if (ticket !== this.navigationTicket || !tenantScope.isCurrent(scope))
          return false
        this.asyncMenu = state.menus as unknown as RouteRecordNormalized[]
        this.disabledButtons = state.disabledButtons
        return true
      } catch (error) {
        if (ticket === this.navigationTicket) {
          this.asyncMenu = []
          this.disabledButtons = []
          this.navigationError =
            error instanceof Error ? error.message : '导航读取失败'
        }
        return false
      }
    },
    clearAsyncMenu() {
      this.navigationTicket += 1
      this.disabledButtons = []
      this.navigationError = ''
      this.currentRouteName = ''
      this.asyncMenu = []
    },
    updateMenuCollpase(val: boolean) {
      this.isMenuCollapsed = val
    },
  },
})

export default menuStore
