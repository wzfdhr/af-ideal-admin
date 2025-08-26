<template>
  <div class="s-section">
    <div class="flex items-center justify-between">
      <h2>快捷操作</h2>
      <a-link>编辑</a-link>
    </div>

    <a-grid class="mt-6 mb-4" :cols="3" :col-gap="16" :row-gap="24">
      <a-grid-item v-for="act in actions" :key="act.text">
        <div class="entry">
          <div>
            <s-icon :name="act.icon" :size="20" />
          </div>
          <p>{{ act.text }}</p>
        </div>
      </a-grid-item>
      <a-grid-item class="text-center">
        <div class="frame">
          <s-icon :name="Add" :size="20" />
        </div>
      </a-grid-item>
    </a-grid>
  </div>
</template>

<script lang="ts" setup>
import { shallowRef } from 'vue'
import {
  FileEdit,
  FingerPrint,
  CalendarEvent,
  Article,
  Archive,
  Add,
} from '@salmon-ui/icons'

const actions = shallowRef([
  { text: '审核', icon: FileEdit },
  { text: '用户', icon: FingerPrint },
  { text: '待办事项', icon: CalendarEvent },
  { text: '内容管理', icon: Article },
  { text: '档案', icon: Archive },
])
</script>

<style lang="scss" scoped>
.entry {
  @apply text-center cursor-pointer;
  & > div {
    @apply bg-gray-100 text-gray-600 inline-flex items-center justify-center p-3 rounded-lg;
  }
  & > p {
    @apply text-xs mt-2;
  }

  &:hover {
    & > div {
      @apply bg-blue-50 text-blue-500;
    }
    & > p {
      @apply text-blue-500;
    }
  }
}
.frame {
  @apply inline-flex items-center justify-center border-2 p-3 border-dashed rounded-lg text-gray-400 cursor-pointer
      hover:border-gray-300 hover:text-gray-600;
}
</style>
