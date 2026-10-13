<template>
  <PendingReportSchedules v-if="dataMode === 'reference'" />
  <MockReportSchedules v-else />
</template>
<script setup lang="ts">
import PendingReportSchedules from '@/components/reporting/unavailable.vue'
import { dataMode } from '../../../../config/data-mode'
import MockReportSchedules from './mock.vue'
</script>
