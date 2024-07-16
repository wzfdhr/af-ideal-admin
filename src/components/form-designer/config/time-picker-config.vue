<template>
  <a-form-item label="字段标识">
    <a-input v-model="widget.id" allow-clear />
  </a-form-item>
  <a-form-item label="字段标签">
    <a-input v-model="widget.label" allow-clear />
  </a-form-item>
  <a-form-item label="宽度">
    <a-input
      v-model="widget.width"
      placeholder="输入含单位(%/px)的数值"
      allow-clear
    />
  </a-form-item>
  <a-form-item label="选择器类型">
    <a-select v-model="widget.type">
      <a-option value="time">时间输入器</a-option>
      <a-option value="time-range">范围选择器</a-option>
    </a-select>
  </a-form-item>
  <a-form-item label="格式">
    <a-input v-model="widget.format" placeholder="HH:mm:ss" />
  </a-form-item>
  <a-form-item label="步长" class="step">
    <div class="flex items-center">
      <span>时：</span>
      <a-input-number v-model="widget.step.hour" :min="1" :max="23" />
    </div>
    <div class="flex items-center mt-2">
      <span>分：</span>
      <a-input-number v-model="widget.step.minute" :min="1" :max="60" />
    </div>
    <div class="flex items-center mt-2">
      <span>秒：</span>
      <a-input-number v-model="widget.step.second" :min="1" :max="60" />
    </div>
  </a-form-item>
  <div class="boolean-config">
    <span class="label">是否禁用</span>
    <a-switch v-model="widget.disabled" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">允许清除</span>
    <a-switch v-model="widget.allowClear" />
  </div>
  <div class="boolean-config my-4">
    <span class="label">是否只读</span>
    <a-switch v-model="widget.readonly" />
  </div>
  <a-form-item label="自定义校验规则">
    <a-textarea
      v-model="widget.rules"
      :auto-size="{ minRows: 4, maxRows: 6 }"
    />
  </a-form-item>
  <a-form-item label="校验触发时机">
    <a-select v-model="widget.trigger" :allow-search="false" multiple>
      <a-option
        v-for="opt in inputEventNames"
        :key="opt"
        :value="opt"
        :label="opt"
      />
    </a-select>
  </a-form-item>
</template>

<script setup lang="ts">
import { computed, PropType } from 'vue'
import { IConfigTimePicker } from '../types'
import { inputEventNames } from '../utils'

const emit = defineEmits(['update:widgetConfig'])
const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigTimePicker>,
    required: true,
  },
})
const widget = computed({
  get: () => props.widgetConfig.config,
  set: (val) => {
    emit('update:widgetConfig', val)
  },
})
</script>

<style lang="scss" scoped>
.arco-picker {
  width: 100%;
}
:deep .arco-form-item-content-flex {
  display: flex;
  flex-direction: column;
}
</style>
