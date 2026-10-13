<template>
  <main class="messaging-page" data-testid="real-message-templates">
    <header>
      <h1>消息模板与发送任务</h1>
      <div class="messaging-actions">
        <button
          v-if="allowed(P.templateCreate)"
          type="button"
          :disabled="busy"
          data-testid="messaging-template-new"
          @click="newTemplate"
        >
          新增模板
        </button>
        <button type="button" :disabled="loading || busy" @click="reload">
          刷新服务器状态
        </button>
      </div>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">正在读取服务器状态…</p>
    <p v-if="!canEnter" role="alert">当前成员无权访问模板、审批或发送任务。</p>
    <section
      v-if="allowed(P.templateList) || editorOpen"
      class="messaging-grid"
    >
      <section v-if="allowed(P.templateList)" class="messaging-panel">
        <h2>已保存的模板</h2>
        <form class="messaging-form" @submit.prevent="query">
          <label>
            关键词
            <input v-model="keyword" data-testid="messaging-template-keyword" />
          </label>
          <label class="messaging-check">
            <input v-model="includeArchived" type="checkbox" />
            包含归档模板
          </label>
          <button type="submit" :disabled="loading">查询</button>
        </form>
        <ul class="messaging-list">
          <li
            v-for="row in rows"
            :key="row.id"
            :class="{ 'messaging-selected': selected?.id === row.id }"
          >
            <button
              type="button"
              :disabled="busy"
              :data-testid="`messaging-template-${row.id}`"
              @click="edit(row.id)"
            >
              {{ row.name }}
            </button>
            <p class="messaging-muted">
              {{ channelLabels[row.channel] }} ·
              {{
                row.archivedAt ? '已归档' : row.enabled ? '可发送' : '已停用'
              }}
              · {{ draftLabels[row.draftState] }} · 草稿 {{ row.draftRevision }}
            </p>
          </li>
        </ul>
        <p v-if="!loading && !rows.length && !error">
          暂无模板。可新增并保存后指派另一位成员审批。
        </p>
        <nav
          class="messaging-actions messaging-pagination"
          aria-label="模板分页"
        >
          <button
            type="button"
            :disabled="page === 1 || loading"
            @click="changePage(-1)"
          >
            上一页
          </button>
          <span>第 {{ page }} 页 / 共 {{ total }} 项</span>
          <button
            type="button"
            :disabled="page * 20 >= total || loading"
            @click="changePage(1)"
          >
            下一页
          </button>
        </nav>
      </section>
      <section
        v-if="editorOpen"
        class="messaging-panel"
        aria-label="模板草稿编辑器"
      >
        <h2>{{ selected ? `模板草稿 · ${selected.id}` : '新增消息模板' }}</h2>
        <p class="messaging-muted">
          修改草稿需重新提交非作者审批。历史审批快照保持独立；发送只使用服务器审批版本。
        </p>
        <form class="messaging-form" @submit.prevent="save">
          <label>
            模板名称
            <input
              v-model="draft.name"
              maxlength="100"
              required
              data-testid="messaging-template-name"
              :disabled="!canEdit || busy"
            />
          </label>
          <label>
            消息通道
            <select
              v-model="draft.channel"
              :disabled="!canEdit || busy"
              data-testid="messaging-template-channel"
            >
              <option
                v-for="(label, value) in channelLabels"
                :key="value"
                :value="value"
              >
                {{ label }}
              </option>
            </select>
          </label>
          <label>
            消息标题
            <input
              v-model="draft.title"
              maxlength="200"
              required
              data-testid="messaging-template-title"
              :disabled="!canEdit || busy"
            />
          </label>
          <label>
            消息正文
            <textarea
              v-model="draft.content"
              maxlength="5000"
              required
              data-testid="messaging-template-content"
              :disabled="!canEdit || busy"
            />
          </label>
          <fieldset :disabled="!canEdit || busy">
            <legend>变量声明（只允许已声明的双花括号变量）</legend>
            <div
              v-for="(variable, index) in draft.variables"
              :key="index"
              class="messaging-record messaging-form"
            >
              <label>
                变量标识
                <input
                  v-model="variable.key"
                  placeholder="applicant"
                  maxlength="40"
                  required
                />
              </label>
              <label>
                显示名称
                <input v-model="variable.label" maxlength="100" required />
              </label>
              <label>
                默认值
                <input v-model="variable.defaultValue" maxlength="1000" />
              </label>
              <label class="messaging-check">
                <input v-model="variable.required" type="checkbox" />
                必填
              </label>
              <button type="button" @click="draft.variables.splice(index, 1)">
                删除此变量
              </button>
            </div>
            <button
              type="button"
              :disabled="draft.variables.length >= 30"
              data-testid="messaging-variable-add"
              @click="
                draft.variables.push({
                  key: '',
                  label: '',
                  required: true,
                  defaultValue: '',
                })
              "
            >
              新增变量
            </button>
          </fieldset>
          <label>
            非作者审批人
            <select
              v-model="draft.reviewerId"
              required
              :disabled="!canEdit || busy"
              data-testid="messaging-template-reviewer"
            >
              <option value="">请选择有审批权限的其他成员</option>
              <option
                v-for="person in reviewers"
                :key="person.id"
                :value="person.id"
              >
                {{ person.name }}
              </option>
            </select>
          </label>
          <DeliveryPicker
            v-model="draft.deliveryModes"
            :disabled="!canEdit || busy"
            :email-enabled="emailAvailable"
            :email-reason="emailReason"
          />
          <div class="messaging-actions">
            <button
              v-if="canEdit"
              type="submit"
              class="messaging-primary"
              :disabled="busy || !draftDirty"
              data-testid="messaging-template-save"
            >
              保存草稿
            </button>
            <span v-if="draftDirty" class="messaging-muted">未保存</span>
            <button type="button" :disabled="busy" @click="closeEditor">
              关闭编辑器
            </button>
          </div>
        </form>
        <div v-if="selected" class="messaging-actions">
          <button
            v-if="allowed(P.templateSubmit) && !selected.archivedAt"
            type="button"
            :disabled="busy || draftDirty || selected.draftState === 'pending'"
            data-testid="messaging-template-submit"
            @click="submit"
          >
            提交已保存草稿审批
          </button>
          <button
            v-if="allowed(P.templateDisable) && !selected.archivedAt"
            type="button"
            :disabled="
              busy ||
              draftDirty ||
              (!selected.enabled && !selected.activeVersionId)
            "
            data-testid="messaging-template-enabled"
            @click="setEnabled"
          >
            {{ selected.enabled ? '停用模板' : '启用已审批模板' }}
          </button>
          <button
            v-if="allowed(P.templateDelete)"
            type="button"
            :disabled="busy || draftDirty"
            data-testid="messaging-template-archive"
            @click="archive"
          >
            {{ selected.archivedAt ? '恢复模板为停用草稿' : '归档删除模板' }}
          </button>
        </div>
        <p v-if="selected?.reviews?.length" class="messaging-muted">
          最近审批：{{ selected.reviews[0].status }}
          {{ selected.reviews[0].reason }}
        </p>
      </section>
      <section v-else class="messaging-panel">
        <h2>模板详情</h2>
        <p>请选择已保存模板，或新增模板。</p>
      </section>
    </section>
    <section
      v-if="allowed(P.templateApprove)"
      class="messaging-panel"
      aria-label="我的模板审批"
    >
      <h2>我的模板审批</h2>
      <p class="messaging-muted">
        按提交时的不可变草稿内容审批。作者不得审批本人提交。
      </p>
      <button type="button" :disabled="loading || busy" @click="loadReviews">
        刷新审批
      </button>
      <p v-if="!loading && !reviews.length">暂无指派给当前成员的审批</p>
      <article
        v-for="review in reviews"
        :key="review.id"
        class="messaging-record"
        :data-testid="`messaging-review-${review.id}`"
      >
        <h3>
          {{ review.templateName }} · 草稿 {{ review.draftRevision }} ·
          {{ review.status }}
        </h3>
        <strong>{{ review.schema.title }}</strong>
        <p class="messaging-copy">{{ review.schema.content }}</p>
        <p class="messaging-muted">
          提交者 {{ review.requestedBy }} · {{ review.requestedAt }} ·
          {{ review.schema.variables.map((v) => v.key).join('、') }}
        </p>
        <label v-if="review.status === 'pending'">
          审批说明
          <input
            v-model="reviewReasons[review.id]"
            maxlength="500"
            :disabled="busy"
            :data-testid="`messaging-review-reason-${review.id}`"
          />
        </label>
        <p v-else>{{ review.reason }}</p>
        <div
          v-if="
            review.status === 'pending' &&
            review.reviewerId === user.id &&
            review.requestedBy !== user.id
          "
          class="messaging-actions"
        >
          <button
            type="button"
            :disabled="busy"
            :data-testid="`messaging-review-approve-${review.id}`"
            @click="decide(review, 'approve')"
          >
            审批通过
          </button>
          <button
            type="button"
            :disabled="
              busy || (reviewReasons[review.id]?.trim().length || 0) < 2
            "
            :data-testid="`messaging-review-reject-${review.id}`"
            @click="decide(review, 'reject')"
          >
            驳回并保留原因
          </button>
        </div>
      </article>
      <nav class="messaging-actions messaging-pagination" aria-label="审批分页">
        <button
          type="button"
          :disabled="reviewPage === 1 || loading"
          @click="changeReviewPage(-1)"
        >
          上一页
        </button>
        <span>第 {{ reviewPage }} 页 / 共 {{ reviewTotal }} 项</span>
        <button
          type="button"
          :disabled="reviewPage * 20 >= reviewTotal || loading"
          @click="changeReviewPage(1)"
        >
          下一页
        </button>
      </nav>
    </section>
    <section
      v-if="allowed(P.sendCreate) && (selected || !allowed(P.templateList))"
      class="messaging-panel"
      aria-label="审批快照发送"
    >
      <h2>使用已审批快照发送</h2>
      <p v-if="!sendable && selected" role="alert">
        模板当前不可发送，请先恢复并启用有效审批版本。
      </p>
      <p v-if="!availableVersions.length">
        暂无已审批版本。保存、提交并由另一位成员审批后再发送。
      </p>
      <nav
        v-if="!allowed(P.templateList)"
        class="messaging-actions messaging-pagination"
        aria-label="审批快照分页"
      >
        <button
          type="button"
          :disabled="approvedPage === 1 || busy"
          @click="changeApprovedPage(-1)"
        >
          上一页
        </button>
        <span>
          第 {{ approvedPage }} 页 / 共 {{ approvedTotal }} 个审批快照
        </span>
        <button
          type="button"
          :disabled="approvedPage * 20 >= approvedTotal || busy"
          @click="changeApprovedPage(1)"
        >
          下一页
        </button>
      </nav>
      <form
        v-if="availableVersions.length"
        class="messaging-form"
        @submit.prevent="send"
      >
        <label>
          不可变审批版本
          <select v-model="versionId" data-testid="messaging-send-version">
            <option
              v-for="version in availableVersions"
              :key="version.id"
              :value="version.id"
            >
              {{ version.schema.name }} · 版本 {{ version.version }} ·
              {{ version.approvedAt }} ·
              {{ version.contentHash.slice(0, 12) }}
            </option>
          </select>
        </label>
        <label
          v-for="variable in activeVersion?.schema.variables"
          :key="variable.key"
        >
          {{ variable.label }} {{ variable.required ? '（必填）' : '' }}
          <input
            v-model="variableValues[variable.key]"
            :required="variable.required"
            maxlength="1000"
            :data-testid="`messaging-send-variable-${variable.key}`"
          />
        </label>
        <AudiencePicker
          v-model="audience"
          :people="catalogue?.people || []"
          :roles="catalogue?.roles || []"
          :departments="catalogue?.departments || []"
          :disabled="busy"
        />
        <DeliveryPicker
          v-model="sendModes"
          :disabled="busy"
          :allowed-modes="activeVersion?.schema.deliveryModes"
          :email-enabled="emailAvailable"
          :email-reason="emailReason"
        />
        <label>
          计划时间（留空表示立即入队）
          <input
            v-model="scheduledAt"
            type="datetime-local"
            data-testid="messaging-send-scheduled-at"
            :disabled="busy"
          />
        </label>
        <div class="messaging-actions">
          <button
            type="button"
            :disabled="busy || !sendable"
            data-testid="messaging-send-preview"
            @click="preview"
          >
            读取服务器预览与范围
          </button>
          <button
            type="submit"
            class="messaging-primary"
            :disabled="
              busy ||
              !previewResult ||
              previewResult.missingVariables.length > 0 ||
              !sendable
            "
            data-testid="messaging-send-create"
          >
            确认创建发送任务
          </button>
        </div>
        <article
          v-if="previewResult"
          class="messaging-record"
          data-testid="messaging-send-preview-result"
        >
          <strong>{{ previewResult.title }}</strong>
          <p class="messaging-copy">{{ previewResult.content }}</p>
          <p>
            当前服务器核对的实际接收成员：{{ previewResult.recipientCount }} 人
          </p>
          <p v-if="previewResult.missingVariables.length" role="alert">
            缺少变量：{{ previewResult.missingVariables.join('、') }}
          </p>
          <p class="messaging-muted">
            任务创建时重新核对授权与成员；创建后刷新任务查看持久投递事实。
          </p>
        </article>
      </form>
    </section>
    <section
      v-if="newJob"
      class="messaging-panel"
      data-testid="messaging-queued-receipt"
    >
      <h2>服务器任务回执</h2>
      <p>
        任务 {{ newJob.id }} 已记录，状态 {{ newJob.status }}。当前站内写入
        {{ newJob.counts.sent }}，待处理 {{ newJob.counts.pending }}。
      </p>
      <p>此回执代表服务器记录的任务事实，实际收件人结果在下方刷新查看。</p>
    </section>
    <Jobs :new-job="newJob" />
  </main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  archiveMessagingTemplate,
  restoreMessagingTemplate,
  createMessagingJob,
  decideMessagingReview,
  fetchMessagingRecipients,
  fetchMessagingReviews,
  fetchMessagingTemplates,
  fetchApprovedMessagingTemplates,
  getMessagingTemplate,
  previewMessagingTemplate,
  saveMessagingTemplate,
  setMessagingTemplateEnabled,
  submitMessagingTemplate,
} from '@/api/messaging'
import type { MessagingPreview } from '@/api/messaging'
import { confirmR1Action } from '@/services/r1-confirm'
import { errorMessage } from '@/views/leave/shared'
import {
  MESSAGING_PERMISSIONS as P,
  parseMessageSendInput,
  parseMessageTemplateDraft,
} from '@af-admin/contracts'
import { useMessagingContext } from './use-messaging-context'
import AudiencePicker from './audience-picker.vue'
import DeliveryPicker from './delivery-picker.vue'
import Jobs from './jobs.vue'
import type {
  MessageSendInput,
  MessageTemplateDraft,
  MessageTemplateRecord,
  MessageTemplateReview,
  MessageTemplateVersion,
  MessageSendJobRecord,
  MessagingAudience,
  MessagingDeliveryMode,
  MessagingRecipientCatalogue,
} from '@af-admin/contracts'
import './messaging.css'

const emptyDraft = (): MessageTemplateDraft => ({
  name: '',
  channel: 'notice',
  title: '',
  content: '',
  variables: [],
  reviewerId: '',
  deliveryModes: ['in-app'],
})
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
const rows = ref<MessageTemplateRecord[]>([])
const selected = ref<MessageTemplateRecord>()
const editorOpen = ref(false)
const detailLoading = ref(false)
const draft = ref(emptyDraft())
const original = ref(JSON.stringify(draft.value))
const draftDirty = computed(
  () => editorOpen.value && JSON.stringify(draft.value) !== original.value
)
const keyword = ref('')
const includeArchived = ref(false)
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const reviews = ref<MessageTemplateReview[]>([])
const reviewReasons = ref<Record<string, string>>({})
const reviewPage = ref(1)
const reviewTotal = ref(0)
const catalogue = ref<MessagingRecipientCatalogue>()
const reviewCatalogue = ref<MessagingRecipientCatalogue>()
const approvedVersions = ref<MessageTemplateVersion[]>([])
const approvedPage = ref(1)
const approvedTotal = ref(0)
const versionId = ref('')
const variableValues = ref<Record<string, string>>({})
const audience = ref<MessagingAudience>({ scope: 'self' })
const sendModes = ref<MessagingDeliveryMode[]>(['in-app'])
const scheduledAt = ref('')
const previewResult = ref<MessagingPreview>()
const newJob = ref<MessageSendJobRecord>()
const sendBaseline = ref('')
const sendSignature = () =>
  JSON.stringify({
    versionId: versionId.value,
    variables: variableValues.value,
    audience: audience.value,
    deliveryModes: sendModes.value,
    scheduledAt: scheduledAt.value,
  })
const sendDirty = computed(
  () => !!versionId.value && sendBaseline.value !== sendSignature()
)
const { user, error, notice, busy, allowed, command, ticket } =
  useMessagingContext(
    () =>
      draftDirty.value ||
      sendDirty.value ||
      Object.values(reviewReasons.value).some(Boolean),
    () => {
      rows.value = []
      selected.value = undefined
      editorOpen.value = false
      detailLoading.value = false
      loading.value = false
      page.value = 1
      total.value = 0
      reviewPage.value = 1
      reviewTotal.value = 0
      draft.value = emptyDraft()
      original.value = JSON.stringify(draft.value)
      reviews.value = []
      reviewReasons.value = {}
      catalogue.value = undefined
      approvedVersions.value = []
      approvedPage.value = 1
      approvedTotal.value = 0
      reviewCatalogue.value = undefined
      newJob.value = undefined
      resetSend()
      load()
    }
  )
const channelLabels = {
  notice: '通知',
  message: '消息',
  todo: '待办',
  alert: '预警',
}
const draftLabels = {
  draft: '草稿',
  pending: '等待审批',
  approved: '草稿已审批',
}
const canEnter = computed(() =>
  [
    P.templateList,
    P.templateCreate,
    P.templateApprove,
    P.sendList,
    P.sendCreate,
  ].some(allowed)
)
const canEdit = computed(
  () =>
    !detailLoading.value &&
    !selected.value?.archivedAt &&
    selected.value?.draftState !== 'pending' &&
    allowed(selected.value ? P.templateUpdate : P.templateCreate)
)
const reviewers = computed(() =>
  (reviewCatalogue.value?.people || []).filter(
    (person) =>
      person.canApprove &&
      person.id !== user.id &&
      person.id !== selected.value?.createdBy
  )
)
const emailCapability = computed(() =>
  (catalogue.value || reviewCatalogue.value)?.deliveryModes.find(
    (mode) => mode.mode === 'email'
  )
)
const emailAvailable = computed(() => !!emailCapability.value?.available)
const emailReason = computed(
  () => emailCapability.value?.reason || '等待服务器通道配置'
)
const availableVersions = computed(
  () => selected.value?.versions || approvedVersions.value
)
const activeVersion = computed(() =>
  availableVersions.value.find((version) => version.id === versionId.value)
)
const sendable = computed(() =>
  selected.value
    ? selected.value.enabled && !selected.value.archivedAt
    : !!activeVersion.value
)
let listSequence = 0
let detailSequence = 0
let reviewSequence = 0
let previewSequence = 0
function resetSend() {
  versionId.value = ''
  variableValues.value = {}
  audience.value = { scope: 'self' }
  scheduledAt.value = ''
  sendModes.value = ['in-app']
  previewResult.value = undefined
  sendBaseline.value = sendSignature()
  previewSequence += 1
}
function useRecord(record: MessageTemplateRecord) {
  selected.value = record
  editorOpen.value = true
  draft.value = clone(record.schema)
  original.value = JSON.stringify(draft.value)
  resetSend()
  versionId.value = record.activeVersionId || record.versions?.[0]?.id || ''
  syncVersionInputs()
}
async function loadTemplates() {
  if (!allowed(P.templateList)) return
  const current = ticket()
  const seq = ++listSequence
  try {
    const result = await fetchMessagingTemplates({
      current: page.value,
      pageSize: 20,
      keyword: keyword.value,
      status: includeArchived.value ? 'all' : '',
    })
    if (current() && seq === listSequence) {
      rows.value = result.list
      total.value = result.total
    }
  } catch (failure) {
    if (current() && seq === listSequence) error.value = errorMessage(failure)
  }
}
async function loadReviews() {
  if (!allowed(P.templateApprove)) return
  const current = ticket()
  const seq = ++reviewSequence
  try {
    const result = await fetchMessagingReviews({
      current: reviewPage.value,
      pageSize: 20,
    })
    if (current() && seq === reviewSequence) {
      reviews.value = result.list
      reviewTotal.value = result.total
    }
  } catch (failure) {
    if (current() && seq === reviewSequence) error.value = errorMessage(failure)
  }
}
async function loadApprovedVersions() {
  const current = ticket()
  try {
    const result = await fetchApprovedMessagingTemplates({
      current: approvedPage.value,
      pageSize: 20,
    })
    if (!current()) return
    approvedVersions.value = result.list
    approvedTotal.value = result.total
    if (!result.list.some((version) => version.id === versionId.value))
      versionId.value = result.list[0]?.id || ''
  } catch (failure) {
    if (current()) error.value = errorMessage(failure)
  }
}
const changeApprovedPage = async (delta: number) => {
  const current = ticket()
  if (!(await canDiscard()) || !current()) return
  approvedPage.value += delta
  await loadApprovedVersions()
}
async function load() {
  const current = ticket()
  loading.value = true
  error.value = ''
  const tasks: Promise<unknown>[] = [loadTemplates(), loadReviews()]
  if (allowed(P.sendCreate) && !allowed(P.templateList))
    tasks.push(loadApprovedVersions())
  if ([P.templateCreate, P.templateUpdate, P.templateSubmit].some(allowed))
    tasks.push(
      fetchMessagingRecipients('review').then((result) => {
        if (current()) reviewCatalogue.value = result
      })
    )
  if (allowed(P.sendCreate))
    tasks.push(
      fetchMessagingRecipients('send').then((result) => {
        if (current()) catalogue.value = result
      })
    )
  try {
    await Promise.all(tasks)
  } catch (failure) {
    if (current()) error.value = errorMessage(failure)
  } finally {
    if (current()) loading.value = false
  }
}
const canDiscard = async () =>
  !(draftDirty.value || sendDirty.value) ||
  confirmR1Action('当前模板或发送参数有未保存输入，确认切换？')
const edit = async (id: string, force = false) => {
  if (busy.value && !force) return
  const current = ticket()
  if (!force && !(await canDiscard())) return
  if (!current()) return
  const seq = ++detailSequence
  detailLoading.value = true
  error.value = ''
  try {
    const record = await getMessagingTemplate(id)
    if (current() && seq === detailSequence) useRecord(record)
  } catch (failure) {
    if (current() && seq === detailSequence) error.value = errorMessage(failure)
  } finally {
    if (current() && seq === detailSequence) detailLoading.value = false
  }
}
const newTemplate = async () => {
  if (busy.value || detailLoading.value) return
  const current = ticket()
  if (!(await canDiscard()) || !current()) return
  detailSequence += 1
  selected.value = undefined
  editorOpen.value = true
  draft.value = emptyDraft()
  original.value = ''
  resetSend()
}
const closeEditor = async () => {
  if (busy.value || detailLoading.value) return
  const current = ticket()
  if (!(await canDiscard()) || !current()) return
  detailSequence += 1
  editorOpen.value = false
  selected.value = undefined
  resetSend()
}
const reload = async () => {
  const current = ticket()
  if (!(await canDiscard()) || !current()) return
  if (selected.value) await edit(selected.value.id, true)
  await load()
}
const query = () => {
  page.value = 1
  loadTemplates()
}
const changePage = (delta: number) => {
  page.value += delta
  loadTemplates()
}
const changeReviewPage = (delta: number) => {
  reviewPage.value += delta
  loadReviews()
}
const save = () => {
  if (!canEdit.value) return
  let schema: MessageTemplateDraft
  try {
    schema = parseMessageTemplateDraft(draft.value)
  } catch (failure) {
    error.value = errorMessage(failure)
    return
  }
  const record = selected.value
  command(
    `template-save:${record?.id || 'new'}`,
    { schema, expectedRevision: record?.revision },
    (key) => saveMessagingTemplate(schema, key, record),
    async (result) => {
      useRecord(result)
      notice.value = '模板草稿已由服务器保存；重新打开可核对持久内容'
      await loadTemplates()
    }
  )
}
const submit = () => {
  const record = selected.value
  if (!record || draftDirty.value || !allowed(P.templateSubmit)) return
  command(
    `template-submit:${record.id}`,
    { expectedRevision: record.revision },
    (key) => submitMessagingTemplate(record, key),
    async (result) => {
      useRecord(result)
      notice.value = '已提交保存的草稿，等待另一位指定成员审批'
      await loadTemplates()
    },
    '确认提交当前已保存的模板草稿审批？'
  )
}
const setEnabled = () => {
  const record = selected.value
  if (!record || !allowed(P.templateDisable)) return
  command(
    `template-enable:${record.id}`,
    { expectedRevision: record.revision, enabled: !record.enabled },
    (key) => setMessagingTemplateEnabled(record, !record.enabled, key),
    async (result) => {
      useRecord(result)
      await loadTemplates()
      notice.value = result.enabled ? '模板已启用有效审批版本' : '模板已停用'
    },
    record.enabled
      ? '确认停用模板并阻止后续发送？'
      : '确认启用此模板的有效审批版本？'
  )
}
const archive = () => {
  const record = selected.value
  if (!record || !allowed(P.templateDelete)) return
  command(
    `template-archive:${record.id}`,
    { expectedRevision: record.revision, restore: !!record.archivedAt },
    (key) =>
      record.archivedAt
        ? restoreMessagingTemplate(record, key)
        : archiveMessagingTemplate(record, key),
    async (result) => {
      useRecord(result)
      notice.value = record.archivedAt
        ? '模板已恢复为停用草稿，请重新提交审批'
        : '模板已归档；审批和发送历史保留'
      await loadTemplates()
    },
    record.archivedAt
      ? '确认恢复模板为停用草稿？恢复后需要重新审批。'
      : '确认归档删除模板？历史审批快照和投递事实会保留。'
  )
}
const decide = (
  review: MessageTemplateReview,
  decision: 'approve' | 'reject'
) => {
  if (
    !allowed(P.templateApprove) ||
    review.requestedBy === user.id ||
    review.reviewerId !== user.id
  )
    return
  const reason = reviewReasons.value[review.id] || ''
  command(
    `review:${review.id}`,
    { expectedRevision: review.revision, decision, reason },
    (key) => decideMessagingReview(review, decision, reason, key),
    async () => {
      delete reviewReasons.value[review.id]
      notice.value =
        decision === 'approve'
          ? '服务器已记录审批并生成不可变版本'
          : '服务器已记录驳回原因'
      await loadReviews()
      await loadTemplates()
    },
    decision === 'approve'
      ? '确认通过该提交快照并生成可发送版本？'
      : '确认驳回该提交快照？'
  )
}
function syncVersionInputs() {
  const schema = activeVersion.value?.schema
  variableValues.value = Object.fromEntries(
    (schema?.variables || []).map((variable) => [
      variable.key,
      variable.defaultValue || '',
    ])
  )
  sendModes.value = schema ? [...schema.deliveryModes] : ['in-app']
  previewResult.value = undefined
  sendBaseline.value = sendSignature()
  previewSequence += 1
}
watch(versionId, syncVersionInputs)
watch(
  [variableValues, audience, sendModes, scheduledAt],
  () => {
    previewResult.value = undefined
    previewSequence += 1
  },
  { deep: true }
)
const preview = async () => {
  const templateId = selected.value?.id || activeVersion.value?.templateId
  if (!templateId || !versionId.value) return
  const current = ticket()
  const seq = ++previewSequence
  const body = {
    versionId: versionId.value,
    variables: { ...variableValues.value },
    audience: clone(audience.value),
  }
  error.value = ''
  try {
    const result = await previewMessagingTemplate(templateId, body)
    if (current() && seq === previewSequence) previewResult.value = result
  } catch (failure) {
    if (current() && seq === previewSequence)
      error.value = errorMessage(failure)
  }
}
const send = () => {
  if (!sendable.value || !previewResult.value || !allowed(P.sendCreate)) return
  let body: MessageSendInput
  try {
    body = parseMessageSendInput({
      templateVersionId: versionId.value,
      variables: variableValues.value,
      audience: audience.value,
      deliveryModes: sendModes.value,
      scheduledAt: scheduledAt.value
        ? new Date(scheduledAt.value).toISOString()
        : null,
    })
  } catch (failure) {
    error.value = errorMessage(failure)
    return
  }
  command(
    'send-template',
    body,
    (key) => createMessagingJob(body, key),
    (result) => {
      newJob.value = result
      sendBaseline.value = sendSignature()
      notice.value = `任务 ${result.id} 已由服务器记录，实际投递请读取任务详情`
    },
    '确认使用当前不可变审批版本创建发送任务？创建回执只代表任务记录，实际投递需继续查看。'
  )
}
onMounted(load)
</script>
