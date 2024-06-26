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
          <a-col :span="12"><todoPanel /></a-col>
          <a-col :span="12"><serviceChart /></a-col>
        </a-row>
      </a-col>
      <a-col :span="6">
        <actionPanel />
        <noticePanel class="mt-4" />
      </a-col>
    </a-row>
  </main>
</template>

<script lang="ts" setup>
import { useUserStore } from '@/store'
import DataPanel from './widgets/data-panel.vue'
import dataAvatar from './widgets/data-avatar.vue'
import todoPanel from './widgets/todo-panel.vue'
import actionPanel from './widgets/action-panel.vue'
import noticePanel from './widgets/notice-panel.vue'
import serviceChart from './widgets/service-chart.vue'

const { userInfo } = useUserStore()
</script>
