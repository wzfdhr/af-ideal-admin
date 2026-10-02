<template>
  <div class="registered-source-picker">
    <label>
      选项来源
      <select
        :value="widget.config.optionsType"
        aria-label="受控选项来源"
        @change="changeMode"
      >
        <option value="fixed">固定值</option>
        <option
          v-if="canBind || widget.config.optionsType === 'registered'"
          value="registered"
        >
          登记数据源
        </option>
      </select>
    </label>
    <template v-if="widget.config.optionsType === 'registered'">
      <label>
        选择数据源
        <select :value="selectedId" aria-label="绑定登记数据源" @change="bind">
          <option value="">请选择</option>
          <option v-for="source in sources" :key="source.id" :value="source.id">
            {{ source.name }} · {{ source.code }}
          </option>
        </select>
      </label>
      <button type="button" @click="load">刷新数据源列表</button>
      <p>发布时固定选择集合；停用或移除的选项不能用于新的业务提交。</p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed, inject, ref, onMounted, watch } from 'vue'
import { useUserStore } from '@/store'
import { fetchFormDataSources } from '@/api/form-data-sources'
import {
  FORM_DATA_SOURCE_PERMISSIONS as P,
  DICTIONARY_PERMISSIONS,
} from '@af-admin/contracts'
import { hasPermission } from '@af-admin/workflow-core'
import { contextSymbol } from './types'
import type { FormDesignerContext, IConfigSelect, IConfigRadio } from './types'
import type { FormDataSource } from '@af-admin/contracts'

const props = defineProps<{ widget: IConfigSelect | IConfigRadio }>()
const widget = computed(() => props.widget)
const user = useUserStore()
const canBind = computed(() =>
  [P.list, P.read, DICTIONARY_PERMISSIONS.read].every((code) =>
    hasPermission(user.permissions, code)
  )
)
const ctx = inject<FormDesignerContext>(contextSymbol)
const sources = ref<FormDataSource[]>([])
const error = ref('')
const selectedId = computed(
  () =>
    ctx?.ast.value.dataSources.find(
      (source) => source.key === widget.value.config.optionsSourceKey
    )?.registryId || ''
)
const load = async () => {
  error.value = ''
  if (!canBind.value) return
  try {
    sources.value = (
      await fetchFormDataSources({ current: 1, pageSize: 100 })
    ).list.filter((source) => source.status === 'enabled')
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : '数据源列表读取失败'
  }
}
onMounted(load)
watch(
  () => [user.tenantId, user.id],
  () => {
    sources.value = []
    error.value = ''
    load()
  }
)
const prune = () => {
  if (!ctx) return
  ctx.ast.value.dataSources = ctx.ast.value.dataSources.filter(
    (source) =>
      source.kind !== 'registered' ||
      ctx.ast.value.widgetsConfig.some(
        (field) =>
          (field.type === 'select' || field.type === 'radio') &&
          field.config.optionsType === 'registered' &&
          field.config.optionsSourceKey === source.key
      )
  )
}
const changeMode = (event: Event) => {
  const mode = (event.target as HTMLSelectElement).value
  widget.value.config.optionsType =
    mode === 'registered' ? 'registered' : 'fixed'
  delete widget.value.config.optionsUrl
  if (mode === 'fixed') {
    delete widget.value.config.optionsSourceKey
    prune()
  }
}
const bind = (event: Event) => {
  if (!ctx) return
  const source = sources.value.find(
    (item) => item.id === (event.target as HTMLSelectElement).value
  )
  if (!source) {
    delete widget.value.config.optionsSourceKey
    prune()
    return
  }
  const ast = ctx.ast.value as typeof ctx.ast.value & { version: number }
  ast.version = 2
  widget.value.config.optionsType = 'registered'
  widget.value.config.optionsSourceKey = source.code
  widget.value.config.options = []
  delete widget.value.config.optionsUrl
  if (!ast.dataSources.some((item) => item.key === source.code))
    ast.dataSources.push({
      key: source.code,
      name: source.name,
      kind: 'registered',
      registryId: source.id,
    })
  prune()
}
</script>
<style scoped>
label {
  display: grid;
  gap: 4px;
  margin: 8px 0;
}
select,
button {
  padding: 6px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
  max-width: 100%;
}
p {
  font-size: 12px;
}
</style>
