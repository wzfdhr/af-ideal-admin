<script lang="tsx">
import { defineComponent, ref, h, computed, compile, PropType } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { listenRouteChange } from '@/utils/route-listener'
import { openWindow, regexUrl } from '@/utils'
import { useMenuStore } from '@/store'
import useMenuTree from './use-menu'
import type { RouteRecordRaw, RouteMeta } from 'vue-router'

export default defineComponent({
  props: {
    collpased: Boolean,
    menu: {
      type: Object as PropType<any>,
      default: undefined,
    },
  },
  emits: ['collapse'],
  setup(props) {
    const router = useRouter()
    const route = useRoute()
    const { menuTree: menuPreset } = useMenuTree()
    const menuStore = useMenuStore()
    const { t } = useI18n()

    const openKeys = ref<string[]>([])
    const selectedKeys = ref<string[]>([])

    const menuTree = props.menu || menuPreset.value

    const isCollpased = computed({
      get() {
        return menuStore.isMenuCollapsed
      },
      set(val: boolean) {
        menuStore.updateMenuCollpase(val)
      },
    })

    const goTo = (item: RouteRecordRaw, urlPrefix?: string) => {
      // external links
      if (regexUrl.test(item.path)) {
        openWindow(item.path)
        return
      }
      if (item.meta?.openInNewWindow) {
        if (urlPrefix) {
          openWindow(`${window.location.origin}${urlPrefix}/${item.path}`)
          return
        }
        openWindow(`${window.location.origin}${item.path}`)
        return
      }
      // eliminate external link side effects
      const { hideInMenu, activeMenu } = item.meta as RouteMeta
      if (route.name === item.name && !hideInMenu && !activeMenu) {
        selectedKeys.value = [item.name as string]
        return
      }

      // trigger router change
      router.push({ name: item.name })
    }

    const findMenuOpenKeys = (name: string) => {
      const result: string[] = []
      let found = false

      const backTrace = (
        item: RouteRecordRaw,
        keys: string[],
        target: string
      ) => {
        if (item.name === target) {
          found = true
          result.push(...keys, item.name as string)
          return
        }
        if (item.children?.length) {
          item.children.forEach((el) => {
            backTrace(el, [...keys], target)
          })
        }
      }

      menuTree.forEach((el: RouteRecordRaw) => {
        if (found) return
        backTrace(el, [el.name as string], name)
      })

      return result
    }

    listenRouteChange((newRoute) => {
      const { requireAuth, activeMenu, hideInMenu } = newRoute.meta
      if (requireAuth && (!hideInMenu || activeMenu)) {
        const menuOpenKeys = findMenuOpenKeys(
          (activeMenu || newRoute.name) as string
        )

        const keySet = new Set([...menuOpenKeys, ...openKeys.value])
        openKeys.value = [...keySet]

        selectedKeys.value = [
          (activeMenu as string | undefined) ||
            menuOpenKeys[menuOpenKeys.length - 1],
        ]
      }
    }, true)

    const renderSubMenu = () => {
      const travel = (
        _route: RouteRecordRaw[],
        nodes = [],
        pathPrefix: string | undefined = undefined
      ) => {
        if (_route) {
          _route.forEach((el) => {
            const icon = el?.meta?.icon
              ? () => h(compile(`<${el?.meta?.icon}/>`))
              : null

            const node =
              el?.children && el?.children.length !== 0 ? (
                <a-sub-menu
                  key={el?.name}
                  v-slots={{
                    title: () =>
                      el?.meta?.text ||
                      h(compile(t((el?.meta?.locale as string) || ''))),
                    icon,
                  }}
                >
                  {travel(
                    el?.children,
                    [],
                    pathPrefix ? pathPrefix + el.path : el.path
                  )}
                </a-sub-menu>
              ) : (
                <a-menu-item
                  key={el?.name}
                  v-slots={{ icon }}
                  onClick={() =>
                    goTo(el, el?.meta?.openInNewWindow ? pathPrefix : undefined)
                  }
                >
                  {el?.meta?.text || t(el?.meta?.locale as string)}
                </a-menu-item>
              )

            nodes.push(node as never)
          })
        }

        return nodes
      }

      return travel(menuTree)
    }

    const setCollapse = (val: boolean) => {
      menuStore.updateMenuCollpase(val)
    }

    return () => (
      <a-menu
        v-model:collapsed={isCollpased.value}
        v-model:open-keys={openKeys.value}
        show-collapse-button
        selected-keys={selectedKeys.value}
        auto-open-selected
        level-indent={34}
        style="height: 100%"
        onCollapse={setCollapse}
      >
        {renderSubMenu()}
      </a-menu>
    )
  },
})
</script>

<style lang="scss" scoped>
:deep(.arco-menu-inner) {
  .arco-menu-inline-header {
    @apply flex items-center;
  }

  .arco-icon {
    &:not(.arco-icon-down) {
      @apply text-lg;
    }
  }
}
</style>
