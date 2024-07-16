<template>
  <a-form-item label="字段标识">
    <a-input v-model="widget.id" allow-clear />
  </a-form-item>
  <a-form-item label="字段标签">
    <a-input v-model="widget.label" allow-clear />
  </a-form-item>
  <a-form-item label="分数上限">
    <a-input-number v-model="widget.count" />
  </a-form-item>
  <a-form-item label="自定义颜色">
    <a-input v-model="widget.color" allow-clear />
  </a-form-item>
  <div class="boolean-config">
    <span class="label">允许半选</span>
    <a-switch v-model="widget.allowHalf" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否只读</span>
    <a-switch v-model="widget.readonly" />
  </div>
  <div class="boolean-config my-4">
    <span class="label">是否禁用</span>
    <a-switch v-model="widget.disabled" />
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
import { IConfigRate } from '../types'
import { inputEventNames } from '../utils'

const emit = defineEmits(['update:widgetConfig'])
const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigRate>,
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
