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
import { formFieldState } from '@af-admin/contracts'
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
  modelValue: { type: Object as PropType<FormRuntimeData>, default: undefined },
})

const emit = defineEmits<{
  (event: 'submit', values: FormRuntimeData): void
  (event: 'update:modelValue', values: FormRuntimeData): void
}>()

const formRef = ref<FormInstanceLike>()
const initialValues = () =>
  props.modelValue === undefined
    ? createInitialFormData(props.ast.widgetsConfig)
    : { ...props.modelValue }
const data = ref<FormRuntimeData>(initialValues())

watch(
  () => props.ast.widgetsConfig,
  () => {
    data.value = initialValues()
  },
  { deep: true }
)
watch(
  () => props.modelValue,
  (values) => {
    if (values && JSON.stringify(values) !== JSON.stringify(data.value))
      data.value = { ...values }
  },
  { deep: true }
)
watch(
  data,
  (values) => {
    if (props.ast.version === 2) {
      props.ast.widgetsConfig.forEach((widget) => {
        if (
          'behavior' in widget.config &&
          !formFieldState(widget.config, values).visible
        )
          delete values[widget.uid]
      })
    }
    emit('update:modelValue', { ...values })
  },
  { deep: true, immediate: true }
)

provide(formData, data)
provide(
  formDataSources,
  computed(() => props.ast.dataSources)
)

const getValues = () => ({ ...data.value })
const setValues = (values: FormRuntimeData) => {
  data.value = { ...values }
}

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
  setValues,
  submit,
  validate,
})
</script>
