import NProgress from 'nprogress'
import usePermission from '@/hooks/use-permission'
import { useUserStore, useMenuStore } from '@/store'
import { menuFromServer, toNoPermissionPage } from '@config'
import { appRoutes } from '../routes'
import { whiteList } from '../constants'
import type { Router, RouteRecordNormalized } from 'vue-router'

const setupPermissionGuard = (router: Router) => {
  router.beforeEach(async (to, from, next) => {
    const userStore = useUserStore()
    const menuStore = useMenuStore()
    const permission = usePermission()
    // 此方法 用于处理权限验证逻辑
    const permissionAllow = permission.hasAccessToRoute(to)
    console.log('是否从服务器获取路由', menuFromServer)
    // 是否从服务器获取路由 如果选择从服务器获取 则调用menu中获取menu的方法
    if (menuFromServer) {
      // TODO: implement permisison logic
      if (
        !menuStore.asyncMenu.length &&
        !whiteList.find((el) => el.name === to.name)
      ) {
        await menuStore.fetchMenuConfig()
      }

      const serverMenuConfig = [...menuStore.asyncMenu, ...whiteList]

      let exist = false
      // 服务器端获取的菜单配置中寻找 与to.name匹配的数量 serverMenuConfig为空或者exist变为true的时候 会停
      while (serverMenuConfig.length && !exist) {
        // 每次循环开始 serverMenuConfig中移出第一个元素 存到el
        const el = serverMenuConfig.shift()
        // 检查 el.name 是否与目标路由 (to.name) 相匹配。如果匹配，设置 exist = true
        if (el?.name === to.name) exist = true
        // 如果 el 元素具有子菜单 (el.children)，则将这些子菜单追加到 serverMenuConfig 数组的末尾，以便在后续迭代中检查
        if (el?.children) {
          serverMenuConfig.push(...(el.children as RouteRecordNormalized[]))
        }
      }
      // 如果有空的时候 则进入 not-found 页面 告诉用户无法访问
      if (exist && permissionAllow) {
        next()
      } else {
        next({ name: 'not-found' })
      }
    } else {
      // menu is not fetched from the server
      // eslint-disable-next-line no-lonely-if
      if (permissionAllow) {
        next()
      } else {
        const dest = !toNoPermissionPage
          ? permission.getFirstAccessibleRoute(appRoutes, userStore.role)
          : { name: 'not-allowed' }
        next(dest || { name: 'not-found' })
      }
    }
    NProgress.done()
  })
}

export default setupPermissionGuard
