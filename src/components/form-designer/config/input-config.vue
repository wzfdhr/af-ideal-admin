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
  <a-form-item label="提示文字">
    <a-input v-model="widget.placeholder" allow-clear />
  </a-form-item>
  <a-form-item label="默认值">
    <a-input v-model="widget.defaultValue" allow-clear />
  </a-form-item>
  <a-form-item label="输入长度限制">
    <a-input-number
      v-model="widget.maxLength"
      placeholder="显示输入计数需要长度限制"
      allow-clear
    />
  </a-form-item>
  <a-form-item label="前缀">
    <a-input v-model="widget.prefix" allow-clear />
  </a-form-item>
  <a-form-item label="后缀">
    <a-input v-model="widget.affix" allow-clear />
  </a-form-item>
  <div class="boolean-config">
    <span class="label">是否禁用</span>
    <a-switch v-model="widget.disabled" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否只读</span>
    <a-switch v-model="widget.readonly" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否显示输入计数</span>
    <a-switch v-model="widget.showWordLimit" />
  </div>
  <div class="boolean-config my-4">
    <span class="label">是否必填</span>
    <a-switch v-model="widget.required" />
  </div>
  <a-form-item label="自定义校验规则">
    <a-textarea
      v-model="widget.rules"
      :auto-size="{ minRows: 4, maxRows: 6 }"
    />
  </a-form-item>
  <a-form-item label="校验触发时机">
    <a-select v-model="widget.trigger" multiple :allow-search="false">
      <a-option
        v-for="opt in inputEventNames"
        :key="opt"
        :value="opt"
        :label="opt"
      />
    </a-select>
  </a-form-item>
</template>

<script lang="ts" setup>
import { computed, PropType } from 'vue'
import { inputEventNames } from '../utils'
import type { IConfigInput } from '../types'

const emit = defineEmits(['update:widgetCofnig'])

const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigInput>,
    required: true,
  },
})

const widget = computed({
  get: () => props.widgetConfig.config,
  set: (val) => {
    emit('update:widgetCofnig', val)
  },
})
</script>
