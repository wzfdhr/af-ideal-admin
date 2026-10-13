<template>
  <RealReportSchedules v-if="dataMode === 'reference'" />
  <MockReportSchedules v-else />
</template>
<script setup lang="ts">
import RealReportSchedules from '@/components/reporting/schedules-index.vue'
import { dataMode } from '../../../../config/data-mode'
import MockReportSchedules from './mock.vue'
</script>
