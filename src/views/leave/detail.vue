<template>
  <main class="leave-page" data-testid="leave-detail">
    <div class="leave-header">
      <div>
        <p>请假审批 / {{ isNew ? '新建申请' : '申请详情' }}</p>
        <h1>
          {{
            isNew ? '填写请假申请' : statusLabels[current?.status || 'draft']
          }}
        </h1>
      </div>
      <a-button @click="router.push('/leave/requests')">返回我的申请</a-button>
    </div>
    <a-alert
      v-if="error"
      type="error"
      :title="error"
      class="leave-alert"
      data-testid="leave-error"
    />
    <a-alert
      v-if="message"
      type="success"
      :title="message"
      class="leave-alert"
    />
    <a-spin :loading="loading" class="w-full">
      <div v-if="schema" class="leave-grid">
        <section class="leave-panel">
          <h2>{{ editable ? '申请内容' : '申请快照' }}</h2>
          <p class="leave-muted">
            申请人：{{ current?.applicantName || user.name }} · 部门：{{
              current?.departmentSnapshot || user.dept
            }}
            · {{ days }} 天
          </p>
          <FormRenderer
            ref="form"
            v-model="values"
            :ast="renderSchema"
            :class="{ 'leave-snapshot': !editable }"
          />
          <ul
            v-if="Object.keys(errors).length"
            role="alert"
            class="leave-field-errors"
          >
            <li v-for="(items, field) in errors" :key="field">
              {{ items.join('；') }}
            </li>
          </ul>
          <p class="leave-muted">
            按自然日半日计算，包含周末；本版本不扣减假期余额。
          </p>
          <div v-if="editable" class="leave-actions">
            <a-button
              :disabled="tenant.switching"
              :loading="busy"
              data-testid="leave-save"
              @click="save"
            >
              保存草稿
            </a-button>
            <a-button
              type="primary"
              :disabled="tenant.switching"
              :loading="busy"
              data-testid="leave-submit"
              @click="submit"
            >
              提交申请
            </a-button>
            <span class="leave-muted" data-testid="leave-save-state">
              {{
                dirty
                  ? '有未保存修改'
                  : current
                  ? `已保存 ${new Date(current.updatedAt).toLocaleString(
                      'zh-CN'
                    )}`
                  : '尚未保存'
              }}
            </span>
          </div>
          <div v-else class="leave-actions">
            <a-button
              v-if="current?.allowedActions.includes('withdraw')"
              :loading="busy"
              data-testid="leave-withdraw"
              @click="withdraw"
            >
              撤回申请
            </a-button>
            <a-button
              v-if="current?.allowedActions.includes('copy')"
              :disabled="busy"
              data-testid="leave-copy"
              @click="copy"
            >
              复制为新申请
            </a-button>
            <a-button
              :disabled="busy"
              data-testid="leave-reload"
              @click="reload"
            >
              刷新状态
            </a-button>
          </div>
          <div v-if="conflict" class="leave-actions">
            <span>保留了本地输入。请确认服务器状态后再操作。</span>
            <a-button data-testid="leave-conflict-reload" @click="reload">
              重新加载服务器版本
            </a-button>
          </div>
          <div v-if="releaseChanged" class="leave-actions">
            <a-button data-testid="leave-preview-latest" @click="previewLatest">
              预览最新发布版本
            </a-button>
          </div>
          <section
            v-if="proposedRelease"
            class="leave-panel mt-4"
            data-testid="leave-migration-preview"
          >
            <h2>新版本 v{{ proposedRelease.releaseVersion }}</h2>
            <FormRenderer :ast="proposedSchema" :model-value="values" />
            <a-checkbox v-model="migrationConfirmed">
              我已预览新版，确认迁移当前草稿
            </a-checkbox>
            <a-button
              :disabled="!migrationConfirmed || busy"
              data-testid="leave-confirm-migration"
              @click="migrateDraft"
            >
              使用新版保存草稿
            </a-button>
          </section>
        </section>
        <aside>
          <section
            v-if="activeTask"
            class="leave-panel"
            data-testid="leave-review-panel"
          >
            <h2>{{ activeTask.nodeName }}</h2>
            <label for="leave-review-comment">处理意见（驳回必填）</label>
            <textarea
              id="leave-review-comment"
              v-model="comment"
              rows="4"
              maxlength="2000"
              data-testid="leave-review-comment"
            ></textarea>
            <div class="leave-actions">
              <a-button
                v-if="canApprove"
                type="primary"
                :loading="busy"
                :disabled="tenant.switching"
                data-testid="leave-approve"
                @click="decide('approve')"
              >
                通过
              </a-button>
              <a-button
                v-if="canReject"
                status="danger"
                :loading="busy"
                :disabled="tenant.switching"
                data-testid="leave-reject"
                @click="decide('reject')"
              >
                驳回
              </a-button>
            </div>
          </section>
          <section class="leave-panel">
            <h2>版本与进度</h2>
            <p>
              发布版本：v{{
                current?.release?.releaseVersion || release?.releaseVersion
              }}
            </p>
            <p v-if="current">状态：{{ statusLabels[current.status] }}</p>
            <ol class="leave-history" data-testid="leave-history">
              <li v-for="item in current?.history || []" :key="item.id">
                <strong>{{ actionLabels[item.action] || item.action }}</strong>
                <p>
                  {{ item.operatorName }} ·
                  {{ new Date(item.createdAt).toLocaleString('zh-CN') }}
                </p>
                <p v-if="item.comment">{{ item.comment }}</p>
              </li>
            </ol>
            <p v-if="!current?.history?.length" class="leave-muted">
              提交后显示流程记录
            </p>
          </section>
        </aside>
      </div>
      <section v-else-if="!loading" class="leave-panel">
        <p>未能加载申请或没有查看权限。</p>
        <a-button @click="load">重试</a-button>
      </section>
    </a-spin>
  </main>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { FormRenderer } from '@/components/form-runtime'
import { migrateFormSchema } from '@/components/form-designer/schema'
import type { VersionedFormSchema } from '@/components/form-designer/schema'
import useUserStore from '@/store/modules/user'
import useTenantStore from '@/store/modules/tenant'
import { registerDirtyCheck } from '@/services/tenant-context'
import { createCommandRetry } from '@/services/command-retry'
import {
  createLeaveRequest,
  getLeaveApplication,
  getLeaveRequest,
  updateLeaveRequest,
  submitLeaveRequest,
  withdrawLeaveRequest,
  decideLeaveTask,
} from '@/api/leave'
import { calculateHalfDayUnits, parseLeaveFields } from '@af-admin/contracts'
import { hasPermission } from '@af-admin/workflow-core'
import {
  statusLabels,
  actionLabels,
  errorMessage,
  fieldErrors,
  isConflict,
  businessCode,
} from './shared'
import type {
  CreateLeaveInput,
  LeaveRequest,
  Release,
} from '@af-admin/contracts'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const tenant = useTenantStore()
const isNew = computed(() => route.params.id === 'new')
const loading = ref(false)
const busy = ref(false)
const current = ref<LeaveRequest>()
const release = ref<Release>()
const schema = ref<VersionedFormSchema>()
const proposedRelease = ref<Release>()
const migrationConfirmed = ref(false)
const error = ref('')
const message = ref('')
const comment = ref('')
const errors = ref<Record<string, string[]>>({})
const conflict = ref(false)
const releaseChanged = ref(false)
const today = new Date().toLocaleDateString('en-CA', {
  timeZone: 'Asia/Shanghai',
})
const values = ref<Record<string, unknown>>({
  leaveType: 'personal',
  startDate: today,
  startSlot: 'am',
  endDate: today,
  endSlot: 'pm',
  reason: '',
})
const saved = ref(JSON.stringify(values.value))
const form = ref<{
  validate: () => Promise<boolean>
  getValues: () => Record<string, unknown>
}>()
const previousId = ref<string>()
let creation: { payload: CreateLeaveInput; key: string } | undefined
const retry = createCommandRetry()
const editable = computed(() =>
  !current.value ? isNew.value : current.value.allowedActions.includes('edit')
)
const dirty = computed(
  () => editable.value && JSON.stringify(values.value) !== saved.value
)
const unregister = registerDirtyCheck(() => dirty.value || busy.value)
const readonlySchema = (ast: VersionedFormSchema) =>
  migrateFormSchema({
    ...ast,
    widgetsConfig: ast.widgetsConfig.map((item) => ({
      ...item,
      config: { ...item.config, disabled: true, readonly: true },
    })),
  })
const renderSchema = computed(() =>
  editable.value
    ? (schema.value as VersionedFormSchema)
    : readonlySchema(schema.value as VersionedFormSchema)
)
const proposedSchema = computed(() =>
  readonlySchema(migrateFormSchema(proposedRelease.value?.formSnapshot))
)
const activeTask = computed(() =>
  current.value?.tasks?.find(
    (task) => task.assigneeId === user.id && task.status === 'pending'
  )
)
const canApprove = computed(() =>
  hasPermission(user.permissions, 'workflow:approve')
)
const canReject = computed(() =>
  hasPermission(user.permissions, 'workflow:reject')
)
const days = computed(() => {
  try {
    return calculateHalfDayUnits(parseLeaveFields(values.value, true)) / 2
  } catch {
    return '—'
  }
})
const pickValues = (item: LeaveRequest) => ({
  leaveType: item.leaveType,
  startDate: item.startDate,
  startSlot: item.startSlot,
  endDate: item.endDate,
  endSlot: item.endSlot,
  reason: item.reason,
})
const showFailure = (failure: unknown) => {
  error.value = errorMessage(failure)
  errors.value = fieldErrors(failure)
  conflict.value = isConflict(failure)
  releaseChanged.value = businessCode(failure) === 'RELEASE_CHANGED'
}
const load = async () => {
  loading.value = true
  error.value = ''
  try {
    if (isNew.value) {
      const app = await getLeaveApplication('leave')
      release.value = app.releases?.find(
        (item) => item.id === app.activeReleaseId
      )
      if (!release.value) throw new Error('应用尚未发布')
      schema.value = migrateFormSchema(release.value.formSnapshot)
      if (typeof route.query.previousId === 'string') {
        const old = await getLeaveRequest(route.query.previousId)
        previousId.value = old.id
        values.value = pickValues(old)
      }
    } else {
      current.value = await getLeaveRequest(String(route.params.id))
      release.value = current.value.release
      schema.value = migrateFormSchema(release.value?.formSnapshot)
      values.value = pickValues(current.value)
    }
    saved.value = JSON.stringify(values.value)
  } catch (failure) {
    showFailure(failure)
  } finally {
    loading.value = false
  }
}
const persist = async (targetRelease?: string) => {
  const fields = parseLeaveFields(values.value, true)
  if (!current.value) {
    if (!creation) {
      const payload: CreateLeaveInput = {
        applicationReleaseId: release.value?.id || '',
        fields,
        ...(previousId.value ? { previousRequestId: previousId.value } : {}),
      }
      creation = { payload, key: retry.key('create', payload) }
    }
    current.value = await createLeaveRequest(creation.payload, creation.key)
    creation = undefined
    retry.complete('create')
    if (JSON.stringify(pickValues(current.value)) !== JSON.stringify(fields))
      current.value = await updateLeaveRequest(current.value.id, {
        fields,
        expectedRevision: current.value.revision,
      })
  } else {
    current.value = await updateLeaveRequest(current.value.id, {
      fields,
      expectedRevision: current.value.revision,
      ...(targetRelease ? { applicationReleaseId: targetRelease } : {}),
    })
  }
  values.value = pickValues(current.value)
  saved.value = JSON.stringify(values.value)
}
const perform = async (action: () => Promise<void>) => {
  if (busy.value || tenant.switching) return
  busy.value = true
  error.value = ''
  message.value = ''
  errors.value = {}
  conflict.value = false
  try {
    await action()
  } catch (failure) {
    showFailure(failure)
  } finally {
    busy.value = false
  }
}
const save = () =>
  perform(async () => {
    await persist()
    message.value = '草稿已保存'
    if (isNew.value)
      await router.replace(`/leave/requests/${current.value?.id}`)
  })
const submit = () =>
  perform(async () => {
    if (!(await form.value?.validate())) throw new Error('请检查表单必填项')
    parseLeaveFields(values.value)
    if (!current.value || dirty.value) await persist()
    const item = current.value as LeaveRequest
    const payload = { expectedRevision: item.revision }
    current.value = await submitLeaveRequest(
      item.id,
      item.revision,
      retry.key(`submit:${item.id}`, payload)
    )
    retry.complete(`submit:${item.id}`)
    saved.value = JSON.stringify(values.value)
    message.value = '申请已提交，等待审批'
    if (isNew.value) await router.replace(`/leave/requests/${item.id}`)
    else current.value = await getLeaveRequest(item.id)
  })
const withdraw = () =>
  perform(async () => {
    const item = current.value as LeaveRequest
    if (!window.confirm('确认撤回这份申请？')) return
    const operation = `withdraw:${item.instanceId}`
    await withdrawLeaveRequest(
      item.instanceId as string,
      item.revision,
      retry.key(operation, { expectedRevision: item.revision })
    )
    retry.complete(operation)
    current.value = await getLeaveRequest(item.id)
    message.value = '申请已撤回'
  })
const decide = (action: 'approve' | 'reject') =>
  perform(async () => {
    const task = activeTask.value
    if (!task) throw new Error('当前没有可处理的任务')
    if (action === 'reject' && !comment.value.trim())
      throw new Error('驳回必须填写处理意见')
    if (
      !window.confirm(
        action === 'approve' ? '确认通过这份申请？' : '确认驳回这份申请？'
      )
    )
      return
    const operation = `${action}:${task.id}`
    await decideLeaveTask(
      task.id,
      action,
      task.revision,
      comment.value,
      retry.key(operation, {
        expectedRevision: task.revision,
        comment: comment.value,
      })
    )
    retry.complete(operation)
    current.value = await getLeaveRequest(current.value?.id as string)
    message.value = action === 'approve' ? '已通过当前审批节点' : '申请已驳回'
    comment.value = ''
  })
const copy = () =>
  router.push({
    path: '/leave/requests/new',
    query: { previousId: current.value?.id },
  })
const reload = async () => {
  if (dirty.value && !window.confirm('重新加载将丢弃本地修改，是否继续？'))
    return
  conflict.value = false
  await load()
}
const previewLatest = async () => {
  try {
    const app = await getLeaveApplication('leave')
    proposedRelease.value = app.releases?.find(
      (item) => item.id === app.activeReleaseId
    )
    migrationConfirmed.value = false
  } catch (failure) {
    showFailure(failure)
  }
}
const migrateDraft = () =>
  perform(async () => {
    if (!migrationConfirmed.value || !proposedRelease.value) return
    await persist(proposedRelease.value.id)
    release.value = proposedRelease.value
    schema.value = migrateFormSchema(release.value.formSnapshot)
    proposedRelease.value = undefined
    releaseChanged.value = false
    message.value = '已确认迁移并保存，可重新提交'
  })
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value || busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeRouteLeave(
  () => !dirty.value || window.confirm('当前有未保存内容，确认离开？')
)
onMounted(() => {
  load()
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  unregister()
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>
<style src="./style.css"></style>
<style scoped>
.leave-history {
  padding-left: 18px;
}
.leave-history li {
  border-left: 2px solid var(--color-border-2);
  padding: 0 0 16px 12px;
  margin-left: 4px;
}
.leave-history p {
  font-size: 13px;
  color: var(--color-text-3);
  margin: 4px 0;
}
.leave-field-errors {
  color: var(--color-danger-6);
}
</style>
