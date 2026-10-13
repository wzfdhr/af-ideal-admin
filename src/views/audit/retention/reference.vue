<template>
  <main class="audit-retention" data-testid="audit-retention-page">
    <header class="audit-retention__header">
      <div>
        <p>审计中心 / 事件逻辑归档</p>
        <h1>审计事件归档与保留</h1>
        <small>
          原始审计事实永久保留；此处建立可验证的逻辑归档成员关系，不删除事实。
        </small>
      </div>
      <button
        type="button"
        data-testid="audit-retention-refresh"
        :disabled="loading || busy || routeInvalid"
        @click="refresh(true)"
      >
        刷新
      </button>
    </header>

    <section
      v-if="rights"
      class="audit-retention__state is-error"
      data-testid="audit-retention-rights"
      role="alert"
    >
      当前身份必须同时拥有保留策略管理、审计读取、导出创建和导出归档权限。已清除先前策略、运行和制品信息。
    </section>
    <template v-if="hasGovernanceAccess">
      <form
        class="audit-retention__policy"
        aria-label="审计热数据保留策略"
        @submit.prevent="savePolicy"
      >
        <div>
          <h2>自然日保留策略</h2>
          <p>
            服务器按所选时区的自然日边界建立归档运行。执行人始终由服务器绑定为当前身份。
          </p>
        </div>
        <label>
          <span>启用策略</span>
          <input
            v-model="policyDraft.enabled"
            data-testid="audit-retention-enabled"
            type="checkbox"
            @change="policyDraftDirty = true"
          />
        </label>
        <label>
          热数据天数（1–3650）
          <input
            v-model.number="policyDraft.hotDays"
            data-testid="audit-retention-hot-days"
            type="number"
            min="1"
            max="3650"
            @input="policyDraftDirty = true"
          />
        </label>
        <label>
          时区
          <input
            v-model="policyDraft.timeZone"
            data-testid="audit-retention-time-zone"
            maxlength="100"
            @input="policyDraftDirty = true"
          />
        </label>
        <button
          type="submit"
          data-testid="audit-retention-save-policy"
          :disabled="busy || !policy"
        >
          保存策略
        </button>
        <p v-if="policy" data-testid="audit-retention-policy-state">
          修订 {{ policy.revision }} · 下次运行
          {{ policy.nextRunAt || '尚未安排' }} · 最近运行
          {{ policy.lastRunId || '无' }} · 执行人
          {{ policy.executor?.name || policy.executor?.id || '未绑定' }}
        </p>
        <p v-if="policyDraftDirty" data-testid="audit-retention-policy-dirty">
          正在编辑本地草稿；自动刷新不会覆盖输入。保存时将重新读取服务器修订
          {{ policy?.revision ?? '未知' }} 后提交。
        </p>
      </form>

      <form
        class="audit-retention__capture"
        aria-label="手动逻辑归档候选范围"
        @submit.prevent="saveQuery"
      >
        <div class="audit-retention__wide">
          <h2>手动完整候选捕获</h2>
          <p>
            一次固定“匹配且尚未归档”的完整授权候选，最多 100000
            条；服务器按每批最多 2000 条、2 MiB 快照和 10 MiB
            文件分批，绝不按当前列表页截断。普通审计查询仍包含全部事实。
          </p>
        </div>
        <label>
          操作人字面值
          <input
            v-model="queryDraft.operatorName"
            data-testid="audit-retention-operator"
            maxlength="100"
          />
        </label>
        <label>
          模块
          <input
            v-model="queryDraft.module"
            data-testid="audit-retention-module"
            maxlength="64"
          />
        </label>
        <label>
          事件类型
          <select
            v-model="queryDraft.eventType"
            data-testid="audit-retention-event-type"
          >
            <option value="">全部</option>
            <option value="operation">操作</option>
            <option value="security">安全</option>
            <option value="permission">权限</option>
            <option value="export">导出</option>
          </select>
        </label>
        <label>
          结果
          <select
            v-model="queryDraft.result"
            data-testid="audit-retention-result"
          >
            <option value="">全部</option>
            <option value="success">成功</option>
            <option value="failure">失败</option>
          </select>
        </label>
        <label>
          对象 ID（精确）
          <input
            v-model="queryDraft.targetId"
            data-testid="audit-retention-target"
            maxlength="100"
          />
        </label>
        <label>
          Trace ID（精确）
          <input
            v-model="queryDraft.traceId"
            data-testid="audit-retention-trace"
            maxlength="100"
          />
        </label>
        <label>
          开始自然日
          <input
            v-model="queryDraft.from"
            data-testid="audit-retention-from"
            type="date"
          />
        </label>
        <label>
          结束自然日
          <input
            v-model="queryDraft.to"
            data-testid="audit-retention-to"
            type="date"
          />
        </label>
        <label>
          查询时区
          <input
            v-model="queryDraft.timeZone"
            data-testid="audit-retention-query-time-zone"
            maxlength="100"
          />
        </label>
        <label>
          批次文件格式
          <select v-model="format" data-testid="audit-retention-format">
            <option
              v-for="capability in capabilities"
              :key="capability.format"
              :value="capability.format"
              :disabled="!capability.available"
            >
              {{ capability.format.toUpperCase()
              }}{{
                capability.available
                  ? ''
                  : `：${capability.reason || '当前不可用'}`
              }}
            </option>
          </select>
        </label>
        <div class="audit-retention__wide audit-retention__actions">
          <button type="submit" :disabled="busy">保存筛选到地址</button>
          <button
            type="button"
            data-testid="audit-retention-create"
            :disabled="busy || routeInvalid || !selectedCapability?.available"
            @click="createRun"
          >
            创建逻辑归档运行
          </button>
        </div>
      </form>

      <form
        class="audit-retention__list-filter"
        aria-label="归档运行分页"
        @submit.prevent="searchRuns"
      >
        <label>
          每页
          <select
            v-model.number="listDraft.pageSize"
            data-testid="audit-retention-page-size"
          >
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </label>
        <button type="submit" :disabled="loading || busy">查询运行</button>
      </form>

      <section
        v-if="error"
        class="audit-retention__state is-error"
        data-testid="audit-retention-error"
        role="alert"
      >
        <strong>{{ error }}</strong>
        <button type="button" @click="refresh(true)">重试当前读取</button>
      </section>
      <section
        v-else-if="loading"
        class="audit-retention__state"
        data-testid="audit-retention-loading"
      >
        正在读取服务器策略和归档运行…
      </section>
      <section
        v-else-if="!runs.length"
        class="audit-retention__state"
        data-testid="audit-retention-empty"
      >
        当前授权范围下没有逻辑归档运行。
      </section>
      <section v-else class="audit-retention__runs" aria-label="逻辑归档运行">
        <article
          v-for="run in runs"
          :key="run.id"
          class="audit-retention__run"
          :data-testid="`audit-retention-run-${run.id}`"
        >
          <button
            type="button"
            class="audit-retention__inspect"
            :disabled="busy"
            @click="inspect(run.id)"
          >
            {{ run.trigger === 'policy' ? '策略' : '手动' }} ·
            {{ run.format.toUpperCase() }} · {{ statusLabels[run.status] }}
          </button>
          <p>
            运行 {{ run.id }} · 修订 {{ run.revision }} · 尝试
            {{ run.attempts }} 次
          </p>
          <p v-if="run.restricted" class="is-private">
            当前字段权限不足，候选覆盖、固定筛选和错误详情已隐藏。
          </p>
          <p v-else data-testid="audit-retention-coverage">
            候选 {{ count(run.coverage.candidateTotal) }} · 已覆盖
            {{ count(run.coverage.coveredTotal) }} · 剩余
            {{ count(run.coverage.remainingTotal) }} · 批次
            {{ count(run.coverage.completedBatchTotal) }} /
            {{ count(run.coverage.batchTotal) }}
          </p>
          <p v-if="run.errorCode" class="is-error">
            {{ run.errorCode }}：{{
              run.errorMessage || '服务器未提供可见详情'
            }}
          </p>
          <div class="audit-retention__actions">
            <button
              v-if="canRun(run, 'cancel')"
              type="button"
              :disabled="busy"
              :data-testid="`audit-retention-cancel-${run.id}`"
              @click="commandRun(run, 'cancel')"
            >
              取消
            </button>
            <button
              v-if="canRun(run, 'retry')"
              type="button"
              :disabled="busy"
              :data-testid="`audit-retention-retry-${run.id}`"
              @click="commandRun(run, 'retry')"
            >
              按原候选清单重试
            </button>
          </div>
        </article>
      </section>

      <nav class="audit-retention__pagination" aria-label="逻辑归档运行分页">
        <button
          type="button"
          :disabled="loading || busy || listApplied.current <= 1"
          @click="goPage(listApplied.current - 1)"
        >
          上一页
        </button>
        <span>
          第 {{ listApplied.current }} / {{ pageCount }} 页 · 共 {{ total }} 项
        </span>
        <button
          type="button"
          :disabled="loading || busy || listApplied.current >= pageCount"
          @click="goPage(listApplied.current + 1)"
        >
          下一页
        </button>
      </nav>

      <section
        v-if="selected"
        class="audit-retention__detail"
        data-testid="audit-retention-detail"
      >
        <h2>服务器运行详情</h2>
        <p>
          {{ selected.id }} · {{ statusLabels[selected.status] }} · 来源
          {{ selected.source }} · 投影 {{ selected.projectionVersion }}
        </p>
        <p v-if="!selected.restricted">
          数据截止 {{ selected.dataCutoffAt || '尚未捕获' }} · 候选摘要
          {{ selected.candidateHash || '尚未生成' }}
        </p>
        <p v-else class="is-private">当前权限不能读取固定候选与覆盖详情。</p>
        <div class="audit-retention__actions">
          <button
            v-if="canRun(selected, 'cancel')"
            type="button"
            :disabled="busy"
            @click="commandRun(selected, 'cancel')"
          >
            取消
          </button>
          <button
            v-if="canRun(selected, 'retry')"
            type="button"
            :disabled="busy"
            @click="commandRun(selected, 'retry')"
          >
            按原候选清单重试
          </button>
        </div>

        <h3>不可变归档批次</h3>
        <p v-if="!batches.length">
          当前运行尚无批次；候选数为零的已完成运行无需批次。
        </p>
        <ol v-else class="audit-retention__batches">
          <li v-for="batch in batches" :key="batch.id">
            <strong>
              批次 {{ batch.ordinal }} · {{ batchStatusLabels[batch.status] }}
            </strong>
            <span v-if="batch.candidateRange">
              候选序号 {{ batch.candidateRange.firstOrdinal }}–{{
                batch.candidateRange.lastOrdinal
              }}
            </span>
            <span>尝试 {{ batch.attempts }} 次</span>
            <span v-if="batch.errorCode" class="is-error">
              {{ batch.errorCode }}：{{ batch.errorMessage || '无可见详情' }}
            </span>
            <span v-if="batch.artifact && !batch.restricted">
              {{ batch.artifact.fileName }} ·
              {{ batch.artifact.size ?? '大小受限' }} 字节 ·
              {{ batch.artifact.scanEngine || '未完成扫描' }}
            </span>
            <button
              v-if="canDownload(batch)"
              type="button"
              :disabled="busy"
              :data-testid="`audit-retention-download-${batch.id}`"
              @click="downloadBatch(selected, batch)"
            >
              校验并下载批次
            </button>
          </li>
        </ol>
        <nav
          v-if="batchTotal"
          class="audit-retention__pagination"
          aria-label="不可变归档批次分页"
        >
          <button
            type="button"
            data-testid="audit-retention-batch-previous"
            :disabled="busy || batchList.current <= 1"
            @click="goBatchPage(batchList.current - 1)"
          >
            上一批次页
          </button>
          <span data-testid="audit-retention-batch-page">
            第 {{ batchList.current }} / {{ batchPageCount }} 页 · 本页
            {{ batches.length }} 项 · 共 {{ batchTotal }} 批
          </span>
          <label>
            每页
            <select
              v-model.number="batchDraftPageSize"
              data-testid="audit-retention-batch-page-size"
              :disabled="busy"
              @change="changeBatchPageSize"
            >
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </label>
          <button
            type="button"
            data-testid="audit-retention-batch-next"
            :disabled="busy || batchList.current >= batchPageCount"
            @click="goBatchPage(batchList.current + 1)"
          >
            下一批次页
          </button>
        </nav>

        <h3>服务器治理事件</h3>
        <p v-if="eventsTotal > events.length">
          当前显示最近 {{ events.length }} / {{ eventsTotal }} 条治理事件。
        </p>
        <ol v-if="events.length" class="audit-retention__events">
          <li v-for="event in events" :key="event.id">
            {{ event.occurredAt }} · {{ event.action }} · {{ event.traceId }}
          </li>
        </ol>
        <p v-else>当前没有可见的治理事件。</p>
      </section>
      <p v-if="notice" class="audit-retention__notice" role="status">
        {{ notice }}
      </p>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  commandAuditArchiveRun,
  createAuditArchiveRun,
  downloadAuditArchiveBatch,
  fetchAuditArchiveBatches,
  fetchAuditArchiveCapabilities,
  fetchAuditArchiveEvents,
  fetchAuditArchiveRuns,
  fetchAuditRetentionPolicy,
  getAuditArchiveBatch,
  getAuditArchiveRun,
  updateAuditRetentionPolicy,
} from '@/api/audit-retention'
import { ApiRequestError } from '@/api/request-client'
import { getToken, getUserId } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import useUserStore from '@/store/modules/user'
import {
  AUDIT_ARCHIVE_BATCH_MAX_FILE_BYTES,
  AUDIT_DEFAULT_TIME_ZONE,
  AUDIT_EXPORT_FORMATS,
  AUDIT_EXPORT_PERMISSIONS,
  AUDIT_RETENTION_PERMISSIONS,
  parseAuditArchiveRunCreate,
  parseAuditQuery,
  parseAuditRetentionPolicyUpdate,
} from '@af-admin/contracts'
import type {
  AuditArchiveBatchStatus,
  AuditArchiveBatchV1,
  AuditArchiveEventV1,
  AuditArchiveRunStatus,
  AuditArchiveRunV1,
  AuditExportCapabilityV1,
  AuditExportFormat,
  AuditQueryV1,
  AuditRetentionPolicyV1,
} from '@af-admin/contracts'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const policy = ref<AuditRetentionPolicyV1 | null>(null)
const runs = ref<readonly AuditArchiveRunV1[]>([])
const selected = ref<AuditArchiveRunV1 | null>(null)
const batches = ref<readonly AuditArchiveBatchV1[]>([])
const events = ref<readonly AuditArchiveEventV1[]>([])
const eventsTotal = ref(0)
const batchTotal = ref(0)
const capabilities = ref<readonly AuditExportCapabilityV1[]>([])
const total = ref(0)
const loading = ref(false)
const busy = ref(false)
const rights = ref(false)
const routeInvalid = ref(false)
const error = ref('')
const notice = ref('')
const explicitRunId = ref('')
const format = ref<AuditExportFormat>('csv')
let readGeneration = 0
let detailGeneration = 0
let commandGeneration = 0
let privacyEpoch = 0
let pollTimer: number | undefined
let pollCount = 0
let mounted = true
let pendingCreateKey = ''
let pendingCreateSignature = ''
let pendingPolicyKey = ''
let pendingPolicySignature = ''
const policyDraftDirty = ref(false)
const policyDraftInitialized = ref(false)

const requiredPermissions = [
  AUDIT_RETENTION_PERMISSIONS.manage,
  'audit:read',
  AUDIT_EXPORT_PERMISSIONS.create,
  AUDIT_EXPORT_PERMISSIONS.archive,
]
const canPermission = (permission: string) =>
  user.permissions.includes('*') || user.permissions.includes(permission)
const hasGovernanceAccess = computed(() =>
  requiredPermissions.every(canPermission)
)
const canDownloadPermission = computed(() =>
  canPermission(AUDIT_EXPORT_PERMISSIONS.download)
)
const identityKey = computed(() =>
  JSON.stringify({
    id: user.id || null,
    tenantId: user.tenantId || null,
    permissions: [...user.permissions].sort(),
  })
)
const defaultQuery = (): AuditQueryV1 =>
  parseAuditQuery({
    version: 1,
    current: 1,
    pageSize: 100,
    timeZone: AUDIT_DEFAULT_TIME_ZONE,
  })
const queryDraft = reactive<AuditQueryV1>(defaultQuery())
const queryApplied = reactive<AuditQueryV1>(defaultQuery())
const policyDraft = reactive({
  enabled: false,
  hotDays: 90,
  timeZone: AUDIT_DEFAULT_TIME_ZONE,
})
const defaultList = () => ({ current: 1, pageSize: 20 })
const listDraft = reactive(defaultList())
const listApplied = reactive(defaultList())
const batchList = reactive(defaultList())
const batchDraftPageSize = ref(20)
const pageCount = computed(() =>
  Math.max(1, Math.ceil(total.value / listApplied.pageSize))
)
const batchPageCount = computed(() =>
  Math.max(1, Math.ceil(batchTotal.value / batchList.pageSize))
)
const selectedCapability = computed(() =>
  capabilities.value.find((item) => item.format === format.value)
)

const statusLabels: Record<AuditArchiveRunStatus, string> = {
  queued: '已排队',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  blocked: '已阻止',
  cancelled: '已取消',
}
const batchStatusLabels: Record<AuditArchiveBatchStatus, string> = {
  queued: '已排队',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  blocked: '已阻止',
  cancelled: '已取消',
  infected: '已隔离',
}
const allowedRouteKeys = new Set([
  'current',
  'pageSize',
  'batchCurrent',
  'batchPageSize',
  'runId',
  'format',
  'module',
  'eventType',
  'result',
  'operatorName',
  'targetId',
  'traceId',
  'from',
  'to',
  'timeZone',
])
const queryKeys = [
  'module',
  'eventType',
  'result',
  'operatorName',
  'targetId',
  'traceId',
  'from',
  'to',
  'timeZone',
]
const routeValue = (key: string) => {
  const value = route.query[key]
  if (Array.isArray(value)) throw new Error(`URL参数 ${key} 不能重复`)
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error(`URL参数 ${key} 必须为文本`)
  return value
}
const preserveRouteInputs = () => {
  queryKeys.forEach((key) => {
    const value = route.query[key]
    let preserved = ''
    if (Array.isArray(value))
      preserved = value
        .filter((item): item is string => typeof item === 'string')
        .join(' | ')
    else if (typeof value === 'string') preserved = value
    Object.assign(queryDraft, { [key]: preserved })
  })
}
const parseRoute = () => {
  const unknown = Object.keys(route.query).find(
    (key) => !allowedRouteKeys.has(key)
  )
  if (unknown) throw new Error(`URL包含未知归档参数 ${unknown}`)
  const audit = parseAuditQuery({
    version: 1,
    current: 1,
    pageSize: 100,
    module: routeValue('module'),
    eventType: routeValue('eventType'),
    result: routeValue('result'),
    operatorName: routeValue('operatorName'),
    targetId: routeValue('targetId'),
    traceId: routeValue('traceId'),
    from: routeValue('from'),
    to: routeValue('to'),
    timeZone: routeValue('timeZone') || AUDIT_DEFAULT_TIME_ZONE,
  })
  const current = Number(routeValue('current') || 1)
  const pageSize = Number(routeValue('pageSize') || 20)
  if (!Number.isSafeInteger(current) || current < 1 || current > 1000000)
    throw new Error('运行页码无效')
  if (![20, 50, 100].includes(pageSize)) throw new Error('运行每页数量无效')
  const batchCurrent = Number(routeValue('batchCurrent') || 1)
  const batchPageSize = Number(routeValue('batchPageSize') || 20)
  if (
    !Number.isSafeInteger(batchCurrent) ||
    batchCurrent < 1 ||
    batchCurrent > 1000000
  )
    throw new Error('批次页码无效')
  if (![20, 50, 100].includes(batchPageSize))
    throw new Error('批次每页数量无效')
  const runId = routeValue('runId')
  if (
    runId &&
    (!/^[A-Za-z0-9_-]{1,100}$/.test(runId) ||
      ['__proto__', 'prototype', 'constructor'].includes(runId.toLowerCase()))
  )
    throw new Error('指定归档运行ID无效')
  const selectedFormat = routeValue('format') || 'csv'
  if (!AUDIT_EXPORT_FORMATS.includes(selectedFormat as AuditExportFormat))
    throw new Error('归档批次格式无效')
  return {
    audit,
    list: { current, pageSize },
    batchList: { current: batchCurrent, pageSize: batchPageSize },
    runId,
    format: selectedFormat as AuditExportFormat,
  }
}
const routeQuery = (
  audit: AuditQueryV1,
  list: typeof listApplied,
  runId = explicitRunId.value
) =>
  Object.fromEntries(
    Object.entries({
      ...audit,
      version: undefined,
      current: list.current,
      pageSize: list.pageSize,
      batchCurrent: batchList.current,
      batchPageSize: batchList.pageSize,
      runId,
      format: format.value,
    })
      .filter(([, value]) => value !== '' && value !== undefined)
      .map(([key, value]) => [key, String(value)])
  )
const sameIdentity = (
  scope: ReturnType<typeof tenantScope.snapshot>,
  token: string | null,
  authUser: string | null,
  store: string
) =>
  mounted &&
  tenantScope.isCurrent(scope) &&
  getToken() === token &&
  getUserId() === authUser &&
  identityKey.value === store &&
  hasGovernanceAccess.value
const errorText = (failure: unknown) => {
  if (failure instanceof ApiRequestError) return failure.context.displayMessage
  if (failure instanceof Error) return failure.message
  return '审计逻辑归档请求失败'
}
const isRights = (failure: unknown) =>
  failure instanceof ApiRequestError &&
  ['forbidden', 'unauthorized'].includes(failure.context.kind)
const commandKey = () => crypto.randomUUID()
const count = (value: number | null) => (value === null ? '权限受限' : value)
const canRun = (run: AuditArchiveRunV1 | null, action: 'cancel' | 'retry') =>
  Boolean(
    run && run.allowedActions.includes(action) && hasGovernanceAccess.value
  )
const canDownload = (batch: AuditArchiveBatchV1) =>
  Boolean(
    canDownloadPermission.value &&
      !batch.restricted &&
      batch.status === 'completed' &&
      batch.artifact?.status === 'ready' &&
      batch.artifact.size !== null &&
      batch.artifact.sha256
  )
const clearPrivate = () => {
  policy.value = null
  runs.value = []
  selected.value = null
  batches.value = []
  events.value = []
  eventsTotal.value = 0
  batchTotal.value = 0
  capabilities.value = []
  total.value = 0
}
const stopPoll = () => {
  if (pollTimer !== undefined) window.clearTimeout(pollTimer)
  pollTimer = undefined
}
const planPoll = (confirmedInactive = false) => {
  stopPoll()
  if (!mounted || document.visibilityState === 'hidden') return
  const active =
    runs.value.some((run) => ['queued', 'processing'].includes(run.status)) ||
    Boolean(
      selected.value && ['queued', 'processing'].includes(selected.value.status)
    )
  if (!active) {
    if (confirmedInactive) pollCount = 0
    return
  }
  if (pollCount >= 20) {
    notice.value = '自动刷新已达到本次上限，请手动刷新获取后续状态。'
    return
  }
  pollTimer = window.setTimeout(() => {
    pollCount += 1
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    refresh(false)
  }, 3000)
}
const validateProjection = (value: {
  source: string
  projectionVersion: number
}) => {
  if (value.source !== 'server' || value.projectionVersion !== 1)
    throw new Error('不支持的审计归档服务器投影')
}
const identitySnapshot = () => ({
  scope: tenantScope.snapshot(),
  token: getToken(),
  authUser: getUserId(),
  store: identityKey.value,
})
type IdentitySnapshot = ReturnType<typeof identitySnapshot>
const sameRead = (
  epoch: number,
  generation: number,
  currentGeneration: number,
  identity: IdentitySnapshot
) =>
  epoch === privacyEpoch &&
  generation === currentGeneration &&
  sameIdentity(
    identity.scope,
    identity.token,
    identity.authUser,
    identity.store
  )
const invalidatePrivate = (forbidden = false, message = '') => {
  privacyEpoch += 1
  readGeneration += 1
  detailGeneration += 1
  commandGeneration += 1
  stopPoll()
  clearPrivate()
  loading.value = false
  busy.value = false
  rights.value = forbidden
  error.value = forbidden ? '' : message
}
const beginReadCycle = () => {
  privacyEpoch += 1
  readGeneration += 1
  detailGeneration += 1
  stopPoll()
  clearPrivate()
  loading.value = true
  error.value = ''
  rights.value = false
  return privacyEpoch
}
const syncPolicyDraft = (nextPolicy: AuditRetentionPolicyV1, force = false) => {
  if (!force && policyDraftInitialized.value && policyDraftDirty.value) return
  Object.assign(policyDraft, {
    enabled: nextPolicy.enabled,
    hotDays: nextPolicy.hotDays,
    timeZone: nextPolicy.timeZone,
  })
  policyDraftInitialized.value = true
  policyDraftDirty.value = false
}
const loadOverview = async (epoch: number) => {
  if (!hasGovernanceAccess.value) return
  const generation = ++readGeneration
  const identity = identitySnapshot()
  try {
    const [nextPolicy, page, ability] = await Promise.all([
      fetchAuditRetentionPolicy(),
      fetchAuditArchiveRuns({ ...listApplied }),
      fetchAuditArchiveCapabilities(),
    ])
    if (!sameRead(epoch, generation, readGeneration, identity)) return
    if (nextPolicy.source !== 'server')
      throw new Error('不支持的审计保留策略来源')
    validateProjection(page)
    if (page.list.some((item) => item.restricted)) {
      invalidatePrivate(false, '当前归档运行权限已变化，请重新刷新。')
      return
    }
    policy.value = nextPolicy
    syncPolicyDraft(nextPolicy)
    runs.value = page.list
    total.value = page.total
    capabilities.value = ability.formats
    Object.assign(listApplied, {
      current: page.current,
      pageSize: page.pageSize,
    })
    Object.assign(listDraft, listApplied)
  } catch (failure) {
    if (!sameRead(epoch, generation, readGeneration, identity)) return
    if (isRights(failure)) invalidatePrivate(true)
    else {
      clearPrivate()
      error.value = errorText(failure)
    }
  } finally {
    if (sameRead(epoch, generation, readGeneration, identity)) {
      loading.value = false
    }
  }
}
const loadDetail = async (epoch: number, id: string) => {
  if (!hasGovernanceAccess.value) return
  const generation = ++detailGeneration
  const identity = identitySnapshot()
  try {
    const [run, batchPage, eventPage] = await Promise.all([
      getAuditArchiveRun(id),
      fetchAuditArchiveBatches(id, { ...batchList }),
      fetchAuditArchiveEvents(id, { current: 1, pageSize: 100 }),
    ])
    if (!sameRead(epoch, generation, detailGeneration, identity)) return
    validateProjection(run)
    validateProjection(batchPage)
    validateProjection(eventPage)
    if (run.restricted || batchPage.list.some((item) => item.restricted)) {
      invalidatePrivate(false, '当前归档详情权限已变化，请重新刷新。')
      return
    }
    selected.value = run
    batches.value = batchPage.list
    batchTotal.value = batchPage.total
    Object.assign(batchList, {
      current: batchPage.current,
      pageSize: batchPage.pageSize,
    })
    batchDraftPageSize.value = batchPage.pageSize
    events.value = eventPage.list
    eventsTotal.value = eventPage.total
  } catch (failure) {
    if (!sameRead(epoch, generation, detailGeneration, identity)) return
    if (isRights(failure)) {
      invalidatePrivate(true)
      return
    }
    selected.value = null
    batches.value = []
    batchTotal.value = 0
    events.value = []
    eventsTotal.value = 0
    error.value = errorText(failure)
  }
}
const acceptRoute = async () => {
  try {
    const parsed = parseRoute()
    routeInvalid.value = false
    error.value = ''
    Object.assign(queryApplied, parsed.audit)
    Object.assign(queryDraft, parsed.audit)
    Object.assign(listApplied, parsed.list)
    Object.assign(listDraft, parsed.list)
    Object.assign(batchList, parsed.batchList)
    batchDraftPageSize.value = parsed.batchList.pageSize
    explicitRunId.value = parsed.runId
    format.value = parsed.format
    if (!hasGovernanceAccess.value) {
      invalidatePrivate(true)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await refresh(false)
  } catch (failure) {
    routeInvalid.value = true
    invalidatePrivate(false)
    preserveRouteInputs()
    error.value = errorText(failure)
  }
}
const navigate = async (
  audit: AuditQueryV1,
  list: typeof listApplied,
  runId = explicitRunId.value
) => {
  const before = route.fullPath
  await router.replace({ query: routeQuery(audit, list, runId) })
  if (before === route.fullPath) {
    Object.assign(queryApplied, audit)
    Object.assign(queryDraft, audit)
    Object.assign(listApplied, list)
    Object.assign(listDraft, list)
    explicitRunId.value = runId
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await refresh(true)
  }
}
const refresh = async (manual: boolean) => {
  if (manual) pollCount = 0
  if (routeInvalid.value) return acceptRoute()
  if (!hasGovernanceAccess.value) {
    invalidatePrivate(true)
    return undefined
  }
  const epoch = beginReadCycle()
  const reads: Promise<unknown>[] = [loadOverview(epoch)]
  if (explicitRunId.value) reads.push(loadDetail(epoch, explicitRunId.value))
  const results = await Promise.all(reads)
  if (
    epoch === privacyEpoch &&
    mounted &&
    hasGovernanceAccess.value &&
    !rights.value
  )
    planPoll(true)
  return results
}
const saveQuery = async () => {
  try {
    const parsed = parseAuditQuery({
      ...queryDraft,
      current: 1,
      pageSize: 100,
    })
    await navigate(parsed, { ...listApplied, current: 1 })
  } catch (failure) {
    error.value = errorText(failure)
  }
}
const searchRuns = () => navigate(queryApplied, { ...listDraft, current: 1 })
const goPage = (current: number) =>
  navigate(queryApplied, { ...listApplied, current })
const inspect = (id: string) => {
  Object.assign(batchList, { current: 1 })
  return navigate(queryApplied, listApplied, id)
}
const goBatchPage = async (current: number) => {
  Object.assign(batchList, { current })
  await navigate(queryApplied, listApplied, explicitRunId.value)
}
const changeBatchPageSize = async () => {
  Object.assign(batchList, {
    current: 1,
    pageSize: batchDraftPageSize.value,
  })
  await navigate(queryApplied, listApplied, explicitRunId.value)
}

const savePolicy = async () => {
  if (busy.value || !policy.value || !hasGovernanceAccess.value) return
  let draftInput
  try {
    draftInput = {
      enabled: policyDraft.enabled,
      hotDays: policyDraft.hotDays,
      timeZone: policyDraft.timeZone,
    }
    parseAuditRetentionPolicyUpdate({
      version: 1,
      expectedRevision: policy.value.revision,
      ...draftInput,
    })
  } catch (failure) {
    error.value = errorText(failure)
    return
  }
  const generation = ++commandGeneration
  const identity = identitySnapshot()
  stopPoll()
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const fresh = await fetchAuditRetentionPolicy()
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    if (fresh.source !== 'server') throw new Error('不支持的审计保留策略来源')
    policy.value = fresh
    syncPolicyDraft(fresh)
    if (!fresh.allowedActions.includes('update'))
      throw new Error('当前策略权限或状态已变化')
    const input = parseAuditRetentionPolicyUpdate({
      version: 1,
      expectedRevision: fresh.revision,
      ...draftInput,
    })
    const signature = JSON.stringify(input)
    if (signature !== pendingPolicySignature) pendingPolicyKey = ''
    pendingPolicySignature = signature
    const key = pendingPolicyKey || commandKey()
    pendingPolicyKey = key
    const result = await updateAuditRetentionPolicy(input, key)
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    pendingPolicyKey = ''
    pendingPolicySignature = ''
    policy.value = result
    syncPolicyDraft(result, true)
    notice.value = '服务器保留策略已更新，执行人已绑定为当前身份。'
    await refresh(true)
  } catch (failure) {
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    if (isRights(failure)) invalidatePrivate(true)
    else error.value = errorText(failure)
  } finally {
    if (generation === commandGeneration) busy.value = false
  }
}
const createRun = async () => {
  if (
    busy.value ||
    routeInvalid.value ||
    !hasGovernanceAccess.value ||
    !selectedCapability.value?.available
  )
    return
  let input
  try {
    input = parseAuditArchiveRunCreate({
      version: 1,
      query: { ...queryDraft, current: 1, pageSize: 100 },
      format: format.value,
    })
  } catch (failure) {
    error.value = errorText(failure)
    return
  }
  const generation = ++commandGeneration
  const identity = identitySnapshot()
  stopPoll()
  busy.value = true
  error.value = ''
  notice.value = ''
  const signature = JSON.stringify(input)
  if (signature !== pendingCreateSignature) pendingCreateKey = ''
  pendingCreateSignature = signature
  const key = pendingCreateKey || commandKey()
  pendingCreateKey = key
  try {
    const run = await createAuditArchiveRun(input, key)
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    if (run.restricted) {
      invalidatePrivate(false, '当前归档运行权限已变化，请重新刷新。')
      return
    }
    pendingCreateKey = ''
    pendingCreateSignature = ''
    selected.value = run
    explicitRunId.value = run.id
    notice.value = '已创建完整候选逻辑归档运行。'
    Object.assign(batchList, { current: 1 })
    await navigate(input.query, listApplied, run.id)
  } catch (failure) {
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    if (isRights(failure)) invalidatePrivate(true)
    else error.value = errorText(failure)
  } finally {
    if (generation === commandGeneration) busy.value = false
  }
}
const commandRun = async (
  run: AuditArchiveRunV1 | null,
  action: 'cancel' | 'retry'
) => {
  if (!run || busy.value || !canRun(run, action)) return
  const generation = ++commandGeneration
  const identity = identitySnapshot()
  stopPoll()
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const fresh = await getAuditArchiveRun(run.id)
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    if (fresh.restricted) {
      invalidatePrivate(false, '当前归档运行权限已变化，请重新刷新。')
      return
    }
    if (!canRun(fresh, action)) throw new Error('当前权限或运行状态已变化')
    const result = await commandAuditArchiveRun(fresh, action, commandKey())
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    if (result.restricted) {
      invalidatePrivate(false, '当前归档运行权限已变化，请重新刷新。')
      return
    }
    if (result.id !== explicitRunId.value)
      Object.assign(batchList, { current: 1 })
    selected.value = result
    explicitRunId.value = result.id
    notice.value = '服务器归档运行状态已更新。'
    await navigate(queryApplied, listApplied, result.id)
  } catch (failure) {
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    if (isRights(failure)) invalidatePrivate(true)
    else error.value = errorText(failure)
  } finally {
    if (generation === commandGeneration) busy.value = false
  }
}
const normalizedMime = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .sort()
    .join(';')
const downloadBatch = async (
  run: AuditArchiveRunV1 | null,
  batch: AuditArchiveBatchV1
) => {
  if (!run || busy.value || !canDownload(batch)) return
  const generation = ++commandGeneration
  const identity = identitySnapshot()
  stopPoll()
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const [freshRun, fresh] = await Promise.all([
      getAuditArchiveRun(run.id),
      getAuditArchiveBatch(run.id, batch.id),
    ])
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    validateProjection(freshRun)
    validateProjection(fresh)
    if (freshRun.restricted || fresh.restricted) {
      invalidatePrivate(false, '当前归档批次权限已变化，请重新刷新。')
      return
    }
    if (!canDownload(fresh) || !fresh.artifact)
      throw new Error('当前权限或归档批次制品状态已变化')
    const { artifact } = fresh
    if (
      artifact.size === null ||
      artifact.size > AUDIT_ARCHIVE_BATCH_MAX_FILE_BYTES ||
      !artifact.sha256
    )
      throw new Error('归档批次制品元数据无效')
    const content = await downloadAuditArchiveBatch(run.id, batch.id)
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    const bytes = await content.blob.arrayBuffer()
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    const actualHash = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    if (!/^\d+$/.test(content.size) || !/^[a-f0-9]{64}$/.test(content.sha256))
      throw new Error('归档下载响应缺少完整性响应头')
    const responseSize = Number(content.size)
    const responseHash = content.sha256
    if (
      content.blob.size !== artifact.size ||
      content.blob.size > AUDIT_ARCHIVE_BATCH_MAX_FILE_BYTES ||
      responseSize !== artifact.size ||
      responseHash !== artifact.sha256 ||
      actualHash !== artifact.sha256 ||
      normalizedMime(content.mimeType) !== normalizedMime(artifact.mimeType) ||
      !/^attachment\b/i.test(content.contentDisposition)
    )
      throw new Error('下载字节与服务器归档制品记录不符')
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    const url = URL.createObjectURL(content.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = artifact.fileName
    anchor.click()
    URL.revokeObjectURL(url)
    notice.value = `已校验并下载 ${artifact.fileName}（${artifact.size} 字节）`
  } catch (failure) {
    if (
      generation !== commandGeneration ||
      !sameIdentity(
        identity.scope,
        identity.token,
        identity.authUser,
        identity.store
      )
    )
      return
    if (isRights(failure)) invalidatePrivate(true)
    else error.value = errorText(failure)
  } finally {
    if (generation === commandGeneration) busy.value = false
  }
}
const visibility = () =>
  document.visibilityState === 'hidden' ? stopPoll() : planPoll()

onMounted(() => {
  acceptRoute()
  document.addEventListener('visibilitychange', visibility)
})
watch(identityKey, (next, previous) => {
  if (!mounted || next === previous) return
  invalidatePrivate(!hasGovernanceAccess.value)
  notice.value = ''
  pendingCreateKey = ''
  pendingCreateSignature = ''
  pendingPolicyKey = ''
  pendingPolicySignature = ''
  rights.value = !hasGovernanceAccess.value
  if (!rights.value) acceptRoute()
})
onBeforeUnmount(() => {
  mounted = false
  privacyEpoch += 1
  readGeneration += 1
  detailGeneration += 1
  commandGeneration += 1
  stopPoll()
  document.removeEventListener('visibilitychange', visibility)
})
</script>

<style scoped>
.audit-retention {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}
h1,
h2,
h3,
p {
  margin-top: 0;
}
.audit-retention__header,
.audit-retention__actions,
.audit-retention__pagination,
.audit-retention__list-filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
button,
input,
select {
  font: inherit;
}
button {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #b8c1ce;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.audit-retention__policy,
.audit-retention__capture,
.audit-retention__list-filter,
.audit-retention__detail {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
}
.audit-retention__policy {
  display: grid;
  grid-template-columns: minmax(280px, 2fr) repeat(3, minmax(150px, 1fr)) auto;
  align-items: end;
  gap: 12px;
}
.audit-retention__policy > p {
  grid-column: 1/-1;
}
.audit-retention__capture {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 12px;
}
.audit-retention__wide {
  grid-column: 1/-1;
}
label {
  display: grid;
  gap: 5px;
  color: #4e5969;
  font-size: 13px;
}
input:not([type='checkbox']),
select {
  height: 36px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid #c9cdd4;
  border-radius: 4px;
  background: #fff;
}
.audit-retention__runs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.audit-retention__run {
  padding: 14px;
  border: 1px solid #dfe4ec;
  border-radius: 6px;
  background: #fff;
}
.audit-retention__inspect {
  width: 100%;
  margin-bottom: 10px;
  text-align: left;
}
.audit-retention__state {
  min-height: 120px;
  display: grid;
  place-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 20px;
  border: 1px solid #e5e6eb;
  background: #fff;
}
.audit-retention__pagination {
  margin-top: 14px;
}
.audit-retention__batches,
.audit-retention__events {
  display: grid;
  gap: 8px;
}
.audit-retention__batches li {
  display: grid;
  gap: 5px;
  padding: 10px;
  border: 1px solid #e5e6eb;
}
.audit-retention__notice {
  position: sticky;
  bottom: 12px;
  margin-top: 12px;
  padding: 10px 14px;
  border: 1px solid #86b7fe;
  background: #eef6ff;
}
.is-error {
  color: #b42318;
}
.is-private {
  color: #b54708;
}
@media (max-width: 1280px) {
  .audit-retention__policy,
  .audit-retention__capture {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
  .audit-retention__wide,
  .audit-retention__policy > p {
    grid-column: 1/-1;
  }
}
@media (max-width: 760px) {
  .audit-retention {
    padding: 14px;
  }
  .audit-retention__policy,
  .audit-retention__capture {
    grid-template-columns: 1fr;
  }
  .audit-retention__wide,
  .audit-retention__policy > p {
    grid-column: auto;
  }
}
</style>
