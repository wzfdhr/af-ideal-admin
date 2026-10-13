<template>
  <RealReportCenter v-if="dataMode === 'reference'" />
  <MockReportCenter v-else />
</template>
<script setup lang="ts">
import RealReportCenter from '@/components/reporting/index.vue'
import { dataMode } from '../../../../config/data-mode'
import MockReportCenter from './mock.vue'
</script>
