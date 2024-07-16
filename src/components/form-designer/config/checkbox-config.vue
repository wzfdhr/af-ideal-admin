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
  <div>
    <span class="label">可选值</span>
    <a-tabs type="line" size="mini">
      <a-tab-pane key="fixed" title="固定值">
        <div
          v-for="(item, i) in widget.config.options"
          :key="i"
          class="flex items-center gap-2 mt-2 first:mt-0"
        >
          <a-input v-model="item.label" class="!w-24" />
          <a-input v-model="item.value" class="!w-16" />
          <a-button status="danger" @click="remove(i)">
            <template #icon>
              <icon-minus />
            </template>
          </a-button>
        </div>
        <a-button long class="mt-2" type="outline" @click="add">
          <template #icon>
            <icon-plus />
          </template>
          增加一个选项
        </a-button>
      </a-tab-pane>
      <a-tab-pane key="remote" title="从接口获取">
        <a-select
          v-model="widget.config.optionsUrl"
          placeholder="选择一个数据源"
        >
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
  <div class="boolean-config mt-4">
    <span class="label">是否禁用</span>
    <a-switch v-model="widget.config.disabled" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否必填</span>
    <a-switch v-model="widget.config.required" />
  </div>
  <a-form-item label="默认值" class="mt-4">
    <a-select
      v-model="widget.config.defaultValue"
      placeholder="请选择默认值"
      multiple
      allow-clear
      scrollbar
    >
      <a-option
        v-for="(item, i) in widget.config.options"
        :key="i"
        :value="item.value"
      >
        {{ item.label }}
      </a-option>
    </a-select>
  </a-form-item>
  <div>
    <span class="label">可选数量</span>
    <a-input-number
      v-model="widget.config.max"
      :max="widget.config.options?.length"
    />
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
import { computed, PropType, inject } from 'vue'
import { merge } from 'lodash'
import { IConfigCheckbox, FormDesignerContext, contextSymbol } from '../types'
import { inputEventNames } from '../utils'

const ctx = inject<FormDesignerContext>(contextSymbol)
const emit = defineEmits(['update:widgetConfig'])
const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigCheckbox>,
    required: true,
  },
})
const widget = computed({
  get: () => props.widgetConfig,
  set: (val) => {
    emit('update:widgetConfig', merge(props.widgetConfig, val))
  },
})
const remove = (index: number) => {
  ;(widget.value as IConfigCheckbox).config.options?.splice(index, 1)
}
const add = () => {
  ;(widget.value as IConfigCheckbox).config.options?.push({
    label: '',
  })
}
</script>

<style lang="scss" scoped></style>
