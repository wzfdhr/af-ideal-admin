import { defineStore } from 'pinia'

export interface StateManagements {
  promoterDrawer?: boolean
  approverDrawer?: boolean
  copyerDrawer?: boolean
  flowPermission1?: {
    id?: number | string
    type?: number | string
    data?: [id: number, departmentName?: string]
    isDepartment?: boolean
  }
}

const stateManagement = defineStore('state', {
  state: (): StateManagements => ({
    promoterDrawer: false,
    approverDrawer: false,
    copyerDrawer: false,
    flowPermission1: {},
  }),
  actions: {
    async setPromoter(payload?: boolean) {
      this.promoterDrawer = payload
    },
    async setApprover(payload?: boolean) {
      this.approverDrawer = payload
    },
    async setCopyer(payload?: boolean) {
      this.copyerDrawer = payload
    },
    async setFlowPermission(payload?: object) {
      this.flowPermission1 = payload
    },
  },
})

export default stateManagement
