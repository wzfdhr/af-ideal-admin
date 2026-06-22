<template>
  <main class="menu-system-page px-6">
    <s-navs :navs="['menu.system', 'menu.system.menu']" />

    <section class="s-section menu-system-page__query">
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
        :permission="SYSTEM_MENU_PERMISSIONS.create"
        @click="openCreate"
      >
        新增菜单
      </PermissionButton>
    </section>

    <section class="s-section">
      <ProTable
        ref="tableRef"
        row-key="id"
        :columns="columns"
        :fetch-data="fetchMenuData"
      />
    </section>

    <a-modal
      v-model:visible="editorVisible"
      data-testid="menu-editor-modal"
      :title="editorTitle"
      @before-ok="submitEditor"
    >
      <ProForm
        ref="editorFormRef"
        v-model="editorModel"
        :schema="editorSchema"
        :submitter="saveMenu"
        hide-actions
      />
    </a-modal>

    <a-modal
      v-model:visible="detailVisible"
      data-testid="menu-detail-modal"
      title="菜单详情"
      :footer="false"
    >
      <a-descriptions v-if="detailRecord" :column="1" bordered>
        <a-descriptions-item label="菜单名称">
          {{ detailRecord.menuName }}
        </a-descriptions-item>
        <a-descriptions-item label="菜单类型">
          {{ getTypeLabel(detailRecord.menuType) }}
        </a-descriptions-item>
        <a-descriptions-item label="请求地址">
          {{ detailRecord.path }}
        </a-descriptions-item>
        <a-descriptions-item label="权限字符">
          {{ detailRecord.permission || '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="排序">
          {{ detailRecord.sort }}
        </a-descriptions-item>
        <a-descriptions-item label="菜单状态">
          {{ getStatusLabel(detailRecord.status) }}
        </a-descriptions-item>
        <a-descriptions-item label="更新时间">
          {{ detailRecord.updatedAt }}
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>

    <a-modal
      v-model:visible="deleteVisible"
      data-testid="menu-delete-modal"
      title="删除菜单"
      @before-ok="confirmDelete"
    >
      <p>
        确认删除菜单
        <strong>{{ pendingDeleteRecord?.menuName }}</strong>
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
  createSystemMenu,
  deleteSystemMenu,
  fetchSystemMenus,
  getSystemMenuDetail,
  SYSTEM_MENU_PERMISSIONS,
  updateSystemMenu,
  type SystemMenuPayload,
  type SystemMenuQuery,
  type SystemMenuRecord,
  type SystemMenuStatus,
  type SystemMenuType,
} from '@/api/system/menu'
import {
  SYSTEM_MENU_STATUS_KEY,
  SYSTEM_MENU_TYPE_KEY,
} from '@/constants/system-menu'
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
const typeOptions = ref<DictionaryOption[]>([])
const editorVisible = ref(false)
const detailVisible = ref(false)
const deleteVisible = ref(false)
const editorMode = ref<'create' | 'update'>('create')
const editingId = ref('')
const detailRecord = ref<SystemMenuRecord>()
const pendingDeleteRecord = ref<SystemMenuRecord>()
const editorModel = ref<Record<string, unknown>>({})

const editorTitle = computed(() =>
  editorMode.value === 'create' ? '新增菜单' : '编辑菜单'
)

const loadStatusOptions = async () => {
  const options = await dictionaryService.getOptions(SYSTEM_MENU_STATUS_KEY)
  statusOptions.value = options
  return options
}

const loadTypeOptions = async () => {
  const options = await dictionaryService.getOptions(SYSTEM_MENU_TYPE_KEY)
  typeOptions.value = options
  return options
}

const getStatusLabel = (value: string) =>
  statusOptions.value.find((item) => item.value === value)?.label || value

const getTypeLabel = (value: string) =>
  typeOptions.value.find((item) => item.value === value)?.label || value

const querySchema: ProFormField[] = [
  {
    field: 'menuName',
    label: '菜单名称',
    type: 'input',
    placeholder: '请输入菜单名称',
  },
  {
    field: 'status',
    label: '菜单状态',
    type: 'select',
    placeholder: '请选择菜单状态',
    loadOptions: loadStatusOptions,
  },
]

const editorSchema: ProFormField[] = [
  {
    field: 'menuName',
    label: '菜单名称',
    type: 'input',
    placeholder: '请输入菜单名称',
    rules: [{ required: true, message: '请输入菜单名称' }],
  },
  {
    field: 'menuType',
    label: '菜单类型',
    type: 'select',
    placeholder: '请选择菜单类型',
    defaultValue: 'menu',
    loadOptions: loadTypeOptions,
    rules: [{ required: true, message: '请选择菜单类型' }],
  },
  {
    field: 'path',
    label: '请求地址',
    type: 'input',
    placeholder: '请输入请求地址',
  },
  {
    field: 'permission',
    label: '权限字符',
    type: 'input',
    placeholder: '请输入权限字符',
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
    label: '菜单状态',
    type: 'select',
    placeholder: '请选择菜单状态',
    defaultValue: 'enabled',
    loadOptions: loadStatusOptions,
    rules: [{ required: true, message: '请选择菜单状态' }],
  },
]

const toCleanFilters = (values: Record<string, unknown>) => {
  const filters: Partial<SystemMenuQuery> = {}

  if (typeof values.menuName === 'string' && values.menuName.trim()) {
    filters.menuName = values.menuName.trim()
  }
  if (values.status === 'enabled' || values.status === 'disabled') {
    filters.status = values.status
  }

  return filters
}

const toMenuType = (value: unknown): SystemMenuType => {
  if (value === 'catalog' || value === 'button') {
    return value
  }

  return 'menu'
}

const toPayload = (values: Record<string, unknown>): SystemMenuPayload => {
  const status: SystemMenuStatus =
    values.status === 'disabled' ? 'disabled' : 'enabled'
  const sort = Number(values.sort)

  return {
    menuName: String(values.menuName || '').trim(),
    menuType: toMenuType(values.menuType),
    path: String(values.path || '').trim(),
    permission: String(values.permission || '').trim(),
    sort: Number.isFinite(sort) && sort > 0 ? sort : 1,
    status,
  }
}

const fetchMenuData = async (params: ProTableFetchParams) => {
  try {
    return await fetchSystemMenus({
      current: params.current,
      pageSize: params.pageSize,
      ...toCleanFilters(params.filters),
    })
  } catch {
    Message.error('菜单列表加载失败')
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
    menuName: '',
    menuType: 'menu',
    path: '',
    permission: '',
    sort: 1,
    status: 'enabled',
  }
  editorVisible.value = true
}

const openEdit = async (record: SystemMenuRecord) => {
  try {
    const detail = await getSystemMenuDetail(record.id)
    editorMode.value = 'update'
    editingId.value = detail.id
    editorModel.value = { ...detail }
    editorVisible.value = true
  } catch {
    Message.error('菜单详情加载失败')
  }
}

const openDetail = async (record: SystemMenuRecord) => {
  try {
    detailRecord.value = await getSystemMenuDetail(record.id)
    detailVisible.value = true
  } catch {
    Message.error('菜单详情加载失败')
  }
}

const openDeleteConfirm = (record: SystemMenuRecord) => {
  pendingDeleteRecord.value = record
  deleteVisible.value = true
}

const saveMenu = async (values: Record<string, unknown>) => {
  const payload = toPayload(values)
  if (editorMode.value === 'create') {
    await createSystemMenu(payload)
    Message.success('新增成功')
  } else {
    await updateSystemMenu(editingId.value, payload)
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
    await deleteSystemMenu(pendingDeleteRecord.value.id)
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
  record: SystemMenuRecord,
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
    title: '菜单名称',
    dataIndex: 'menuName',
  },
  {
    title: '排序',
    dataIndex: 'sort',
  },
  {
    title: '请求地址',
    dataIndex: 'path',
  },
  {
    title: '类型',
    render: ({ record }) => getTypeLabel((record as SystemMenuRecord).menuType),
  },
  {
    title: '状态',
    render: ({ record }) =>
      h(
        'span',
        {
          class:
            (record as SystemMenuRecord).status === 'enabled'
              ? 'menu-status menu-status--enabled'
              : 'menu-status menu-status--disabled',
        },
        getStatusLabel((record as SystemMenuRecord).status)
      ),
  },
  {
    title: '权限字符',
    dataIndex: 'permission',
  },
  {
    title: '更新时间',
    dataIndex: 'updatedAt',
  },
  {
    title: '操作',
    render: ({ record }) => {
      const item = record as SystemMenuRecord
      return h('div', { class: 'menu-system-page__actions' }, [
        renderActionButton(item, SYSTEM_MENU_PERMISSIONS.detail, '详情', () =>
          openDetail(item)
        ),
        renderActionButton(item, SYSTEM_MENU_PERMISSIONS.update, '编辑', () =>
          openEdit(item)
        ),
        renderActionButton(
          item,
          SYSTEM_MENU_PERMISSIONS.delete,
          '删除',
          () => openDeleteConfirm(item),
          true
        ),
      ])
    },
  },
]

onMounted(() => {
  Promise.all([loadStatusOptions(), loadTypeOptions()]).catch(() => {
    Message.error('菜单字典加载失败')
  })
})
</script>

<style scoped>
.menu-system-page__query {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.menu-system-page__actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.menu-status {
  display: inline-flex;
  align-items: center;
  min-width: 44px;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
}

.menu-status--enabled {
  color: #1f7a3f;
  background: #e8f7ee;
}

.menu-status--disabled {
  color: #8a5a00;
  background: #fff3d6;
}
</style>
