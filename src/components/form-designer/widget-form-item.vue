<template>
  <a-form-item
    v-if="widget.type !== 'grid' && widget.type !== 'tab'"
    :label="widget.config.label || widget.name"
    class="group widget-wrapper bg-white z-50"
    :class="{ 'is-selected': isSelected }"
    :field="widget.name"
    :required="widget.config.required"
    @click="onWidgetSelect"
  >
    <template v-if="widget.type === 'input'">
      <a-input
        :default-value="widget.config.defaultValue"
        :placeholder="widget.config.placeholder"
        :allow-clear="widget.config.allowClear"
        :max-length="widget.config.maxLength"
        :show-word-limit="widget.config.showWordLimit"
        :readonly="widget.config.readonly"
        :disabled="widget.config.disabled"
        :style="{ width: widget.config.width }"
      >
        <template v-if="widget.config.prefix" #prepend>
          {{ widget.config.prefix }}
        </template>
        <template v-if="widget.config.affix" #append>
          {{ widget.config.affix }}
        </template>
      </a-input>
    </template>
    <template v-if="widget.type === 'select'">
      <a-select
        :allow-clear="widget.config.allowClear"
        :allow-create="widget.config.allowCreate"
        :allow-search="widget.config.allowSearch"
        :default-value="widget.config.defaultValue"
        :disabled="widget.config.disabled"
        :multiple="!!widget.config.limit && widget.config.limit > 0"
        :limit="widget.config.limit"
        :placeholder="widget.config.placeholder"
        :style="{ width: widget.config.width }"
      >
        <a-option
          v-for="(opt, i) in widget.config.options"
          :key="i"
          :value="opt.value"
        >
          {{ opt.label }}
        </a-option>
      </a-select>
    </template>
    <template v-if="widget.type === 'radio'">
      <a-radio-group
        :direction="widget.config.direction"
        :type="widget.config.type"
        :disabled="widget.config.disabled"
        :default-value="widget.config.defaultValue"
        :style="{ width: widget.config.width }"
      >
        <a-radio
          v-for="(item, i) in widget.config.options"
          :key="i"
          :value="item.value"
        >
          {{ item.label }}
        </a-radio>
      </a-radio-group>
    </template>
    <template v-if="widget.type === 'slider'">
      <a-slider
        :default-value="widget.config.defaultValue"
        :step="widget.config.step"
        :min="widget.config.min"
        :marks="widget.config.marks"
        :max="widget.config.max"
        :direction="widget.config.direction"
        :disabled="widget.config.disabled"
        :show-ticks="widget.config.showTicks"
        :show-input="widget.config.showInput"
        :range="widget.config.range"
        :style="{ width: widget.config.width }"
      />
    </template>
    <template v-if="widget.type === 'inputNumber'">
      <a-input-number
        :default-value="widget.config.defaultValue"
        :placeholder="widget.config.placeholder"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :disabled="widget.config.disabled"
        :error="widget.config.error"
        :style="{ width: widget.config.width }"
        :size="widget.config.size"
        :step="widget.config.step"
        :precision="widget.config.precision"
      />
    </template>
    <template v-if="widget.type === 'inputTag'">
      <a-input-tag
        :style="{ width: widget.config.width }"
        :default-value="widget.config.defaultValue"
        :disabled="widget.config.disabled"
        :readonly="widget.config.readonly"
        :allow-clear="widget.config.allowClear"
        :placeholder="widget.config.placeholder"
        :max-tag-count="widget.config.maxTagCount"
      />
    </template>
    <template v-if="widget.type === 'checkbox'">
      <a-checkbox-group
        :disabled="widget.config.disabled"
        :direction="widget.config.direction"
        :indeterminate="widget.config.indeterminate"
        :style="{ width: widget.config.width }"
        :default-value="widget.config.defaultValue"
        :max="widget.config.max"
      >
        <template v-for="(item, i) in widget.config.options" :key="i">
          <a-checkbox :value="item.value">
            {{ item.label }}
          </a-checkbox>
        </template>
      </a-checkbox-group>
    </template>
    <template v-if="widget.type === 'switch'">
      <a-switch
        :disabled="widget.config.disabled"
        :size="widget.config.size"
        :type="widget.config.type"
        :direction="widget.config.checkedValue"
        :checked-value="widget.config.checkedValue"
        :unchecked-value="widget.config.uncheckedValue"
        :default-checked="widget.config.defaultChecked"
      />
    </template>
    <template v-if="widget.type === 'date-picker'">
      <a-date-picker
        v-if="widget.config.modeSelection === 'date'"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-week-picker
        v-else-if="widget.config.modeSelection === 'week'"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-month-picker
        v-else-if="widget.config.modeSelection === 'month'"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-quarter-picker
        v-else-if="widget.config.modeSelection === 'quarter'"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-year-picker
        v-else-if="widget.config.modeSelection === 'year'"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-range-picker
        v-else-if="widget.config.modeSelection === 'date-range'"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-range-picker
        v-else-if="widget.config.modeSelection === 'week-range'"
        mode="week"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-range-picker
        v-else-if="widget.config.modeSelection === 'month-range'"
        mode="month"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-range-picker
        v-else-if="widget.config.modeSelection === 'quarter-range'"
        mode="quarter"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-range-picker
        v-else-if="widget.config.modeSelection === 'year-range'"
        mode="year"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
    </template>
    <template v-if="widget.type === 'rate'">
      <a-rate
        :count="widget.config.count"
        :allow-half="widget.config.allowHalf"
        :grading="widget.config.grading"
        :readonly="widget.config.readonly"
        :disabled="widget.config.disabled"
        :color="widget.config.color"
      />
    </template>
    <template v-if="widget.type === 'time-picker'">
      <a-time-picker
        :type="widget.config.type"
        :disabled="widget.config.disabled"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :size="widget.config.size"
        :format="widget.config.format"
        :step="widget.config.step"
        :style="{ width: widget.config.width }"
      />
    </template>
    <template v-if="widget.type === 'cascader'">
      <a-cascader
        :options="
          typeof widget.config.options === 'string'
            ? JSON.parse(widget.config.options)
            : widget.config.options
        "
        :style="{ width: widget.config.width }"
        :placeholder="widget.config.placeholder"
        :default-value="widget.config.defaultValue"
        :disabled="widget.config.disabled"
        :allow-search="widget.config.allowSearch"
        :allow-clear="widget.config.allowClear"
        :multiple="widget.config.multiple"
        :check-strictly="widget.config.checkStrictly"
        :expand-trigger="widget.config.expandTrigger"
      />
    </template>
    <template v-if="widget.type === 'textarea'">
      <a-textarea
        :placeholder="widget.config.placeholder"
        :disabled="widget.config.disabled"
        :max-length="widget.config.maxLength"
        :show-word-limit="widget.config.showWordLimit"
        :allow-clear="widget.config.allowClear"
        :auto-size="widget.config.autoSize"
        :style="{ width: widget.config.width }"
      />
    </template>
    <template v-if="widget.type === 'upload'">
      <a-upload
        :action="widget.config.action"
        :disabled="widget.config.disabled"
        :multiple="widget.config.multiple"
        :limit="widget.config.limit"
      />
    </template>

    <!-- uid display -->
    <span
      class="absolute top-0 right-0 text-blue-500 px-2 py-1 text-xs font-bold opacity-30"
      :class="{ 'opacity-100': isSelected }"
    >
      {{ widget.uid }}
    </span>

    <!-- drag handler -->
    <button
      v-show="isSelected"
      class="widget-action-icon absolute top-0 left-0 cursor-move drag-handler z-50"
    >
      <s-icon :name="DragMove" :size="16" />
    </button>
    <!-- delete -->
    <button
      v-show="isSelected"
      class="widget-action-icon absolute bottom-0 right-0 z-50"
      @click="onWidgetDelete(index)"
    >
      <s-icon :name="DeleteBinFill" :size="16" />
    </button>
  </a-form-item>
</template>

<script lang="ts" setup>
import { PropType, inject, computed, ref } from 'vue'
import { DragMove, DeleteBinFill } from '@salmon-ui/icons'
import { WidgetsConfig, FormDesignerContext, contextSymbol } from './types'

const props = defineProps({
  widget: {
    type: Object as PropType<WidgetsConfig>,
    required: true,
  },
  index: {
    type: Number,
    required: true,
  },
  parentLevelConfig: {
    type: Array as PropType<WidgetsConfig[]>,
    required: true,
  },
})

const context = inject(contextSymbol) as FormDesignerContext

const widgetsList = ref(props.parentLevelConfig)

const isSelected = computed(
  () => context.selectedWidget.value?.uid === props.widget.uid
)

const onWidgetSelect = () => {
  context.setSelectedWidget(props.widget)
}

const onWidgetDelete = (idx: number) => {
  widgetsList.value.splice(idx, 1)
}
</script>

<style lang="scss" scoped>
.widget-wrapper::before {
  z-index: 10;
}
.arco-picker {
  width: 100%;
}
.nested-widget-list {
  min-height: 32px;
  align-self: stretch;
}
</style>
