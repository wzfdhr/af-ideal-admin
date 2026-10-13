<template>
  <main class="message-templates" data-testid="message-templates">
    <div class="message-templates__header">
      <div>
        <p class="message-templates__breadcrumb">消息中心 / 模板任务</p>
        <h1>模板任务</h1>
      </div>
      <div class="message-templates__summary">共 {{ total }} 个消息模板</div>
    </div>

    <section class="message-templates__filters" aria-label="模板筛选">
      <label class="message-templates__field">
        <span>消息通道</span>
        <select
          v-model="filters.channel"
          data-testid="message-template-channel"
        >
          <option value="">全部通道</option>
          <option
            v-for="option in channelOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label class="message-templates__field">
        <span>状态</span>
        <select v-model="filters.status" data-testid="message-template-status">
          <option value="">全部状态</option>
          <option value="enabled">启用</option>
          <option value="draft">草稿</option>
          <option value="disabled">停用</option>
        </select>
      </label>
      <label class="message-templates__field">
        <span>关键词</span>
        <input
          v-model.trim="filters.keyword"
          data-testid="message-template-keyword"
          placeholder="模板名称、标题或内容"
        />
      </label>
      <div class="message-templates__actions">
        <button
          class="message-templates__button message-templates__button--primary"
          data-testid="message-template-query"
          :disabled="loading"
          type="button"
          @click="queryTemplates"
        >
          查询
        </button>
        <button
          class="message-templates__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="message-templates__layout">
      <div class="message-templates__panel">
        <div class="message-templates__panel-title">
          <h2>消息模板</h2>
          <span>变量、通道和默认接收范围</span>
        </div>
        <div class="message-templates__list">
          <article
            v-for="template in templates"
            :key="template.id"
            class="message-templates__item"
            :class="{
              'is-selected': selectedTemplate?.id === template.id,
              'is-disabled': template.status !== 'enabled',
            }"
          >
            <button
              class="message-templates__item-button"
              type="button"
              @click="selectTemplate(template)"
            >
              <strong>{{ template.name }}</strong>
              <span>{{ getChannelLabel(template.channel) }}</span>
            </button>
            <p>{{ template.title }}</p>
            <div class="message-templates__meta">
              <span>{{ getStatusLabel(template.status) }}</span>
              <span>{{ getScopeLabel(template.recipientScope) }}</span>
              <span>{{ template.updatedAt }}</span>
            </div>
          </article>
          <div
            v-if="!loading && templates.length === 0"
            class="message-templates__empty"
          >
            暂无消息模板
          </div>
        </div>
      </div>

      <div class="message-templates__panel">
        <div class="message-templates__panel-title">
          <h2>变量预览</h2>
          <span>{{ selectedTemplate?.id || '请选择模板' }}</span>
        </div>

        <div v-if="selectedTemplate" class="message-templates__designer">
          <section class="message-templates__form-grid">
            <label class="message-templates__field">
              <span>接收范围</span>
              <select v-model="recipientForm.scope">
                <option value="all">全部用户</option>
                <option value="role">角色</option>
                <option value="department">部门</option>
                <option value="tenant">租户</option>
              </select>
            </label>
            <label class="message-templates__field">
              <span>接收目标</span>
              <input v-model.trim="recipientForm.target" placeholder="审批人" />
            </label>
          </section>

          <section class="message-templates__variables">
            <label
              v-for="variable in selectedTemplate.variables"
              :key="variable.key"
              class="message-templates__field"
            >
              <span>
                {{ variable.label }}
                <small v-if="variable.required">必填</small>
              </span>
              <input
                v-model.trim="variableValues[variable.key]"
                :data-testid="`message-template-variable-${variable.key}`"
                :placeholder="variable.defaultValue || variable.key"
              />
            </label>
            <p
              v-if="selectedTemplate.variables.length === 0"
              class="message-templates__empty-inline"
            >
              当前模板无需变量
            </p>
          </section>

          <div class="message-templates__delivery">
            <span>投递方式</span>
            <label
              v-for="mode in deliveryOptions"
              :key="mode.value"
              class="message-templates__check"
            >
              <input
                v-model="deliveryModes"
                :value="mode.value"
                type="checkbox"
              />
              <span>{{ mode.label }}</span>
            </label>
          </div>

          <div class="message-templates__preview-actions">
            <button
              class="message-templates__button message-templates__button--primary"
              data-testid="message-template-preview"
              :disabled="loading"
              type="button"
              @click="handlePreview"
            >
              生成预览
            </button>
            <button
              class="message-templates__button"
              data-testid="message-template-create-task"
              :disabled="loading || !previewResult"
              type="button"
              @click="handleCreateTask"
            >
              创建发送任务
            </button>
          </div>

          <div v-if="previewResult" class="message-templates__preview">
            <strong>{{ previewResult.title }}</strong>
            <p>{{ previewResult.content }}</p>
            <span>{{ previewResult.recipientSummary }}</span>
            <span v-if="previewResult.missingVariables.length > 0">
              缺少变量：{{ previewResult.missingVariables.join('、') }}
            </span>
          </div>

          <div
            v-if="taskResult"
            class="message-templates__task-result"
            :class="{ 'is-failed': !taskResult.success }"
          >
            <strong>
              {{
                taskResult.success
                  ? `发送任务排队中：${taskResult.taskId}`
                  : '发送任务创建失败'
              }}
            </strong>
            <span v-if="taskResult.success">
              接收 {{ taskResult.recipientCount }} 人 / 审计
              {{ taskResult.auditLogId }}
            </span>
            <span v-else>{{ taskResult.reason }}</span>
          </div>
        </div>
        <div v-else class="message-templates__empty">暂无可预览模板</div>

        <p v-if="actionMessage" class="message-templates__message">
          {{ actionMessage }}
        </p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  createMessageSendTask,
  fetchMessageTemplates,
  previewMessageTemplate,
  type MessageRecipientScope,
  type MessageSendTaskResult,
  type MessageTemplateChannel,
  type MessageTemplatePageResult,
  type MessageTemplatePreviewResult,
  type MessageTemplateQuery,
  type MessageTemplateRecord,
  type MessageTemplateStatus,
} from '@/api/message-template'
import type { MessageDeliveryMode } from '@/api/message-subscription'

const channelOptions: Array<{
  label: string
  value: MessageTemplateChannel
}> = [
  { label: '公告', value: 'notice' },
  { label: '站内信', value: 'message' },
  { label: '待办', value: 'todo' },
  { label: '告警', value: 'alert' },
]

const deliveryOptions: Array<{ label: string; value: MessageDeliveryMode }> = [
  { label: '站内', value: 'in-app' },
  { label: '邮件', value: 'email' },
  { label: 'WebSocket', value: 'websocket' },
]

const statusLabels: Record<MessageTemplateStatus, string> = {
  draft: '草稿',
  enabled: '启用',
  disabled: '停用',
}

const scopeLabels: Record<MessageRecipientScope, string> = {
  all: '全部用户',
  role: '角色',
  department: '部门',
  tenant: '租户',
}

const templates = ref<MessageTemplateRecord[]>([])
const selectedTemplate = ref<MessageTemplateRecord>()
const previewResult = ref<MessageTemplatePreviewResult>()
const taskResult = ref<MessageSendTaskResult>()
const deliveryModes = ref<MessageDeliveryMode[]>([])
const total = ref(0)
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)
const actionMessage = ref('')

const filters = reactive({
  channel: '' as MessageTemplateChannel | '',
  status: '' as MessageTemplateStatus | '',
  keyword: '',
})

const recipientForm = reactive({
  scope: 'role' as MessageRecipientScope,
  target: '审批人',
})

const variableValues = reactive<Record<string, string>>({})

const cloneTemplate = (
  record: MessageTemplateRecord
): MessageTemplateRecord => ({
  ...record,
  variables: record.variables.map((variable) => ({ ...variable })),
  deliveryModes: [...(record.deliveryModes || [])],
})

const buildQuery = (): MessageTemplateQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  channel: filters.channel,
  status: filters.status,
  keyword: filters.keyword,
})

const resetVariableValues = (template: MessageTemplateRecord) => {
  Object.keys(variableValues).forEach((key) => {
    delete variableValues[key]
  })
  template.variables.forEach((variable) => {
    variableValues[variable.key] = variable.defaultValue || ''
  })
}

const selectTemplate = (template: MessageTemplateRecord) => {
  selectedTemplate.value = cloneTemplate(template)
  previewResult.value = undefined
  taskResult.value = undefined
  recipientForm.scope = template.recipientScope
  recipientForm.target = template.recipientTarget
  deliveryModes.value =
    template.deliveryModes && template.deliveryModes.length > 0
      ? [...template.deliveryModes]
      : ['in-app', 'websocket']
  resetVariableValues(template)
}

const loadTemplates = async () => {
  loading.value = true

  try {
    const result: MessageTemplatePageResult = await fetchMessageTemplates(
      buildQuery()
    )
    templates.value = result.list.map(cloneTemplate)
    total.value = result.total
    if (templates.value.length > 0) {
      selectTemplate(templates.value[0])
    } else {
      selectedTemplate.value = undefined
    }
  } finally {
    loading.value = false
  }
}

const queryTemplates = async () => {
  current.value = 1
  await loadTemplates()
}

const resetFilters = async () => {
  filters.channel = ''
  filters.status = ''
  filters.keyword = ''
  await queryTemplates()
}

const handlePreview = async () => {
  if (!selectedTemplate.value) return

  previewResult.value = await previewMessageTemplate(
    selectedTemplate.value.id,
    {
      variables: { ...variableValues },
      recipientScope: recipientForm.scope,
      recipientTarget: recipientForm.target,
    }
  )
  taskResult.value = undefined
  actionMessage.value = previewResult.value.missingVariables.length
    ? '模板变量未填写完整'
    : '模板预览已生成'
}

const handleCreateTask = async () => {
  if (!selectedTemplate.value || !previewResult.value) return

  taskResult.value = await createMessageSendTask({
    templateId: selectedTemplate.value.id,
    title: previewResult.value.title,
    content: previewResult.value.content,
    recipientScope: recipientForm.scope,
    recipientTarget: recipientForm.target,
    deliveryModes: [...deliveryModes.value],
  })
  actionMessage.value = taskResult.value.success
    ? `已创建发送任务：${taskResult.value.taskId}`
    : taskResult.value.reason || '发送任务创建失败'
}

const getChannelLabel = (channel: MessageTemplateChannel) =>
  channelOptions.find((item) => item.value === channel)?.label || channel

const getStatusLabel = (status: MessageTemplateStatus) => statusLabels[status]

const getScopeLabel = (scope: MessageRecipientScope) => scopeLabels[scope]

onMounted(loadTemplates)
</script>

<style scoped lang="scss">
.message-templates {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}

.message-templates__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h1 {
    margin: 4px 0 0;
    font-size: 24px;
    font-weight: 650;
  }
}

.message-templates__breadcrumb {
  margin: 0;
  color: #667085;
  font-size: 13px;
}

.message-templates__summary {
  color: #475467;
  font-weight: 600;
}

.message-templates__filters {
  display: grid;
  grid-template-columns: 180px 160px minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.message-templates__layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.2fr);
  gap: 16px;
  align-items: start;
}

.message-templates__panel {
  min-width: 0;
  padding: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.message-templates__panel-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
  }

  span {
    color: #667085;
    font-size: 13px;
  }
}

.message-templates__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #475467;
  font-size: 13px;

  input,
  select {
    height: 34px;
    padding: 0 10px;
    border: 1px solid #d0d5dd;
    border-radius: 6px;
    background: #fff;
    color: #1d2129;
  }

  small {
    margin-left: 4px;
    color: #b42318;
    font-size: 12px;
  }
}

.message-templates__actions,
.message-templates__preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.message-templates__button {
  height: 34px;
  padding: 0 12px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.message-templates__button--primary {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}

.message-templates__list,
.message-templates__designer {
  display: grid;
  gap: 12px;
}

.message-templates__item {
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;

  &.is-selected {
    border-color: #165dff;
    background: #f8fbff;
  }

  &.is-disabled {
    opacity: 0.72;
  }

  p {
    margin: 8px 0;
    color: #475467;
  }
}

.message-templates__item-button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #1d2129;
  text-align: left;
  cursor: pointer;

  strong,
  span {
    display: block;
  }
}

.message-templates__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    padding: 2px 8px;
    border-radius: 999px;
    background: #f2f4f7;
    color: #475467;
    font-size: 12px;
  }
}

.message-templates__form-grid {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 12px;
}

.message-templates__variables {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.message-templates__delivery {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: #475467;
  font-size: 13px;
}

.message-templates__check {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: #344054;
}

.message-templates__preview,
.message-templates__task-result {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;

  p {
    margin: 0;
  }
}

.message-templates__task-result {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;

  &.is-failed {
    border-color: #fed7aa;
    background: #fff7ed;
    color: #9a3412;
  }
}

.message-templates__message {
  margin: 12px 0 0;
  color: #475467;
  font-size: 13px;
}

.message-templates__empty,
.message-templates__empty-inline {
  padding: 24px;
  color: #667085;
  text-align: center;
}

.message-templates__empty-inline {
  padding: 12px;
  text-align: left;
}

@media (max-width: 1024px) {
  .message-templates__layout,
  .message-templates__filters,
  .message-templates__form-grid,
  .message-templates__variables {
    grid-template-columns: 1fr;
  }

  .message-templates__header {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 720px) {
  .message-templates {
    padding: 16px;
  }

  .message-templates__panel-title {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
