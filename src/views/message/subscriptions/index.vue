<template>
  <RealSubscriptions v-if="dataMode === 'reference'" />
  <MockSubscriptions v-else />
</template>
<script setup lang="ts">
import RealSubscriptions from '@/components/messaging/subscriptions.vue'
import { dataMode } from '../../../../config/data-mode'
import MockSubscriptions from './mock.vue'
</script>
