<template>
  <a-form :model="formConfig" layout="vertical">
    <a-form-item label="表单尺寸">
      <a-select v-model="formConfig.size">
        <a-option label="mini" />
        <a-option label="small" />
        <a-option label="medium" />
        <a-option label="large" />
      </a-select>
    </a-form-item>
    <a-form-item label="表单布局">
      <a-select v-model="formConfig.layout">
        <a-option label="horizontal" />
        <a-option label="vertical" />
      </a-select>
    </a-form-item>
    <a-form-item label="标签对齐方式">
      <a-select v-model="formConfig.labelAlign">
        <a-option label="left" />
        <a-option label="right" />
      </a-select>
    </a-form-item>
  </a-form>
</template>

<script lang="ts" setup>
import { PropType, computed } from 'vue'
import { FormConfig } from './types'

const props = defineProps({
  config: {
    type: Object as PropType<FormConfig>,
    required: true,
  },
})

const emit = defineEmits(['update:config'])

const formConfig = computed({
  get: () => props.config,
  set: (val) => {
    emit('update:config', val)
  },
})
</script>
