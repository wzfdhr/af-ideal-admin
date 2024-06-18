/**
 * 此文件包含所有应用层级的状态管理，通常情况下你无需更改这些逻辑
 */
import { defineStore } from 'pinia'
import { getMenu } from '@/api/user'
import { namesRouteCached } from '@config'
import type { RouteRecordNormalized } from 'vue-router'

type MenuState = {
  asyncMenu: RouteRecordNormalized[]
  isMenuCollapsed: boolean
  cachedRoutes: Set<string>
}

const menuStore = defineStore('menu', {
  state: (): MenuState => ({
    asyncMenu: [],
    isMenuCollapsed: false,
    cachedRoutes: new Set(namesRouteCached),
  }),

  getters: {
    getAsyncMnu(state: MenuState) {
      return state.asyncMenu
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
      } catch (error) {
        console.error(error)
      }
    },
    clearAsyncMenu() {
      this.asyncMenu = []
    },
    updateMenuCollpase(val: boolean) {
      this.isMenuCollapsed = val
    },
  },
})

export default menuStore
