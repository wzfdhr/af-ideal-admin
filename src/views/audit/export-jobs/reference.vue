<template>
  <main class="audit-exports" data-testid="audit-export-page">
    <header class="audit-exports__header">
      <div>
        <p>审计中心 / 真实导出任务</p>
        <h1>审计导出</h1>
        <small>来源：server · 投影版本：1 · 完整匹配上限 2000 条</small>
      </div>
      <button
        type="button"
        data-testid="audit-export-refresh"
        :disabled="loading || busy"
        @click="refresh"
      >
        刷新任务
      </button>
    </header>

    <form
      class="audit-exports__query"
      aria-label="审计导出事实查询"
      @submit.prevent="saveQuery"
    >
      <h2>导出事实范围</h2>
      <label>
        操作人字面值
        <input
          v-model="draft.operatorName"
          data-testid="audit-export-operator"
          maxlength="100"
        />
      </label>
      <label>
        模块
        <input
          v-model="draft.module"
          data-testid="audit-export-module"
          maxlength="64"
        />
      </label>
      <label>
        事件类型
        <select v-model="draft.eventType" data-testid="audit-export-event-type">
          <option value="">全部</option>
          <option value="operation">操作</option>
          <option value="security">安全</option>
          <option value="permission">权限</option>
          <option value="export">导出</option>
        </select>
      </label>
      <label>
        结果
        <select v-model="draft.result" data-testid="audit-export-result">
          <option value="">全部</option>
          <option value="success">成功</option>
          <option value="failure">失败</option>
        </select>
      </label>
      <label>
        对象 ID（精确）
        <input
          v-model="draft.targetId"
          data-testid="audit-export-target"
          maxlength="100"
        />
      </label>
      <label>
        Trace ID（精确）
        <input
          v-model="draft.traceId"
          data-testid="audit-export-trace"
          maxlength="100"
        />
      </label>
      <label>
        开始自然日
        <input
          v-model="draft.from"
          data-testid="audit-export-from"
          type="date"
        />
      </label>
      <label>
        结束自然日
        <input v-model="draft.to" data-testid="audit-export-to" type="date" />
      </label>
      <label>
        时区
        <input
          v-model="draft.timeZone"
          data-testid="audit-export-time-zone"
          maxlength="100"
        />
      </label>
      <div class="audit-exports__query-actions">
        <button
          type="submit"
          data-testid="audit-export-save-query"
          :disabled="busy"
        >
          保存筛选到地址
        </button>
        <label>
          格式
          <select v-model="format" data-testid="audit-export-format">
            <option
              v-for="ability in capabilities"
              :key="ability.format"
              :value="ability.format"
              :disabled="!ability.available"
            >
              {{ ability.format.toUpperCase()
              }}{{
                ability.available ? '' : `：${ability.reason || '当前不可用'}`
              }}
            </option>
          </select>
        </label>
        <button
          type="button"
          data-testid="audit-export-create"
          :disabled="busy || routeInvalid || !selectedCapability?.available"
          @click="create"
        >
          导出全部匹配事实
        </button>
      </div>
      <p>
        导出固定当前筛选的完整授权集合，不会只导出页面上可见的 20/50/100 条。
      </p>
    </form>

    <form
      v-if="canPermission(P.list)"
      class="audit-exports__list-filter"
      aria-label="导出任务筛选"
      @submit.prevent="searchJobs"
    >
      <label>
        任务状态
        <select v-model="listDraft.status" data-testid="audit-export-status">
          <option value="">全部</option>
          <option v-for="(label, key) in statusLabels" :key="key" :value="key">
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        归档范围
        <select
          v-model="listDraft.archived"
          data-testid="audit-export-archived"
        >
          <option value="all">全部</option>
          <option value="active">未归档</option>
          <option value="archived">已归档</option>
        </select>
      </label>
      <label>
        每页
        <select
          v-model.number="listDraft.pageSize"
          data-testid="audit-export-page-size"
        >
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <button
        type="submit"
        data-testid="audit-export-search"
        :disabled="loading || busy"
      >
        查询任务
      </button>
    </form>

    <section
      v-if="rights"
      class="audit-exports__state is-rights"
      data-testid="audit-export-rights"
      role="alert"
    >
      当前身份无权读取审计导出任务，已清除先前任务、筛选快照和文件元数据。
    </section>
    <section
      v-else-if="error"
      class="audit-exports__state is-error"
      data-testid="audit-export-error"
      role="alert"
    >
      <strong>{{ error }}</strong>
      <button type="button" @click="refresh">重试当前读取</button>
    </section>
    <section
      v-else-if="loading"
      class="audit-exports__state"
      data-testid="audit-export-loading"
    >
      正在读取真实任务状态…
    </section>
    <section
      v-else-if="!canPermission(P.list)"
      class="audit-exports__state"
      data-testid="audit-export-list-unavailable"
    >
      当前身份没有任务列表权限。可用的创建或指定任务操作仍按各自权限执行。
    </section>
    <section
      v-else-if="!jobs.length"
      class="audit-exports__state"
      data-testid="audit-export-empty"
    >
      当前授权范围与筛选下没有导出任务。
    </section>

    <section
      v-else-if="canPermission(P.list)"
      class="audit-exports__jobs"
      aria-label="真实审计导出任务"
    >
      <article
        v-for="job in jobs"
        :key="job.id"
        class="audit-exports__job"
        :data-testid="`audit-export-job-${job.id}`"
      >
        <button
          type="button"
          class="audit-exports__inspect"
          :disabled="busy"
          @click="inspect(job.id)"
        >
          {{ job.format.toUpperCase() }} · {{ statusLabels[job.status] }} ·
          {{ stageLabels[job.stage] }}
        </button>
        <p>
          任务 {{ job.id }} · 修订 {{ job.revision }} · 尝试
          {{ job.attempts }} 次
        </p>
        <p v-if="job.restricted" class="is-private">
          当前权限不足：固定筛选、数量、摘要和制品元数据已隐藏。
        </p>
        <template v-else>
          <p>
            {{ job.processedRows ?? 0 }} / {{ job.totalRows ?? '待捕获' }} 条 ·
            截止 {{ job.dataCutoffAt || '尚未捕获' }}
          </p>
          <p v-if="job.artifact">
            {{ job.artifact.fileName }} ·
            {{ job.artifact.size ?? '字节数受限' }} 字节 ·
            {{ job.artifact.status }} · 扫描
            {{ job.artifact.scanEngine || '未完成' }}
          </p>
        </template>
        <p v-if="job.errorCode" class="is-error">
          {{ job.errorCode }}：{{ job.errorMessage }}
        </p>
        <div class="audit-exports__actions">
          <button
            v-if="can(job, 'cancel')"
            type="button"
            :disabled="busy"
            :data-testid="`audit-export-cancel-${job.id}`"
            @click="command(job, 'cancel')"
          >
            取消
          </button>
          <button
            v-if="can(job, 'retry')"
            type="button"
            :disabled="busy"
            :data-testid="`audit-export-retry-${job.id}`"
            @click="command(job, 'retry')"
          >
            按原快照重试
          </button>
          <button
            v-if="can(job, 'archive')"
            type="button"
            :disabled="busy"
            :data-testid="`audit-export-archive-${job.id}`"
            @click="command(job, 'archive')"
          >
            归档
          </button>
          <button
            v-if="can(job, 'unarchive')"
            type="button"
            :disabled="busy"
            :data-testid="`audit-export-unarchive-${job.id}`"
            @click="command(job, 'unarchive')"
          >
            取消归档
          </button>
          <button
            v-if="can(job, 'download')"
            type="button"
            :disabled="busy"
            :data-testid="`audit-export-download-${job.id}`"
            @click="download(job)"
          >
            下载并校验
          </button>
        </div>
      </article>
    </section>

    <nav
      v-if="canPermission(P.list)"
      class="audit-exports__pagination"
      aria-label="真实审计导出分页"
    >
      <button
        type="button"
        data-testid="audit-export-previous"
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
        data-testid="audit-export-next"
        :disabled="loading || busy || listApplied.current >= pageCount"
        @click="goPage(listApplied.current + 1)"
      >
        下一页
      </button>
    </nav>

    <section
      v-if="selected"
      class="audit-exports__detail"
      data-testid="audit-export-detail"
    >
      <h2>服务器任务详情</h2>
      <p>
        任务 {{ selected.id }} · 来源 {{ selected.source }} · 生产器
        {{ selected.producerVersion }} · 投影 {{ selected.projectionVersion }}
      </p>
      <p>
        {{ statusLabels[selected.status] }} /
        {{ stageLabels[selected.stage] }} · 下一尝试
        {{ selected.nextAttemptAt }} · 租约 {{ selected.leaseUntil || '无' }}
      </p>
      <template v-if="!selected.restricted">
        <p v-if="selected.query" data-testid="audit-export-fixed-query">
          固定筛选：{{ querySummary(selected.query) }}
        </p>
        <p v-if="selected.artifact">
          MIME {{ selected.artifact.mimeType }} ·
          {{ selected.artifact.size }} 字节 · SHA-256
          {{ selected.artifact.sha256 }} · 扫描
          {{ selected.artifact.scanEngine }} / {{ selected.artifact.scannedAt }}
        </p>
      </template>
      <p v-else class="is-private">
        当前权限不能读取固定查询、数量、摘要或制品。
      </p>
      <ol v-if="selected.events?.length" aria-label="审计导出服务端事件">
        <li v-for="event in selected.events" :key="event.id">
          {{ event.occurredAt }} · {{ event.action }} · {{ event.traceId }}
          <span v-if="event.operator.name">· {{ event.operator.name }}</span>
        </li>
      </ol>
      <div class="audit-exports__actions">
        <button
          v-if="can(selected, 'cancel')"
          type="button"
          :disabled="busy"
          @click="command(selected, 'cancel')"
        >
          取消
        </button>
        <button
          v-if="can(selected, 'retry')"
          type="button"
          :disabled="busy"
          @click="command(selected, 'retry')"
        >
          按原快照重试
        </button>
        <button
          v-if="can(selected, 'archive')"
          type="button"
          :disabled="busy"
          @click="command(selected, 'archive')"
        >
          归档
        </button>
        <button
          v-if="can(selected, 'unarchive')"
          type="button"
          :disabled="busy"
          @click="command(selected, 'unarchive')"
        >
          取消归档
        </button>
        <button
          v-if="can(selected, 'download')"
          type="button"
          :disabled="busy"
          :data-testid="`audit-export-detail-download-${selected.id}`"
          @click="download(selected)"
        >
          下载并校验
        </button>
      </div>
    </section>
    <p v-if="notice" class="audit-exports__notice" role="status">
      {{ notice }}
    </p>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  archiveAuditExport,
  commandAuditExport,
  createAuditExport,
  downloadAuditExport,
  fetchAuditExportCapabilities,
  fetchAuditExports,
  getAuditExport,
} from '@/api/audit-exports'
import { ApiRequestError } from '@/api/request-client'
import { getToken, getUserId } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import useUserStore from '@/store/modules/user'
import {
  AUDIT_DEFAULT_TIME_ZONE,
  AUDIT_EXPORT_FORMATS,
  AUDIT_EXPORT_PERMISSIONS as P,
  parseAuditExportCreate,
  parseAuditQuery,
} from '@af-admin/contracts'
import type {
  AuditExportAllowedAction,
  AuditExportCapabilityV1,
  AuditExportFormat,
  AuditExportJobV1,
  AuditExportStatus,
  AuditQueryV1,
} from '@af-admin/contracts'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const jobs = ref<readonly AuditExportJobV1[]>([])
const selected = ref<AuditExportJobV1 | null>(null)
const capabilities = ref<readonly AuditExportCapabilityV1[]>([])
const total = ref(0)
const loading = ref(false)
const busy = ref(false)
const rights = ref(false)
const error = ref('')
const notice = ref('')
const routeInvalid = ref(false)
const explicitJobId = ref('')
const format = ref<AuditExportFormat>('csv')
let listGeneration = 0
let detailGeneration = 0
let capabilityGeneration = 0
let commandGeneration = 0
let pollTimer: number | undefined
let pendingCreateKey = ''
let pendingCreateSignature = ''
let mounted = true

const defaultAudit = (): AuditQueryV1 =>
  parseAuditQuery({
    version: 1,
    current: 1,
    pageSize: 100,
    timeZone: AUDIT_DEFAULT_TIME_ZONE,
  })
const draft = reactive<AuditQueryV1>(defaultAudit())
const applied = reactive<AuditQueryV1>(defaultAudit())
const defaultList = () => ({
  current: 1,
  pageSize: 20,
  status: '' as AuditExportStatus | '',
  archived: 'all' as const,
})
const listDraft = reactive(defaultList())
const listApplied = reactive(defaultList())
const selectedCapability = computed(() =>
  capabilities.value.find((item) => item.format === format.value)
)
const pageCount = computed(() =>
  Math.max(1, Math.ceil(total.value / listApplied.pageSize))
)
const identityKey = computed(() =>
  JSON.stringify({
    id: user.id || null,
    tenantId: user.tenantId || null,
    permissions: [...user.permissions].sort(),
  })
)
const canPermission = (permission: string) =>
  user.permissions.includes('*') || user.permissions.includes(permission)
const hasMetadataPermission = computed(() =>
  Object.values(P).some((permission) => canPermission(permission))
)
const actionPermissions = {
  cancel: P.cancel,
  retry: P.retry,
  archive: P.archive,
  unarchive: P.archive,
  download: P.download,
} as const
const can = (job: AuditExportJobV1 | null, action: AuditExportAllowedAction) =>
  Boolean(
    job &&
      job.allowedActions.includes(action) &&
      canPermission(actionPermissions[action])
  )

const statusLabels: Record<AuditExportStatus, string> = {
  queued: '已排队',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  blocked: '已阻止',
  cancelled: '已取消',
  infected: '已隔离',
  expired: '已过期',
}
const stageLabels = {
  queued: '等待处理',
  capturing: '捕获事实',
  rendering: '生成文件',
  scanning: '扫描文件',
  completed: '完成',
  stopped: '停止',
}
const allowedRouteKeys = new Set([
  'current',
  'pageSize',
  'status',
  'archived',
  'module',
  'eventType',
  'result',
  'operatorName',
  'targetId',
  'traceId',
  'from',
  'to',
  'timeZone',
  'jobId',
  'format',
])
const routeValue = (key: string) => {
  const value = route.query[key]
  if (Array.isArray(value)) throw new Error(`URL参数 ${key} 不能重复`)
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error(`URL参数 ${key} 必须为文本`)
  return value
}
const preserveRouteInputs = () => {
  ;[
    'module',
    'eventType',
    'result',
    'operatorName',
    'targetId',
    'traceId',
    'from',
    'to',
    'timeZone',
  ].forEach((key) => {
    const value = route.query[key]
    let preserved = ''
    if (Array.isArray(value))
      preserved = value
        .filter((item): item is string => typeof item === 'string')
        .join(' | ')
    else if (typeof value === 'string') preserved = value
    Object.assign(draft, { [key]: preserved })
  })
}
const parseRoute = () => {
  const unknown = Object.keys(route.query).find(
    (key) => !allowedRouteKeys.has(key)
  )
  if (unknown) throw new Error(`URL包含未知导出参数 ${unknown}`)
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
    throw new Error('任务页码无效')
  if (![20, 50, 100].includes(pageSize)) throw new Error('任务每页数量无效')
  const status = routeValue('status') as AuditExportStatus | ''
  if (status && !(status in statusLabels)) throw new Error('任务状态无效')
  const archived = routeValue('archived') || 'all'
  if (!['all', 'active', 'archived'].includes(archived))
    throw new Error('归档范围无效')
  const jobId = routeValue('jobId')
  if (
    jobId &&
    (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(jobId) ||
      ['__proto__', 'prototype', 'constructor'].includes(jobId.toLowerCase()))
  )
    throw new Error('指定任务ID无效')
  const selectedFormat = routeValue('format') || 'csv'
  if (!AUDIT_EXPORT_FORMATS.includes(selectedFormat as AuditExportFormat))
    throw new Error('审计导出格式无效')
  return {
    audit,
    list: {
      current,
      pageSize,
      status,
      archived: archived as 'all' | 'active' | 'archived',
    },
    jobId,
    format: selectedFormat as AuditExportFormat,
  }
}
const routeQuery = (audit: AuditQueryV1, list: typeof listApplied) =>
  Object.fromEntries(
    Object.entries({
      ...audit,
      version: undefined,
      current: list.current,
      pageSize: list.pageSize,
      status: list.status,
      archived: list.archived,
      jobId: explicitJobId.value,
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
  identityKey.value === store
const errorText = (failure: unknown) => {
  if (failure instanceof ApiRequestError) return failure.context.displayMessage
  if (failure instanceof Error) return failure.message
  return '审计导出请求失败'
}
const isRights = (failure: unknown) =>
  failure instanceof ApiRequestError &&
  ['forbidden', 'unauthorized'].includes(failure.context.kind)
const commandKey = () => crypto.randomUUID()

const clearPrivate = () => {
  jobs.value = []
  selected.value = null
  capabilities.value = []
  total.value = 0
}
const stopPoll = () => {
  if (pollTimer !== undefined) window.clearTimeout(pollTimer)
  pollTimer = undefined
}
const planPoll = () => {
  stopPoll()
  if (!mounted || document.visibilityState === 'hidden') return
  const listActive =
    canPermission(P.list) &&
    jobs.value.some((job) => ['queued', 'processing'].includes(job.status))
  const detailActive =
    Boolean(explicitJobId.value) &&
    Boolean(
      selected.value && ['queued', 'processing'].includes(selected.value.status)
    )
  if (!listActive && !detailActive) return
  pollTimer = window.setTimeout(() => {
    // An explicit detail can be older than or excluded from the current list
    // page, so every poll must refresh it independently from the list.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    refresh()
  }, 3000)
}
const loadCapabilities = async () => {
  if (!canPermission(P.create)) return
  const generation = ++capabilityGeneration
  const scope = tenantScope.snapshot()
  const token = getToken()
  const authUser = getUserId()
  const store = identityKey.value
  try {
    const result = await fetchAuditExportCapabilities()
    if (
      generation !== capabilityGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    capabilities.value = result.formats
  } catch (failure) {
    if (
      generation !== capabilityGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    capabilities.value = []
    if (isRights(failure)) {
      rights.value = true
      clearPrivate()
    }
  }
}
const loadList = async () => {
  if (!canPermission(P.list)) {
    detailGeneration += 1
    loading.value = false
    jobs.value = []
    selected.value = null
    total.value = 0
    return
  }
  stopPoll()
  const generation = ++listGeneration
  const selectedId = selected.value?.id
  const selectionGeneration = ++detailGeneration
  selected.value = null
  const scope = tenantScope.snapshot()
  const token = getToken()
  const authUser = getUserId()
  const store = identityKey.value
  loading.value = true
  error.value = ''
  rights.value = false
  jobs.value = []
  total.value = 0
  try {
    const result = await fetchAuditExports({ ...listApplied })
    if (
      generation !== listGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    if (result.source !== 'server' || result.projectionVersion !== 1)
      throw new Error('不支持的审计导出投影')
    const max = Math.max(1, Math.ceil(result.total / result.pageSize))
    if (listApplied.current > max) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      await navigate(applied, { ...listApplied, current: max })
      return
    }
    jobs.value = result.list
    total.value = result.total
    if (!explicitJobId.value && detailGeneration === selectionGeneration)
      selected.value = selectedId
        ? result.list.find((job) => job.id === selectedId) || null
        : null
    Object.assign(listApplied, {
      current: result.current,
      pageSize: result.pageSize,
    })
  } catch (failure) {
    if (
      generation !== listGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    rights.value = isRights(failure)
    if (rights.value) clearPrivate()
    else {
      jobs.value = []
      if (detailGeneration === selectionGeneration) selected.value = null
      total.value = 0
    }
    error.value = rights.value ? '' : errorText(failure)
  } finally {
    if (generation === listGeneration) {
      loading.value = false
      planPoll()
    }
  }
}
const inspect = async (id: string) => {
  const generation = ++detailGeneration
  const scope = tenantScope.snapshot()
  const token = getToken()
  const authUser = getUserId()
  const store = identityKey.value
  try {
    const result = await getAuditExport(id)
    if (
      generation !== detailGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    selected.value = result
    planPoll()
  } catch (failure) {
    if (
      generation !== detailGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    rights.value = isRights(failure)
    if (rights.value) clearPrivate()
    else selected.value = null
    error.value = rights.value ? '' : errorText(failure)
    planPoll()
  }
}
const navigate = async (audit: AuditQueryV1, list: typeof listApplied) => {
  const before = route.fullPath
  await router.replace({ query: routeQuery(audit, list) })
  if (before === route.fullPath) {
    Object.assign(applied, audit)
    Object.assign(draft, audit)
    Object.assign(listApplied, list)
    Object.assign(listDraft, list)
    // The same URL does not remount the route, so use the complete refresh path
    // to retain and revalidate an explicit detail as well as the list.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await refresh()
  }
}
const acceptRoute = () => {
  try {
    const value = parseRoute()
    routeInvalid.value = false
    Object.assign(applied, value.audit)
    Object.assign(draft, value.audit)
    Object.assign(listApplied, value.list)
    Object.assign(listDraft, value.list)
    explicitJobId.value = value.jobId
    format.value = value.format
    const reads: Promise<unknown>[] = []
    if (canPermission(P.list)) reads.push(loadList())
    else {
      jobs.value = []
      total.value = 0
      loading.value = false
    }
    rights.value = !hasMetadataPermission.value
    if (value.jobId && hasMetadataPermission.value)
      reads.push(inspect(value.jobId))
    return Promise.all(reads)
  } catch (failure) {
    routeInvalid.value = true
    listGeneration += 1
    capabilityGeneration += 1
    loading.value = false
    clearPrivate()
    preserveRouteInputs()
    error.value = errorText(failure)
    return Promise.resolve()
  }
}
const saveQuery = async () => {
  try {
    const audit = parseAuditQuery({ ...draft, current: 1, pageSize: 100 })
    await navigate(audit, { ...listApplied, current: 1 })
  } catch (failure) {
    error.value = errorText(failure)
  }
}
const searchJobs = () => navigate(applied, { ...listDraft, current: 1 })
const goPage = (current: number) =>
  navigate(applied, { ...listApplied, current })
const refresh = () => {
  if (routeInvalid.value) return acceptRoute()
  const reads: Promise<unknown>[] = []
  if (canPermission(P.list)) reads.push(loadList())
  if (explicitJobId.value && hasMetadataPermission.value)
    reads.push(inspect(explicitJobId.value))
  if (reads.length) return Promise.all(reads)
  return loadCapabilities()
}
const create = async () => {
  if (
    busy.value ||
    routeInvalid.value ||
    !canPermission(P.create) ||
    !selectedCapability.value?.available
  )
    return
  let input
  try {
    input = parseAuditExportCreate({
      version: 1,
      query: { ...draft, current: 1, pageSize: 100 },
      format: format.value,
    })
  } catch (failure) {
    error.value = errorText(failure)
    return
  }
  const generation = ++commandGeneration
  const scope = tenantScope.snapshot()
  const token = getToken()
  const authUser = getUserId()
  const store = identityKey.value
  busy.value = true
  error.value = ''
  notice.value = ''
  const signature = JSON.stringify(input)
  if (signature !== pendingCreateSignature) pendingCreateKey = ''
  pendingCreateSignature = signature
  const key = pendingCreateKey || commandKey()
  pendingCreateKey = key
  try {
    const job = await createAuditExport(input, key)
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    pendingCreateKey = ''
    pendingCreateSignature = ''
    selected.value = job
    explicitJobId.value = job.id
    notice.value = `已创建 ${job.format.toUpperCase()} 全量匹配导出任务`
    const before = route.fullPath
    await router.replace({ query: routeQuery(applied, listApplied) })
    if (before === route.fullPath) {
      if (canPermission(P.list)) await loadList()
      else planPoll()
    }
  } catch (failure) {
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    if (isRights(failure)) {
      rights.value = true
      clearPrivate()
    } else error.value = errorText(failure)
  } finally {
    if (generation === commandGeneration) busy.value = false
  }
}
const command = async (
  job: AuditExportJobV1 | null,
  action: 'cancel' | 'retry' | 'archive' | 'unarchive'
) => {
  if (!job || busy.value || !can(job, action)) return
  const generation = ++commandGeneration
  const scope = tenantScope.snapshot()
  const token = getToken()
  const authUser = getUserId()
  const store = identityKey.value
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const fresh = await getAuditExport(job.id)
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    if (!can(fresh, action)) throw new Error('当前权限或任务状态已变化')
    const result =
      action === 'archive' || action === 'unarchive'
        ? await archiveAuditExport(fresh, action === 'archive', commandKey())
        : await commandAuditExport(fresh, action, commandKey())
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    selected.value = result
    notice.value = '服务器任务状态已更新'
    await refresh()
  } catch (failure) {
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    if (isRights(failure)) {
      rights.value = true
      clearPrivate()
    } else error.value = errorText(failure)
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
const download = async (job: AuditExportJobV1 | null) => {
  if (!job || busy.value || !can(job, 'download')) return
  const generation = ++commandGeneration
  const scope = tenantScope.snapshot()
  const token = getToken()
  const authUser = getUserId()
  const store = identityKey.value
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const fresh = await getAuditExport(job.id)
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    const { artifact } = fresh
    if (
      fresh.restricted ||
      !fresh.allowedActions.includes('download') ||
      !artifact ||
      artifact.status !== 'ready' ||
      artifact.size === null ||
      !artifact.sha256
    )
      throw new Error('当前权限或制品状态已变化')
    const content = await downloadAuditExport(job.id)
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    const bytes = await content.blob.arrayBuffer()
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
    )
      return
    const actualHash = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    if (
      content.blob.size !== artifact.size ||
      actualHash !== artifact.sha256 ||
      normalizedMime(content.mimeType) !== normalizedMime(artifact.mimeType) ||
      !/^attachment\b/i.test(content.contentDisposition)
    )
      throw new Error('下载字节与服务器制品记录不符')
    if (
      generation !== commandGeneration ||
      !sameIdentity(scope, token, authUser, store)
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
      !sameIdentity(scope, token, authUser, store)
    )
      return
    if (isRights(failure)) {
      rights.value = true
      clearPrivate()
    } else error.value = errorText(failure)
  } finally {
    if (generation === commandGeneration) busy.value = false
  }
}
const querySummary = (query: AuditQueryV1) =>
  [
    query.module || '全部模块',
    query.eventType || '全部类型',
    query.result || '全部结果',
    query.from || '不限开始',
    query.to || '不限结束',
    query.timeZone,
  ].join(' · ')
const visibility = () =>
  document.visibilityState === 'hidden' ? stopPoll() : planPoll()

onMounted(() => {
  Promise.all([loadCapabilities(), acceptRoute()])
  document.addEventListener('visibilitychange', visibility)
})
watch(identityKey, (next, previous) => {
  if (!mounted || next === previous) return
  listGeneration += 1
  detailGeneration += 1
  capabilityGeneration += 1
  commandGeneration += 1
  stopPoll()
  clearPrivate()
  error.value = ''
  notice.value = ''
  pendingCreateKey = ''
  pendingCreateSignature = ''
  busy.value = false
  loading.value = false
  rights.value = !hasMetadataPermission.value
  if (!rights.value) Promise.all([loadCapabilities(), acceptRoute()])
})
onBeforeUnmount(() => {
  mounted = false
  listGeneration += 1
  detailGeneration += 1
  capabilityGeneration += 1
  commandGeneration += 1
  stopPoll()
  document.removeEventListener('visibilitychange', visibility)
})
</script>

<style scoped>
.audit-exports {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}
h1,
h2,
p {
  margin-top: 0;
}
.audit-exports__header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}
button,
input,
select {
  font: inherit;
}
button {
  min-height: 34px;
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
.audit-exports__query {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 12px;
  padding: 16px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
}
.audit-exports__query h2,
.audit-exports__query p,
.audit-exports__query-actions {
  grid-column: 1/-1;
}
label {
  display: grid;
  gap: 5px;
  color: #4e5969;
  font-size: 13px;
}
input,
select {
  height: 34px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid #c9cdd4;
  border-radius: 4px;
  background: #fff;
}
.audit-exports__query-actions,
.audit-exports__list-filter,
.audit-exports__actions,
.audit-exports__pagination {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
}
.audit-exports__list-filter {
  margin-top: 14px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e5e6eb;
}
.audit-exports__state {
  min-height: 150px;
  display: grid;
  place-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 20px;
  background: #fff;
  border: 1px solid #e5e6eb;
}
.is-error,
.is-rights {
  color: #b42318 !important;
}
.is-private {
  color: #b54708;
}
.audit-exports__jobs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.audit-exports__job,
.audit-exports__detail {
  padding: 14px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
}
.audit-exports__inspect {
  width: 100%;
  text-align: left;
  font-weight: 600;
}
.audit-exports__pagination {
  justify-content: flex-end;
  margin-top: 14px;
}
.audit-exports__detail {
  margin-top: 14px;
}
.audit-exports__notice {
  position: fixed;
  right: 20px;
  bottom: 20px;
  padding: 10px 14px;
  color: #fff;
  background: #344054;
  border-radius: 4px;
}
@media (max-width: 1050px) {
  .audit-exports__query {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }
}
@media (max-width: 640px) {
  .audit-exports {
    padding: 14px;
  }
  .audit-exports__header {
    flex-direction: column;
  }
  .audit-exports__query {
    grid-template-columns: 1fr;
  }
}
</style>
