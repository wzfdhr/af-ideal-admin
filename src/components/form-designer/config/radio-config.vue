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
  <a-form-item label="排列方式">
    <a-select v-model="widget.config.direction">
      <a-option value="horizontal">水平排列</a-option>
      <a-option value="vertical">垂直排列</a-option>
    </a-select>
  </a-form-item>
  <a-form-item label="单选框类型">
    <a-select v-model="widget.config.type">
      <a-option value="radio">圆形</a-option>
      <a-option value="button">按钮</a-option>
    </a-select>
  </a-form-item>
  <a-form-item label="是否必填">
    <a-switch v-model="widget.config.required" />
  </a-form-item>
  <a-form-item label="默认值">
    <a-select
      v-model="widget.config.defaultValue"
      placeholder="请选择默认值"
      allow-clear
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
  <div class="mb-4">
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
          <a-button status="danger" @click="removeColFromRadio(i)">
            <template #icon>
              <icon-minus />
            </template>
          </a-button>
        </div>
        <a-button long class="mt-2" type="outline" @click="addColToRadio">
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
  <div class="boolean-config my-4">
    <span class="label">是否禁用</span>
    <a-switch v-model="widget.config.disabled" />
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

<script lang="ts" setup>
import { inject, computed, PropType } from 'vue'
import { IConfigRadio, FormDesignerContext, contextSymbol } from '../types'
import { inputEventNames } from '../utils'

const emit = defineEmits(['update:widgetConfig'])
const ctx = inject<FormDesignerContext>(contextSymbol)

const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigRadio>,
    required: true,
  },
})
const widget = computed({
  get: () => props.widgetConfig,
  set: (val) => {
    emit('update:widgetConfig', val)
  },
})
const removeColFromRadio = (index: number) => {
  ;(widget.value as IConfigRadio).config.options?.splice(index, 1)
}
const addColToRadio = () => {
  ;(widget.value as IConfigRadio).config.options?.push({
    label: '',
  })
}
</script>
