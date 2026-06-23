<template>
  <component :is="Form" class="pro-form" :model="formModel">
    <component
      :is="FormItem"
      v-for="field in schema"
      :key="field.field"
      :field="field.field"
      :label="field.label"
      :validate-status="errors[field.field] ? 'error' : undefined"
      :help="errors[field.field]"
    >
      <component
        :is="getFieldComponent(field)"
        v-bind="field.props"
        :model-value="formModel[field.field]"
        :disabled="isFieldReadonly(field)"
        :options="getFieldOptions(field)"
        :placeholder="field.placeholder"
        @update:model-value="(value: unknown) => updateField(field.field, value)"
      />
    </component>

    <div
      v-if="submitError"
      class="pro-form__submit-error"
      data-testid="pro-form-submit-error"
      role="alert"
    >
      {{ submitError }}
    </div>

    <div v-if="!hideActions && !readonly" class="pro-form__actions">
      <component
        :is="Button"
        type="primary"
        :loading="submitLoading"
        @click="submit"
      >
        {{ submitText }}
      </component>
      <component :is="Button" @click="reset">
        {{ resetText }}
      </component>
    </div>
  </component>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { adminUi } from '@/components/pro-ui'
import type {
  ProFormExpose,
  ProFormField,
  ProFormOption,
  ProFormSubmitErrorPayload,
} from './types'

const { Button, Form, FormItem, Input, Select } = adminUi

interface ProFormComponentProps {
  schema: ProFormField[]
  modelValue?: Record<string, unknown>
  readonly?: boolean
  submitText?: string
  resetText?: string
  hideActions?: boolean
  submitErrorText?: string
  submitter?: (values: Record<string, unknown>) => void | Promise<void>
}

const props = withDefaults(defineProps<ProFormComponentProps>(), {
  modelValue: () => ({}),
  readonly: false,
  submitText: '提交',
  resetText: '重置',
  hideActions: false,
  submitErrorText: '提交失败，请稍后重试',
  submitter: undefined,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, unknown>): void
  (event: 'submit', value: Record<string, unknown>): void
  (event: 'submitFailed', errors: Record<string, string>): void
  (event: 'submitError', payload: ProFormSubmitErrorPayload): void
  (event: 'reset', value: Record<string, unknown>): void
}>()

const formModel = reactive<Record<string, unknown>>({})
const errors = reactive<Record<string, string>>({})
const optionMap = reactive<Record<string, ProFormOption[]>>({})
const submitLoading = ref(false)
const submitError = ref('')

const getDefaultValues = () =>
  props.schema.reduce<Record<string, unknown>>((collector, field) => {
    collector[field.field] =
      props.modelValue[field.field] ?? field.defaultValue ?? undefined
    return collector
  }, {})

const syncValues = (values: Record<string, unknown>) => {
  Object.keys(formModel).forEach((key) => {
    delete formModel[key]
  })
  Object.assign(formModel, values)
}

const clearErrors = () => {
  Object.keys(errors).forEach((key) => {
    delete errors[key]
  })
}

const clearSubmitError = () => {
  submitError.value = ''
}

const getValues = () => ({ ...formModel })

const setValues = (values: Record<string, unknown>) => {
  clearSubmitError()
  Object.assign(formModel, values)
  emit('update:modelValue', getValues())
}

const isEmptyValue = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

const validateField = async (field: ProFormField) => {
  const value = formModel[field.field]
  const rules = field.rules || []

  const requiredRule = rules.find(
    (rule) => rule.required && isEmptyValue(value)
  )
  if (requiredRule) {
    return requiredRule.message || `${field.label}不能为空`
  }

  const validatorMessages = await Promise.all(
    rules
      .filter((rule) => rule.validator)
      .map((rule) => rule.validator?.(value, getValues()))
  )

  return validatorMessages.find((message) => message) || ''
}

const validate = async () => {
  clearErrors()

  await Promise.all(
    props.schema.map(async (field) => {
      const message = await validateField(field)
      if (message) {
        errors[field.field] = message
      }
    })
  )

  return !Object.keys(errors).length
}

const submit = async () => {
  submitLoading.value = true
  clearSubmitError()
  const valid = await validate()
  if (!valid) {
    submitLoading.value = false
    emit('submitFailed', { ...errors })
    return false
  }

  const values = getValues()
  try {
    await props.submitter?.(values)
    emit('submit', values)
    return true
  } catch (error) {
    const payload = {
      error,
      message: props.submitErrorText,
      values,
    }
    submitError.value = payload.message
    emit('submitError', payload)
    return false
  } finally {
    submitLoading.value = false
  }
}

const reset = () => {
  clearErrors()
  clearSubmitError()
  syncValues(getDefaultValues())
  emit('update:modelValue', getValues())
  emit('reset', getValues())
}

const updateField = (field: string, value: unknown) => {
  formModel[field] = value
  delete errors[field]
  clearSubmitError()
  emit('update:modelValue', getValues())
}

const getFieldComponent = (field: ProFormField) => {
  if (field.type === 'select') {
    return Select
  }
  return Input
}

const isFieldReadonly = (field: ProFormField) =>
  props.readonly || Boolean(field.readonly)

const getFieldOptions = (field: ProFormField) =>
  field.type === 'select'
    ? optionMap[field.field] || field.options || []
    : undefined

const loadAsyncOptions = async () => {
  await Promise.all(
    props.schema
      .filter((field) => field.type === 'select' && field.loadOptions)
      .map(async (field) => {
        if (field.loadOptions) {
          optionMap[field.field] = await field.loadOptions()
        }
      })
  )
}

watch(
  () => props.modelValue,
  () => {
    syncValues(getDefaultValues())
  },
  { deep: true }
)

syncValues(getDefaultValues())

onMounted(() => {
  loadAsyncOptions()
})

defineExpose<ProFormExpose>({
  submit,
  reset,
  validate,
  getValues,
  setValues,
})
</script>

<style scoped>
.pro-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.pro-form__submit-error {
  width: 100%;
  color: #c92a2a;
  font-size: 14px;
  line-height: 22px;
}
</style>
