<template>
  <a-form-item
    :label="widget.config.label || widget.name"
    :required="widget.config.required"
    :field="widget.uid"
    :rules="computedRules(widget.config.rules)"
    :validate-trigger="widget.config.trigger"
  >
    <template v-if="widget.type === 'input'">
      <a-input
        v-model="ctx[widget.uid]"
        :default-value="widget.config.defaultValue"
        :placeholder="widget.config.placeholder"
        :allow-clear="widget.config.allowClear"
        :max-length="widget.config.maxLength"
        :show-word-limit="widget.config.showWordLimit"
        :readonly="widget.config.readonly"
        :disabled="widget.config.disabled"
        :style="{ width: widget.config.width }"
      />
    </template>
    <template v-if="widget.type === 'inputNumber'">
      <a-input-number
        v-model="ctx[widget.uid]"
        :default-value="widget.config.defaultValue"
        :placeholder="widget.config.placeholder"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :disabled="widget.config.disabled"
        :error="widget.config.error"
        :size="widget.config.size"
        :step="widget.config.step"
        :precision="widget.config.precision"
      />
    </template>
    <template v-if="widget.type === 'checkbox'">
      <a-checkbox-group
        v-model="ctx[widget.uid]"
        :default-value="widget.config.defaultValue"
        :disabled="widget.config.disabled"
        :direction="widget.config.direction"
        :indeterminate="widget.config.indeterminate"
        :max="widget.config.max"
      >
        <template v-if="widget.config.optionsType === 'fixed'">
          <template v-for="(item, i) in widget.config.options" :key="i">
            <a-checkbox :value="item.value">
              {{ item.label }}
            </a-checkbox>
          </template>
        </template>
        <template v-else>
          <template v-for="(item, i) in remoteData" :key="i">
            <a-checkbox :value="item.value">
              {{ item.label }}
            </a-checkbox>
          </template>
        </template>
      </a-checkbox-group>
    </template>
    <template v-if="widget.type === 'select'">
      <a-select
        v-model="ctx[widget.uid]"
        :allow-clear="widget.config.allowClear"
        :allow-create="widget.config.allowCreate"
        :allow-search="widget.config.allowSearch"
        :default-value="widget.config.defaultValue"
        :disabled="widget.config.disabled"
        :multiple="widget.config.limit !== undefined && widget.config.limit > 0"
        :limit="widget.config.limit"
        :placeholder="widget.config.placeholder"
        :style="{ width: widget.config.width }"
      >
        <template v-if="widget.config.optionsType === 'fixed'">
          <a-option
            v-for="(opt, i) in widget.config.options"
            :key="i"
            :value="opt.value"
          >
            {{ opt.label }}
          </a-option>
        </template>
        <template v-else>
          <a-option v-for="(opt, i) in remoteData" :key="i" :value="opt.value">
            {{ opt.label }}
          </a-option>
        </template>
      </a-select>
    </template>
    <template v-if="widget.type === 'radio'">
      <a-radio-group
        v-model="ctx[widget.uid]"
        :direction="widget.config.direction"
        :default-value="widget.config.defaultValue"
        :type="widget.config.type"
        :disabled="widget.config.disabled"
      >
        <template v-if="widget.config.optionsType === 'fixed'">
          <a-radio
            v-for="(item, i) in widget.config.options"
            :key="i"
            :value="item.value"
          >
            {{ item.label }}
          </a-radio>
        </template>
        <template v-else>
          <a-option v-for="(opt, i) in remoteData" :key="i" :value="opt.value">
            {{ opt.label }}
          </a-option>
        </template>
      </a-radio-group>
    </template>
    <template v-if="widget.type === 'slider'">
      <a-slider
        v-model="ctx[widget.uid]"
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
    <template v-if="widget.type === 'switch'">
      <a-switch
        v-model="ctx[widget.uid]"
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
        v-model="ctx[widget.uid]"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-week-picker
        v-else-if="widget.config.modeSelection === 'week'"
        v-model="ctx[widget.uid]"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-month-picker
        v-else-if="widget.config.modeSelection === 'month'"
        v-model="ctx[widget.uid]"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-quarter-picker
        v-else-if="widget.config.modeSelection === 'quarter'"
        v-model="ctx[widget.uid]"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-year-picker
        v-else-if="widget.config.modeSelection === 'year'"
        v-model="ctx[widget.uid]"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-range-picker
        v-else-if="widget.config.modeSelection === 'date-range'"
        v-model="ctx[widget.uid]"
        :allow-clear="widget.config.allowClear"
        :readonly="widget.config.readonly"
        :error="widget.config.error"
        :disabled="widget.config.disabled"
        :show-time="widget.config.showTime"
        :style="{ width: widget.config.width }"
      />
      <a-range-picker
        v-else-if="widget.config.modeSelection === 'week-range'"
        v-model="ctx[widget.uid]"
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
        v-model="ctx[widget.uid]"
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
        v-model="ctx[widget.uid]"
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
        v-model="ctx[widget.uid]"
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
        v-model="ctx[widget.uid]"
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
        v-model="ctx[widget.uid]"
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
        v-model="ctx[widget.uid]"
        :options="
          typeof widget.config.options === 'string'
            ? JSON.parse(widget.config.options)
            : widget.config.options
        "
        :placeholder="widget.config.placeholder"
        :default-value="widget.config.defaultValue"
        :disabled="widget.config.disabled"
        :allow-search="widget.config.allowSearch"
        :allow-clear="widget.config.allowClear"
        :multiple="widget.config.multiple"
        :check-strictly="widget.config.checkStrictly"
        :expand-trigger="widget.config.expandTrigger"
        :style="{ width: widget.config.width }"
      />
    </template>
    <template v-if="widget.type === 'textarea'">
      <a-textarea
        v-model="ctx[widget.uid]"
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
        v-model="ctx[widget.uid]"
        :action="widget.config.action"
        :disabled="widget.config.disabled"
        :multiple="widget.config.multiple"
        :limit="widget.config.limit"
      />
    </template>
  </a-form-item>
</template>

<script lang="ts" setup>
import { ref, PropType, inject, nextTick } from 'vue'
import axios from 'axios'
import type {
  WidgetsConfig,
  IConfigTab,
  IConfigGrid,
} from '@/components/form-designer/types'
import { formData } from './use-form-preview'

const props = defineProps({
  widget: {
    type: Object as PropType<Exclude<WidgetsConfig, IConfigTab | IConfigGrid>>,
    required: true,
  },
})

const ctx = inject(formData) as any

const remoteData = ref<any>()

nextTick(() => {
  if (
    props.widget.type === 'select' ||
    props.widget.type === 'checkbox' ||
    props.widget.type === 'radio' ||
    props.widget.type === 'cascader'
  ) {
    console.log(props.widget.config)
    if (
      props.widget.config.optionsType === 'remote' &&
      props.widget.config.optionsUrl
    ) {
      axios
        .get(props.widget.config.optionsUrl)
        .then((res) => {
          remoteData.value = res.data
        })
        .catch((err) => {
          console.log(err)
        })
    }
  }
})

const computedRules = (rules?: string) => {
  let result
  try {
    if (rules && rules.trim() !== '') {
      // disable no-eval temporarily
      // eslint-disable-next-line no-eval
      result = eval(rules)
    }
  } catch (e) {
    // do nothing
  }
  return result
}
</script>
