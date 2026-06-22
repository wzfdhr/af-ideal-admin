<template>
  <div class="dict-select">
    <component
      :is="Select"
      :model-value="modelValue"
      :options="options"
      :loading="loading"
      :disabled="disabled"
      :placeholder="placeholder"
      @update:model-value="(value: unknown) => emit('update:modelValue', value)"
    />
    <span v-if="error" class="dict-select__error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { adminUi } from '@/components/pro-ui'
import { dictionaryService, type DictionaryOption } from '@/services/dictionary'

const { Select } = adminUi

const props = withDefaults(
  defineProps<{
    dictKey: string
    modelValue?: unknown
    disabled?: boolean
    placeholder?: string
  }>(),
  {
    modelValue: undefined,
    disabled: false,
    placeholder: '请选择',
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: unknown): void
  (event: 'loaded', options: DictionaryOption[]): void
  (event: 'loadError', message: string): void
}>()

const options = ref<DictionaryOption[]>([])
const loading = ref(false)
const error = ref('')

const loadOptions = async () => {
  loading.value = true
  error.value = ''

  try {
    options.value = await dictionaryService.getOptions(props.dictKey)
    emit('loaded', options.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '字典加载失败'
    emit('loadError', error.value)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.dictKey,
  () => {
    loadOptions()
  }
)

onMounted(() => {
  loadOptions()
})
</script>
