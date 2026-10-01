<template>
  <main class="member-page" data-testid="reference-user-system">
    <s-navs :navs="['menu.system', 'menu.system.user']" />
    <h1>用户与租户成员</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <section>
      <label>
        账号名称
        <input
          v-model="username"
          aria-label="查询账号名称"
          @keydown.enter="search"
        />
      </label>
      <button type="button" @click="search">搜索</button>
      <PermissionButton
        :permission="USER_PERMISSIONS.create"
        type="primary"
        @click="openEditor()"
      >
        新增用户
      </PermissionButton>
    </section>
    <section>
      <ProTable
        ref="table"
        :fetch-data="load"
        :columns="columns"
        row-key="id"
        empty-text="暂无租户成员"
      />
    </section>
    <a-modal
      v-model:visible="editorVisible"
      :title="editing ? '编辑成员' : '新增用户'"
      data-testid="member-editor-modal"
      unmount-on-close
      @before-ok="submit"
      @close="clearPrivateInput"
    >
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="editing">
        账号 {{ editing.username }}；目前电话
        {{ editing.phone || '未填写' }}，邮箱
        {{ editing.email || '未填写' }}。新值留空保持原资料。
      </p>
      <p v-else>新成员初始业务权限未分配，身份和私有密码会单独创建。</p>
      <ProForm
        ref="form"
        v-model="values"
        :schema="schema"
        :submitter="save"
        hide-actions
      />
      <template v-if="editing">
        <label>
          <input v-model="clearPhone" type="checkbox" />
          清空电话
        </label>
        <label>
          <input v-model="clearEmail" type="checkbox" />
          清空邮箱
        </label>
      </template>
      <label v-else class="private-field">
        初始密码
        <input
          v-model="password"
          aria-label="初始密码"
          type="password"
          autocomplete="new-password"
          minlength="16"
          maxlength="200"
        />
      </label>
    </a-modal>
    <a-modal
      v-model:visible="passwordVisible"
      title="重置成员密码"
      data-testid="member-password-modal"
      @before-ok="resetPassword"
      @close="clearPrivateInput"
    >
      <p>仅限本租户创建且未被其他租户共用的身份；重置后原会话失效。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <label class="private-field">
        新密码
        <input
          v-model="password"
          aria-label="重置密码"
          type="password"
          autocomplete="new-password"
          minlength="16"
          maxlength="200"
        />
      </label>
    </a-modal>
    <a-modal v-model:visible="detailVisible" title="成员详情" :footer="false">
      <dl v-if="detail">
        <dt>账号</dt>
        <dd>{{ detail.username }}</dd>
        <dt>姓名</dt>
        <dd>{{ detail.name }}</dd>
        <dt>电话</dt>
        <dd>{{ detail.phone || '未填写' }}</dd>
        <dt>邮箱</dt>
        <dd>{{ detail.email || '未填写' }}</dd>
        <dt>部门</dt>
        <dd>{{ detail.dept }}</dd>
        <dt>状态</dt>
        <dd>{{ detail.status === 'enabled' ? '启用' : '停用' }}</dd>
      </dl>
    </a-modal>
  </main>
</template>
<script setup lang="ts">
import { computed, h, onUnmounted, ref } from 'vue'
import ProTable from '@/components/pro-table/index.vue'
import ProForm from '@/components/pro-form/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import type { ProFormExpose, ProFormField } from '@/components/pro-form/types'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import {
  queryMembers,
  memberDetail,
  createMember,
  updateMember,
  deleteMember,
  resetMemberPassword,
} from '@/api/system/member'
import type { MemberRecord } from '@/api/system/member'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import {
  registerDirtyCheck,
  resetTenantContext,
} from '@/services/tenant-context'
import { clearAuth } from '@/services/auth'
import useUserStore from '@/store/modules/user'
import {
  USER_PERMISSIONS,
  parseUserCreate,
  parseUserUpdate,
  privatePassword,
} from '@af-admin/contracts'

const user = useUserStore()
const table = ref<ProTableExpose>()
const form = ref<ProFormExpose>()
const username = ref('')
const editorVisible = ref(false)
const passwordVisible = ref(false)
const detailVisible = ref(false)
const editing = ref<MemberRecord>()
const detail = ref<MemberRecord>()
const values = ref<Record<string, unknown>>({})
const password = ref('')
const clearPhone = ref(false)
const clearEmail = ref(false)
const error = ref('')
const retry = createCommandRetry()
const unregister = registerDirtyCheck(
  () => editorVisible.value || passwordVisible.value
)
const clearPrivateInput = () => {
  password.value = ''
  retry.clear()
}
onUnmounted(() => {
  unregister()
  clearPrivateInput()
})
const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : '操作失败'
const schema = computed<ProFormField[]>(() => {
  const result: ProFormField[] = [
    {
      field: 'name',
      label: '成员姓名',
      type: 'input',
      placeholder: '请输入成员姓名',
      rules: [{ required: true }],
    },
    {
      field: 'phone',
      label: '新电话',
      type: 'input',
      placeholder: editing.value ? '留空保持原电话' : '请输入电话（可选）',
    },
    {
      field: 'email',
      label: '新邮箱',
      type: 'input',
      placeholder: editing.value ? '留空保持原邮箱' : '请输入邮箱（可选）',
    },
    {
      field: 'status',
      label: '成员状态',
      type: 'select',
      defaultValue: 'enabled',
      options: [
        { label: '启用', value: 'enabled' },
        { label: '停用', value: 'disabled' },
      ],
    },
  ]
  if (!editing.value)
    result.unshift({
      field: 'username',
      label: '账号名称',
      type: 'input',
      placeholder: '请输入账号名称',
      rules: [{ required: true }],
    })
  return result
})
const load = async ({ current, pageSize, filters }: ProTableFetchParams) => {
  const result = await queryMembers({
    current,
    pageSize,
    username: String(filters.username || ''),
  })
  return { ...result, list: result.list.map((value) => ({ ...value })) }
}
const search = () => table.value?.setFilters({ username: username.value })
const openEditor = (value?: MemberRecord) => {
  editing.value = value
  error.value = ''
  clearPrivateInput()
  clearPhone.value = false
  clearEmail.value = false
  values.value = value
    ? { name: value.name, phone: '', email: '', status: value.status }
    : { username: '', name: '', phone: '', email: '', status: 'enabled' }
  editorVisible.value = true
}
const exitRevokedContext = () => {
  clearAuth()
  resetTenantContext()
  window.location.assign('/login')
}
const save = async (input: Record<string, unknown>) => {
  error.value = ''
  try {
    if (editing.value) {
      const member = editing.value
      const body = parseUserUpdate({
        name: input.name,
        status: input.status,
        expectedRevision: member.revision,
        ...(clearPhone.value || input.phone
          ? { phone: clearPhone.value ? '' : input.phone }
          : {}),
        ...(clearEmail.value || input.email
          ? { email: clearEmail.value ? '' : input.email }
          : {}),
      })
      const operation = `update:${member.id}`
      const saved = await updateMember(
        member.id,
        body,
        retry.key(operation, body)
      )
      retry.complete(operation)
      if (saved.id === user.id) {
        if (saved.status === 'disabled') {
          exitRevokedContext()
          return
        }
        await user.info()
      }
    } else {
      const body = parseUserCreate({
        ...input,
        initialPassword: password.value,
      })
      await createMember(body, retry.key('create', body))
      retry.complete('create')
    }
    editorVisible.value = false
    await table.value?.reload()
  } catch (failure) {
    error.value = message(failure)
    throw failure
  }
}
const submit = async () => {
  return (await form.value?.submit()) ?? false
}
const remove = async (value: MemberRecord) => {
  if (
    !(await confirmR1Action(
      `确认撤销“${value.name}”在当前租户的成员关系？历史记录保留，待办或最后管理员冲突会阻止操作。`
    ))
  )
    return
  try {
    const operation = `delete:${value.id}`
    await deleteMember(
      value,
      retry.key(operation, { expectedRevision: value.revision })
    )
    retry.complete(operation)
    if (value.id === user.id) {
      exitRevokedContext()
      return
    }
    error.value = ''
    await table.value?.reload()
  } catch (failure) {
    error.value = message(failure)
  }
}
const inspect = async (value: MemberRecord) => {
  try {
    detail.value = await memberDetail(value.id)
    detailVisible.value = true
    error.value = ''
  } catch (failure) {
    error.value = message(failure)
  }
}
const openPassword = (value: MemberRecord) => {
  editing.value = value
  clearPrivateInput()
  error.value = ''
  passwordVisible.value = true
}
const resetPassword = async () => {
  if (!editing.value) return false
  try {
    const member = editing.value
    const value = privatePassword(password.value)
    const operation = `password:${member.id}`
    await resetMemberPassword(
      member,
      value,
      retry.key(operation, {
        initialPassword: value,
        expectedRevision: member.revision,
        expectedCredentialRevision: member.credentialRevision,
      })
    )
    retry.complete(operation)
    passwordVisible.value = false
    if (member.id === user.id) {
      exitRevokedContext()
      return true
    }
    error.value = ''
    await table.value?.reload()
    return true
  } catch (failure) {
    error.value = message(failure)
    return false
  }
}
const action = (permission: string, label: string, run: () => void) =>
  h(
    PermissionButton,
    { permission, type: 'text', onClick: run },
    { default: () => label }
  )
const columns = [
  { title: '账号', dataIndex: 'username' },
  { title: '姓名', dataIndex: 'name' },
  { title: '电话', dataIndex: 'phone' },
  { title: '邮箱', dataIndex: 'email' },
  { title: '部门', dataIndex: 'dept' },
  {
    title: '状态',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h('span', record.status === 'enabled' ? '启用' : '停用'),
  },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) => {
      const member = record as unknown as MemberRecord
      return h('div', [
        action(USER_PERMISSIONS.detail, '详情', () => inspect(member)),
        action(USER_PERMISSIONS.update, '编辑', () => openEditor(member)),
        action(USER_PERMISSIONS.resetPassword, '重置密码', () =>
          openPassword(member)
        ),
        action(USER_PERMISSIONS.delete, '撤销成员', () => remove(member)),
      ])
    },
  },
]
</script>
<style scoped>
.member-page {
  padding: 24px;
}
h1 {
  font-size: 20px;
  margin-bottom: 16px;
}
section {
  padding: 20px;
  margin: 16px 0;
  background: var(--color-bg-2);
  border-radius: 8px;
}
label {
  display: inline-block;
  margin-right: 16px;
}
.private-field {
  display: block;
  margin-top: 16px;
}
input,
button {
  border: 1px solid var(--color-border-2);
  padding: 6px 12px;
  border-radius: 4px;
}
input {
  color: var(--color-text-1);
  background: var(--color-bg-2);
}
[role='alert'] {
  color: var(--color-danger-6);
  margin: 12px 0;
}
dd {
  margin: 4px 0 16px;
}
:focus-visible {
  outline: 2px solid var(--color-primary-6);
  outline-offset: 2px;
}
</style>
