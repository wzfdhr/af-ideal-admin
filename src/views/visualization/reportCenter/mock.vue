<template>
  <main class="p-6 h-full w-full">
    <s-navs :navs="['menu.visualization', 'menu.visualization.reportCenter']" />
    <report-center class="mt-4" />
  </main>
</template>

<script setup lang="ts">
import ReportCenter from '@/components/report-center/index.vue'
</script>
