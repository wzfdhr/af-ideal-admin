<template>
  <div class="s-section">
    <div class="flex items-center justify-between">
      <h2 class="text-base">待办事项</h2>
      <a-link>查看更多</a-link>
    </div>

    <div class="mt-4">
      <a-table :columns="cols" :data="data" :pagination="false">
        <template #action>
          <a-button size="small">查看</a-button>
        </template>
        <template #progress="{ record }: { record: any }">
          {{ record.progress }}%
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const cols = ref([
  { dataIndex: 'title', title: '业务名称' },
  { dataIndex: 'progress', slotName: 'progress', title: '审核进度' },
  { dataIndex: 'todo', title: '待审数量' },
  { slotName: 'action', title: '操作' },
])

const data = ref([
  {
    title: '业务的名称',
    progress: 48,
    todo: 10,
  },
  {
    title: '业务的名称',
    progress: 78,
    todo: 12,
  },
  {
    title: '业务的名称',
    progress: 88,
    todo: 19,
  },
  {
    title: '业务的名称',
    progress: 58,
    todo: 17,
  },
])
</script>

<style lang="scss" scoped></style>
