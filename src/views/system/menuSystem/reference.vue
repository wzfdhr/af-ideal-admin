<template>
  <main class="menu-resources" data-testid="reference-menu-resources">
    <h1>菜单资源</h1>
    <p>菜单引用已登记页面。启停控制导航，业务接口继续检查实际权限。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <section class="query">
      <label>
        菜单名称
        <input v-model="keyword" aria-label="查询菜单名称" />
      </label>
      <label>
        状态
        <select v-model="status" aria-label="筛选菜单状态">
          <option value="">全部有效资源</option>
          <option value="enabled">启用</option>
          <option value="disabled">停用</option>
          <option value="deleted">已删除</option>
        </select>
      </label>
      <a-button @click="search">搜索</a-button>
      <a-button @click="refresh">刷新</a-button>
      <PermissionButton :permission="P.create" @click="create">
        新增资源
      </PermissionButton>
    </section>
    <ProTable
      ref="table"
      row-key="id"
      :columns="columns"
      :fetch-data="fetchRows"
    />
    <a-modal
      v-model:visible="visible"
      title="维护菜单资源"
      :unmount-on-close="true"
      :ok-loading="busy"
      data-testid="menu-resource-editor"
      @before-ok="save"
    >
      <p v-if="editorError" role="alert">{{ editorError }}</p>
      <label>
        菜单名称
        <input v-model="form.menuName" aria-label="资源名称" maxlength="100" />
      </label>
      <label>
        资源类型
        <select
          v-model="form.menuType"
          :disabled="!!editing"
          aria-label="资源类型"
          @change="resetBinding"
        >
          <option value="catalog">目录</option>
          <option value="menu">页面菜单</option>
          <option value="button">按钮</option>
        </select>
      </label>
      <label v-if="form.menuType === 'menu'">
        登记页面
        <select
          v-model="form.routeKey"
          :disabled="!!editing"
          aria-label="登记页面"
        >
          <option
            v-for="route in catalogue?.routes.filter(
              (item) => item.type === 'menu' && !item.protected
            )"
            :key="route.key"
            :value="route.key"
          >
            {{ t(route.locale) }} · {{ route.path }}
          </option>
          <option v-if="editing?.protected" :value="editing.routeKey">
            {{ t(editing.menuName) }}
          </option>
        </select>
      </label>
      <label>
        父资源
        <select v-model="parent" aria-label="父资源">
          <option value="" :disabled="form.menuType === 'button'">
            根目录
          </option>
          <option v-for="node in parents" :key="node.id" :value="node.id">
            {{ t(node.menuName) }} · {{ node.id }}
          </option>
        </select>
      </label>
      <label v-if="form.menuType === 'button'">
        登记权限
        <select
          v-model="form.permission"
          :disabled="!!editing"
          aria-label="按钮权限"
        >
          <option
            v-for="permission in catalogue?.permissions"
            :key="permission.code"
            :value="permission.code"
          >
            {{ permission.title }} · {{ permission.code }}
          </option>
        </select>
      </label>
      <p v-if="form.menuType === 'menu'">
        组件、路径和基础权限取自登记目录，不能填写脚本或外部地址。
      </p>
      <label>
        排序
        <input
          v-model.number="form.sort"
          aria-label="资源排序"
          type="number"
          min="0"
          max="100000"
        />
      </label>
      <label>
        启停
        <select v-model="form.status" aria-label="资源状态">
          <option value="enabled">启用</option>
          <option value="disabled">停用</option>
        </select>
      </label>
      <p v-if="editing?.protected">
        管理及本人凭据入口受到保护，可以修改显示名称和排序。
      </p>
    </a-modal>
  </main>
</template>
<script setup lang="ts">
import { ref, computed, h, onUnmounted, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUserStore, useMenuStore } from '@/store'
import ProTable from '@/components/pro-table/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import { adminUi } from '@/components/pro-ui'
import {
  listMenuResources,
  menuCatalogue,
  createMenuResource,
  updateMenuResource,
  menuResourceCommand,
} from '@/api/menu-resources'
import { createCommandRetry } from '@/services/command-retry'
import { registerDirtyCheck } from '@/services/tenant-context'
import { confirmR1Action } from '@/services/r1-confirm'
import { errorMessage } from '@/views/leave/shared'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import { hasPermission } from '@/services/ui-permissions'
import { MENU_PERMISSIONS as P, parseMenuResource } from '@af-admin/contracts'
import type { MenuResourceInput, MenuResourceRecord } from '@af-admin/contracts'
import type { TableColumnData } from '@arco-design/web-vue'

const user = useUserStore()
const menu = useMenuStore()
const { t } = useI18n()
const table = ref<ProTableExpose>()
const keyword = ref('')
const status = ref('')
const error = ref('')
const message = ref('')
const editorError = ref('')
const visible = ref(false)
const busy = ref(false)
const editing = ref<MenuResourceRecord>()
const catalogue = ref<Awaited<ReturnType<typeof menuCatalogue>>>()
const parent = ref('')
const empty = (): MenuResourceInput => ({
  menuName: '',
  menuType: 'catalog',
  parentId: null,
  permission: '',
  sort: 0,
  status: 'enabled',
})
const form = ref<MenuResourceInput>(empty())
const retry = createCommandRetry()
let ticket = 0
const unregister = registerDirtyCheck(() => visible.value)
const parents = computed(() => {
  const type = form.value.menuType === 'button' ? 'menu' : 'catalog'
  return (
    catalogue.value?.parents.filter(
      (node) => node.id !== editing.value?.id && node.menuType === type
    ) || []
  )
})
const resetBinding = () => {
  form.value.routeKey = undefined
  form.value.permission = ''
  parent.value = ''
}
const reload = async () => {
  await table.value?.reload()
  await menu.fetchNavigationState()
}
const fetchRows = async (params: ProTableFetchParams) => {
  const seq = ticket
  try {
    const result = await listMenuResources({
      current: params.current,
      pageSize: params.pageSize,
      menuName: keyword.value,
      status: status.value,
    })
    if (seq !== ticket) return { list: [], total: 0 }
    error.value = ''
    return { ...result, list: result.list.map((row) => ({ ...row })) }
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
    throw failure
  }
}
const search = () => table.value?.reload()
const refresh = async () => {
  await reload()
}
const open = async (row?: MenuResourceRecord) => {
  const seq = ++ticket
  editorError.value = ''
  error.value = ''
  retry.clear()
  editing.value = row
  form.value = empty()
  if (row)
    form.value = {
      menuName: row.menuName,
      menuType: row.menuType,
      parentId: row.parentId,
      permission: row.permission,
      sort: row.sort,
      status: row.status,
      expectedRevision: row.revision,
      ...(row.routeKey ? { routeKey: row.routeKey } : {}),
    }
  parent.value = row?.parentId || ''
  try {
    const result = await menuCatalogue()
    if (seq !== ticket) return
    catalogue.value = result
    visible.value = true
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
  }
}
const create = () => open()
const save = async () => {
  const seq = ticket
  try {
    busy.value = true
    const body = parseMenuResource(
      { ...form.value, parentId: parent.value || null },
      !!editing.value
    )
    const key = retry.key(editing.value?.id || 'create', body)
    if (editing.value) await updateMenuResource(editing.value.id, body, key)
    else await createMenuResource(body, key)
    if (seq !== ticket) return false
    retry.complete(editing.value?.id || 'create')
    visible.value = false
    message.value = '菜单资源已保存，导航已重新读取'
    await reload()
    return true
  } catch (failure) {
    if (seq === ticket) editorError.value = errorMessage(failure)
    return false
  } finally {
    busy.value = false
  }
}
const command = async (
  row: MenuResourceRecord,
  action: 'delete' | 'restore'
) => {
  if (
    !(await confirmR1Action(
      action === 'delete'
        ? '确认删除此资源？资源事实保留，可从已删除列表恢复。'
        : '确认恢复此资源？'
    ))
  )
    return
  const seq = ticket
  const body = { expectedRevision: row.revision }
  try {
    await menuResourceCommand(
      row.id,
      action,
      row.revision,
      retry.key(`${action}:${row.id}`, body)
    )
    if (seq !== ticket) return
    retry.complete(`${action}:${row.id}`)
    message.value = action === 'delete' ? '资源已删除' : '资源已恢复'
    await reload()
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
  }
}
const columns: TableColumnData[] = [
  {
    title: '名称',
    dataIndex: 'menuName',
    render: ({ record }) => t((record as MenuResourceRecord).menuName),
  },
  { title: '类型', dataIndex: 'menuType' },
  { title: '登记页面', dataIndex: 'routeKey' },
  { title: '排序', dataIndex: 'sort' },
  {
    title: '状态',
    dataIndex: 'status',
    render: ({ record }) => {
      if ((record as MenuResourceRecord).deletedAt) return '已删除'
      return record.status === 'enabled' ? '启用' : '停用'
    },
  },
  { title: '版本', dataIndex: 'revision' },
  {
    title: '操作',
    render: ({ record }) => {
      const row = record as MenuResourceRecord
      const buttons = []
      if (!row.deletedAt && hasPermission(user.permissions, P.update))
        buttons.push(
          h(adminUi.Button, { onClick: () => open(row) }, () => '编辑资源')
        )
      if (
        !row.deletedAt &&
        !row.protected &&
        hasPermission(user.permissions, P.delete)
      )
        buttons.push(
          h(
            adminUi.Button,
            { onClick: () => command(row, 'delete') },
            () => '删除资源'
          )
        )
      if (row.deletedAt && hasPermission(user.permissions, P.update))
        buttons.push(
          h(
            adminUi.Button,
            { onClick: () => command(row, 'restore') },
            () => '恢复资源'
          )
        )
      return h('div', { class: 'resource-actions' }, buttons)
    },
  },
]
watch(
  () => [user.id, user.tenantId],
  () => {
    ticket += 1
    visible.value = false
    error.value = ''
    message.value = ''
    catalogue.value = undefined
    retry.clear()
    table.value?.reload()
  }
)
onBeforeRouteLeave(
  () => !visible.value || confirmR1Action('存在未保存资源配置，确认离开？')
)
onUnmounted(() => {
  ticket += 1
  unregister()
  retry.clear()
})
</script>
<style scoped>
.menu-resources {
  padding: 24px;
  max-width: 1440px;
  margin: auto;
}
h1 {
  font-size: 24px;
  margin-bottom: 12px;
}
.query {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin: 20px 0;
}
label {
  display: block;
  margin: 12px 0;
}
input,
select {
  display: block;
  padding: 8px;
  color: var(--color-text-1);
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
  width: 100%;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
