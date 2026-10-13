<template>
  <RealTemplates v-if="dataMode === 'reference'" />
  <MockTemplates v-else />
</template>
<script setup lang="ts">
import RealTemplates from '@/components/messaging/templates.vue'
import { dataMode } from '../../../../config/data-mode'
import MockTemplates from './mock.vue'
</script>
