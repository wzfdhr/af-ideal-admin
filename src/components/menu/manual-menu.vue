<template>
  <a-menu
    v-model:collapsed="isCollpased"
    :default-selected-keys="selectedKeys"
    show-collapse-button
    auto-open-selected
    :level-indent="34"
    style="height: 100%"
    @collapse="setCollapse"
  >
    <template v-for="item in menu" :key="item.key">
      <a-menu-item
        v-if="!item.children"
        :key="item.key"
        @click="goTo(item.path as string)"
      >
        <template v-if="item.icon" #icon>
          <component :is="renderIcon(item.icon!)" />
        </template>
        {{ item.label }}
      </a-menu-item>

      <a-sub-menu
        v-if="item.children && item.children.length > 0"
        :key="item.key"
      >
        <template v-if="item.icon" #icon>
          <component :is="renderIcon(item.icon!)" />
        </template>
        <template #title>{{ item.label }}</template>
        <a-menu-item
          v-for="child in item.children"
          :key="child.key"
          @click="goTo(child.path)"
        >
          {{ child.label }}
        </a-menu-item>
      </a-sub-menu>
    </template>
  </a-menu>
</template>

<script lang="ts" setup>
import { h, compile, computed, ref, PropType } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMenuStore } from '@/store'

type MenuItem = {
  key: string
  path?: string
  label: string
  icon?: string
  children?: Record<'key' | 'path' | 'label', string>[]
}

defineProps({
  menu: {
    type: Array as PropType<MenuItem[]>,
    required: true,
  },
})

defineEmits(['collpase'])

const menuStore = useMenuStore()
const router = useRouter()
const route = useRoute()
const selectedKeys = ref([route.name])

const isCollpased = computed({
  get() {
    return menuStore.isMenuCollapsed
  },
  set(val: boolean) {
    menuStore.updateMenuCollpase(val)
  },
})

const renderIcon = (iconName: string) => h(compile(`<${iconName} />`))

const setCollapse = (val: boolean) => {
  menuStore.updateMenuCollpase(val)
}

const goTo = (path: string) => {
  router.push(path)
}
</script>
