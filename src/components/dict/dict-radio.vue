<template>
  <div class="dict-radio">
    <component
      :is="RadioGroup"
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="(value: unknown) => emit('update:modelValue', value)"
    >
      <component
        :is="Radio"
        v-for="option in options"
        :key="String(option.value)"
        :value="option.value"
        :disabled="disabled || option.disabled"
      >
        {{ option.label }}
      </component>
    </component>
    <span v-if="loading" class="dict-radio__loading">加载中...</span>
    <span v-if="error" class="dict-radio__error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { adminUi } from '@/components/pro-ui'
import { dictionaryService, type DictionaryOption } from '@/services/dictionary'

const { Radio, RadioGroup } = adminUi

const props = withDefaults(
  defineProps<{
    dictKey: string
    modelValue?: unknown
    disabled?: boolean
  }>(),
  {
    modelValue: undefined,
    disabled: false,
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
