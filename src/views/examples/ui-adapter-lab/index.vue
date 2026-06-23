<template>
  <main class="ui-adapter-lab px-6" data-testid="ui-adapter-lab">
    <s-navs :navs="['menu.examples', 'menu.examples.uiAdapterLab']" />

    <section class="s-section ui-adapter-lab__governance">
      <div>
        <span class="ui-adapter-lab__label">Active adapter</span>
        <strong>{{ adminUi.name }}</strong>
      </div>
      <div>
        <span class="ui-adapter-lab__label">Candidate adapter</span>
        <strong>{{ aheartCandidateStatus.status }}</strong>
      </div>
      <div>
        <span class="ui-adapter-lab__label">Evidence</span>
        <strong>{{ aheartCandidateStatus.evidence.maturityMatrix }}</strong>
      </div>
    </section>

    <section class="s-section ui-adapter-lab__query">
      <ProForm
        ref="queryFormRef"
        :schema="querySchema"
        submit-text="查询"
        reset-text="重置"
        @submit="handleSearch"
        @reset="handleReset"
      />
      <div class="ui-adapter-lab__actions">
        <PermissionButton
          data-testid="ui-adapter-lab-create"
          type="primary"
          :permission="UI_ADAPTER_LAB_PERMISSIONS.create"
          @click="openCreate"
        >
          新增验证项
        </PermissionButton>
        <component
          :is="Button"
          data-testid="ui-adapter-lab-empty"
          @click="loadEmptyState"
        >
          空态
        </component>
        <PermissionButton
          data-testid="ui-adapter-lab-error"
          status="danger"
          :permission="UI_ADAPTER_LAB_PERMISSIONS.error"
          @click="simulateErrorState"
        >
          错误态
        </PermissionButton>
      </div>
    </section>

    <section class="s-section">
      <p
        v-if="errorMessage"
        class="ui-adapter-lab__error"
        data-testid="ui-adapter-lab-error-state"
      >
        {{ errorMessage }}
      </p>
      <p
        v-if="emptyVisible"
        class="ui-adapter-lab__empty"
        data-testid="ui-adapter-lab-empty-state"
      >
        暂无匹配的候选组件验证项
      </p>
      <ProTable
        ref="tableRef"
        row-key="id"
        :default-page-size="20"
        :columns="columns"
        :fetch-data="fetchLabData"
      />
    </section>

    <component
      :is="Modal"
      v-model:visible="editorVisible"
      data-testid="ui-adapter-lab-editor-modal"
      :title="editorTitle"
      :footer="false"
    >
      <ProForm
        ref="editorFormRef"
        v-model="editorModel"
        :schema="editorSchema"
        :submitter="saveLabItem"
        hide-actions
      />
      <div class="ui-adapter-lab__modal-actions">
        <component
          :is="Button"
          type="primary"
          data-testid="ui-adapter-lab-submit-editor"
          @click="submitEditor"
        >
          保存
        </component>
      </div>
    </component>

    <component
      :is="Drawer"
      v-model:visible="drawerVisible"
      data-testid="ui-adapter-lab-drawer"
      title="验证详情"
      :footer="false"
      width="420px"
    >
      <dl v-if="detailRecord" class="ui-adapter-lab__detail">
        <dt>名称</dt>
        <dd>{{ detailRecord.name }}</dd>
        <dt>组件</dt>
        <dd>{{ detailRecord.component }}</dd>
        <dt>状态</dt>
        <dd>{{ detailRecord.status }}</dd>
        <dt>说明</dt>
        <dd>{{ detailRecord.description }}</dd>
      </dl>
    </component>
  </main>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue'
import ProForm from '@/components/pro-form/index.vue'
import ProTable from '@/components/pro-table/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import { adminUi, aheartCandidateStatus } from '@/components/pro-ui'
import {
  createUiAdapterLabItem,
  fetchUiAdapterLabItems,
  simulateUiAdapterLabError,
  updateUiAdapterLabItem,
  type UiAdapterLabItem,
  type UiAdapterLabPayload,
  type UiAdapterLabQuery,
  type UiAdapterLabStatus,
} from '@/api/ui-adapter-lab'
import { UI_ADAPTER_LAB_PERMISSIONS } from '@/constants/ui-adapter-lab'
import type { ProFormExpose, ProFormField } from '@/components/pro-form/types'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import type { TableColumnData } from '@arco-design/web-vue'

const { Button, Drawer, Message, Modal } = adminUi

const tableRef = ref<ProTableExpose>()
const queryFormRef = ref<ProFormExpose>()
const editorFormRef = ref<ProFormExpose>()
const editorVisible = ref(false)
const drawerVisible = ref(false)
const editorMode = ref<'create' | 'update'>('create')
const editingId = ref('')
const editorModel = ref<Record<string, unknown>>({})
const detailRecord = ref<UiAdapterLabItem>()
const emptyVisible = ref(false)
const errorMessage = ref('')

const editorTitle = computed(() =>
  editorMode.value === 'create' ? '新增验证项' : '编辑验证项'
)

const statusOptions = [
  { label: '全部', value: '' },
  { label: 'Ready', value: 'ready' },
  { label: 'Blocked', value: 'blocked' },
]

const querySchema: ProFormField[] = [
  {
    field: 'keyword',
    label: '关键词',
    type: 'input',
    placeholder: '组件、名称或说明',
  },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    defaultValue: '',
    options: statusOptions,
  },
]

const editorSchema: ProFormField[] = [
  {
    field: 'name',
    label: '名称',
    type: 'input',
    placeholder: '请输入验证项名称',
    rules: [{ required: true, message: '请输入验证项名称' }],
  },
  {
    field: 'component',
    label: '组件',
    type: 'select',
    placeholder: '请选择组件',
    options: [
      { label: 'Button', value: 'Button' },
      { label: 'Table', value: 'Table' },
      { label: 'Form', value: 'Form' },
      { label: 'Upload', value: 'Upload' },
    ],
    rules: [{ required: true, message: '请选择组件' }],
  },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    defaultValue: 'blocked',
    options: statusOptions.filter((item) => item.value),
    rules: [{ required: true, message: '请选择状态' }],
  },
  {
    field: 'description',
    label: '说明',
    type: 'input',
    placeholder: '请输入 Mock-backed 验证说明',
  },
]

const toStatus = (value: unknown): UiAdapterLabStatus | '' =>
  value === 'ready' || value === 'blocked' ? value : ''

const toFilters = (
  values: Record<string, unknown>
): Partial<UiAdapterLabQuery> => ({
  keyword: typeof values.keyword === 'string' ? values.keyword.trim() : '',
  status: toStatus(values.status),
})

const toPayload = (values: Record<string, unknown>): UiAdapterLabPayload => ({
  name: String(values.name || '').trim(),
  component: String(values.component || '').trim(),
  status: toStatus(values.status) || 'blocked',
  description: String(values.description || '').trim(),
})

const fetchLabData = async (params: ProTableFetchParams) => {
  const result = await fetchUiAdapterLabItems({
    current: params.current,
    pageSize: params.pageSize,
    keyword: '',
    status: '',
    ...toFilters(params.filters),
  })

  emptyVisible.value = result.total === 0

  return {
    list: result.list as unknown as Record<string, unknown>[],
    total: result.total,
  }
}

const handleSearch = (values: Record<string, unknown>) => {
  errorMessage.value = ''
  return tableRef.value?.reset(toFilters(values))
}

const handleReset = (values: Record<string, unknown>) => {
  errorMessage.value = ''
  return tableRef.value?.reset(toFilters(values))
}

const loadEmptyState = () => {
  errorMessage.value = ''
  return tableRef.value?.reset({
    keyword: 'no-such-component',
    status: '',
  })
}

const simulateErrorState = async () => {
  const result = await simulateUiAdapterLabError()
  errorMessage.value = `${result.reason} (${result.traceId})`
}

const openCreate = () => {
  editorMode.value = 'create'
  editingId.value = ''
  editorModel.value = {
    name: 'Aheart Button',
    component: 'Button',
    status: 'blocked',
    description: 'Mock-backed adapter validation item',
  }
  editorVisible.value = true
}

const openEdit = (record: UiAdapterLabItem) => {
  editorMode.value = 'update'
  editingId.value = record.id
  editorModel.value = {
    name: record.name,
    component: record.component,
    status: record.status,
    description: record.description,
  }
  editorVisible.value = true
}

const openDetail = (record: UiAdapterLabItem) => {
  detailRecord.value = record
  drawerVisible.value = true
}

const saveLabItem = async (values: Record<string, unknown>) => {
  const payload = toPayload(values)
  const result =
    editorMode.value === 'create'
      ? await createUiAdapterLabItem(payload)
      : await updateUiAdapterLabItem(editingId.value, payload)

  if (!result.success) {
    errorMessage.value = result.reason || '保存失败'
    Message.error(errorMessage.value)
    return
  }

  Message.success('保存成功')
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

const renderActionButton = (
  record: UiAdapterLabItem,
  permission: string,
  label: string,
  onClick: () => void
) =>
  h(
    PermissionButton,
    {
      permission,
      type: 'text',
      size: 'small',
      onClick,
    },
    { default: () => label }
  )

const columns: TableColumnData[] = [
  {
    title: '名称',
    dataIndex: 'name',
  },
  {
    title: '组件',
    dataIndex: 'component',
  },
  {
    title: 'Adapter',
    dataIndex: 'adapter',
  },
  {
    title: '状态',
    dataIndex: 'status',
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
  },
  {
    title: '操作',
    render: ({ record }) => {
      const item = record as UiAdapterLabItem
      return h('div', { class: 'ui-adapter-lab__row-actions' }, [
        renderActionButton(item, UI_ADAPTER_LAB_PERMISSIONS.view, '详情', () =>
          openDetail(item)
        ),
        renderActionButton(
          item,
          UI_ADAPTER_LAB_PERMISSIONS.update,
          '编辑',
          () => openEdit(item)
        ),
      ])
    },
  },
]
</script>

<style scoped>
.ui-adapter-lab__governance {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.ui-adapter-lab__label {
  display: block;
  margin-bottom: 4px;
  color: #667085;
  font-size: 12px;
}

.ui-adapter-lab__query {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.ui-adapter-lab__actions,
.ui-adapter-lab__row-actions,
.ui-adapter-lab__modal-actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.ui-adapter-lab__error,
.ui-adapter-lab__empty {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.ui-adapter-lab__error {
  color: #b42318;
  background: #fef3f2;
}

.ui-adapter-lab__empty {
  color: #344054;
  background: #f2f4f7;
}

.ui-adapter-lab__detail {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 8px 12px;
}

.ui-adapter-lab__detail dt {
  color: #667085;
}

.ui-adapter-lab__detail dd {
  margin: 0;
}
</style>
