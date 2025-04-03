<template>
  <a-form :model="config" layout="vertical" class="config-panel">
    <radio-config
      v-if="config.type === 'radio'"
      v-model:widgetConfig="config"
    />
    <inputnumber-config
      v-if="config.type === 'inputNumber'"
      v-model:widgetConfig="config"
    />
    <slider-config
      v-if="config.type === 'slider'"
      v-model:widgetConfig="config"
    />
    <switch-config
      v-if="config.type === 'switch'"
      v-model:widgetConfig="config"
    />
    <cascader-config
      v-if="config.type === 'cascader'"
      v-model:widgetConfig="config"
    />
    <textarea-config
      v-if="config.type === 'textarea'"
      v-model:widgetConfig="config"
    />
    <date-picker-config
      v-if="config.type === 'date-picker'"
      v-model:widgetConfig="config"
    />
    <checkbox-config
      v-if="config.type === 'checkbox'"
      v-model:widgetConfig="config"
    />
    <rate-config v-if="config.type === 'rate'" v-model:widgetConfig="config" />
    <time-picker-config
      v-if="config.type === 'time-picker'"
      v-model:widgetConfig="config"
    />
    <upload-config
      v-if="config.type === 'upload'"
      v-model:widgetConfig="config"
    />
    <grid-config v-if="config.type === 'grid'" v-model:widgetConfig="config" />
    <tab-config v-if="config.type === 'tab'" v-model:widgetConfig="config" />
    <input-config
      v-if="config.type === 'input'"
      v-model:widgetConfig="config"
    />
    <InputTagConfig
      v-if="config.type === 'inputTag'"
      v-model:widgetConfig="config"
    />
    <select-config
      v-if="config.type === 'select'"
      v-model:widgetConfig="config"
    />
    <a-collapse class="ast-pre">
      <a-collapse-item key="json" header="控件配置 JSON">
        <pre>{{ config }}</pre>
      </a-collapse-item>
    </a-collapse>
  </a-form>
</template>

<script lang="ts" setup>
import { PropType, computed } from 'vue'
import { WidgetsConfig } from './types'
import checkboxConfig from './config/checkbox-config.vue'
import inputnumberConfig from './config/inputnumber-config.vue'
import RadioConfig from './config/radio-config.vue'
import SliderConfig from './config/slider-config.vue'
import SwitchConfig from './config/switch-config.vue'
import CascaderConfig from './config/cascader-config.vue'
import TextareaConfig from './config/textarea-config.vue'
import DatePickerConfig from './config/date-picker-config.vue'
import RateConfig from './config/rate-config.vue'
import TimePickerConfig from './config/time-picker-config.vue'
import UploadConfig from './config/upload-config.vue'
import GridConfig from './config/grid-config.vue'
import TabConfig from './config/tab-config.vue'
import InputConfig from './config/input-config.vue'
import SelectConfig from './config/select-config.vue'
import InputTagConfig from './config/inputtag-config.vue'

const props = defineProps({
  widgetConfig: {
    type: Object as PropType<WidgetsConfig>,
    required: true,
  },
})

const emit = defineEmits(['update:widgetConfig'])

const config = computed({
  get: () => props.widgetConfig,
  set: (val) => {
    emit('update:widgetConfig', val)
  },
})
</script>
