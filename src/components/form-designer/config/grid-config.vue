<template>
  <div class="mb-6">
    <div>
      <span class="label">栅格列</span>
      <div
        v-for="(col, i) in widget.cols"
        :key="i"
        class="flex items-center gap-4 mt-2 first:mt-0"
      >
        <a-input-number v-model="col.span" />
        <a-button status="danger" @click="removeColFromGrid(i)">
          <template #icon>
            <icon-minus />
          </template>
        </a-button>
      </div>
      <a-button long type="outline" class="mt-2" @click="addColToGrid">
        <template #icon>
          <icon-plus />
        </template>
        增加列
      </a-button>
    </div>
  </div>
  <a-form-item label="栅格间距">
    <a-input-number v-model="widget.config.gutter" />
  </a-form-item>
  <a-form-item label="水平排列方式">
    <a-select v-model="widget.config.justify">
      <a-option value="start">左对齐</a-option>
      <a-option value="center">居中</a-option>
      <a-option value="end">右对齐</a-option>
      <a-option value="space-around">均匀分布</a-option>
      <a-option value="space-between">两端对齐</a-option>
    </a-select>
  </a-form-item>
  <a-form-item label="垂直排列方式">
    <a-select v-model="widget.config.align">
      <a-option value="start">顶部对齐</a-option>
      <a-option value="center">居中</a-option>
      <a-option value="end">底部对齐</a-option>
    </a-select>
  </a-form-item>
</template>

<script setup lang="ts">
import { computed, PropType } from 'vue'
import { sumBy } from 'lodash'
import { IConfigGrid } from '../types'

const emit = defineEmits(['update:widgetConfig'])
const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigGrid>,
    required: true,
  },
})
const widget = computed({
  get: () => props.widgetConfig,
  set: (val) => {
    emit('update:widgetConfig', val)
  },
})
const removeColFromGrid = (index: number) => {
  widget.value.cols.splice(index, 1)
}

const addColToGrid = () => {
  const remains = sumBy((widget.value as IConfigGrid).cols, (e) => e.span)
  ;(widget.value as IConfigGrid).cols.push({
    span: remains > 0 ? 24 - remains : 0,
    widgets: [],
  })
}
</script>

<style lang="scss" scoped></style>
