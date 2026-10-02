<template>
  <main class="scope-page" data-testid="member-data-scope-page">
    <h1>成员数据范围</h1>
    <p>全部仅表示当前租户；查看原始联系方式还需要对应的功能权限。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <ProTable
      ref="table"
      :fetch-data="load"
      :columns="columns"
      row-key="roleId"
    />
    <a-modal
      v-model:visible="visible"
      title="配置成员数据范围"
      data-testid="member-scope-editor"
      @before-ok="save"
    >
      <p>{{ editing?.roleName }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <label>
        数据范围
        <select v-model="scope" aria-label="成员数据范围">
          <option value="self">本人</option>
          <option value="department">部门</option>
          <option value="department-and-children">部门及下级</option>
          <option value="all">本租户全部</option>
          <option value="tenant">本租户全部（兼容）</option>
        </select>
      </label>
      <fieldset
        v-if="scope === 'department' || scope === 'department-and-children'"
      >
        <legend>部门（不指定则使用访问者所属部门）</legend>
        <label
          v-for="department in departments"
          :key="department.value"
          class="choice"
        >
          <input
            v-model="selectedDepartments"
            type="checkbox"
            :value="department.value"
            :disabled="department.disabled"
            :aria-label="department.label"
          />
          {{ department.label }}
        </label>
      </fieldset>
      <fieldset>
        <legend>可见成员字段</legend>
        <label v-for="field in fields" :key="field.value" class="choice">
          <input
            v-model="selectedFields"
            type="checkbox"
            :value="field.value"
            :aria-label="field.label"
          />
          {{ field.label }}
        </label>
      </fieldset>
    </a-modal>
    <a-modal
      v-model:visible="previewVisible"
      title="预览已保存范围"
      data-testid="member-scope-preview"
      :footer="false"
    >
      <p>
        请选择已绑定该角色的成员。预览只显示其授权可见字段，不返回隐藏行的原始数据。
      </p>
      <label>
        访问者
        <select v-model="subjectId" aria-label="预览访问者">
          <option value="">请选择</option>
          <option v-for="person in people" :key="person.id" :value="person.id">
            {{ person.name }}（{{ person.username }}）
          </option>
        </select>
      </label>
      <PermissionButton
        :permission="DATA_SCOPE_PERMISSIONS.preview"
        @click="preview"
      >
        预览
      </PermissionButton>
      <p v-if="previewError" role="alert">{{ previewError }}</p>
      <p v-if="!people.length">该角色尚无启用成员</p>
      <table v-if="rows.length">
        <thead>
          <tr>
            <th>账号</th>
            <th>姓名</th>
            <th>部门</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="String(row.id)">
            <td>{{ row.username ?? '无字段权限' }}</td>
            <td>{{ row.name ?? '无字段权限' }}</td>
            <td>{{ row.dept ?? '无字段权限' }}</td>
            <td>{{ row.status ?? '无字段权限' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="previewed">当前没有可见成员</p>
      <p v-if="truncated">只显示前100条授权记录</p>
    </a-modal>
  </main>
</template>
<script setup lang="ts">
import { h, onUnmounted, ref } from 'vue'
import { fetchDepartmentTree } from '@/api/system/department'
import {
  memberScopeRules,
  updateMemberScope,
  boundScopeMembers,
  previewMemberScope,
} from '@/api/member-data-scope'
import ProTable from '@/components/pro-table/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import { createCommandRetry } from '@/services/command-retry'
import { registerDirtyCheck } from '@/services/tenant-context'
import { departmentChoices } from '@af-admin/workflow-core'
import { DATA_SCOPE_PERMISSIONS, parseMemberScope } from '@af-admin/contracts'
import type { MemberScopeRule, RowScope } from '@af-admin/contracts'

const table = ref<ProTableExpose>()
const editing = ref<MemberScopeRule>()
const visible = ref(false)
const previewVisible = ref(false)
const error = ref('')
const previewError = ref('')
const scope = ref<RowScope>('self')
const selectedDepartments = ref<string[]>([])
const selectedFields = ref<string[]>([])
const departments = ref<{ value: string; label: string; disabled: boolean }[]>(
  []
)
const people = ref<{ id: string; name: string; username: string }[]>([])
const subjectId = ref('')
const rows = ref<Record<string, unknown>[]>([])
const previewed = ref(false)
const truncated = ref(false)
const retry = createCommandRetry()
const fields = [
  { value: 'username', label: '账号名称' },
  { value: 'name', label: '成员姓名' },
  { value: 'dept', label: '部门名称' },
  { value: 'status', label: '成员状态' },
  { value: 'phone', label: '电话' },
  { value: 'email', label: '邮箱' },
]
const labels: Record<RowScope, string> = {
  'self': '本人',
  'department': '部门',
  'department-and-children': '部门及下级',
  'all': '本租户全部',
  'tenant': '本租户全部（兼容）',
}
const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : '范围操作失败'
const unregister = registerDirtyCheck(() => visible.value)
onUnmounted(() => {
  unregister()
  retry.clear()
})
const load = async ({ current, pageSize }: ProTableFetchParams) => {
  const result = await memberScopeRules({ current, pageSize })
  return { ...result, list: result.list.map((value) => ({ ...value })) }
}
const open = async (value: MemberScopeRule) => {
  error.value = ''
  retry.clear()
  try {
    departments.value = departmentChoices(await fetchDepartmentTree())
    editing.value = value
    scope.value = value.dataScope
    selectedDepartments.value = [...value.departmentIds]
    selectedFields.value = [...value.fieldPermissions]
    visible.value = true
  } catch (failure) {
    error.value = message(failure)
  }
}
const save = async () => {
  if (!editing.value) return false
  try {
    const body = parseMemberScope({
      dataScope: scope.value,
      departmentIds: ['department', 'department-and-children'].includes(
        scope.value
      )
        ? selectedDepartments.value
        : [],
      fieldPermissions: selectedFields.value,
      expectedRevision: editing.value.revision,
    })
    const operation = `scope:${editing.value.roleId}`
    await updateMemberScope(
      editing.value.roleId,
      body,
      retry.key(operation, body)
    )
    retry.complete(operation)
    visible.value = false
    error.value = ''
    await table.value?.reload()
    return true
  } catch (failure) {
    error.value = message(failure)
    return false
  }
}
const openPreview = async (value: MemberScopeRule) => {
  try {
    people.value = await boundScopeMembers(value.roleId)
    editing.value = value
    subjectId.value = ''
    rows.value = []
    previewError.value = ''
    previewed.value = false
    truncated.value = false
    previewVisible.value = true
  } catch (failure) {
    error.value = message(failure)
  }
}
const preview = async () => {
  if (!editing.value || !subjectId.value) {
    previewError.value = '请选择已绑定角色的成员'
    return
  }
  try {
    const result = await previewMemberScope(
      editing.value.roleId,
      subjectId.value
    )
    rows.value = result.visibleRows
    truncated.value = result.truncated
    previewError.value = ''
    previewed.value = true
  } catch (failure) {
    previewError.value = message(failure)
  }
}
const action = (permission: string, name: string, run: () => void) =>
  h(
    PermissionButton,
    { permission, type: 'text', onClick: run },
    { default: () => name }
  )
const columns = [
  { title: '角色', dataIndex: 'roleName' },
  {
    title: '成员范围',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h('span', labels[record.dataScope as RowScope]),
  },
  {
    title: '可见字段',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h(
        'span',
        (record.fieldPermissions as string[])
          .map(
            (key) => fields.find((field) => field.value === key)?.label || key
          )
          .join('、')
      ),
  },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h('div', [
        action(DATA_SCOPE_PERMISSIONS.update, '配置', () =>
          open(record as unknown as MemberScopeRule)
        ),
        action(DATA_SCOPE_PERMISSIONS.preview, '预览', () =>
          openPreview(record as unknown as MemberScopeRule)
        ),
      ]),
  },
]
</script>
<style scoped>
.scope-page {
  padding: 24px;
  color: var(--color-text-1);
}
h1 {
  font-size: 22px;
  margin-bottom: 16px;
}
p {
  margin: 12px 0;
}
fieldset {
  margin: 16px 0;
  padding: 12px;
  border: 1px solid var(--color-border-2);
  max-height: 240px;
  overflow: auto;
}
.choice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}
select {
  padding: 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
  width: 100%;
  color: var(--color-text-1);
  background: var(--color-bg-2);
}
table {
  width: 100%;
  margin-top: 16px;
}
th,
td {
  padding: 8px;
  border: 1px solid var(--color-border-2);
  text-align: left;
}
[role='alert'] {
  color: var(--color-danger-6);
}
:focus-visible {
  outline: 2px solid var(--color-primary-6);
  outline-offset: 2px;
}
</style>
