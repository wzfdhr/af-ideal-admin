<template>
  <main class="department-system-page px-6">
    <s-navs :navs="['menu.system', 'menu.system.department']" />

    <section class="s-section department-system-page__query">
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
        :permission="SYSTEM_DEPARTMENT_PERMISSIONS.create"
        @click="openCreate"
      >
        新增部门
      </PermissionButton>
    </section>

    <section class="s-section">
      <ProTable
        ref="tableRef"
        row-key="id"
        :columns="columns"
        :fetch-data="fetchDepartmentData"
      />
    </section>

    <a-modal
      v-model:visible="editorVisible"
      data-testid="department-editor-modal"
      :title="editorTitle"
      @before-ok="submitEditor"
    >
      <ProForm
        ref="editorFormRef"
        v-model="editorModel"
        :schema="editorSchema"
        :submitter="saveDepartment"
        hide-actions
      />
    </a-modal>

    <a-modal
      v-model:visible="detailVisible"
      data-testid="department-detail-modal"
      title="部门详情"
      :footer="false"
    >
      <a-descriptions v-if="detailRecord" :column="1" bordered>
        <a-descriptions-item label="部门名称">
          {{ detailRecord.departmentName }}
        </a-descriptions-item>
        <a-descriptions-item label="负责人">
          {{ detailRecord.leader }}
        </a-descriptions-item>
        <a-descriptions-item label="排序">
          {{ detailRecord.sort }}
        </a-descriptions-item>
        <a-descriptions-item label="部门状态">
          {{ getStatusLabel(detailRecord.status) }}
        </a-descriptions-item>
        <a-descriptions-item label="更新时间">
          {{ detailRecord.updatedAt }}
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>

    <a-modal
      v-model:visible="deleteVisible"
      data-testid="department-delete-modal"
      title="删除部门"
      @before-ok="confirmDelete"
    >
      <p>
        确认删除部门
        <strong>{{ pendingDeleteRecord?.departmentName }}</strong>
        吗？删除后将无法在当前 Mock 数据中恢复。
      </p>
    </a-modal>
  </main>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import ProForm from '@/components/pro-form/index.vue'
import ProTable from '@/components/pro-table/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import { adminUi } from '@/components/pro-ui'
import { dictionaryService } from '@/services/dictionary'
import {
  createSystemDepartment,
  deleteSystemDepartment,
  fetchSystemDepartments,
  getSystemDepartmentDetail,
  SYSTEM_DEPARTMENT_PERMISSIONS,
  updateSystemDepartment,
  type SystemDepartmentPayload,
  type SystemDepartmentQuery,
  type SystemDepartmentRecord,
  type SystemDepartmentStatus,
} from '@/api/system/department'
import { SYSTEM_DEPARTMENT_STATUS_KEY } from '@/constants/system-department'
import type { DictionaryOption } from '@/services/dictionary'
import type { ProFormExpose, ProFormField } from '@/components/pro-form/types'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import type { TableColumnData } from '@arco-design/web-vue'

const { Message } = adminUi

const tableRef = ref<ProTableExpose>()
const queryFormRef = ref<ProFormExpose>()
const editorFormRef = ref<ProFormExpose>()
const statusOptions = ref<DictionaryOption[]>([])
const editorVisible = ref(false)
const detailVisible = ref(false)
const deleteVisible = ref(false)
const editorMode = ref<'create' | 'update'>('create')
const editingId = ref('')
const detailRecord = ref<SystemDepartmentRecord>()
const pendingDeleteRecord = ref<SystemDepartmentRecord>()
const editorModel = ref<Record<string, unknown>>({})

const editorTitle = computed(() =>
  editorMode.value === 'create' ? '新增部门' : '编辑部门'
)

const loadStatusOptions = async () => {
  const options = await dictionaryService.getOptions(
    SYSTEM_DEPARTMENT_STATUS_KEY
  )
  statusOptions.value = options
  return options
}

const getStatusLabel = (value: string) =>
  statusOptions.value.find((item) => item.value === value)?.label || value

const querySchema: ProFormField[] = [
  {
    field: 'departmentName',
    label: '部门名称',
    type: 'input',
    placeholder: '请输入部门名称',
  },
  {
    field: 'status',
    label: '部门状态',
    type: 'select',
    placeholder: '请选择部门状态',
    loadOptions: loadStatusOptions,
  },
]

const editorSchema: ProFormField[] = [
  {
    field: 'departmentName',
    label: '部门名称',
    type: 'input',
    placeholder: '请输入部门名称',
    rules: [{ required: true, message: '请输入部门名称' }],
  },
  {
    field: 'leader',
    label: '负责人',
    type: 'input',
    placeholder: '请输入负责人',
  },
  {
    field: 'sort',
    label: '排序',
    type: 'input',
    placeholder: '请输入排序',
    defaultValue: 1,
  },
  {
    field: 'status',
    label: '部门状态',
    type: 'select',
    placeholder: '请选择部门状态',
    defaultValue: 'enabled',
    loadOptions: loadStatusOptions,
    rules: [{ required: true, message: '请选择部门状态' }],
  },
]

const toCleanFilters = (values: Record<string, unknown>) => {
  const filters: Partial<SystemDepartmentQuery> = {}

  if (
    typeof values.departmentName === 'string' &&
    values.departmentName.trim()
  ) {
    filters.departmentName = values.departmentName.trim()
  }
  if (values.status === 'enabled' || values.status === 'disabled') {
    filters.status = values.status
  }

  return filters
}

const toPayload = (
  values: Record<string, unknown>
): SystemDepartmentPayload => {
  const status: SystemDepartmentStatus =
    values.status === 'disabled' ? 'disabled' : 'enabled'
  const sort = Number(values.sort)

  return {
    departmentName: String(values.departmentName || '').trim(),
    leader: String(values.leader || '').trim(),
    sort: Number.isFinite(sort) && sort > 0 ? sort : 1,
    status,
  }
}

const fetchDepartmentData = async (params: ProTableFetchParams) => {
  try {
    return await fetchSystemDepartments({
      current: params.current,
      pageSize: params.pageSize,
      ...toCleanFilters(params.filters),
    })
  } catch {
    Message.error('部门列表加载失败')
    return { list: [], total: 0 }
  }
}

const handleSearch = (values: Record<string, unknown>) =>
  tableRef.value?.reset(toCleanFilters(values))

const handleReset = (values: Record<string, unknown>) =>
  tableRef.value?.reset(toCleanFilters(values))

const openCreate = () => {
  editorMode.value = 'create'
  editingId.value = ''
  editorModel.value = {
    departmentName: '',
    leader: '',
    sort: 1,
    status: 'enabled',
  }
  editorVisible.value = true
}

const openEdit = async (record: SystemDepartmentRecord) => {
  try {
    const detail = await getSystemDepartmentDetail(record.id)
    editorMode.value = 'update'
    editingId.value = detail.id
    editorModel.value = { ...detail }
    editorVisible.value = true
  } catch {
    Message.error('部门详情加载失败')
  }
}

const openDetail = async (record: SystemDepartmentRecord) => {
  try {
    detailRecord.value = await getSystemDepartmentDetail(record.id)
    detailVisible.value = true
  } catch {
    Message.error('部门详情加载失败')
  }
}

const openDeleteConfirm = (record: SystemDepartmentRecord) => {
  pendingDeleteRecord.value = record
  deleteVisible.value = true
}

const saveDepartment = async (values: Record<string, unknown>) => {
  const payload = toPayload(values)
  if (editorMode.value === 'create') {
    await createSystemDepartment(payload)
    Message.success('新增成功')
  } else {
    await updateSystemDepartment(editingId.value, payload)
    Message.success('保存成功')
  }

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
    await deleteSystemDepartment(pendingDeleteRecord.value.id)
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
  record: SystemDepartmentRecord,
  permission: string,
  label: string,
  onClick: () => void,
  danger = false
) =>
  h(
    PermissionButton,
    {
      permission,
      type: 'text',
      size: 'small',
      status: danger ? 'danger' : undefined,
      onClick,
    },
    { default: () => label }
  )

const columns: TableColumnData[] = [
  {
    title: '部门名称',
    dataIndex: 'departmentName',
  },
  {
    title: '负责人',
    dataIndex: 'leader',
  },
  {
    title: '排序',
    dataIndex: 'sort',
  },
  {
    title: '状态',
    render: ({ record }) =>
      h(
        'span',
        {
          class:
            (record as SystemDepartmentRecord).status === 'enabled'
              ? 'department-status department-status--enabled'
              : 'department-status department-status--disabled',
        },
        getStatusLabel((record as SystemDepartmentRecord).status)
      ),
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
  },
  {
    title: '操作',
    render: ({ record }) => {
      const item = record as SystemDepartmentRecord
      return h('div', { class: 'department-system-page__actions' }, [
        renderActionButton(
          item,
          SYSTEM_DEPARTMENT_PERMISSIONS.detail,
          '详情',
          () => openDetail(item)
        ),
        renderActionButton(
          item,
          SYSTEM_DEPARTMENT_PERMISSIONS.update,
          '编辑',
          () => openEdit(item)
        ),
        renderActionButton(
          item,
          SYSTEM_DEPARTMENT_PERMISSIONS.delete,
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
    Message.error('部门状态加载失败')
  })
})
</script>

<style scoped>
.department-system-page__query {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.department-system-page__actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.department-status {
  display: inline-flex;
  align-items: center;
  min-width: 44px;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
}

.department-status--enabled {
  color: #1f7a3f;
  background: #e8f7ee;
}

.department-status--disabled {
  color: #8a5a00;
  background: #fff3d6;
}
</style>
