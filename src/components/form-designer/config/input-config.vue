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
  <a-form-item label="字段类型">
    <select
      :value="widget.valueType || 'text'"
      aria-label="字段类型"
      @change="changeValueType"
    >
      <option value="text">文本</option>
      <option value="integer">非负整数</option>
      <option value="decimal">非负金额（两位小数）</option>
      <option value="coordinate">经纬坐标（最多六位小数）</option>
    </select>
  </a-form-item>
  <a-form-item v-if="widget.valueType === 'coordinate'" label="坐标轴">
    <select v-model="widget.coordinateAxis" aria-label="坐标轴">
      <option value="longitude">经度（-180 至 180）</option>
      <option value="latitude">纬度（-90 至 90）</option>
    </select>
  </a-form-item>
  <p v-if="widget.valueType === 'coordinate'">
    输入十进制坐标，最多六位小数。保存时去除末尾零；切换为坐标会清除原数值范围和字段校验。
  </p>
  <a-form-item label="默认值">
    <a-input v-model="widget.defaultValue" allow-clear />
  </a-form-item>
  <a-form-item v-if="widget.valueType !== 'coordinate'" label="输入长度限制">
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
  <a-form-item v-if="dataMode === 'mock'" label="自定义校验规则">
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
import { computed, inject, PropType } from 'vue'
import { dataMode } from '../../../../config/data-mode'
import { inputEventNames } from '../utils'
import { contextSymbol } from '../types'
import type { IConfigInput, FormDesignerContext } from '../types'

const emit = defineEmits(['update:widgetCofnig'])
const ctx = inject<FormDesignerContext>(contextSymbol)

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
const changeValueType = (event: Event) => {
  const { value } = event.target as HTMLSelectElement
  if (!['text', 'integer', 'decimal', 'coordinate'].includes(value)) return
  widget.value.valueType = value as NonNullable<
    IConfigInput['config']['valueType']
  >
  if (value === 'coordinate') {
    widget.value.coordinateAxis = 'longitude'
    delete widget.value.validation
    delete widget.value.min
    delete widget.value.max
    if (ctx)
      (ctx.ast.value as typeof ctx.ast.value & { version: number }).version = 2
  } else delete widget.value.coordinateAxis
}
</script>
