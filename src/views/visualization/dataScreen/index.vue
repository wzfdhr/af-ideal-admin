<template>
  <main class="p-6 h-full w-full">
    <s-navs :navs="['menu.visualization', 'menu.visualization.dataScreen']" />
    <ReferenceDataScreen v-if="dataMode === 'reference'" class="mt-4" />
    <DataScreenDesigner v-else class="mt-4" />
  </main>
</template>

<script setup lang="ts">
import DataScreenDesigner from '@/components/data-screen/designer/index.vue'
import ReferenceDataScreen from '@/components/data-screen/reference/index.vue'
import { dataMode } from '../../../../config/data-mode'
</script>
