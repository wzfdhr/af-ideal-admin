<template>
  <main class="user-system-page px-6">
    <s-navs :navs="['menu.system', 'menu.system.user']" />

    <section class="s-section user-system-page__query">
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
        :permission="SYSTEM_USER_PERMISSIONS.create"
        @click="openCreate"
      >
        新增用户
      </PermissionButton>
    </section>

    <section class="s-section">
      <ProTable
        ref="tableRef"
        row-key="id"
        :columns="columns"
        :fetch-data="fetchUserData"
      />
    </section>

    <a-modal
      v-model:visible="editorVisible"
      data-testid="user-editor-modal"
      :title="editorTitle"
      @before-ok="submitEditor"
    >
      <ProForm
        ref="editorFormRef"
        v-model="editorModel"
        :schema="editorSchema"
        :submitter="saveUser"
        hide-actions
      />
    </a-modal>

    <a-modal
      v-model:visible="detailVisible"
      data-testid="user-detail-modal"
      title="用户详情"
      :footer="false"
    >
      <a-descriptions v-if="detailRecord" :column="1" bordered>
        <a-descriptions-item label="账号名称">
          {{ detailRecord.username }}
        </a-descriptions-item>
        <a-descriptions-item label="用户姓名">
          {{ detailRecord.name }}
        </a-descriptions-item>
        <a-descriptions-item label="手机号">
          {{ detailRecord.phone }}
        </a-descriptions-item>
        <a-descriptions-item label="Email">
          {{ detailRecord.email }}
        </a-descriptions-item>
        <a-descriptions-item label="所在部门">
          {{ detailRecord.dept }}
        </a-descriptions-item>
        <a-descriptions-item label="用户状态">
          {{ getStatusLabel(detailRecord.status) }}
        </a-descriptions-item>
        <a-descriptions-item label="角色">
          {{ detailRecord.role }}
        </a-descriptions-item>
        <a-descriptions-item label="更新时间">
          {{ detailRecord.updatedAt }}
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>

    <a-modal
      v-model:visible="deleteVisible"
      data-testid="user-delete-modal"
      title="删除用户"
      @before-ok="confirmDelete"
    >
      <p>
        确认删除用户
        <strong>{{ pendingDeleteRecord?.username }}</strong>
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
  createSystemUser,
  deleteSystemUser,
  fetchSystemUsers,
  getSystemUserDetail,
  SYSTEM_USER_PERMISSIONS,
  updateSystemUser,
  type SystemUserPayload,
  type SystemUserQuery,
  type SystemUserRecord,
  type SystemUserStatus,
} from '@/api/system/user'
import { SYSTEM_USER_STATUS_KEY } from '@/constants/system-user'
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
const detailRecord = ref<SystemUserRecord>()
const pendingDeleteRecord = ref<SystemUserRecord>()
const editorModel = ref<Record<string, unknown>>({})

const editorTitle = computed(() =>
  editorMode.value === 'create' ? '新增用户' : '编辑用户'
)

const loadStatusOptions = async () => {
  const options = await dictionaryService.getOptions(SYSTEM_USER_STATUS_KEY)
  statusOptions.value = options
  return options
}

const getStatusLabel = (value: string) =>
  statusOptions.value.find((item) => item.value === value)?.label || value

const querySchema: ProFormField[] = [
  {
    field: 'username',
    label: '账号名称',
    type: 'input',
    placeholder: '请输入账号名称',
  },
  {
    field: 'phone',
    label: '手机号',
    type: 'input',
    placeholder: '请输入手机号码',
  },
  {
    field: 'status',
    label: '用户状态',
    type: 'select',
    placeholder: '请选择用户状态',
    loadOptions: loadStatusOptions,
  },
]

const editorSchema: ProFormField[] = [
  {
    field: 'username',
    label: '账号名称',
    type: 'input',
    placeholder: '请输入账号名称',
    rules: [{ required: true, message: '请输入账号名称' }],
  },
  {
    field: 'name',
    label: '用户姓名',
    type: 'input',
    placeholder: '请输入用户姓名',
    rules: [{ required: true, message: '请输入用户姓名' }],
  },
  {
    field: 'phone',
    label: '手机号',
    type: 'input',
    placeholder: '请输入手机号码',
    rules: [{ required: true, message: '请输入手机号码' }],
  },
  {
    field: 'email',
    label: 'Email',
    type: 'input',
    placeholder: '请输入邮箱',
  },
  {
    field: 'dept',
    label: '所在部门',
    type: 'input',
    placeholder: '请输入所在部门',
  },
  {
    field: 'role',
    label: '角色',
    type: 'input',
    placeholder: '请输入角色标识',
  },
  {
    field: 'status',
    label: '用户状态',
    type: 'select',
    placeholder: '请选择用户状态',
    defaultValue: 'enabled',
    loadOptions: loadStatusOptions,
    rules: [{ required: true, message: '请选择用户状态' }],
  },
]

const toCleanFilters = (values: Record<string, unknown>) => {
  const filters: Partial<SystemUserQuery> = {}

  if (typeof values.username === 'string' && values.username.trim()) {
    filters.username = values.username.trim()
  }
  if (typeof values.phone === 'string' && values.phone.trim()) {
    filters.phone = values.phone.trim()
  }
  if (values.status === 'enabled' || values.status === 'disabled') {
    filters.status = values.status
  }

  return filters
}

const toPayload = (values: Record<string, unknown>): SystemUserPayload => {
  const status: SystemUserStatus =
    values.status === 'disabled' ? 'disabled' : 'enabled'

  return {
    username: String(values.username || '').trim(),
    name: String(values.name || '').trim(),
    phone: String(values.phone || '').trim(),
    email: String(values.email || '').trim(),
    dept: String(values.dept || '').trim(),
    status,
    role: String(values.role || '').trim(),
  }
}

const fetchUserData = async (params: ProTableFetchParams) => {
  try {
    return await fetchSystemUsers({
      current: params.current,
      pageSize: params.pageSize,
      ...toCleanFilters(params.filters),
    })
  } catch {
    Message.error('用户列表加载失败')
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
    username: '',
    name: '',
    phone: '',
    email: '',
    dept: '',
    status: 'enabled',
    role: '',
  }
  editorVisible.value = true
}

const openEdit = async (record: SystemUserRecord) => {
  try {
    const detail = await getSystemUserDetail(record.id)
    editorMode.value = 'update'
    editingId.value = detail.id
    editorModel.value = { ...detail }
    editorVisible.value = true
  } catch {
    Message.error('用户详情加载失败')
  }
}

const openDetail = async (record: SystemUserRecord) => {
  try {
    detailRecord.value = await getSystemUserDetail(record.id)
    detailVisible.value = true
  } catch {
    Message.error('用户详情加载失败')
  }
}

const openDeleteConfirm = (record: SystemUserRecord) => {
  pendingDeleteRecord.value = record
  deleteVisible.value = true
}

const saveUser = async (values: Record<string, unknown>) => {
  const payload = toPayload(values)
  if (editorMode.value === 'create') {
    await createSystemUser(payload)
    Message.success('新增成功')
  } else {
    await updateSystemUser(editingId.value, payload)
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
    await deleteSystemUser(pendingDeleteRecord.value.id)
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
  record: SystemUserRecord,
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
    title: '账号名称',
    dataIndex: 'username',
  },
  {
    title: '用户姓名',
    dataIndex: 'name',
  },
  {
    title: '手机号',
    dataIndex: 'phone',
  },
  {
    title: 'Email',
    dataIndex: 'email',
  },
  {
    title: '所在部门',
    dataIndex: 'dept',
  },
  {
    title: '状态',
    render: ({ record }) =>
      h(
        'span',
        {
          class:
            (record as SystemUserRecord).status === 'enabled'
              ? 'user-status user-status--enabled'
              : 'user-status user-status--disabled',
        },
        getStatusLabel((record as SystemUserRecord).status)
      ),
  },
  {
    title: '角色',
    dataIndex: 'role',
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
  },
  {
    title: '操作',
    render: ({ record }) => {
      const item = record as SystemUserRecord
      return h('div', { class: 'user-system-page__actions' }, [
        renderActionButton(item, SYSTEM_USER_PERMISSIONS.detail, '详情', () =>
          openDetail(item)
        ),
        renderActionButton(item, SYSTEM_USER_PERMISSIONS.update, '编辑', () =>
          openEdit(item)
        ),
        renderActionButton(
          item,
          SYSTEM_USER_PERMISSIONS.delete,
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
    Message.error('用户状态加载失败')
  })
})
</script>

<style scoped>
.user-system-page__query {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.user-system-page__actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.user-status {
  display: inline-flex;
  align-items: center;
  min-width: 44px;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
}

.user-status--enabled {
  color: #1f7a3f;
  background: #e8f7ee;
}

.user-status--disabled {
  color: #8a5a00;
  background: #fff3d6;
}
</style>
