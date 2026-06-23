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

    <section
      class="s-section ui-adapter-lab__coverage"
      data-testid="ui-adapter-lab-coverage"
    >
      <div class="ui-adapter-lab__section-title">
        <span>Adapter coverage</span>
        <h3>组件覆盖矩阵</h3>
      </div>
      <div class="ui-adapter-lab__coverage-grid">
        <article
          v-for="item in coverageItems"
          :key="item.name"
          class="ui-adapter-lab__coverage-card"
        >
          <div>
            <strong>{{ item.name }}</strong>
            <span :class="['ui-adapter-lab__status', item.status]">
              {{ item.statusText }}
            </span>
          </div>
          <p>{{ item.description }}</p>
        </article>
      </div>
    </section>

    <section
      class="s-section ui-adapter-lab__mock-scenarios"
      data-testid="ui-adapter-lab-mock-scenarios"
    >
      <div class="ui-adapter-lab__section-title">
        <span>Mock scenarios</span>
        <h3>Mock 场景覆盖</h3>
      </div>
      <div class="ui-adapter-lab__scenario-grid">
        <article
          v-for="scenario in mockScenarios"
          :key="scenario.name"
          class="ui-adapter-lab__scenario"
        >
          <span>{{ scenario.state }}</span>
          <strong>{{ scenario.name }}</strong>
          <p>{{ scenario.description }}</p>
        </article>
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

const coverageItems = [
  {
    name: 'Button',
    status: 'ready',
    statusText: '已覆盖',
    description: '普通按钮、危险按钮、权限按钮和加载态。',
  },
  {
    name: 'Table',
    status: 'ready',
    statusText: '已覆盖',
    description: 'ProTable 查询、分页、行操作和空态。',
  },
  {
    name: 'Form',
    status: 'ready',
    statusText: '已覆盖',
    description: 'ProForm schema、校验、默认值和提交回调。',
  },
  {
    name: 'Upload',
    status: 'blocked',
    statusText: '补齐中',
    description: '文件上传、预览、权限下载和失败重试。',
  },
  {
    name: 'Tabs',
    status: 'ready',
    statusText: '已覆盖',
    description: '路由标签、关闭行为和缓存视图切换。',
  },
  {
    name: 'Modal',
    status: 'ready',
    statusText: '已覆盖',
    description: '新增、编辑、确认提交和错误提示。',
  },
  {
    name: 'Drawer',
    status: 'ready',
    statusText: '已覆盖',
    description: '详情抽屉、字段展示和只读态。',
  },
  {
    name: 'A11y',
    status: 'blocked',
    statusText: '治理中',
    description: '焦点顺序、禁用说明和键盘访问约束。',
  },
  {
    name: '国际化',
    status: 'blocked',
    statusText: '扩展中',
    description: '菜单、表单项、空态和错误态双语对齐。',
  },
]

const mockScenarios = [
  {
    name: '查询分页',
    state: '正常态',
    description: 'fetch-data 走 Mock API，覆盖关键词、状态和分页。',
  },
  {
    name: '空态',
    state: '无数据',
    description: '点击空态按钮可模拟 no-such-component 查询。',
  },
  {
    name: '错误态',
    state: '异常',
    description: '模拟 500 traceId，验证错误文案和消息提示。',
  },
  {
    name: '权限态',
    state: '受控',
    description: '新增、编辑、详情均通过 PermissionButton 管理。',
  },
  {
    name: '国际化',
    state: '双语',
    description: '路由菜单 key 与页面核心文案纳入 locale 校验。',
  },
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

.ui-adapter-lab__section-title {
  display: grid;
  gap: 4px;
  margin-bottom: 16px;
}

.ui-adapter-lab__section-title span {
  color: #667085;
  font-size: 12px;
}

.ui-adapter-lab__section-title h3 {
  margin: 0;
  color: #101828;
}

.ui-adapter-lab__coverage-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.ui-adapter-lab__coverage-card {
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  background: #fff;
}

.ui-adapter-lab__coverage-card div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ui-adapter-lab__coverage-card p,
.ui-adapter-lab__scenario p {
  margin: 8px 0 0;
  color: #475467;
  line-height: 1.7;
}

.ui-adapter-lab__status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.ui-adapter-lab__status.ready {
  color: #027a48;
  background: #ecfdf3;
}

.ui-adapter-lab__status.blocked {
  color: #b54708;
  background: #fffaeb;
}

.ui-adapter-lab__scenario-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.ui-adapter-lab__scenario {
  min-height: 116px;
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 6px;
  background: #fff;
}

.ui-adapter-lab__scenario span {
  display: block;
  margin-bottom: 6px;
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

@media (max-width: 1100px) {
  .ui-adapter-lab__coverage-grid,
  .ui-adapter-lab__scenario-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .ui-adapter-lab__governance,
  .ui-adapter-lab__coverage-grid,
  .ui-adapter-lab__scenario-grid {
    grid-template-columns: 1fr;
  }

  .ui-adapter-lab__query {
    flex-direction: column;
  }
}
</style>
