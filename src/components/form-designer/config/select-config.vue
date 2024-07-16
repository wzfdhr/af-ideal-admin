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
  <a-form-item label="可选数量">
    <a-input-number v-model="widget.config.limit" />
    <template #extra>当数量不为0时开启多选</template>
  </a-form-item>
  <div>
    <span class="label">可选值</span>
    <a-tabs
      v-model:active-key="widget.config.optionsType"
      type="line"
      size="mini"
    >
      <a-tab-pane key="fixed" title="固定值">
        <div
          v-for="(opt, i) in widget.config.options"
          :key="i"
          class="flex items-center gap-2 mt-2 first:mt-0"
        >
          <a-input v-model="opt.label" class="!w-24" placeholder="选项名称" />
          <a-input v-model="opt.value" class="!w-16" placeholder="值" />
          <a-button status="danger" @click="removeOption(i)">
            <template #icon>
              <icon-minus />
            </template>
          </a-button>
        </div>

        <a-button long class="mt-2" type="outline" @click="addOption">
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
  <a-form-item label="默认值" class="mt-4">
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
  <div class="boolean-config">
    <span class="label">允许搜索</span>
    <a-switch v-model="widget.config.allowSearch" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">允许新增选项</span>
    <a-switch v-model="widget.config.allowCreate" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">允许清除</span>
    <a-switch v-model="widget.config.allowClear" />
  </div>
  <div class="boolean-config mt-4">
    <span class="label">是否必填</span>
    <a-switch v-model="widget.config.required" />
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
import { computed, inject, PropType } from 'vue'
import { merge } from 'lodash'
import { IConfigSelect, FormDesignerContext, contextSymbol } from '../types'
import { inputEventNames } from '../utils'

const emit = defineEmits(['update:widgetCofnig'])
const ctx = inject<FormDesignerContext>(contextSymbol)

const props = defineProps({
  widgetConfig: {
    type: Object as PropType<IConfigSelect>,
    required: true,
  },
})

const widget = computed({
  get: () => props.widgetConfig,
  set: (val) => {
    emit('update:widgetCofnig', merge(props.widgetConfig, val))
  },
})

const removeOption = (i: number) => {
  widget.value.config.options?.splice(i, 1)
}

const addOption = () => {
  widget.value.config.options?.push({
    label: '',
    value: '',
  })
}
</script>

<style lang="scss" scoped>
:deep(.arco-tabs-nav-tab) {
  justify-content: flex-start;
}
</style>
