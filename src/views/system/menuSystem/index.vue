<template>
  <ReferenceMenus v-if="dataMode === 'reference' && user.tenants.length" />
  <MockMenus v-else />
</template>
<script setup lang="ts">
import { useUserStore } from '@/store'
import { dataMode } from '../../../../config/data-mode'
import ReferenceMenus from './reference.vue'
import MockMenus from './mock.vue'

const user = useUserStore()
</script>
