<template>
  <PersistentDesigner v-if="user.tenants.length" />
  <main v-else class="p-6 h-full w-full">
    <s-navs :navs="['menu.Scalability', 'menu.Scalability.lowCodeBuilder']" />
    <low-code-builder class="mt-4" />
  </main>
</template>

<script setup lang="ts">
import PersistentDesigner from '@/components/low-code/designer-persistent.vue'
import { useUserStore } from '@/store'
import LowCodeBuilder from '@/components/low-code/builder/index.vue'

const user = useUserStore()
</script>
