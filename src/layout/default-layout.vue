<template>
  <a-layout class="h-full">
    <tool-bar />
    <a-layout>
      <a-layout-sider
        breakpoint="xl"
        :collapsed="collapsed"
        collapsible
        :width="menuWidth"
        class="layout-sider"
        hide-trigger
      >
        <div class="menu-wrapper">
          <s-menu @collapse="setCollapsed" />
        </div>
      </a-layout-sider>
      <a-layout :style="{ paddingLeft: `${menuWidth}px` }">
        <a-layout-content class="layout-content">
          <page-view />
        </a-layout-content>
      </a-layout>
    </a-layout>
  </a-layout>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useMenuStore } from '@/store'
import ToolBar from '@/components/tool-bar.vue'
import SMenu from '@/components/menu/index.vue'
import { menuWidth as w } from '@config'
import PageView from './inner-layout.vue'

const menuStore = useMenuStore()

const collapsed = computed(() => menuStore.isMenuCollapsed)
const setCollapsed = (val: boolean) => {
  menuStore.updateMenuCollpase(val)
}
const menuWidth = computed(() => (collapsed.value ? 48 : w))
</script>

<style lang="scss" scoped>
.layout-sider {
  @apply fixed top-0 left-0 z-50 h-full pt-[60px];
  transition: all 0.2s cubic-bezier(0.34, 0.69, 0.1, 1);
  &::after {
    @apply absolute top-0 -right-[1px] block w-[1px] h-full;
    content: '';
  }

  > :deep(.arco-layout-sider-children) {
    overflow-y: hidden;
  }
}

.menu-wrapper {
  @apply h-full overflow-auto overflow-x-hidden;
  :deep(.arco-menu) {
    ::-webkit-scrollbar {
      width: 12px;
      height: 4px;
    }

    ::-webkit-scrollbar-thumb {
      border: 4px solid transparent;
      background-clip: padding-box;
      border-radius: 7px;
      background-color: var(--color-text-4);
    }

    ::-webkit-scrollbar-thumb:hover {
      background-color: var(--color-text-3);
    }
  }
}

.layout-content {
  @apply overflow-y-hidden;
  background-color: var(--color-fill-2);
  min-height: calc(100vh - 60px);
  transition: padding 0.2s cubic-bezier(0.34, 0.69, 0.1, 1);
}
</style>
