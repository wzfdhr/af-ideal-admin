<template>
  <a-form
    ref="formRef"
    :model="data"
    :size="ast.formConfig.size"
    :layout="ast.formConfig.layout"
    :label-align="ast.formConfig.labelAlign"
  >
    <template v-for="(item, i) in ast.widgetsConfig" :key="i">
      <widget-renderer v-if="item !== undefined" :widget="item" />
    </template>
  </a-form>
</template>

<script lang="ts" setup>
import { computed, ref, provide, PropType, watch } from 'vue'
import type {
  VersionedFormSchema,
  WidgetsConfig,
} from '@/components/form-designer/schema'
import WidgetRenderer from './renderer/index.vue'
import {
  formData,
  formDataSources,
  type FormRuntimeData,
} from './renderer/use-form-preview'

type FormInstanceLike = {
  validate?: () => Promise<unknown> | unknown
}

const readDefaultValue = (widget: WidgetsConfig) => {
  if ('defaultValue' in widget.config) {
    return widget.config.defaultValue
  }

  if ('defaultChecked' in widget.config) {
    return widget.config.defaultChecked
  }

  return undefined
}

const createInitialFormData = (widgets: WidgetsConfig[]) => {
  const values: FormRuntimeData = {}

  widgets.forEach((widget) => {
    if (widget.type === 'grid') {
      widget.cols.forEach((col) => {
        Object.assign(values, createInitialFormData(col.widgets))
      })
      return
    }

    if (widget.type === 'tab') {
      widget.panes.forEach((pane) => {
        Object.assign(values, createInitialFormData(pane.widgets))
      })
      return
    }

    const defaultValue = readDefaultValue(widget)
    if (defaultValue !== undefined) {
      values[widget.uid] = defaultValue
    }
  })

  return values
}

const props = defineProps({
  ast: {
    type: Object as PropType<VersionedFormSchema>,
    required: true,
  },
})

const emit = defineEmits<{
  (event: 'submit', values: FormRuntimeData): void
}>()

const formRef = ref<FormInstanceLike>()
const data = ref<FormRuntimeData>(
  createInitialFormData(props.ast.widgetsConfig)
)

watch(
  () => props.ast.widgetsConfig,
  (widgets) => {
    data.value = createInitialFormData(widgets)
  },
  { deep: true }
)

provide(formData, data)
provide(
  formDataSources,
  computed(() => props.ast.dataSources)
)

const getValues = () => ({ ...data.value })

const validate = async () => {
  const result = await formRef.value?.validate?.()
  return result === undefined || result === true
}

const submit = async () => {
  const valid = await validate()

  if (valid) {
    emit('submit', getValues())
  }

  return valid
}

defineExpose({
  data,
  getValues,
  submit,
  validate,
})
</script>
