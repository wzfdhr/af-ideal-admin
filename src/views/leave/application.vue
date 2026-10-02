<template>
  <main class="leave-page leave-configuration" data-testid="leave-application">
    <div class="leave-header">
      <div>
        <p>业务应用 / 配置与发布</p>
        <h1>{{ app?.name || '应用配置' }}</h1>
      </div>
      <a-button :disabled="busy" @click="reload">重新加载</a-button>
    </div>
    <a-alert
      v-if="error"
      type="error"
      :title="error"
      class="leave-alert"
      data-testid="application-error"
    />
    <ul
      v-if="Object.keys(validation).length"
      role="alert"
      data-testid="application-validation"
      class="leave-field-errors"
    >
      <li v-for="(items, key) in validation" :key="key">
        {{ validationLabel(String(key)) }}：{{ items.join('；') }}
      </li>
    </ul>
    <a-alert
      v-if="message"
      type="success"
      :title="message"
      class="leave-alert"
    />
    <a-spin :loading="loading" class="w-full">
      <section v-if="app" class="leave-panel">
        <h2>
          {{
            activeRelease
              ? `当前发布版本 v${activeRelease.releaseVersion}`
              : '尚未发布'
          }}
        </h2>
        <p class="leave-muted">
          表单和流程一起发布。已提交的申请继续使用原版本；新申请使用活动版本。
        </p>
        <a-space wrap>
          <a-button
            v-if="can('application:publish')"
            type="primary"
            :disabled="
              dirty ||
              busy ||
              !formDraft ||
              !workflowDraft ||
              app?.status === 'archived'
            "
            data-testid="application-publish"
            @click="publish"
          >
            发布已保存的表单与流程
          </a-button>
          <span v-if="dirty" class="leave-muted">请先保存修改，再发布</span>
          <label for="application-release">活动版本</label>
          <select
            id="application-release"
            v-model="rollbackId"
            data-testid="application-release-select"
          >
            <option
              v-for="item in app.releases || []"
              :key="item.id"
              :value="item.id"
            >
              v{{ item.releaseVersion
              }}{{ item.id === app.activeReleaseId ? '（当前）' : '' }}
            </option>
          </select>
          <a-button
            v-if="can('application:rollback')"
            :disabled="
              busy ||
              !rollbackId ||
              rollbackId === app.activeReleaseId ||
              app.status === 'archived'
            "
            data-testid="application-rollback"
            @click="activate"
          >
            启用所选版本
          </a-button>
        </a-space>
      </section>
      <a-tabs v-model:active-key="tab">
        <a-tab-pane key="form" title="配置表单">
          <section class="leave-panel">
            <a-space wrap>
              <label for="application-form">表单草稿</label>
              <select
                id="application-form"
                v-model="formId"
                :disabled="busy"
                @change="selectForm"
              >
                <option v-for="item in forms" :key="item.id" :value="item.id">
                  {{ item.name }} · 修改版 {{ item.revision }}
                </option>
              </select>
              <a-button
                :loading="busy"
                data-testid="application-save-form"
                @click="saveForm"
              >
                保存表单草稿
              </a-button>
              <span class="leave-muted">
                {{ formDirty ? '表单有未保存修改' : '表单已保存' }}
              </span>
            </a-space>
            <p class="leave-muted mt-3">
              可调整字段标签和显示。业务字段标识、请假类型和半日选项需保持一致。
            </p>
          </section>
          <FormDesigner
            v-if="formDraft"
            :key="`${formDraft.id}:${formDraft.revision}`"
            embedded
            :initial-schema="formDraft.schema"
            @update:schema="editedForm = $event"
          />
        </a-tab-pane>
        <a-tab-pane key="workflow" title="配置流程">
          <section class="leave-panel">
            <a-space wrap>
              <label for="application-workflow">流程草稿</label>
              <select
                id="application-workflow"
                v-model="workflowId"
                :disabled="busy"
                @change="selectWorkflow"
              >
                <option
                  v-for="item in workflows"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.name }} · 修改版 {{ item.revision }}
                </option>
              </select>
              <a-button
                :loading="busy"
                data-testid="application-save-workflow"
                @click="saveWorkflow"
              >
                保存流程草稿
              </a-button>
              <span class="leave-muted">
                {{ workflowDirty ? '流程有未保存修改' : '流程已保存' }}
              </span>
            </a-space>
            <p class="leave-muted mt-3">
              当前支持串行审批与抄送。选择节点后可配置处理人，每个审批节点仅指定一人。
            </p>
          </section>
          <WorkflowDesigner
            v-if="workflowDraft"
            :key="`${workflowDraft.id}:${workflowDraft.revision}`"
            embedded
            :initial-schema="workflowDraft.schema"
            :members="members"
            :form-schema="preview.schema"
            @update:schema="editedWorkflow = $event"
          />
        </a-tab-pane>
        <a-tab-pane key="preview" title="预览发布内容">
          <section class="leave-panel">
            <h2>表单预览</h2>
            <p
              v-if="preview.error"
              role="alert"
              data-testid="application-preview-error"
            >
              {{ preview.error }}
            </p>
            <FormRenderer v-else-if="preview.schema" :ast="preview.schema" />
          </section>
          <section class="leave-panel">
            <h2>流程配置</h2>
            <pre class="configuration-json">{{
              JSON.stringify(editedWorkflow, null, 2)
            }}</pre>
          </section>
        </a-tab-pane>
        <a-tab-pane key="compare" title="表单版本对比">
          <FormVersionComparison
            v-if="app"
            :key="app.id"
            :releases="app.releases || []"
            :active-release-id="app.activeReleaseId"
            :draft="editedForm"
            :draft-revision="formDraft?.revision"
            :dirty="formDirty"
          />
        </a-tab-pane>
      </a-tabs>
    </a-spin>
  </main>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { confirmR1Action } from '@/services/r1-confirm'
import FormDesigner from '@/components/form-designer/index.vue'
import WorkflowDesigner from '@/components/workflow-designer/index.vue'
import FormVersionComparison from '@/components/form-version-comparison.vue'
import { FormRenderer } from '@/components/form-runtime'
import { migrateFormSchema } from '@/components/form-designer/schema'
import useUserStore from '@/store/modules/user'
import {
  getLeaveApplication,
  publishLeaveApplication,
  activateLeaveRelease,
} from '@/api/leave'
import {
  fetchConfigurationDrafts,
  fetchConfigurationDraft,
  saveConfigurationDraft,
  fetchConfigurationMembers,
} from '@/api/leave-configuration'
import type {
  ConfigurationDraft,
  ConfigurationMember,
} from '@/api/leave-configuration'
import { createCommandRetry } from '@/services/command-retry'
import { registerDirtyCheck } from '@/services/tenant-context'
import { hasPermission } from '@af-admin/workflow-core'
import { errorMessage, fieldErrors, stableSignature } from './shared'
import type { Application } from '@af-admin/contracts'

const user = useUserStore()
const route = useRoute()
const applicationId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : 'leave'
)
const app = ref<Application>()
const forms = ref<ConfigurationDraft[]>([])
const workflows = ref<ConfigurationDraft[]>([])
const members = ref<ConfigurationMember[]>([])
const formId = ref('')
const workflowId = ref('')
const rollbackId = ref('')
const editedForm = ref<unknown>()
const editedWorkflow = ref<unknown>()
const tab = ref('form')
const error = ref('')
const validation = ref<Record<string, string[]>>({})
const validationLabel = (key: string) => {
  const graph = editedWorkflow.value as
    | { nodes?: { id: string; name: string }[] }
    | undefined
  const node = graph?.nodes?.find((item) => item.id === key)
  return node ? `${node.name}（${key}）` : key
}
const message = ref('')
const loading = ref(false)
const busy = ref(false)
const retry = createCommandRetry()
const can = (permission: string) => hasPermission(user.permissions, permission)
const formDraft = computed(() =>
  forms.value.find((item) => item.id === formId.value)
)
const workflowDraft = computed(() =>
  workflows.value.find((item) => item.id === workflowId.value)
)
const formDirty = computed(
  () =>
    stableSignature(editedForm.value) !==
    stableSignature(formDraft.value?.schema)
)
const workflowDirty = computed(
  () =>
    stableSignature(editedWorkflow.value) !==
    stableSignature(workflowDraft.value?.schema)
)
const dirty = computed(() => formDirty.value || workflowDirty.value)
const unregister = registerDirtyCheck(() => dirty.value || busy.value)
const preview = computed(() => {
  if (!editedForm.value) return { schema: undefined, error: '' }
  try {
    return { schema: migrateFormSchema(editedForm.value), error: '' }
  } catch (failure) {
    return { schema: undefined, error: errorMessage(failure) }
  }
})
const activeRelease = computed(() =>
  app.value?.releases?.find((item) => item.id === app.value?.activeReleaseId)
)
const selectForm = () => {
  editedForm.value = formDraft.value?.schema
}
const selectWorkflow = () => {
  editedWorkflow.value = workflowDraft.value?.schema
}
let loadSequence = 0
const load = async () => {
  const ticket = ++loadSequence
  const requestedId = applicationId.value
  const requestedTenant = user.tenantId
  const requestedUser = user.id
  const current = () =>
    ticket === loadSequence &&
    requestedId === applicationId.value &&
    requestedTenant === user.tenantId &&
    requestedUser === user.id
  validation.value = {}
  loading.value = true
  error.value = ''
  message.value = ''
  app.value = undefined
  forms.value = []
  workflows.value = []
  members.value = []
  formId.value = ''
  workflowId.value = ''
  editedForm.value = undefined
  editedWorkflow.value = undefined
  try {
    const application = await getLeaveApplication(requestedId)
    if (!current()) return
    const boundFormId =
      application.formDraftId || (requestedId === 'leave' ? 'form-leave' : '')
    const boundWorkflowId =
      application.workflowDraftId ||
      (requestedId === 'leave' ? 'workflow-leave' : '')
    if (!boundFormId || !boundWorkflowId)
      throw new Error('应用缺少绑定的表单或流程草稿')
    const [boundForm, boundWorkflow, people, formData, workflowData] =
      await Promise.all([
        fetchConfigurationDraft('form', boundFormId),
        fetchConfigurationDraft('workflow', boundWorkflowId),
        fetchConfigurationMembers(requestedTenant || ''),
        requestedId === 'leave'
          ? fetchConfigurationDrafts('form')
          : Promise.resolve({ list: [] }),
        requestedId === 'leave'
          ? fetchConfigurationDrafts('workflow')
          : Promise.resolve({ list: [] }),
      ])
    if (!current()) return
    app.value = application
    forms.value = [
      boundForm,
      ...formData.list.filter((item) => item.id !== boundForm.id),
    ]
    workflows.value = [
      boundWorkflow,
      ...workflowData.list.filter((item) => item.id !== boundWorkflow.id),
    ]
    members.value = people
    formId.value = boundForm.id
    workflowId.value = boundWorkflow.id
    selectForm()
    selectWorkflow()
    rollbackId.value = application.activeReleaseId || ''
  } catch (failure) {
    if (current()) error.value = errorMessage(failure)
  } finally {
    if (current()) loading.value = false
  }
}
const perform = async (action: () => Promise<void>) => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  validation.value = {}
  message.value = ''
  try {
    await action()
  } catch (failure) {
    error.value = errorMessage(failure)
    validation.value = fieldErrors(failure)
  } finally {
    busy.value = false
  }
}
const saveForm = () =>
  perform(async () => {
    const item = formDraft.value
    if (!item) return
    const result = await saveConfigurationDraft(
      'form',
      item.id,
      editedForm.value,
      item.revision
    )
    forms.value = forms.value.map((old) =>
      old.id === result.id ? result : old
    )
    editedForm.value = result.schema
    message.value = '表单草稿已保存'
  })
const saveWorkflow = () =>
  perform(async () => {
    const item = workflowDraft.value
    if (!item) return
    const result = await saveConfigurationDraft(
      'workflow',
      item.id,
      editedWorkflow.value,
      item.revision
    )
    workflows.value = workflows.value.map((old) =>
      old.id === result.id ? result : old
    )
    editedWorkflow.value = result.schema
    message.value = '流程草稿已保存'
  })
const publish = () =>
  perform(async () => {
    if (dirty.value || !app.value || !formDraft.value || !workflowDraft.value)
      return
    if (!(await confirmR1Action('确认将当前已保存的表单和流程一起发布？')))
      return
    const payload = {
      expectedRevision: app.value.revision,
      formDraftId: formDraft.value.id,
      workflowDraftId: workflowDraft.value.id,
      formRevision: formDraft.value.revision,
      workflowRevision: workflowDraft.value.revision,
    }
    const release = await publishLeaveApplication(
      applicationId.value,
      payload,
      retry.key('publish', payload)
    )
    retry.complete('publish')
    app.value = await getLeaveApplication(applicationId.value)
    rollbackId.value = app.value.activeReleaseId || ''
    message.value = `发布成功，当前为 v${release.releaseVersion}`
  })
const activate = () =>
  perform(async () => {
    if (
      !app.value ||
      !(await confirmR1Action('确认切换活动版本？在途申请继续使用原版本。'))
    )
      return
    const payload = {
      releaseId: rollbackId.value,
      expectedRevision: app.value.revision,
    }
    app.value = await activateLeaveRelease(
      applicationId.value,
      payload.releaseId,
      payload.expectedRevision,
      retry.key('activate', payload)
    )
    retry.complete('activate')
    message.value = '活动版本已切换'
  })
const reload = async () => {
  if (
    !dirty.value ||
    (await confirmR1Action('重新加载将丢弃未保存修改，是否继续？'))
  )
    load()
}
onBeforeRouteLeave(
  () => !dirty.value || confirmR1Action('配置有未保存修改，确认离开？')
)
onBeforeRouteUpdate(
  async () =>
    !dirty.value || confirmR1Action('切换应用将丢弃未保存修改，是否继续？')
)
watch(
  () => [applicationId.value, user.tenantId, user.id],
  () => {
    app.value = undefined
    forms.value = []
    workflows.value = []
    retry.clear()
    load()
  }
)
onMounted(load)
onBeforeUnmount(() => {
  loadSequence += 1
  unregister()
})
</script>
<style src="./style.css"></style>
<style scoped>
.leave-configuration {
  max-width: none;
}
.configuration-json {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
}
</style>
