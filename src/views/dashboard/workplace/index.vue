<template>
  <main class="px-6 pb-6">
    <s-navs :navs="['menu.dashboard']" />

    <a-row :gutter="16" class="w-full">
      <a-col :span="18" class="w-full">
        <div class="s-section">
          <data-avatar />
          <a-divider />
          <data-panel />
          <a-divider />
        </div>

        <a-row :gutter="16" class="mt-4">
          <a-col :span="12"></a-col>
          <a-col :span="12"></a-col>
        </a-row>
      </a-col>
      <a-col :span="6"></a-col>
    </a-row>
  </main>
</template>

<script lang="ts" setup>
import { useUserStore } from '@/store'
import DataPanel from './widgets/data-panel.vue'
import dataAvatar from './widgets/data-avatar.vue'

const { userInfo } = useUserStore()
</script>
