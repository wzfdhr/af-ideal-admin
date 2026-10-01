<template>
  <main class="position-page" data-testid="position-system">
    <h1>岗位与组织成员</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <PermissionButton
      :permission="POSITION_PERMISSIONS.create"
      type="primary"
      @click="openEditor()"
    >
      新增岗位
    </PermissionButton>
    <section>
      <h2>岗位</h2>
      <ProTable
        ref="positionsTable"
        :fetch-data="loadPositions"
        :columns="positionColumns"
        row-key="id"
        empty-text="暂无岗位"
      />
    </section>
    <section v-if="canAssign">
      <h2>组织成员</h2>
      <ProTable
        ref="membersTable"
        :fetch-data="loadMembers"
        :columns="memberColumns"
        row-key="id"
      />
    </section>
    <dialog
      ref="editorDialog"
      aria-label="岗位编辑"
      @close="editorOpen = false"
      @keydown.esc.capture="closeEditorOnEscape"
      @cancel="guardDialogCancel"
    >
      <h2>{{ editing ? '编辑岗位' : '新增岗位' }}</h2>
      <p v-if="error" role="alert">{{ error }}</p>
      <ProForm
        v-if="editorOpen"
        ref="editor"
        v-model="values"
        :schema="schema"
        :submitter="save"
        hide-actions
      />
      <footer>
        <button type="button" :disabled="busy" @click="editorDialog?.close()">
          取消
        </button>
        <button type="button" :disabled="busy" @click="editor?.submit()">
          保存
        </button>
      </footer>
    </dialog>
    <dialog
      ref="assignmentDialog"
      aria-label="成员组织绑定"
      @cancel="guardDialogCancel"
    >
      <h2>{{ member?.name }} · 组织绑定</h2>
      <label>
        部门
        <select
          v-model="assignmentDepartment"
          aria-label="成员部门"
          @change="loadAvailablePositions"
        >
          <option
            v-for="item in departments"
            :key="String(item.value)"
            :value="item.value"
            :disabled="item.disabled"
          >
            {{ item.label }}
          </option>
        </select>
      </label>
      <label>
        岗位
        <select v-model="assignmentPosition" aria-label="成员岗位">
          <option value="">无岗位</option>
          <option
            v-for="item in availablePositions"
            :key="item.id"
            :value="item.id"
            :disabled="item.status !== 'enabled'"
          >
            {{ item.positionName }}
          </option>
        </select>
      </label>
      <p v-if="assignmentError" role="alert">{{ assignmentError }}</p>
      <footer>
        <button
          type="button"
          :disabled="busy"
          @click="assignmentDialog?.close()"
        >
          取消
        </button>
        <button
          type="button"
          :disabled="busy || !assignmentDepartment || !!assignmentError"
          @click="assign"
        >
          保存绑定
        </button>
      </footer>
    </dialog>
  </main>
</template>
<script setup lang="ts">
import { computed, h, nextTick, onMounted, ref } from 'vue'
import ProForm from '@/components/pro-form/index.vue'
import ProTable from '@/components/pro-table/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import useUserStore from '@/store/modules/user'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import {
  fetchPositions,
  savePosition,
  removePosition,
  fetchOrganizationMembers,
  assignOrganization,
  positionDepartmentTree,
} from '@/api/system/position'
import type { OrganizationMember } from '@/api/system/position'
import type {
  ProFormExpose,
  ProFormField,
  ProFormOption,
} from '@/components/pro-form/types'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import { POSITION_PERMISSIONS } from '@af-admin/contracts'
import { departmentChoices, hasPermission } from '@af-admin/workflow-core'
import type { Position, PositionInput } from '@af-admin/contracts'

const user = useUserStore()
const canAssign = computed(() =>
  hasPermission(user.permissions, POSITION_PERMISSIONS.assign)
)
const positionsTable = ref<ProTableExpose>()
const membersTable = ref<ProTableExpose>()
const editorDialog = ref<HTMLDialogElement>()
const assignmentDialog = ref<HTMLDialogElement>()
const editor = ref<ProFormExpose>()
const editorOpen = ref(false)
const values = ref<Record<string, unknown>>({})
const editing = ref<Position>()
const member = ref<OrganizationMember>()
const departments = ref<ProFormOption[]>([])
const availablePositions = ref<Position[]>([])
const assignmentDepartment = ref('')
const assignmentPosition = ref('')
const assignmentError = ref('')
const error = ref('')
const busy = ref(false)
const guardDialogCancel = (event: Event) => {
  if (busy.value) event.preventDefault()
}
const closeEditorOnEscape = (event: KeyboardEvent) => {
  if (editorDialog.value?.querySelector('.arco-select-view-opened')) return
  event.preventDefault()
  event.stopPropagation()
  if (!busy.value) editorDialog.value?.close()
}
let positionLookup = 0
const retry = createCommandRetry()
const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : '操作失败'
const loadDepartments = async () => {
  departments.value = departmentChoices(await positionDepartmentTree())
  return departments.value
}
const schema: ProFormField[] = [
  {
    field: 'departmentId',
    label: '所属部门',
    type: 'select',
    props: { popupContainer: 'dialog[aria-label="岗位编辑"]' },
    loadOptions: loadDepartments,
    rules: [{ required: true, message: '请选择部门' }],
  },
  {
    field: 'positionName',
    label: '岗位名称',
    type: 'input',
    placeholder: '请输入岗位名称',
    rules: [{ required: true, message: '请输入岗位名称' }],
  },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    defaultValue: 'enabled',
    props: { popupContainer: 'dialog[aria-label="岗位编辑"]' },
    options: [
      { label: '启用', value: 'enabled' },
      { label: '停用', value: 'disabled' },
    ],
  },
]
const loadPositions = async ({ current, pageSize }: ProTableFetchParams) => {
  const result = await fetchPositions({ current, pageSize })
  return { ...result, list: result.list.map((item) => ({ ...item })) }
}
const loadMembers = async ({ current, pageSize }: ProTableFetchParams) => {
  const result = await fetchOrganizationMembers({ current, pageSize })
  return { ...result, list: result.list.map((item) => ({ ...item })) }
}
const openEditor = async (value?: Position) => {
  editing.value = value
  retry.clear()
  error.value = ''
  values.value = value
    ? { ...value }
    : { departmentId: '', positionName: '', status: 'enabled' }
  editorOpen.value = true
  await nextTick()
  editorDialog.value?.showModal()
}
const refresh = async () => {
  await positionsTable.value?.reload().catch(() => undefined)
  await membersTable.value?.reload().catch(() => undefined)
}
const save = async (input: Record<string, unknown>) => {
  busy.value = true
  error.value = ''
  try {
    const body: PositionInput = {
      departmentId: String(input.departmentId || ''),
      positionName: String(input.positionName || ''),
      status: input.status === 'disabled' ? 'disabled' : 'enabled',
      ...(editing.value ? { expectedRevision: editing.value.revision } : {}),
    }
    const operation = editing.value ? `update:${editing.value.id}` : 'create'
    await savePosition(editing.value?.id, body, retry.key(operation, body))
    retry.complete(operation)
    editorDialog.value?.close()
    await refresh()
  } catch (failure) {
    error.value = message(failure)
    throw failure
  } finally {
    busy.value = false
  }
}
const remove = async (value: Position) => {
  if (
    !(await confirmR1Action(
      `确认删除岗位“${value.positionName}”？有关联成员时不可删除。`
    ))
  )
    return
  try {
    await removePosition(
      value,
      retry.key(`delete:${value.id}`, { expectedRevision: value.revision })
    )
    retry.complete(`delete:${value.id}`)
    await refresh()
  } catch (failure) {
    error.value = message(failure)
  }
}
const loadAvailablePositions = async () => {
  const lookup = ++positionLookup
  const departmentId = assignmentDepartment.value
  assignmentError.value = ''
  assignmentPosition.value = ''
  availablePositions.value = []
  if (!departmentId) return
  try {
    const items: Position[] = []
    let current = 1
    let total = 0
    do {
      // Read one tenant-scoped page at a time so a changed selection cancels the lookup.
      // eslint-disable-next-line no-await-in-loop
      const result = await fetchPositions({
        current,
        pageSize: 100,
        departmentId,
      })
      if (lookup !== positionLookup) return
      items.push(...result.list)
      total = result.total
      if (!result.list.length) break
      current += 1
    } while (items.length < total)
    availablePositions.value = items
  } catch (failure) {
    if (lookup === positionLookup) assignmentError.value = message(failure)
  }
}
const openAssignment = async (value: OrganizationMember) => {
  member.value = value
  retry.clear()
  assignmentDepartment.value = value.departmentId || ''
  assignmentError.value = ''
  try {
    await loadDepartments()
    await loadAvailablePositions()
    assignmentPosition.value = value.positionId || ''
    assignmentDialog.value?.showModal()
  } catch (failure) {
    error.value = message(failure)
  }
}
const assign = async () => {
  if (!member.value) return
  busy.value = true
  try {
    const target = member.value
    const body = {
      departmentId: assignmentDepartment.value,
      positionId: assignmentPosition.value || null,
      expectedRevision: target.revision,
    }
    await assignOrganization(
      target,
      body.departmentId,
      body.positionId,
      retry.key(`assign:${target.id}`, body)
    )
    retry.complete(`assign:${target.id}`)
    assignmentDialog.value?.close()
    await refresh()
  } catch (failure) {
    assignmentError.value = message(failure)
  } finally {
    busy.value = false
  }
}
const action = (permission: string, label: string, run: () => void) =>
  h(
    PermissionButton,
    { permission, type: 'text', onClick: run },
    { default: () => label }
  )
const positionColumns = [
  { title: '岗位名称', dataIndex: 'positionName' },
  {
    title: '所属部门',
    render: ({ record }: { record: Record<string, unknown> }) =>
      departments.value.find((item) => item.value === record.departmentId)
        ?.label || String(record.departmentId),
  },
  {
    title: '状态',
    render: ({ record }: { record: Record<string, unknown> }) =>
      record.status === 'enabled' ? '启用' : '停用',
  },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) =>
      h('div', [
        action(POSITION_PERMISSIONS.update, '编辑', () =>
          openEditor(record as unknown as Position)
        ),
        action(POSITION_PERMISSIONS.delete, '删除', () =>
          remove(record as unknown as Position)
        ),
      ]),
  },
]
const memberColumns = [
  { title: '成员', dataIndex: 'name' },
  {
    title: '所属部门',
    render: ({ record }: { record: Record<string, unknown> }) =>
      departments.value.find((item) => item.value === record.departmentId)
        ?.label || '未绑定',
  },
  {
    title: '岗位',
    render: ({ record }: { record: Record<string, unknown> }) =>
      String(record.positionName || '未绑定'),
  },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) =>
      action(POSITION_PERMISSIONS.assign, '组织绑定', () =>
        openAssignment(record as unknown as OrganizationMember)
      ),
  },
]
onMounted(() =>
  loadDepartments().catch((failure) => {
    error.value = message(failure)
  })
)
</script>
<style scoped>
.position-page {
  padding: 24px;
}
h1 {
  margin-bottom: 16px;
  font-size: 20px;
}
h2 {
  margin-bottom: 16px;
  font-size: 16px;
}
[role='alert'] {
  margin: 12px 0;
  color: var(--color-danger-6);
}
section {
  padding: 20px;
  margin: 20px 0;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
}
dialog {
  width: 520px;
  max-width: 90vw;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  padding: 24px;
  color: var(--color-text-1);
  background: var(--color-bg-2);
}
dialog::backdrop {
  background: #0008;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
button,
select {
  padding: 6px 12px;
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
}
label {
  display: block;
  margin: 16px 0;
}
select {
  width: 100%;
}
:focus-visible {
  outline: 2px solid var(--color-primary-6);
  outline-offset: 2px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
