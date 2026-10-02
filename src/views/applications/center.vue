<template>
  <main class="application-center" data-testid="application-center">
    <h1>应用中心</h1>
    <ApplicationPackageImport @imported="table?.reload()" />
    <p v-if="error" role="alert">{{ error }}</p>
    <PermissionButton :permission="P.create" type="primary" @click="open()">
      创建应用
    </PermissionButton>
    <label>
      查询应用
      <input v-model="keyword" aria-label="查询应用" />
    </label>
    <a-button @click="table?.reload()">查询</a-button>
    <ProTable ref="table" :fetch-data="load" :columns="columns" row-key="id" />
    <a-modal
      v-model:visible="visible"
      :title="editing ? '应用信息' : source ? '独立复制应用' : '创建应用'"
      data-testid="application-center-editor"
      @before-ok="save"
    >
      <p v-if="editorError" role="alert">{{ editorError }}</p>
      <label>
        应用名称
        <input v-model="name" aria-label="应用名称" maxlength="100" />
      </label>
      <label>
        应用标识
        <input
          v-model="code"
          aria-label="应用标识"
          :disabled="Boolean(editing)"
          maxlength="64"
        />
      </label>
      <label>
        说明
        <textarea v-model="description" aria-label="应用说明" maxlength="500" />
      </label>
      <label v-if="!source && !editing">
        初始模板
        <select v-model="template" aria-label="初始模板">
          <option value="blank">空白应用</option>
          <option value="leave">请假审批模板</option>
          <option value="equipment">设备领用模板</option>
        </select>
      </label>
      <p v-else-if="source">
        复制已发布快照或明确保存的草稿，新副本需要独立发布。
      </p>
    </a-modal>
  </main>
</template>
<script setup lang="ts">
import { h, ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import ApplicationPackageImport from '@/components/application-package-import.vue'
import { exportApplicationPackage } from '@/api/application-packages'
import {
  listApplications,
  createApplication,
  copyApplication,
  changeApplicationState,
  updateApplicationMetadata,
} from '@/api/application-center'
import ProTable from '@/components/pro-table/index.vue'
import PermissionButton from '@/components/permission-button.vue'
import type {
  ProTableExpose,
  ProTableFetchParams,
} from '@/components/pro-table/types'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import { registerDirtyCheck } from '@/services/tenant-context'
import {
  APPLICATION_PERMISSIONS as P,
  parseApplicationCreate,
  parseApplicationCopy,
} from '@af-admin/contracts'
import type { ManagedApplication } from '@af-admin/contracts'

const table = ref<ProTableExpose>()
const router = useRouter()
const retry = createCommandRetry()
const error = ref('')
const editorError = ref('')
const keyword = ref('')
const visible = ref(false)
const source = ref<ManagedApplication>()
const editing = ref<ManagedApplication>()
const name = ref('')
const code = ref('')
const description = ref('')
const template = ref<'blank' | 'leave' | 'equipment'>('blank')
const unregister = registerDirtyCheck(() => visible.value)
onUnmounted(() => {
  unregister()
  retry.clear()
})
const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : '应用操作未完成'
const load = async ({ current, pageSize }: ProTableFetchParams) => {
  const result = await listApplications({
    current,
    pageSize,
    keyword: keyword.value,
  })
  return { ...result, list: result.list.map((app) => ({ ...app })) }
}
const open = (app?: ManagedApplication) => {
  editing.value = undefined
  source.value = app
  name.value = app ? `${app.name}副本` : ''
  code.value = ''
  description.value = app?.description || ''
  template.value = 'blank'
  editorError.value = ''
  retry.clear()
  visible.value = true
}
const edit = (app: ManagedApplication) => {
  open()
  editing.value = app
  name.value = app.name
  code.value = app.code
  description.value = app.description
}
const save = async () => {
  try {
    const metadata = {
      name: name.value,
      code: code.value,
      description: description.value,
    }
    if (editing.value) {
      const body = { name: name.value, description: description.value }
      await updateApplicationMetadata(
        editing.value,
        body,
        retry.key(`metadata:${editing.value.id}`, {
          ...body,
          expectedRevision: editing.value.revision,
        })
      )
    } else if (source.value) {
      const body: Record<string, unknown> = {
        ...metadata,
        expectedRevision: source.value.revision,
      }
      if (!source.value.activeReleaseId) {
        body.formRevision = source.value.formRevision
        body.workflowRevision = source.value.workflowRevision
      }
      const parsed = parseApplicationCopy(body)
      await copyApplication(
        source.value.id,
        parsed,
        retry.key(`copy:${source.value.id}`, parsed)
      )
    } else {
      const parsed = parseApplicationCreate({
        ...metadata,
        template: template.value,
      })
      await createApplication(parsed, retry.key('create', parsed))
    }
    retry.clear()
    visible.value = false
    error.value = ''
    await table.value?.reload()
    return true
  } catch (failure) {
    editorError.value = message(failure)
    return false
  }
}
const state = async (app: ManagedApplication) => {
  const status = app.status === 'archived' ? 'enabled' : 'archived'
  if (
    !(await confirmR1Action(
      status === 'archived'
        ? '确认归档？新申请将被阻止，历史流程可继续处理。'
        : '确认恢复应用？'
    ))
  )
    return
  try {
    const payload = { status, expectedRevision: app.revision }
    await changeApplicationState(
      app,
      status,
      retry.key(`state:${app.id}`, payload)
    )
    retry.complete(`state:${app.id}`)
    error.value = ''
    await table.value?.reload()
  } catch (failure) {
    error.value = message(failure)
  }
}
const exportPackage = async (app: ManagedApplication) => {
  try {
    const pkg = await exportApplicationPackage(app)
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${app.code}.af-application.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (failure) {
    error.value = message(failure)
  }
}
const action = (permission: string, label: string, run: () => void) =>
  h(
    PermissionButton,
    { permission, type: 'text', onClick: run },
    { default: () => label }
  )
const columns = [
  { title: '应用名称', dataIndex: 'name' },
  { title: '标识', dataIndex: 'code' },
  {
    title: '状态',
    render: ({ record }: { record: Record<string, unknown> }) => {
      if (record.status === 'archived') return '已归档'
      return record.activeReleaseId ? '已发布' : '未发布'
    },
  },
  {
    title: '操作',
    render: ({ record }: { record: Record<string, unknown> }) => {
      const app = record as unknown as ManagedApplication
      const actions = [
        action('application:configure', '配置', () =>
          router.push(`/applications/${app.id}/configuration`)
        ),
      ]
      if (app.status === 'enabled') {
        actions.push(action(P.copy, '复制', () => open(app)))
        actions.push(
          action('application:configure', '应用信息', () => edit(app))
        )
      }
      actions.push(
        action(P.archive, app.status === 'archived' ? '恢复' : '归档', () =>
          state(app)
        )
      )
      if (
        app.status === 'enabled' &&
        app.activeReleaseId &&
        app.businessKind === 'leave'
      )
        actions.push(
          action('leave:create', '运行', () =>
            router.push({
              path: '/leave/requests/new',
              query: { applicationId: app.id },
            })
          )
        )
      if (
        app.status === 'enabled' &&
        app.activeReleaseId &&
        app.businessKind === 'generic'
      )
        actions.push(
          action('business:create', '运行', () =>
            router.push({
              path: '/business/records/new',
              query: { applicationId: app.id },
            })
          )
        )
      actions.push(
        action('application:export', '导出定义包', () => exportPackage(app))
      )
      return h('div', actions)
    },
  },
]
</script>
<style scoped>
.application-center {
  padding: 24px;
  color: var(--color-text-1);
}
h1 {
  font-size: 24px;
  margin-bottom: 20px;
}
label {
  display: block;
  margin: 16px 0;
}
input,
textarea,
select {
  display: block;
  width: 100%;
  padding: 8px;
  color: var(--color-text-1);
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
  border-radius: 4px;
}
[role='alert'] {
  color: var(--color-danger-6);
  margin: 16px 0;
}
:focus-visible {
  outline: 2px solid var(--color-primary-6);
  outline-offset: 2px;
}
</style>
