<template>
  <component
    :is="Modal"
    data-testid="dictionary-options-modal"
    :visible="visible"
    :width="720"
    title="字典选项"
    :footer="false"
    @cancel="close"
  >
    <p>按显示顺序维护选项。停用项不会出现在运行选项中。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading">正在读取字典选项…</p>
    <template v-else-if="dictionary">
      <p>{{ dictionary.dictName }} · 版本 {{ dictionary.revision }}</p>
      <div class="dictionary-options-list">
        <div
          v-for="(item, index) in items"
          :key="item.key"
          class="dictionary-option"
          :data-testid="`dictionary-option-${index}`"
        >
          <label>
            标签
            <input
              v-model="item.label"
              :aria-label="`选项${index + 1}标签`"
              maxlength="100"
              :disabled="saving"
            />
          </label>
          <label>
            类型
            <select
              v-model="item.type"
              :aria-label="`选项${index + 1}类型`"
              :disabled="saving"
            >
              <option value="string">文字</option>
              <option value="number">数字</option>
              <option value="boolean">布尔</option>
            </select>
          </label>
          <label v-if="item.type === 'boolean'">
            值
            <select
              v-model="item.value"
              :aria-label="`选项${index + 1}值`"
              :disabled="saving"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label v-else>
            值
            <input
              v-model="item.value"
              :aria-label="`选项${index + 1}值`"
              maxlength="100"
              :disabled="saving"
            />
          </label>
          <label class="dictionary-option__disabled">
            <input v-model="item.disabled" type="checkbox" :disabled="saving" />
            停用
          </label>
          <button
            type="button"
            :disabled="saving"
            @click="items.splice(index, 1)"
          >
            移除选项 {{ index + 1 }}
          </button>
        </div>
      </div>
      <button
        type="button"
        :disabled="saving || items.length >= 200"
        @click="add"
      >
        添加选项
      </button>
      <button type="button" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存选项' }}
      </button>
      <button type="button" :disabled="saving" @click="load">
        重新读取选项
      </button>
      <button type="button" :disabled="saving" @click="preview">
        刷新运行选项
      </button>
      <p v-if="previewText" data-testid="dictionary-runtime-options">
        {{ previewText }}
      </p>
    </template>
  </component>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { adminUi } from '@/components/pro-ui'
import {
  getSystemDictionaryDetail,
  updateDictionaryItems,
} from '@/api/system/dictionary'
import { dictionaryService } from '@/services/dictionary'
import { createCommandRetry } from '@/services/command-retry'
import { registerDirtyCheck } from '@/services/tenant-context'
import type { SystemDictionaryRecord } from '@/api/system/dictionary'
import { parseDictionaryItems } from '@af-admin/contracts'

const props = defineProps<{ visible: boolean; id: string }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'saved'): void }>()
const { Modal, Message } = adminUi
const dictionary = ref<SystemDictionaryRecord>()
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const previewText = ref('')
const baseline = ref('')
interface Item {
  key: string
  label: string
  type: string
  value: string
  disabled: boolean
}
const items = ref<Item[]>([])
const retry = createCommandRetry()
const changed = () =>
  props.visible && JSON.stringify(items.value) !== baseline.value
const unregister = registerDirtyCheck(changed)
onBeforeUnmount(unregister)
const close = () => {
  if (
    !saving.value &&
    (!changed() || window.confirm('选项尚未保存，确认关闭？'))
  )
    emit('close')
}
let loadGeneration = 0
const load = async () => {
  const generation = ++loadGeneration
  const { id } = props
  if (changed() && !window.confirm('重新读取会覆盖本地选项，确认继续？')) return
  loading.value = true
  error.value = ''
  previewText.value = ''
  try {
    const detail = await getSystemDictionaryDetail(id)
    if (generation !== loadGeneration || props.id !== id || !props.visible)
      return
    dictionary.value = detail
    items.value = (dictionary.value.items || []).map((item) => ({
      key: crypto.randomUUID(),
      label: item.label,
      type: typeof item.value,
      value: String(item.value),
      disabled: item.disabled,
    }))
    baseline.value = JSON.stringify(items.value)
    retry.clear()
  } catch (failure) {
    if (generation !== loadGeneration || props.id !== id || !props.visible)
      return
    error.value =
      failure instanceof Error ? failure.message : '读取失败，请重试'
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}
watch(
  () => [props.visible, props.id],
  () => {
    if (props.visible) {
      items.value = []
      baseline.value = '[]'
      dictionary.value = undefined
      load()
    }
  }
)
const add = () =>
  items.value.push({
    key: crypto.randomUUID(),
    label: '',
    type: 'string',
    value: '',
    disabled: false,
  })
const itemValue = (item: Item) => {
  if (item.type === 'boolean') return item.value === 'true'
  if (item.type === 'number')
    return item.value.trim() === '' ? null : Number(item.value)
  return item.value
}
const save = async () => {
  if (!dictionary.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    if (
      items.value.some(
        (item) =>
          item.type === 'boolean' && !['true', 'false'].includes(item.value)
      )
    )
      throw new Error('布尔值须明确选择 true 或 false')
    const input = parseDictionaryItems({
      expectedRevision: dictionary.value.revision,
      items: items.value.map((item) => ({
        label: item.label,
        value: itemValue(item),
        disabled: item.disabled,
      })),
    })
    dictionary.value = await updateDictionaryItems(
      props.id,
      input.expectedRevision,
      input.items,
      retry.key('items', input)
    )
    retry.complete('items')
    baseline.value = JSON.stringify(items.value)
    dictionaryService.clear(dictionary.value.dictType)
    previewText.value = ''
    Message.success('选项已保存')
    emit('saved')
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : '保存失败，输入已保留'
  } finally {
    saving.value = false
  }
}
const preview = async () => {
  if (!dictionary.value) return
  error.value = ''
  try {
    const options = await dictionaryService.getOptions(
      dictionary.value.dictType,
      true
    )
    const labels = options.map(
      (item) => `${item.label} (${String(item.value)})`
    )
    previewText.value = labels.length ? labels.join('、') : '暂无启用选项'
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : '运行选项读取失败'
  }
}
</script>
<style scoped>
.dictionary-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.dictionary-option label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dictionary-option .dictionary-option__disabled {
  flex-direction: row;
  align-items: center;
}
.dictionary-options-list {
  max-height: 50vh;
  overflow-y: auto;
  padding: 8px 0;
}
input:not([type='checkbox']),
select {
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
}
button {
  margin: 4px;
  padding: 4px 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  white-space: nowrap;
  background: var(--color-fill-2);
}
@media (max-width: 760px) {
  .dictionary-option {
    grid-template-columns: minmax(0, 1fr) 96px;
  }
}
</style>
