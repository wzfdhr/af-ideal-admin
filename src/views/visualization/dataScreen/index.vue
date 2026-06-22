<template>
  <main class="p-6 h-full w-full">
    <s-navs :navs="['menu.visualization', 'menu.visualization.dataScreen']" />
    <data-screen-designer class="mt-4" />
  </main>
</template>

<script setup lang="ts">
import DataScreenDesigner from '@/components/data-screen/designer/index.vue'
</script>
