import { setRouteEmitter } from '@/utils/route-listener'
// import other guard modules below...
import setupLoginGuard from './login-guard'
import setupPermissionGuard from './permission'
import type { Router } from 'vue-router'

const setupPageGuard = (router: Router) => {
  router.beforeEach(async (to) => {
    setRouteEmitter(to)
  })
}

const createRouteGuards = (router: Router) => {
  setupPageGuard(router)
  // ...and set them up here
  setupLoginGuard(router)
  setupPermissionGuard(router)
}

export default createRouteGuards
