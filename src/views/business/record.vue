<template>
  <main class="business-record" data-testid="business-record">
    <h1>{{ current ? statusLabels[current.status] : '新建业务申请' }}</h1>
    <p v-if="error" role="alert" data-testid="business-error">{{ error }}</p>
    <ul v-if="Object.keys(validation).length" role="alert">
      <li v-for="(items, key) in validation" :key="key">
        {{ fieldName(String(key)) }}：{{ items.join('；') }}
      </li>
    </ul>
    <section v-if="ast">
      <FormRenderer v-if="editable" v-model="values" :ast="ast" />
      <dl v-else class="record-values">
        <template
          v-for="widget in release?.formSnapshot.widgetsConfig"
          :key="widget.uid"
        >
          <dt>{{ widget.config.label || widget.name }}</dt>
          <dd>{{ displayValue(widget.uid) }}</dd>
        </template>
      </dl>
      <p v-for="(amount, key) in computedFields" :key="key">
        计算金额：
        <strong data-testid="business-total">{{ amount }} 元</strong>
      </p>
      <div class="actions">
        <a-button
          v-if="editable"
          data-testid="business-save"
          :disabled="busy"
          @click="save"
        >
          保存草稿
        </a-button>
        <a-button
          v-if="current?.allowedActions.includes('submit')"
          data-testid="business-submit"
          :disabled="busy || dirty"
          @click="submit"
        >
          提交审批
        </a-button>
        <a-button
          v-if="current?.allowedActions.includes('withdraw')"
          data-testid="business-withdraw"
          :disabled="busy"
          @click="withdraw"
        >
          撤回申请
        </a-button>
        <a-button :disabled="busy" @click="reload">重新加载</a-button>
        <a-button
          v-if="releaseChanged"
          data-testid="business-migrate"
          :disabled="busy"
          @click="migrate"
        >
          查看并确认最新版本
        </a-button>
      </div>
    </section>
    <section v-if="pendingTask && current?.status === 'running'">
      <label v-if="(current?.tasks.length || 0) > 1">
        选择待办任务
        <select v-model="selectedTaskId" aria-label="选择待办任务">
          <option
            v-for="task in current?.tasks"
            :key="task.id"
            :value="task.id"
          >
            {{ task.nodeName || '审批任务' }}
          </option>
        </select>
      </label>
      <p>{{ pendingTask.nodeName || '当前审批任务' }}</p>
      <label>
        处理意见
        <textarea v-model="comment" aria-label="处理意见" maxlength="500" />
      </label>
      <a-button
        v-if="can('workflow:approve')"
        data-testid="business-approve"
        :disabled="busy"
        @click="decide('approve')"
      >
        通过
      </a-button>
      <a-button
        v-if="can('workflow:reject')"
        data-testid="business-reject"
        :disabled="busy"
        @click="decide('reject')"
      >
        驳回
      </a-button>
    </section>
    <section
      v-if="current?.activities?.length"
      aria-label="并行与会签进度"
      data-testid="parallel-progress"
    >
      <h2>并行与会签进度</h2>
      <ul>
        <li
          v-for="activity in current.activities"
          :key="activity.id"
          :data-activity-node="activity.nodeId"
        >
          {{ activity.nodeName }} ·
          {{ activityLabels[activity.status] || activity.status }}
          <span v-if="activity.kind === 'fork'">
            · 已汇合 {{ activity.arrivedBranches }}/{{
              activity.expectedBranches
            }}
            条分支
          </span>
          <span v-else>
            · 已批准 {{ activity.approved }}/{{ activity.threshold }} 票 · 待签
            {{ activity.pending }} 人 · 已拒绝 {{ activity.rejected }} 人
          </span>
        </li>
      </ul>
    </section>
    <section v-if="current?.history.length">
      <h2>处理历史</h2>
      <ol>
        <li v-for="item in current.history" :key="item.id">
          {{ actionLabels[item.action] || item.action }} ·
          {{ item.operatorName }} · {{ item.comment }}
        </li>
      </ol>
    </section>
    <StoredFiles v-if="current" :record-id="current.id" :editable="editable" />
  </main>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  useRoute,
  useRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
} from 'vue-router'
import StoredFiles from '@/components/stored-files.vue'
import { FormRenderer, migrateFormSchema } from '@/components/form-runtime'
import type { VersionedFormSchema } from '@/components/form-designer/schema'
import {
  businessApplication,
  businessRecord,
  createBusinessRecord,
  updateBusinessRecord,
  submitBusinessRecord,
  withdrawBusinessRecord,
} from '@/api/business-records'
import type { BusinessDetail } from '@/api/business-records'
import { decideLeaveTask } from '@/api/leave'
import useUserStore from '@/store/modules/user'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import { registerDirtyCheck } from '@/services/tenant-context'
import {
  errorMessage,
  fieldErrors,
  statusLabels,
  actionLabels,
  businessCode,
} from '@/views/leave/shared'
import { hasPermission } from '@af-admin/workflow-core'
import {
  computeBusinessFields,
  validateBusinessFields,
} from '@af-admin/contracts'
import type { Release } from '@af-admin/contracts'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const retry = createCommandRetry()
const current = ref<BusinessDetail>()
const release = ref<Release>()
const values = ref<Record<string, unknown>>({})
const baseline = ref('')
const busy = ref(false)
const error = ref('')
const comment = ref('')
const releaseChanged = ref(false)
const validation = ref<Record<string, string[]>>({})
const can = (code: string) => hasPermission(user.permissions, code)
const isNew = computed(() => route.params.id === 'new')
const editable = computed(() =>
  isNew.value
    ? can('business:create')
    : Boolean(current.value?.allowedActions.includes('edit'))
)
const dirty = computed(
  () => editable.value && baseline.value !== JSON.stringify(values.value)
)
const ast = computed<VersionedFormSchema | undefined>(() => {
  if (!release.value) return undefined
  const schema = migrateFormSchema(release.value.formSnapshot)
  if (!editable.value)
    schema.widgetsConfig.forEach((widget) => {
      Object.assign(widget.config, { disabled: true, readonly: true })
    })
  return schema
})
const selectedTaskId = ref('')
const pendingTask = computed(
  () =>
    current.value?.tasks.find((task) => task.id === selectedTaskId.value) ||
    current.value?.tasks[0]
)
const activityLabels: Record<string, string> = {
  waiting: '等待处理',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒绝',
}
const computedFields = computed(() => {
  if (!release.value) return {}
  try {
    return computeBusinessFields(
      release.value.formSnapshot,
      validateBusinessFields(release.value.formSnapshot, values.value, false)
    )
  } catch {
    return {}
  }
})
const displayValue = (id: string) => {
  const value = values.value[id]
  if (value === undefined || value === null || value === '') return '未填写'
  const schema = release.value?.formSnapshot
  const widget = schema?.widgetsConfig.find((item) => item.uid === id)
  const source = schema?.dataSources.find(
    (item) => item.key === widget?.config.optionsSourceKey
  )
  const choices =
    widget?.config.optionsType === 'registered'
      ? source?.optionsSnapshot
      : widget?.config.options
  let choice
  if (Array.isArray(choices)) {
    choice = choices.find(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        String(item.value) === String(value)
    )
  }
  if (
    choice &&
    typeof choice === 'object' &&
    !Array.isArray(choice) &&
    typeof choice.label === 'string'
  )
    return choice.label
  return String(value)
}
const fieldName = (key: string) =>
  String(
    release.value?.formSnapshot.widgetsConfig.find(
      (widget) => widget.uid === key
    )?.config.label || '业务内容'
  )
const unregister = registerDirtyCheck(() => dirty.value)
onUnmounted(() => {
  unregister()
  retry.clear()
})
const load = async () => {
  const path = route.fullPath
  error.value = ''
  validation.value = {}
  releaseChanged.value = false
  try {
    if (isNew.value) {
      const app = await businessApplication(
        String(route.query.applicationId || '')
      )
      if (path !== route.fullPath) return
      current.value = undefined
      release.value = app.release
      values.value = {}
      app.release.formSnapshot.widgetsConfig.forEach((widget) => {
        if (widget.config.defaultValue !== undefined)
          values.value[widget.uid] = widget.config.defaultValue
      })
    } else {
      const data = await businessRecord(String(route.params.id))
      if (path !== route.fullPath) return
      current.value = data
      if (!data.tasks.some((task) => task.id === selectedTaskId.value))
        selectedTaskId.value = data.tasks[0]?.id || ''
      release.value = data.release
      values.value = { ...data.fields }
      data.release.formSnapshot.widgetsConfig.forEach((widget) => {
        if (
          widget.config.valueType === 'integer' &&
          values.value[widget.uid] !== undefined
        )
          values.value[widget.uid] = String(values.value[widget.uid])
      })
    }
    await nextTick()
    baseline.value = JSON.stringify(values.value)
  } catch (failure) {
    error.value = errorMessage(failure)
  }
}
const perform = async (run: () => Promise<void>) => {
  busy.value = true
  error.value = ''
  validation.value = {}
  try {
    await run()
  } catch (failure) {
    error.value = errorMessage(failure)
    validation.value = fieldErrors(failure)
    releaseChanged.value = businessCode(failure) === 'RELEASE_CHANGED'
  } finally {
    busy.value = false
  }
}
const save = () =>
  perform(async () => {
    if (!release.value) return
    const fields = validateBusinessFields(
      release.value.formSnapshot,
      values.value,
      false
    )
    if (isNew.value) {
      const body = { applicationReleaseId: release.value.id, fields }
      const receipt = await createBusinessRecord(
        body,
        retry.key('create', body)
      )
      retry.complete('create')
      baseline.value = JSON.stringify(values.value)
      await router.replace(`/business/records/${receipt.id}`)
    } else if (current.value) {
      const body = { fields, expectedRevision: current.value.revision }
      await updateBusinessRecord(
        current.value.id,
        body,
        retry.key('save', body)
      )
      retry.complete('save')
      await load()
    }
  })
const submit = () =>
  perform(async () => {
    if (
      !current.value ||
      !(await confirmR1Action('确认提交当前已保存的业务申请？'))
    )
      return
    const body = { expectedRevision: current.value.revision }
    await submitBusinessRecord(
      current.value.id,
      body.expectedRevision,
      retry.key('submit', body)
    )
    retry.complete('submit')
    await load()
  })
const withdraw = () =>
  perform(async () => {
    if (
      !current.value ||
      !(await confirmR1Action('确认撤回申请？未处理待办将被取消。'))
    )
      return
    const body = { expectedRevision: current.value.revision }
    await withdrawBusinessRecord(
      current.value.id,
      body.expectedRevision,
      retry.key('withdraw', body)
    )
    retry.complete('withdraw')
    await load()
  })
const decide = (action: 'approve' | 'reject') =>
  perform(async () => {
    if (
      !pendingTask.value ||
      !(await confirmR1Action(
        action === 'approve' ? '确认通过申请？' : '确认驳回申请？'
      ))
    )
      return
    const body = {
      expectedRevision: pendingTask.value.revision,
      comment: comment.value,
    }
    await decideLeaveTask(
      pendingTask.value.id,
      action,
      body.expectedRevision,
      body.comment,
      retry.key(action, body)
    )
    retry.complete(action)
    comment.value = ''
    await load()
  })
const migrate = () =>
  perform(async () => {
    if (!current.value || !release.value) return
    const next = await businessApplication(release.value.applicationId)
    const keys = new Set(
      next.release.formSnapshot.widgetsConfig.map((widget) => widget.uid)
    )
    const removed = Object.keys(values.value).filter((key) => !keys.has(key))
    if (
      !(await confirmR1Action(
        `确认迁移到发布版本v${next.release.releaseVersion}？${
          removed.length
            ? '已删除的字段将移除，请确认已保存其内容。'
            : '相同字段会保留。'
        }`
      ))
    )
      return
    const body = {
      fields: Object.fromEntries(
        Object.entries(values.value).filter(([key]) => keys.has(key))
      ),
      applicationReleaseId: next.release.id,
      expectedRevision: current.value.revision,
    }
    await updateBusinessRecord(
      current.value.id,
      body,
      retry.key('migrate', body)
    )
    retry.complete('migrate')
    await load()
  })
const reload = async () => {
  if (
    !dirty.value ||
    (await confirmR1Action('重新加载会丢弃未保存修改，是否继续？'))
  )
    await load()
}
onBeforeRouteLeave(
  () => !dirty.value || confirmR1Action('有未保存修改，确认离开？')
)
onBeforeRouteUpdate(
  () => !dirty.value || confirmR1Action('有未保存修改，确认切换记录？')
)
watch(
  () => route.fullPath,
  () => {
    current.value = undefined
    release.value = undefined
    retry.clear()
    load()
  }
)
onMounted(load)
</script>
<style scoped>
.business-record {
  padding: 24px;
  color: var(--color-text-1);
  max-width: 1100px;
  margin: auto;
}
h1 {
  font-size: 24px;
  margin-bottom: 24px;
}
h2 {
  font-size: 20px;
  margin: 20px 0;
}
section {
  margin: 20px 0;
  padding: 20px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
}
.record-values dt {
  color: var(--color-text-2);
  margin-top: 16px;
}
.record-values dd {
  color: var(--color-text-1);
  margin: 8px 0;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
textarea {
  display: block;
  width: 100%;
  padding: 12px;
  color: var(--color-text-1);
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
}
</style>
