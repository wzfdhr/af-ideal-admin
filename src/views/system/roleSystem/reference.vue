<template>
  <main class="role-page" data-testid="reference-role-system">
    <s-navs :navs="['menu.system', 'menu.system.role']" />
    <h1>角色与成员授权</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <section>
      <PermissionButton
        :permission="ROLE_PERMISSIONS.create"
        type="primary"
        @click="openRole()"
      >
        新增角色
      </PermissionButton>
    </section>
    <section>
      <h2>角色</h2>
      <ProTable
        ref="roleTable"
        :fetch-data="loadRoles"
        :columns="roleColumns"
        row-key="id"
      />
    </section>
    <section v-if="canAssign">
      <h2>成员授权</h2>
      <label>
        账号
        <input
          v-model="keyword"
          aria-label="查询授权账号"
          @keydown.enter="search"
        />
      </label>
      <button type="button" @click="search">查询成员</button>
      <ProTable
        ref="memberTable"
        :fetch-data="loadMembers"
        :columns="memberColumns"
        row-key="id"
      />
    </section>
    <a-modal
      v-model:visible="roleVisible"
      :title="editing ? '编辑角色' : '新增角色'"
      data-testid="role-editor-modal"
      unmount-on-close
      @before-ok="submitRole"
    >
      <p v-if="error" role="alert">{{ error }}</p>
      <ProForm
        ref="form"
        v-model="values"
        :schema="schema"
        :submitter="saveRole"
        hide-actions
      />
      <fieldset :disabled="!canBindPermissions">
        <legend>角色权限</legend>
        <label
          v-for="permission in catalogue"
          :key="permission.code"
          class="choice"
        >
          <input
            v-model="selectedPermissions"
            type="checkbox"
            :value="permission.code"
            :disabled="!permission.delegatable"
            :aria-label="permission.title"
          />
          {{ permission.module }} · {{ permission.title }}
        </label>
      </fieldset>
    </a-modal>
    <a-modal
      v-model:visible="authorizationVisible"
      title="成员授权"
      data-testid="member-authorization-modal"
      unmount-on-close
      @before-ok="saveAuthorization"
    >
      <p>
        {{ subject?.name ?? '无字段权限' }}（{{
          subject?.username ?? subject?.id
        }}）
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <fieldset>
        <legend>绑定角色</legend>
        <label v-for="role in choices" :key="role.id" class="choice">
          <input
            v-model="selectedRoles"
            type="checkbox"
            :value="role.id"
            :aria-label="role.roleName"
            :disabled="
              role.status !== 'enabled' && !selectedRoles.includes(role.id)
            "
          />
          {{ role.roleName }} {{ role.status === 'disabled' ? '（停用）' : '' }}
        </label>
      </fieldset>
      <fieldset>
        <legend>直接权限</legend>
        <p>直接授权与角色授权合并生效；撤销角色不会自动清除其他来源的权限。</p>
        <label
          v-for="permission in catalogue"
          :key="permission.code"
          class="choice"
        >
          <input
            v-model="directPermissions"
            type="checkbox"
            :value="permission.code"
            :aria-label="`直接权限：${permission.title}`"
            :disabled="!permission.delegatable"
          />
          {{ permission.title }}
        </label>
      </fieldset>
      <p v-if="authorization?.directPermissions.includes('*')">
        已有初始化通配授权不可通过此表单新增；保存将以当前明确选择的权限替换。
      </p>
      <h3>当前有效权限</h3>
      <ul>
        <li v-for="code in authorization?.effectivePermissions" :key="code">
          {{ label(code) }}
        </li>
      </ul>
    </a-modal>
  </main>
</template>
<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref } from 'vue'
import ProTable from '@/components/pro-table/index.vue'
import ProForm from '@/components/pro-form/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import type { ProFormExpose, ProFormField } from '@/components/pro-form/types'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import {
  permissionCatalogue,
  managedRoles,
  saveManagedRole,
  deleteManagedRole,
  authorizationMembers,
  memberAuthorization,
  saveMemberAuthorization,
} from '@/api/system/authorization'
import type {
  PermissionDefinition,
  AuthorizationMember,
  MemberAuthorization,
} from '@/api/system/authorization'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import { registerDirtyCheck } from '@/services/tenant-context'
import useUserStore from '@/store/modules/user'
import { hasPermission } from '@af-admin/workflow-core'
import { ROLE_PERMISSIONS, parseRole } from '@af-admin/contracts'
import type { ManagedRole } from '@af-admin/contracts'

const user = useUserStore()
const roleTable = ref<ProTableExpose>()
const memberTable = ref<ProTableExpose>()
const form = ref<ProFormExpose>()
const catalogue = ref<PermissionDefinition[]>([])
const choices = ref<ManagedRole[]>([])
const editing = ref<ManagedRole>()
const subject = ref<AuthorizationMember>()
const authorization = ref<MemberAuthorization>()
const roleVisible = ref(false)
const authorizationVisible = ref(false)
const error = ref('')
const keyword = ref('')
const values = ref<Record<string, unknown>>({})
const selectedPermissions = ref<string[]>([])
const selectedRoles = ref<string[]>([])
const directPermissions = ref<string[]>([])
const retry = createCommandRetry()
const canAssign = computed(() =>
  hasPermission(user.permissions, ROLE_PERMISSIONS.assign)
)
const canBindPermissions = computed(() =>
  hasPermission(user.permissions, ROLE_PERMISSIONS.permissions)
)
const unregister = registerDirtyCheck(
  () => roleVisible.value || authorizationVisible.value
)
onUnmounted(() => {
  unregister()
  retry.clear()
})
const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : '授权操作失败'
const label = (code: string) =>
  catalogue.value.find((value) => value.code === code)?.title || code
const schema: ProFormField[] = [
  {
    field: 'roleName',
    label: '角色名称',
    type: 'input',
    placeholder: '请输入角色名称',
    rules: [{ required: true }],
  },
  {
    field: 'roleKey',
    label: '角色标识',
    type: 'input',
    placeholder: '请输入角色标识',
    rules: [{ required: true }],
  },
  { field: 'roleSort', label: '排序', type: 'input', defaultValue: 0 },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    defaultValue: 'enabled',
    options: [
      { label: '启用', value: 'enabled' },
      { label: '停用', value: 'disabled' },
    ],
  },
  { field: 'remark', label: '备注', type: 'input' },
]
const loadRoles = async ({ current, pageSize }: ProTableFetchParams) => {
  const result = await managedRoles({ current, pageSize })
  return { ...result, list: result.list.map((role) => ({ ...role })) }
}
const loadMembers = async ({
  current,
  pageSize,
  filters,
}: ProTableFetchParams) => {
  const result = await authorizationMembers({
    current,
    pageSize,
    keyword: String(filters.keyword || ''),
  })
  return { ...result, list: result.list.map((member) => ({ ...member })) }
}
const search = () => memberTable.value?.setFilters({ keyword: keyword.value })
const openRole = async (value?: ManagedRole) => {
  error.value = ''
  retry.clear()
  try {
    catalogue.value = await permissionCatalogue()
    editing.value = value
    values.value = {
      roleName: value?.roleName || '',
      roleKey: value?.roleKey || '',
      roleSort: value?.roleSort || 0,
      status: value?.status || 'enabled',
      remark: value?.remark || '',
    }
    selectedPermissions.value = value ? [...value.permissions] : []
    roleVisible.value = true
  } catch (failure) {
    error.value = message(failure)
  }
}
const saveRole = async (input: Record<string, unknown>) => {
  error.value = ''
  try {
    const body = parseRole(
      {
        ...input,
        roleSort: Number(input.roleSort),
        permissions: selectedPermissions.value,
        ...(editing.value ? { expectedRevision: editing.value.revision } : {}),
      },
      !!editing.value
    )
    const operation = editing.value ? `update:${editing.value.id}` : 'create'
    await saveManagedRole(editing.value?.id, body, retry.key(operation, body))
    retry.complete(operation)
    roleVisible.value = false
    await user.info()
    await roleTable.value?.reload()
    await memberTable.value?.reload()
  } catch (failure) {
    error.value = message(failure)
    throw failure
  }
}
const submitRole = async () => (await form.value?.submit()) ?? false
const allRoles = async (
  current = 1,
  collected: ManagedRole[] = []
): Promise<ManagedRole[]> => {
  const page = await managedRoles({ current, pageSize: 100 })
  const result = [...collected, ...page.list]
  return page.list.length && result.length < page.total
    ? allRoles(current + 1, result)
    : result
}
const openAuthorization = async (member: AuthorizationMember) => {
  error.value = ''
  retry.clear()
  try {
    const [directory, roles, current] = await Promise.all([
      permissionCatalogue(),
      allRoles(),
      memberAuthorization(member.id),
    ])
    catalogue.value = directory
    choices.value = roles
    subject.value = member
    authorization.value = current
    selectedRoles.value = current.roles.map((role) => role.id)
    directPermissions.value = current.directPermissions.filter(
      (code) => code !== '*'
    )
    authorizationVisible.value = true
  } catch (failure) {
    error.value = message(failure)
  }
}
const saveAuthorization = async () => {
  if (!authorization.value) return false
  error.value = ''
  try {
    const target = authorization.value
    const body = {
      roleIds: [...selectedRoles.value].sort(),
      directPermissions: [...directPermissions.value].sort(),
      expectedRevision: target.revision,
    }
    const operation = `authorization:${target.id}`
    await saveMemberAuthorization(
      target,
      body.roleIds,
      body.directPermissions,
      retry.key(operation, body)
    )
    retry.complete(operation)
    authorizationVisible.value = false
    await user.info()
    await memberTable.value?.reload()
    return true
  } catch (failure) {
    error.value = message(failure)
    return false
  }
}
const removeRole = async (value: ManagedRole) => {
  if (
    !(await confirmR1Action(
      `确认删除角色“${value.roleName}”？角色仍绑定成员时必须先明确调整授权。`
    ))
  )
    return
  try {
    const operation = `delete:${value.id}`
    await deleteManagedRole(
      value,
      retry.key(operation, { expectedRevision: value.revision })
    )
    retry.complete(operation)
    error.value = ''
    await roleTable.value?.reload()
  } catch (failure) {
    error.value = message(failure)
  }
}
const statusLabel = (status: unknown) => {
  if (status === undefined) return '无字段权限'
  return status === 'enabled' ? '启用' : '停用'
}
const action = (permission: string, name: string, run: () => void) =>
  h(
    PermissionButton,
    { permission, type: 'text', onClick: run },
    { default: () => name }
  )
const roleColumns = [
  { title: '角色', dataIndex: 'roleName' },
  { title: '标识', dataIndex: 'roleKey' },
  {
    title: '状态',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h('span', statusLabel(record.status)),
  },
  {
    title: '权限数量',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h('span', String((record.permissions as string[]).length)),
  },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h('div', [
        action(ROLE_PERMISSIONS.update, '编辑', () =>
          openRole(record as unknown as ManagedRole)
        ),
        action(ROLE_PERMISSIONS.delete, '删除', () =>
          removeRole(record as unknown as ManagedRole)
        ),
      ]),
  },
]
const memberColumns = [
  {
    title: '账号',
    render: ({ record }: { record: Record<string, unknown> }) =>
      String(record.username ?? '无字段权限'),
  },
  {
    title: '成员',
    render: ({ record }: { record: Record<string, unknown> }) =>
      String(record.name ?? '无字段权限'),
  },
  {
    title: '状态',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h('span', statusLabel(record.status)),
  },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) =>
      action(ROLE_PERMISSIONS.assign, '配置授权', () =>
        openAuthorization(record as unknown as AuthorizationMember)
      ),
  },
]
onMounted(() =>
  permissionCatalogue()
    .then((value) => {
      catalogue.value = value
    })
    .catch((failure) => {
      error.value = message(failure)
    })
)
</script>
<style scoped>
.role-page {
  padding: 24px;
  color: var(--color-text-1);
}
h1 {
  font-size: 22px;
  margin-bottom: 16px;
}
h2 {
  font-size: 18px;
  margin-bottom: 12px;
}
section {
  padding: 20px;
  margin: 16px 0;
  background: var(--color-bg-2);
  border-radius: 8px;
}
fieldset {
  padding: 12px;
  margin: 16px 0;
  border: 1px solid var(--color-border-2);
  max-height: 260px;
  overflow: auto;
}
.choice {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 8px 0;
}
input,
button {
  padding: 6px 12px;
  margin-right: 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
}
[role='alert'] {
  color: var(--color-danger-6);
  margin: 12px 0;
}
:focus-visible {
  outline: 2px solid var(--color-primary-6);
  outline-offset: 2px;
}
</style>
