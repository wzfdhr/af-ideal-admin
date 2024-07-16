<template>
  <a-form-item label="字段标识">
    <a-input v-model="widget.config.id" allow-clear />
  </a-form-item>
  <a-form-item label="字段标签">
    <a-input v-model="widget.config.label" allow-clear />
  </a-form-item>
  <a-form-item label="宽度">
    <a-input
      v-model="widget.config.width"
      placeholder="输入含单位(%/px)的数值"
      allow-clear
    />
  </a-form-item>
  <a-form-item label="提示文字">
    <a-input v-model="widget.config.placeholder" allow-clear />
  </a-form-item>
  <a-form-item label="输入长度限制">
    <a-input-number
      v-model="widget.config.maxLength"
      placeholder="显示输入计数需要长度限制"
      allow-clear
    />
  </a-form-item>
  <div class="boolean-config">
    <span class="label">是否禁用</span>
    <a-switch v-model="widget.config.disabled" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否必填</span>
    <a-switch v-model="widget.config.required" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否显示输入计数</span>
    <a-switch v-model="widget.config.showWordLimit" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">允许清除</span>
    <a-switch v-model="widget.config.allowClear" />
  </div>
  <div class="boolean-config my-4">
    <span class="label">自适应高度</span>
    <a-switch
      v-model="widget.config.isautoSize"
      @change="isauto(widget.config.isautoSize)"
    />
  </div>
  <div v-if="widget.config.isautoSize" class="mb-2">
    <span class="label">最小行数</span>
    <a-input-number v-model="minrow" @change="ischange"></a-input-number>
    <span class="label">最大行数</span>
    <a-input-number v-model="maxrow" @change="ischange"></a-input-number>
  </div>
  <a-form-item label="自定义校验规则">
    <a-textarea
      v-model="widget.config.rules"
      :auto-size="{ minRows: 4, maxRows: 6 }"
    />
  </a-form-item>
  <a-form-item label="校验触发时机">
    <a-select v-model="widget.config.trigger" :allow-search="false" multiple>
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
import { computed, PropType, ref } from 'vue'
import { IConfigTextarea } from '../types'
import { inputEventNames } from '../utils'

const emit = defineEmits(['update:widgetConfig'])
const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigTextarea>,
    required: true,
  },
})
const widget = computed({
  get: () => props.widgetConfig,
  set: (val) => {
    emit('update:widgetConfig', val)
  },
})
const maxrow = ref(0)
const minrow = ref(0)
const ischange = () => {
  widget.value.config.autoSize = {
    minRows: minrow.value,
    maxRows: maxrow.value,
  }
}
const isauto = (val: any) => {
  if (val) {
    widget.value.config.autoSize = true
    ischange()
  }
  if (val === false) {
    widget.value.config.autoSize = false
  }
}
</script>

<style lang="scss" scoped></style>
