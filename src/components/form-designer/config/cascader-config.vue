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
  <div class="mb-4">
    <span class="label">可选值</span>
    <a-tabs v-model:active-key="widget.optionsType" type="line" size="mini">
      <a-tab-pane key="fixed" title="固定值">
        <a-textarea
          v-if="typeof widget.options === 'string'"
          v-model="widget.options"
          :auto-size="{ minRows: 4, maxRows: 8 }"
        />
      </a-tab-pane>
      <a-tab-pane key="remote" title="从接口获取">
        <a-select v-model="widget.optionsUrl" placeholder="选择一个数据源">
          <a-option
            v-for="(item, i) in ctx?.ast.value.dataSources"
            :key="i"
            :value="item.url"
          >
            {{ item.name }}
          </a-option>
        </a-select>
      </a-tab-pane>
    </a-tabs>
  </div>

  <a-form-item label="默认值">
    <a-input v-model="widget.defaultValue" />
  </a-form-item>
  <div class="boolean-config">
    <span class="label">是否禁用</span>
    <a-switch v-model="widget.disabled" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否只读</span>
    <a-switch v-model="widget.readonly" />
  </div>
  <div class="boolean-config my-4">
    <span class="label">是否必填</span>
    <a-switch v-model="widget.required" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">允许搜索</span>
    <a-switch v-model="widget.allowSearch" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">允许清除</span>
    <a-switch v-model="widget.allowClear" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">允许多选</span>
    <a-switch v-model="widget.multiple" />
  </div>
  <div class="boolean-config my-4">
    <span class="label">严格选择模式</span>
    <a-switch v-model="widget.checkStrictly" />
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
import { computed, inject, PropType } from 'vue'
import { merge } from 'lodash'
import { IConfigCascader, FormDesignerContext, contextSymbol } from '../types'
import { inputEventNames } from '../utils'

const ctx = inject<FormDesignerContext>(contextSymbol)

const emit = defineEmits(['update:widgetConfig'])
const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigCascader>,
    required: true,
  },
})
const widget = computed({
  get: () => props.widgetConfig.config,
  set: (val) => {
    emit('update:widgetConfig', merge(props.widgetConfig, val))
  },
})
</script>

<style lang="scss" scoped></style>
