<template>
  <section v-if="canList" data-testid="form-data-source-manager">
    <h3>受控数据源</h3>
    <PermissionButton
      :permission="[
        P.create,
        DICTIONARY_PERMISSIONS.list,
        DICTIONARY_PERMISSIONS.read,
      ]"
      mode="all"
      type="primary"
      @click="create"
    >
      登记字典数据源
    </PermissionButton>
    <ProTable
      ref="table"
      row-key="id"
      :columns="columns"
      :fetch-data="fetchSources"
    />
    <p v-if="queryError" role="alert">{{ queryError }}</p>
    <div v-if="preview" data-testid="form-source-preview">
      <p>
        数据源版本 {{ preview.sourceRevision }} · 字典版本
        {{ preview.dictionaryRevision }}
      </p>
      <p v-if="!preview.options.length">当前字典没有启用选项</p>
      <ul v-else>
        <li v-for="(item, index) in preview.options" :key="index">
          {{ item.label }} ({{ String(item.value) }})
        </li>
      </ul>
    </div>
    <component
      :is="Modal"
      v-model:visible="visible"
      title="登记与维护数据源"
      :footer="false"
      data-testid="form-source-editor"
    >
      <p v-if="editorError" role="alert">{{ editorError }}</p>
      <form @submit.prevent="save">
        <label>
          名称
          <input
            v-model="model.name"
            aria-label="数据源名称"
            maxlength="100"
            :disabled="saving"
            required
          />
        </label>
        <label>
          编码
          <input
            v-model="model.code"
            aria-label="数据源编码"
            maxlength="60"
            :disabled="saving || Boolean(editing)"
            required
          />
        </label>
        <template v-if="!editing">
          <label>
            搜索字典
            <input
              v-model="dictionarySearch"
              aria-label="搜索关联字典"
              :disabled="saving"
            />
          </label>
          <button type="button" :disabled="saving" @click="loadDictionaries">
            搜索关联字典
          </button>
        </template>
        <label>
          关联字典
          <select
            v-model="model.dictionaryId"
            aria-label="关联字典"
            :disabled="saving || Boolean(editing)"
            required
          >
            <option value="">请选择字典</option>
            <option v-if="editing" :value="model.dictionaryId">
              原关联字典
            </option>
            <option
              v-for="item in dictionaries"
              :key="item.id"
              :value="item.id"
            >
              {{ item.dictName }}
            </option>
          </select>
        </label>
        <label>
          状态
          <select
            v-model="model.status"
            aria-label="数据源状态"
            :disabled="saving"
          >
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
        </label>
        <label>
          说明
          <input
            v-model="model.description"
            aria-label="数据源说明"
            maxlength="500"
            :disabled="saving"
          />
        </label>
        <button type="submit" :disabled="saving">
          {{ saving ? '保存中…' : '保存数据源' }}
        </button>
      </form>
      <button
        v-if="editing"
        type="button"
        :disabled="saving"
        @click="edit(editing)"
      >
        重新读取数据源
      </button>
    </component>
  </section>
  <p v-else>当前账号没有数据源管理权限</p>
</template>
<script setup lang="ts">
import { computed, ref, h, onBeforeUnmount, watch } from 'vue'
import { useUserStore } from '@/store'
import { adminUi } from '@/components/pro-ui'
import ProTable from '@/components/pro-table/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import {
  fetchFormDataSources,
  getFormDataSource,
  saveFormDataSource,
  queryFormDataSource,
} from '@/api/form-data-sources'
import { fetchSystemDictionaries } from '@/api/system/dictionary'
import { createCommandRetry } from '@/services/command-retry'
import { registerDirtyCheck } from '@/services/tenant-context'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import type { SystemDictionaryRecord } from '@/api/system/dictionary'
import { hasPermission } from '@af-admin/workflow-core'
import {
  FORM_DATA_SOURCE_PERMISSIONS as P,
  DICTIONARY_PERMISSIONS,
  parseFormDataSource,
} from '@af-admin/contracts'
import type { TableColumnData } from '@arco-design/web-vue'
import type { FormDataSource, FormDataSourceInput } from '@af-admin/contracts'

const user = useUserStore()
const canList = computed(() => hasPermission(user.permissions, P.list))
const { Modal, Message } = adminUi
const table = ref<ProTableExpose>()
const visible = ref(false)
const saving = ref(false)
const editing = ref('')
const editorError = ref('')
const queryError = ref('')
const dictionarySearch = ref('')
const dictionaries = ref<SystemDictionaryRecord[]>([])
const model = ref<FormDataSourceInput>({
  code: '',
  name: '',
  kind: 'dictionary',
  dictionaryId: '',
  status: 'enabled',
  description: '',
})
const preview = ref<Awaited<ReturnType<typeof queryFormDataSource>>>()
let querySequence = 0
const retry = createCommandRetry()
watch(
  () => [user.tenantId, user.id],
  () => {
    querySequence += 1
    preview.value = undefined
    visible.value = false
    editing.value = ''
    model.value = {
      code: '',
      name: '',
      kind: 'dictionary',
      dictionaryId: '',
      status: 'enabled',
      description: '',
    }
    dictionaries.value = []
    editorError.value = ''
    queryError.value = ''
    retry.clear()
    table.value?.reset({}).catch(() => {
      /* ProTable retains its own request error. */
    })
  }
)
const unregister = registerDirtyCheck(() => visible.value)
onBeforeUnmount(unregister)
const fetchSources = async (params: ProTableFetchParams) => {
  const result = await fetchFormDataSources({
    current: params.current,
    pageSize: params.pageSize,
  })
  return { ...result, list: result.list.map((source) => ({ ...source })) }
}
const loadDictionaries = async () => {
  try {
    dictionaries.value = (
      await fetchSystemDictionaries({
        current: 1,
        pageSize: 100,
        dictName: dictionarySearch.value,
        dictStatus: 'enabled',
      })
    ).list
  } catch (failure) {
    editorError.value =
      failure instanceof Error ? failure.message : '无法搜索字典'
  }
}
const create = () => {
  editing.value = ''
  retry.clear()
  editorError.value = ''
  dictionarySearch.value = ''
  model.value = {
    code: '',
    name: '',
    kind: 'dictionary',
    dictionaryId: '',
    status: 'enabled',
    description: '',
  }
  visible.value = true
  loadDictionaries()
}
const edit = async (id: string) => {
  try {
    const source = await getFormDataSource(id)
    editing.value = id
    retry.clear()
    editorError.value = ''
    model.value = {
      code: source.code,
      name: source.name,
      kind: source.kind,
      dictionaryId: source.dictionaryId,
      status: source.status,
      description: source.description,
      expectedRevision: source.revision,
    }
    visible.value = true
  } catch (failure) {
    queryError.value =
      failure instanceof Error ? failure.message : '无法读取数据源'
  }
}
const save = async () => {
  if (saving.value) return
  saving.value = true
  editorError.value = ''
  try {
    const input = parseFormDataSource(model.value, Boolean(editing.value))
    await saveFormDataSource(
      input,
      retry.key('save', input),
      editing.value || undefined
    )
    retry.complete('save')
    visible.value = false
    querySequence += 1
    preview.value = undefined
    Message.success('数据源已保存')
    await table.value?.reload()
  } catch (failure) {
    editorError.value =
      failure instanceof Error ? failure.message : '保存失败，输入已保留'
  } finally {
    saving.value = false
  }
}
const query = async (id: string) => {
  querySequence += 1
  const sequence = querySequence
  queryError.value = ''
  preview.value = undefined
  try {
    const result = await queryFormDataSource(id)
    if (sequence === querySequence) preview.value = result
  } catch (failure) {
    if (sequence !== querySequence) return
    queryError.value =
      failure instanceof Error ? failure.message : '查询失败，请重试'
  }
}
const action = (label: string, permissions: string[], run: () => void) =>
  h(
    PermissionButton,
    { permission: permissions, mode: 'all', type: 'text', onClick: run },
    { default: () => label }
  )
const columns: TableColumnData[] = [
  { title: '名称', dataIndex: 'name' },
  { title: '编码', dataIndex: 'code' },
  {
    title: '状态',
    render: ({ record }) => (record.status === 'enabled' ? '启用' : '停用'),
  },
  { title: '版本', dataIndex: 'revision' },
  {
    title: '操作',
    render: ({ record }) =>
      h('div', {}, [
        action(
          '维护数据源',
          [P.list, P.update, DICTIONARY_PERMISSIONS.read],
          () => edit((record as FormDataSource).id)
        ),
        action('查询预览', [P.read, DICTIONARY_PERMISSIONS.read], () =>
          query((record as FormDataSource).id)
        ),
      ]),
  },
]
</script>
<style scoped>
form {
  display: grid;
  gap: 12px;
}
label {
  display: grid;
  gap: 4px;
}
input,
select {
  padding: 6px 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
}
button {
  padding: 6px 12px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  background: var(--color-fill-2);
}
</style>
