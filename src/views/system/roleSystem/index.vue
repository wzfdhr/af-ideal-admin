<template>
  <main class="role-system-page px-6">
    <s-navs :navs="['menu.system', 'menu.system.role']" />

    <section class="s-section role-system-page__query">
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
        :permission="SYSTEM_ROLE_PERMISSIONS.create"
        @click="openCreate"
      >
        新增角色
      </PermissionButton>
    </section>

    <section class="s-section">
      <ProTable
        ref="tableRef"
        row-key="id"
        :columns="columns"
        :fetch-data="fetchRoleData"
      />
    </section>

    <a-modal
      v-model:visible="editorVisible"
      data-testid="role-editor-modal"
      :title="editorTitle"
      @before-ok="submitEditor"
    >
      <ProForm
        ref="editorFormRef"
        v-model="editorModel"
        :schema="editorSchema"
        :submitter="saveRole"
        hide-actions
      />
    </a-modal>

    <a-modal
      v-model:visible="detailVisible"
      data-testid="role-detail-modal"
      title="角色详情"
      :footer="false"
    >
      <a-descriptions v-if="detailRecord" :column="1" bordered>
        <a-descriptions-item label="角色名称">
          {{ detailRecord.roleName }}
        </a-descriptions-item>
        <a-descriptions-item label="权限字符">
          {{ detailRecord.roleKey }}
        </a-descriptions-item>
        <a-descriptions-item label="显示顺序">
          {{ detailRecord.roleSort }}
        </a-descriptions-item>
        <a-descriptions-item label="数据权限">
          {{ detailRecord.dataScope }}
        </a-descriptions-item>
        <a-descriptions-item label="角色状态">
          {{ getStatusLabel(detailRecord.status) }}
        </a-descriptions-item>
        <a-descriptions-item label="备注">
          {{ detailRecord.remark || '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="更新时间">
          {{ detailRecord.updatedAt }}
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>

    <a-modal
      v-model:visible="deleteVisible"
      data-testid="role-delete-modal"
      title="删除角色"
      @before-ok="confirmDelete"
    >
      <p>
        确认删除角色
        <strong>{{ pendingDeleteRecord?.roleName }}</strong>
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
  createSystemRole,
  deleteSystemRole,
  fetchSystemRoles,
  getSystemRoleDetail,
  SYSTEM_ROLE_PERMISSIONS,
  updateSystemRole,
  type SystemRolePayload,
  type SystemRoleQuery,
  type SystemRoleRecord,
  type SystemRoleStatus,
} from '@/api/system/role'
import { SYSTEM_ROLE_STATUS_KEY } from '@/constants/system-role'
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
const detailRecord = ref<SystemRoleRecord>()
const pendingDeleteRecord = ref<SystemRoleRecord>()
const editorModel = ref<Record<string, unknown>>({})

const editorTitle = computed(() =>
  editorMode.value === 'create' ? '新增角色' : '编辑角色'
)

const loadStatusOptions = async () => {
  const options = await dictionaryService.getOptions(SYSTEM_ROLE_STATUS_KEY)
  statusOptions.value = options
  return options
}

const getStatusLabel = (value: string) =>
  statusOptions.value.find((item) => item.value === value)?.label || value

const querySchema: ProFormField[] = [
  {
    field: 'roleName',
    label: '角色名称',
    type: 'input',
    placeholder: '请输入角色名称',
  },
  {
    field: 'roleKey',
    label: '权限字符',
    type: 'input',
    placeholder: '请输入权限字符',
  },
  {
    field: 'status',
    label: '角色状态',
    type: 'select',
    placeholder: '请选择角色状态',
    loadOptions: loadStatusOptions,
  },
]

const editorSchema: ProFormField[] = [
  {
    field: 'roleName',
    label: '角色名称',
    type: 'input',
    placeholder: '请输入角色名称',
    rules: [{ required: true, message: '请输入角色名称' }],
  },
  {
    field: 'roleKey',
    label: '权限字符',
    type: 'input',
    placeholder: '请输入权限字符',
    rules: [{ required: true, message: '请输入权限字符' }],
  },
  {
    field: 'roleSort',
    label: '显示顺序',
    type: 'input',
    placeholder: '请输入显示顺序',
    defaultValue: 1,
  },
  {
    field: 'dataScope',
    label: '数据权限',
    type: 'input',
    placeholder: '请输入数据权限',
  },
  {
    field: 'status',
    label: '角色状态',
    type: 'select',
    placeholder: '请选择角色状态',
    defaultValue: 'enabled',
    loadOptions: loadStatusOptions,
    rules: [{ required: true, message: '请选择角色状态' }],
  },
  {
    field: 'remark',
    label: '备注',
    type: 'input',
    placeholder: '请输入备注',
  },
]

const toCleanFilters = (values: Record<string, unknown>) => {
  const filters: Partial<SystemRoleQuery> = {}

  if (typeof values.roleName === 'string' && values.roleName.trim()) {
    filters.roleName = values.roleName.trim()
  }
  if (typeof values.roleKey === 'string' && values.roleKey.trim()) {
    filters.roleKey = values.roleKey.trim()
  }
  if (values.status === 'enabled' || values.status === 'disabled') {
    filters.status = values.status
  }

  return filters
}

const toPayload = (values: Record<string, unknown>): SystemRolePayload => {
  const status: SystemRoleStatus =
    values.status === 'disabled' ? 'disabled' : 'enabled'
  const roleSort = Number(values.roleSort)

  return {
    roleName: String(values.roleName || '').trim(),
    roleKey: String(values.roleKey || '').trim(),
    roleSort: Number.isFinite(roleSort) && roleSort > 0 ? roleSort : 1,
    dataScope: String(values.dataScope || '').trim(),
    status,
    remark: String(values.remark || '').trim(),
  }
}

const fetchRoleData = async (params: ProTableFetchParams) => {
  try {
    return await fetchSystemRoles({
      current: params.current,
      pageSize: params.pageSize,
      ...toCleanFilters(params.filters),
    })
  } catch {
    Message.error('角色列表加载失败')
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
    roleName: '',
    roleKey: '',
    roleSort: 1,
    dataScope: '',
    status: 'enabled',
    remark: '',
  }
  editorVisible.value = true
}

const openEdit = async (record: SystemRoleRecord) => {
  try {
    const detail = await getSystemRoleDetail(record.id)
    editorMode.value = 'update'
    editingId.value = detail.id
    editorModel.value = { ...detail }
    editorVisible.value = true
  } catch {
    Message.error('角色详情加载失败')
  }
}

const openDetail = async (record: SystemRoleRecord) => {
  try {
    detailRecord.value = await getSystemRoleDetail(record.id)
    detailVisible.value = true
  } catch {
    Message.error('角色详情加载失败')
  }
}

const openDeleteConfirm = (record: SystemRoleRecord) => {
  pendingDeleteRecord.value = record
  deleteVisible.value = true
}

const saveRole = async (values: Record<string, unknown>) => {
  const payload = toPayload(values)
  if (editorMode.value === 'create') {
    await createSystemRole(payload)
    Message.success('新增成功')
  } else {
    await updateSystemRole(editingId.value, payload)
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
    await deleteSystemRole(pendingDeleteRecord.value.id)
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
  record: SystemRoleRecord,
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
    title: '角色名称',
    dataIndex: 'roleName',
  },
  {
    title: '权限字符',
    dataIndex: 'roleKey',
  },
  {
    title: '显示顺序',
    dataIndex: 'roleSort',
  },
  {
    title: '数据权限',
    dataIndex: 'dataScope',
  },
  {
    title: '状态',
    render: ({ record }) =>
      h(
        'span',
        {
          class:
            (record as SystemRoleRecord).status === 'enabled'
              ? 'role-status role-status--enabled'
              : 'role-status role-status--disabled',
        },
        getStatusLabel((record as SystemRoleRecord).status)
      ),
  },
  {
    title: '备注',
    dataIndex: 'remark',
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
  },
  {
    title: '操作',
    render: ({ record }) => {
      const item = record as SystemRoleRecord
      return h('div', { class: 'role-system-page__actions' }, [
        renderActionButton(item, SYSTEM_ROLE_PERMISSIONS.detail, '详情', () =>
          openDetail(item)
        ),
        renderActionButton(item, SYSTEM_ROLE_PERMISSIONS.update, '编辑', () =>
          openEdit(item)
        ),
        renderActionButton(
          item,
          SYSTEM_ROLE_PERMISSIONS.delete,
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
    Message.error('角色状态加载失败')
  })
})
</script>

<style scoped>
.role-system-page__query {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.role-system-page__actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.role-status {
  display: inline-flex;
  align-items: center;
  min-width: 44px;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
}

.role-status--enabled {
  color: #1f7a3f;
  background: #e8f7ee;
}

.role-status--disabled {
  color: #8a5a00;
  background: #fff3d6;
}
</style>
