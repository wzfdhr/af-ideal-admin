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
  <a-form-item label="默认值">
    <a-input-number v-model="widget.defaultValue" allow-clear />
  </a-form-item>
  <a-form-item label="提示文字">
    <a-input v-model="widget.placeholder" />
  </a-form-item>
  <a-form-item label="精度">
    <a-input-number v-model="widget.precision" :min="0" />
  </a-form-item>
  <a-form-item label="步长">
    <a-input-number v-model="widget.step" />
  </a-form-item>
  <div class="boolean-config">
    <span class="label">是否禁用</span>
    <a-switch v-model="widget.disabled" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否必填</span>
    <a-switch v-model="widget.required" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否只读</span>
    <a-switch v-model="widget.readonly" />
  </div>
  <div class="boolean-config my-4">
    <span class="label">允许清除</span>
    <a-switch v-model="widget.allowClear" />
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
import { IConfigInputNumber } from '../types'
import { inputEventNames } from '../utils'

const emit = defineEmits(['update:widgetConfig'])
const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigInputNumber>,
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

<style lang="scss" scoped></style>
