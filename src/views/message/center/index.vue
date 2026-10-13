<template>
  <RealCenter v-if="dataMode === 'reference'" />
  <MockCenter v-else />
</template>
<script setup lang="ts">
import { dataMode } from '../../../../config/data-mode'
import RealCenter from './real.vue'
import MockCenter from './mock.vue'
</script>
