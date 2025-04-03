<template>
  <div class="mb-4">
    <span class="label">标签页</span>
    <div
      v-for="(item, i) in widget.panes"
      :key="i"
      class="flex items-center justify-between gap-4 mt-2 first:mt-0"
    >
      <a-input v-model="item.name" />
      <a-button status="danger" @click="removePaneFromTab(i)">
        <template #icon>
          <icon-minus />
        </template>
      </a-button>
    </div>
    <a-button long type="outline" class="mt-2" @click="addPane">
      <template #icon>
        <icon-plus />
      </template>
      增加标签页
    </a-button>
  </div>
  <a-form-item label="标签页外观">
    <a-select v-model="widget.config.type">
      <a-option value="line">线形</a-option>
      <a-option value="card">卡片</a-option>
      <a-option value="card-gutter">带有间距的卡片</a-option>
      <a-option value="text">纯文本</a-option>
      <a-option value="rounded">圆滑</a-option>
      <a-option value="capsule">胶囊</a-option>
    </a-select>
  </a-form-item>
</template>

<script lang="ts" setup>
import { computed, PropType } from 'vue'
import type { IConfigTab } from '../types'

const emit = defineEmits(['update:widgetConfig'])
const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigTab>,
    required: true,
  },
})
const widget = computed({
  get: () => props.widgetConfig,
  set: (val) => {
    emit('update:widgetConfig', val)
  },
})

const removePaneFromTab = (idx: number) => {
  widget.value.panes.splice(idx, 1)
}

const addPane = () => {
  widget.value.panes.push({
    name: '标签页',
    widgets: [],
  })
}
</script>
