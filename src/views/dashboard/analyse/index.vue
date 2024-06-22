<template>
  <main class="px-6 pb-6">
    <s-navs :navs="['menu.dashboard']" />
    分析台
  </main>
</template>

<script lang="ts" setup>
import { useUserStore } from '@/store'

const { userInfo } = useUserStore()
</script>
