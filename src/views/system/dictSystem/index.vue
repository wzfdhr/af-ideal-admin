<template>
  <main class="dict-system-page px-6">
    <s-navs :navs="['menu.system', 'menu.system.dict']" />

    <section class="s-section dict-system-page__query">
      <ProForm
        ref="queryFormRef"
        :schema="querySchema"
        submit-text="搜索"
        reset-text="重置"
        @submit="handleSearch"
        @reset="handleReset"
      />
      <PermissionButton
        type="primary"
        :permission="SYSTEM_DICT_PERMISSIONS.create"
        @click="openCreate"
      >
        新增字典
      </PermissionButton>
    </section>

    <section class="s-section">
      <ProTable
        ref="tableRef"
        row-key="id"
        :columns="columns"
        :fetch-data="fetchDictionaryData"
      />
    </section>

    <component
      :is="Modal"
      v-model:visible="editorVisible"
      data-testid="dict-editor-modal"
      :title="editorTitle"
      @before-ok="submitEditor"
    >
      <p v-if="editorError" role="alert">{{ editorError }}</p>
      <ProForm
        ref="editorFormRef"
        v-model="editorModel"
        :schema="editorSchema"
        :submitter="saveDictionary"
        hide-actions
      />
    </component>

    <component
      :is="Modal"
      v-model:visible="detailVisible"
      data-testid="dict-detail-modal"
      title="字典详情"
      :footer="false"
    >
      <a-descriptions v-if="detailRecord" :column="1" bordered>
        <a-descriptions-item label="字典名称">
          {{ detailRecord.dictName }}
        </a-descriptions-item>
        <a-descriptions-item label="字典类型">
          {{ detailRecord.dictType }}
        </a-descriptions-item>
        <a-descriptions-item label="字典状态">
          {{ getStatusLabel(detailRecord.dictStatus) }}
        </a-descriptions-item>
        <a-descriptions-item label="描述">
          {{ detailRecord.description || '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="更新时间">
          {{ detailRecord.updatedAt }}
        </a-descriptions-item>
      </a-descriptions>
    </component>

    <component
      :is="Modal"
      v-model:visible="deleteVisible"
      data-testid="dict-delete-modal"
      title="删除字典"
      @before-ok="confirmDelete"
    >
      <p>
        确认删除字典
        <strong>{{ pendingDeleteRecord?.dictName }}</strong>
        吗？{{
          realMode
            ? '删除后该类型不能重新创建，历史记录保留。'
            : '删除后将无法在当前 Mock 数据中恢复。'
        }}
      </p>
    </component>
    <DictionaryItemsEditor
      v-if="realMode"
      :id="itemsId"
      :visible="itemsVisible"
      @close="itemsVisible = false"
      @saved="tableRef?.reload()"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onBeforeUnmount, ref } from 'vue'
import { createCommandRetry } from '@/services/command-retry'
import { registerDirtyCheck } from '@/services/tenant-context'
import DictionaryItemsEditor from '@/components/dictionary-items-editor.vue'
import ProForm from '@/components/pro-form/index.vue'
import ProTable from '@/components/pro-table/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import { adminUi } from '@/components/pro-ui'
import { dictionaryService } from '@/services/dictionary'
import {
  createSystemDictionary,
  deleteSystemDictionary,
  fetchSystemDictionaries,
  getSystemDictionaryDetail,
  SYSTEM_DICT_PERMISSIONS,
  updateSystemDictionary,
  type SystemDictionaryPayload,
  type SystemDictionaryQuery,
  type SystemDictionaryRecord,
  type SystemDictionaryStatus,
} from '@/api/system/dictionary'
import { SYSTEM_DICT_STATUS_KEY } from '@/constants/system-dictionary'
import type { ProFormExpose, ProFormField } from '@/components/pro-form/types'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import { dataMode } from '../../../../config/data-mode'
import type { TableColumnData } from '@arco-design/web-vue'

const { Message, Modal } = adminUi
const realMode = dataMode === 'reference'
const retry = createCommandRetry()
const editingRevision = ref<number>()
const editorError = ref('')
const itemsVisible = ref(false)
const itemsId = ref('')

const tableRef = ref<ProTableExpose>()
const queryFormRef = ref<ProFormExpose>()
const editorFormRef = ref<ProFormExpose>()
const editorVisible = ref(false)
const detailVisible = ref(false)
const deleteVisible = ref(false)
const editorMode = ref<'create' | 'update'>('create')
const editingId = ref('')
const detailRecord = ref<SystemDictionaryRecord>()
const pendingDeleteRecord = ref<SystemDictionaryRecord>()
const editorModel = ref<Record<string, unknown>>({})
const unregisterDirty = registerDirtyCheck(
  () => realMode && editorVisible.value
)
onBeforeUnmount(unregisterDirty)

const editorTitle = computed(() =>
  editorMode.value === 'create' ? '新增字典' : '编辑字典'
)

const loadStatusOptions = async () => {
  return dictionaryService.getOptions(SYSTEM_DICT_STATUS_KEY)
}

const getStatusLabel = (value: string) =>
  dictionaryService.getLabel(SYSTEM_DICT_STATUS_KEY, value, value)

const querySchema: ProFormField[] = [
  {
    field: 'dictName',
    label: '字典名称',
    type: 'input',
    placeholder: '请输入字典名称',
  },
  {
    field: 'dictType',
    label: '字典类型',
    type: 'input',
    placeholder: '请输入字典类型',
  },
  {
    field: 'dictStatus',
    label: '字典状态',
    type: 'select',
    placeholder: '请选择字典状态',
    loadOptions: loadStatusOptions,
  },
]

const editorSchema: ProFormField[] = [
  {
    field: 'dictName',
    label: '字典名称',
    type: 'input',
    placeholder: '请输入字典名称',
    rules: [{ required: true, message: '请输入字典名称' }],
  },
  {
    field: 'dictType',
    label: '字典类型',
    type: 'input',
    placeholder: '请输入字典类型',
    rules: [{ required: true, message: '请输入字典类型' }],
  },
  {
    field: 'dictStatus',
    label: '字典状态',
    type: 'select',
    placeholder: '请选择字典状态',
    defaultValue: 'enabled',
    loadOptions: loadStatusOptions,
    rules: [{ required: true, message: '请选择字典状态' }],
  },
  {
    field: 'description',
    label: '描述',
    type: 'input',
    placeholder: '请输入描述',
  },
]

const toCleanFilters = (values: Record<string, unknown>) => {
  const filters: Partial<SystemDictionaryQuery> = {}

  if (typeof values.dictName === 'string' && values.dictName.trim()) {
    filters.dictName = values.dictName.trim()
  }
  if (typeof values.dictType === 'string' && values.dictType.trim()) {
    filters.dictType = values.dictType.trim()
  }
  if (values.dictStatus === 'enabled' || values.dictStatus === 'disabled') {
    filters.dictStatus = values.dictStatus
  }

  return filters
}

const toPayload = (
  values: Record<string, unknown>
): SystemDictionaryPayload => {
  const dictStatus: SystemDictionaryStatus =
    values.dictStatus === 'disabled' ? 'disabled' : 'enabled'

  return {
    dictName: String(values.dictName || '').trim(),
    dictType: String(values.dictType || '').trim(),
    dictStatus,
    description: String(values.description || '').trim(),
    ...(realMode && editorMode.value === 'update'
      ? { expectedRevision: editingRevision.value }
      : {}),
  }
}

const fetchDictionaryData = async (params: ProTableFetchParams) => {
  try {
    return await fetchSystemDictionaries({
      current: params.current,
      pageSize: params.pageSize,
      ...toCleanFilters(params.filters),
    })
  } catch {
    Message.error('字典列表加载失败')
    if (realMode) throw new Error('字典列表加载失败，请重试')
    return { list: [], total: 0 }
  }
}

const handleSearch = (values: Record<string, unknown>) =>
  tableRef.value?.reset(toCleanFilters(values))

const handleReset = (values: Record<string, unknown>) =>
  tableRef.value?.reset(toCleanFilters(values))

const openCreate = () => {
  retry.clear()
  editingRevision.value = undefined
  editorError.value = ''
  editorMode.value = 'create'
  editingId.value = ''
  editorModel.value = {
    dictName: '',
    dictType: '',
    dictStatus: 'enabled',
    description: '',
  }
  editorVisible.value = true
}

const openEdit = async (record: SystemDictionaryRecord) => {
  try {
    const detail = await getSystemDictionaryDetail(record.id)
    editorMode.value = 'update'
    editingId.value = detail.id
    editingRevision.value = detail.revision
    retry.clear()
    editorError.value = ''
    editorModel.value = { ...detail }
    editorVisible.value = true
  } catch {
    Message.error('字典详情加载失败')
  }
}

const openDetail = async (record: SystemDictionaryRecord) => {
  try {
    detailRecord.value = await getSystemDictionaryDetail(record.id)
    detailVisible.value = true
  } catch {
    Message.error('字典详情加载失败')
  }
}

const openDeleteConfirm = (record: SystemDictionaryRecord) => {
  pendingDeleteRecord.value = record
  deleteVisible.value = true
}

const saveDictionary = async (values: Record<string, unknown>) => {
  const payload = toPayload(values)
  const creating = editorMode.value === 'create'
  const operation = creating ? 'create' : `update:${editingId.value}`
  editorError.value = ''
  try {
    if (creating) {
      if (realMode)
        await createSystemDictionary(payload, retry.key(operation, payload))
      else await createSystemDictionary(payload)
    } else if (realMode)
      await updateSystemDictionary(
        editingId.value,
        payload,
        retry.key(operation, payload)
      )
    else await updateSystemDictionary(editingId.value, payload)
  } catch (failure) {
    editorError.value =
      failure instanceof Error ? failure.message : '保存失败，输入已保留'
    throw failure
  }
  retry.complete(operation)
  if (realMode) dictionaryService.clear(payload.dictType)
  Message.success(creating ? '新增成功' : '保存成功')
  editorVisible.value = false
  await tableRef.value?.reload()
}

const submitEditor = async () => {
  try {
    return Boolean(await editorFormRef.value?.submit())
  } catch {
    Message.error('保存失败')
    return false
  }
}

const confirmDelete = async () => {
  if (!pendingDeleteRecord.value) {
    return false
  }

  try {
    if (realMode) {
      const item = pendingDeleteRecord.value
      await deleteSystemDictionary(
        item.id,
        item.revision,
        retry.key(`delete:${item.id}`, { expectedRevision: item.revision })
      )
      retry.complete(`delete:${item.id}`)
      dictionaryService.clear(item.dictType)
    } else await deleteSystemDictionary(pendingDeleteRecord.value.id)
    Message.success('删除成功')
    deleteVisible.value = false
    pendingDeleteRecord.value = undefined
    await tableRef.value?.reload()
    return true
  } catch {
    Message.error('删除失败')
    return false
  }
}

const renderActionButton = (
  record: SystemDictionaryRecord,
  permission: string | string[],
  label: string,
  onClick: () => void,
  danger = false
) =>
  h(
    PermissionButton,
    {
      permission,
      mode: 'all',
      type: 'text',
      size: 'small',
      status: danger ? 'danger' : undefined,
      onClick,
    },
    { default: () => label }
  )

const optionActions = (item: SystemDictionaryRecord) => {
  if (!realMode) return []
  return [
    renderActionButton(
      item,
      [SYSTEM_DICT_PERMISSIONS.update, SYSTEM_DICT_PERMISSIONS.detail],
      '选项',
      () => {
        itemsId.value = item.id
        itemsVisible.value = true
      }
    ),
  ]
}

const columns: TableColumnData[] = [
  {
    title: '字典名称',
    dataIndex: 'dictName',
  },
  {
    title: '字典类型',
    dataIndex: 'dictType',
  },
  {
    title: '状态',
    render: ({ record }) =>
      h(
        'span',
        {
          class:
            (record as SystemDictionaryRecord).dictStatus === 'enabled'
              ? 'dict-status dict-status--enabled'
              : 'dict-status dict-status--disabled',
        },
        getStatusLabel((record as SystemDictionaryRecord).dictStatus)
      ),
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
  },
  {
    title: '操作',
    render: ({ record }) => {
      const item = record as SystemDictionaryRecord
      return h('div', { class: 'dict-system-page__actions' }, [
        renderActionButton(item, SYSTEM_DICT_PERMISSIONS.detail, '详情', () =>
          openDetail(item)
        ),
        renderActionButton(item, SYSTEM_DICT_PERMISSIONS.update, '编辑', () =>
          openEdit(item)
        ),
        ...optionActions(item),
        renderActionButton(
          item,
          SYSTEM_DICT_PERMISSIONS.delete,
          '删除',
          () => openDeleteConfirm(item),
          true
        ),
      ])
    },
  },
]

onMounted(() => {
  loadStatusOptions().catch(() => {
    Message.error('字典状态加载失败')
  })
})
</script>

<style scoped>
.dict-system-page__query {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dict-system-page__actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.dict-status {
  display: inline-flex;
  align-items: center;
  min-width: 44px;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
}

.dict-status--enabled {
  color: #1f7a3f;
  background: #e8f7ee;
}

.dict-status--disabled {
  color: #8a5a00;
  background: #fff3d6;
}
</style>
