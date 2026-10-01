<template>
  <router-view v-slot="{ Component, route }">
    <transition name="fade" mode="out-in" appear>
      <component
        :is="Component"
        v-if="route.meta.ignoreCache"
        :key="`${user.tenantId || ''}:${tenant.generation}:${route.fullPath}`"
      />
      <keep-alive v-else :include="cacheList">
        <component
          :is="Component"
          :key="`${user.tenantId || ''}:${tenant.generation}:${route.fullPath}`"
        />
      </keep-alive>
    </transition>
  </router-view>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useMenuStore } from '@/store'
import useUserStore from '@/store/modules/user'
import useTenantStore from '@/store/modules/tenant'

const menuStore = useMenuStore()
const user = useUserStore()
const tenant = useTenantStore()
const cacheList = computed(() => Array.from(menuStore.getCachedRoutes))
</script>
