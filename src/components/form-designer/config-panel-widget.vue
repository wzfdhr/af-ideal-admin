<template>
  <a-form :model="config" layout="vertical" class="config-panel">
    <radio-config
      v-if="config.type === 'radio'"
      v-model:widget-config="config"
    />
    <inputnumber-config
      v-if="config.type === 'inputNumber'"
      v-model:widget-config="config"
    />
    <slider-config
      v-if="config.type === 'slider'"
      v-model:widget-config="config"
    />
    <switch-config
      v-if="config.type === 'switch'"
      v-model:widget-config="config"
    />
    <cascader-config
      v-if="config.type === 'cascader'"
      v-model:widget-config="config"
    />
    <textarea-config
      v-if="config.type === 'textarea'"
      v-model:widget-config="config"
    />
    <date-picker-config
      v-if="config.type === 'date-picker'"
      v-model:widget-config="config"
    />
    <checkbox-config
      v-if="config.type === 'checkbox'"
      v-model:widget-config="config"
    />
    <rate-config v-if="config.type === 'rate'" v-model:widget-config="config" />
    <time-picker-config
      v-if="config.type === 'time-picker'"
      v-model:widget-config="config"
    />
    <upload-config
      v-if="config.type === 'upload'"
      v-model:widget-config="config"
    />
    <grid-config v-if="config.type === 'grid'" v-model:widget-config="config" />
    <tab-config v-if="config.type === 'tab'" v-model:widget-config="config" />
    <input-config
      v-if="config.type === 'input'"
      v-model:widget-config="config"
    />
    <InputTagConfig
      v-if="config.type === 'inputTag'"
      v-model:widget-config="config"
    />
    <select-config
      v-if="config.type === 'select'"
      v-model:widget-config="config"
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
