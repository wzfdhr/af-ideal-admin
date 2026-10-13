<template>
  <main class="audit-v1" data-testid="audit-v1-page">
    <header class="audit-v1__header">
      <div>
        <p>审计中心 / 服务端事实检索</p>
        <h1>审计日志</h1>
        <small>
          来源：server · 投影版本：1 · 查询时区：{{ applied.timeZone }}
        </small>
      </div>
      <div class="audit-v1__summary">
        <b>{{ total }}</b>
        <span>条当前授权事实</span>
        <button type="button" data-testid="audit-refresh" @click="refresh">
          刷新
        </button>
      </div>
    </header>

    <form
      class="audit-v1__filters"
      aria-label="真实审计筛选"
      @submit.prevent="submit"
    >
      <label>
        操作人字面值
        <input
          v-model="draft.operatorName"
          data-testid="audit-operator"
          maxlength="100"
          autocomplete="off"
        />
      </label>
      <label>
        模块
        <input
          v-model="draft.module"
          data-testid="audit-module"
          maxlength="64"
          list="audit-modules"
          autocomplete="off"
        />
        <datalist id="audit-modules">
          <option
            v-for="item in catalogue?.modules || []"
            :key="item.code"
            :value="item.code"
          >
            {{ item.label }}
          </option>
        </datalist>
      </label>
      <label>
        事件类型
        <select v-model="draft.eventType" data-testid="audit-event-type">
          <option value="">全部类型</option>
          <option v-for="item in eventTypeOptions" :key="item" :value="item">
            {{ typeLabel(item) }}
          </option>
        </select>
      </label>
      <label>
        结果
        <select v-model="draft.result" data-testid="audit-result">
          <option value="">全部结果</option>
          <option v-for="item in resultOptions" :key="item" :value="item">
            {{ resultLabel(item) }}
          </option>
        </select>
      </label>
      <label>
        归档状态
        <select
          v-model="draftArchiveState"
          data-testid="audit-archive-state"
          @change="draftArchiveExplicit = true"
        >
          <option value="all">全部</option>
          <option value="hot">未归档</option>
          <option value="archived">已归档</option>
        </select>
      </label>
      <label>
        对象 ID（精确）
        <input
          v-model="draft.targetId"
          data-testid="audit-target"
          maxlength="100"
          autocomplete="off"
        />
      </label>
      <label>
        Trace ID（精确）
        <input
          v-model="draft.traceId"
          data-testid="audit-trace"
          maxlength="100"
          autocomplete="off"
        />
      </label>
      <label>
        开始自然日
        <input v-model="draft.from" data-testid="audit-date-from" type="date" />
      </label>
      <label>
        结束自然日
        <input v-model="draft.to" data-testid="audit-date-to" type="date" />
      </label>
      <label>
        时区
        <input
          v-model="draft.timeZone"
          data-testid="audit-time-zone"
          maxlength="100"
          autocomplete="off"
        />
      </label>
      <div class="audit-v1__filter-actions">
        <button type="submit" data-testid="audit-query" :disabled="loading">
          查询
        </button>
        <button
          type="button"
          :disabled="loading"
          data-testid="audit-reset"
          @click="reset"
        >
          重置
        </button>
      </div>
    </form>

    <details v-if="catalogue?.actions.length" class="audit-v1__catalogue">
      <summary>当前范围登记动作（{{ visibleActions.length }}）</summary>
      <span
        v-for="item in visibleActions"
        :key="`${item.module}:${item.action}`"
      >
        {{ moduleLabel(item.module) }} / {{ item.action }} /
        {{ typeLabel(item.eventType) }}
      </span>
    </details>

    <section
      v-if="rights"
      class="audit-v1__state audit-v1__state--rights"
      data-testid="audit-rights"
      role="alert"
    >
      当前身份无权读取审计事实，已清除先前结果。
    </section>
    <section
      v-else-if="error"
      class="audit-v1__state audit-v1__state--error"
      data-testid="audit-error"
      role="alert"
    >
      <strong>{{ error }}</strong>
      <span v-if="failedFields.length">
        失败字段：{{ failedFields.join('、') }}
      </span>
      <button type="button" data-testid="audit-retry" @click="refresh">
        使用当前条件重试
      </button>
    </section>
    <section
      v-else-if="loading"
      class="audit-v1__state"
      data-testid="audit-loading"
      aria-live="polite"
    >
      正在按当前身份查询服务端事实…
    </section>
    <section
      v-else-if="!records.length"
      class="audit-v1__state"
      data-testid="audit-empty"
    >
      当前授权范围与筛选条件下没有审计事实。
    </section>

    <section
      v-else
      class="audit-v1__table-wrap"
      aria-label="服务端事实审计结果"
    >
      <table class="audit-v1__table">
        <thead>
          <tr>
            <th>事实时间</th>
            <th>操作人</th>
            <th>模块 / 动作</th>
            <th>类型 / 结果</th>
            <th>对象</th>
            <th>Trace</th>
            <th>服务端选定详情</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="record in records"
            :key="record.id"
            :data-testid="`audit-row-${record.id}`"
          >
            <td>
              <time :datetime="record.occurredAt">
                {{ formatTime(record.occurredAt) }}
              </time>
            </td>
            <td>
              <strong>{{ operatorName(record) }}</strong>
              <span>{{ operatorMeta(record) }}</span>
            </td>
            <td>
              <strong>{{ moduleLabel(record.module) }}</strong>
              <span>{{ actionLabel(record.module, record.action) }}</span>
            </td>
            <td>
              <span class="audit-v1__badge">
                {{ typeLabel(record.eventType) }}
              </span>
              <span class="audit-v1__result" :class="`is-${record.result}`">
                {{ resultLabel(record.result) }}
              </span>
            </td>
            <td>
              <strong>{{ record.target.id || '无对象标识' }}</strong>
              <span>{{ record.target.type }}</span>
            </td>
            <td>
              <code>{{ record.traceId }}</code>
              <button
                type="button"
                class="audit-v1__copy"
                :data-testid="`audit-copy-${record.id}`"
                @click="copyTrace(record.traceId)"
              >
                复制 Trace
              </button>
            </td>
            <td>
              <dl v-if="detailEntries(record).length" class="audit-v1__detail">
                <div v-for="entry in detailEntries(record)" :key="entry[0]">
                  <dt>{{ entry[0] }}</dt>
                  <dd>{{ displayScalar(entry[1]) }}</dd>
                </div>
              </dl>
              <span v-else>无获准详情字段</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="audit-v1__pagination" aria-label="真实审计分页">
      <label>
        每页
        <select
          v-model.number="draft.pageSize"
          data-testid="audit-page-size"
          @change="changePageSize"
        >
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <button
        type="button"
        data-testid="audit-previous"
        :disabled="loading || applied.current <= 1"
        @click="goPage(applied.current - 1)"
      >
        上一页
      </button>
      <span>第 {{ applied.current }} / {{ pageCount }} 页</span>
      <button
        type="button"
        data-testid="audit-next"
        :disabled="loading || applied.current >= pageCount"
        @click="goPage(applied.current + 1)"
      >
        下一页
      </button>
    </footer>
    <p v-if="copyMessage" class="audit-v1__copy-message" role="status">
      {{ copyMessage }}
    </p>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiRequestError } from '@/api/request-client'
import { fetchAuditCatalogue, fetchAuditEventPage } from '@/api/audit'
import { getToken, getUserId } from '@/services/auth'
import { tenantScope } from '@/services/tenant-context'
import useUserStore from '@/store/modules/user'
import {
  AUDIT_DEFAULT_TIME_ZONE,
  AUDIT_EVENT_TYPES,
  AUDIT_RESULTS,
  parseAuditQuery,
  parseAuditQueryV2,
} from '@af-admin/contracts'
import type {
  AuditArchiveState,
  AuditCatalogueV1,
  AuditEventRecordV1,
  AuditEventType,
  AuditQueryV1,
  AuditQueryV2,
  AuditResult,
} from '@af-admin/contracts'

type AuditLogQuery = AuditQueryV1 | AuditQueryV2

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const records = ref<readonly AuditEventRecordV1[]>([])
const catalogue = ref<AuditCatalogueV1 | null>(null)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const rights = ref(false)
const routeInvalid = ref(false)
const failedFields = ref<string[]>([])
const copyMessage = ref('')
let queryGeneration = 0
let catalogueGeneration = 0
let mounted = true

const defaultQuery = (): AuditQueryV1 =>
  parseAuditQuery({
    version: 1,
    current: 1,
    pageSize: 20,
    timeZone: AUDIT_DEFAULT_TIME_ZONE,
  })
const applied = reactive<AuditQueryV1>(defaultQuery())
const draft = reactive<AuditQueryV1>(defaultQuery())
const appliedArchiveState = ref<AuditArchiveState | null>(null)
const draftArchiveState = ref<AuditArchiveState>('all')
const draftArchiveExplicit = ref(false)
const allowedRouteKeys = new Set([
  'version',
  'current',
  'pageSize',
  'module',
  'eventType',
  'result',
  'operatorName',
  'targetId',
  'traceId',
  'from',
  'to',
  'timeZone',
  'archiveState',
])
const routeValue = (key: string, value: unknown) => {
  if (Array.isArray(value)) throw new Error(`URL参数 ${key} 不能重复`)
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') throw new Error(`URL参数 ${key} 必须为文本`)
  return value
}
const rawRouteQuery = () => {
  const unknown = Object.keys(route.query).find(
    (key) => !allowedRouteKeys.has(key)
  )
  if (unknown) throw new Error(`URL包含未知审计参数 ${unknown}`)
  return Object.fromEntries(
    Array.from(allowedRouteKeys).map((key) => [
      key,
      routeValue(key, route.query[key]),
    ])
  )
}
const queryFromRoute = (): AuditLogQuery => {
  const raw = rawRouteQuery()
  const explicitArchiveState = Object.prototype.hasOwnProperty.call(
    route.query,
    'archiveState'
  )
  if (explicitArchiveState)
    return parseAuditQueryV2({
      ...raw,
      version: raw.version || 2,
      current: raw.current || 1,
      pageSize: raw.pageSize || 20,
      timeZone: raw.timeZone || AUDIT_DEFAULT_TIME_ZONE,
    })
  const legacy = Object.fromEntries(
    Object.entries(raw).filter(([key]) => key !== 'archiveState')
  )
  return parseAuditQuery({
    ...legacy,
    version: legacy.version || 1,
    current: legacy.current || 1,
    pageSize: legacy.pageSize || 20,
    timeZone: legacy.timeZone || AUDIT_DEFAULT_TIME_ZONE,
  })
}
const preserveRouteInputs = () => {
  const fallback = defaultQuery()
  Object.assign(draft, fallback)
  draftArchiveState.value = 'all'
  draftArchiveExplicit.value = false
  allowedRouteKeys.forEach((key) => {
    const value = route.query[key]
    let preserved = ''
    if (Array.isArray(value))
      preserved = value
        .filter((item): item is string => typeof item === 'string')
        .join(' | ')
    else if (typeof value === 'string') preserved = value
    if (
      [
        'module',
        'eventType',
        'result',
        'operatorName',
        'targetId',
        'traceId',
        'from',
        'to',
        'timeZone',
      ].includes(key)
    )
      Object.assign(draft, { [key]: preserved })
  })
  const preservedArchiveState = route.query.archiveState
  if (
    typeof preservedArchiveState === 'string' &&
    ['all', 'hot', 'archived'].includes(preservedArchiveState)
  ) {
    draftArchiveState.value = preservedArchiveState as AuditArchiveState
    draftArchiveExplicit.value = true
  }
}
const routeQuery = (query: AuditLogQuery) =>
  Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => [key, String(value)])
  )
const legacyQuery = (query: AuditLogQuery): AuditQueryV1 =>
  parseAuditQuery({
    ...Object.fromEntries(
      Object.entries(query).filter(([key]) => key !== 'archiveState')
    ),
    version: 1,
  })
const syncApplied = (query: AuditLogQuery) => {
  Object.assign(applied, legacyQuery(query))
  appliedArchiveState.value =
    query.version === 2 ? query.archiveState || 'all' : null
}
const syncDraft = (query: AuditLogQuery) => {
  Object.assign(draft, legacyQuery(query))
  draftArchiveExplicit.value = query.version === 2
  draftArchiveState.value =
    query.version === 2 ? query.archiveState || 'all' : 'all'
}
const draftQuery = (overrides: Partial<AuditQueryV1> = {}): AuditLogQuery => {
  if (draftArchiveExplicit.value)
    return parseAuditQueryV2({
      ...draft,
      ...overrides,
      version: 2,
      archiveState: draftArchiveState.value,
    })
  return parseAuditQuery({ ...draft, ...overrides, version: 1 })
}
const currentAppliedQuery = (): AuditLogQuery => {
  if (appliedArchiveState.value)
    return parseAuditQueryV2({
      ...applied,
      version: 2,
      archiveState: appliedArchiveState.value,
    })
  return parseAuditQuery({ ...applied, version: 1 })
}
const withCurrent = (query: AuditLogQuery, current: number): AuditLogQuery =>
  query.version === 2
    ? parseAuditQueryV2({ ...query, current })
    : parseAuditQuery({ ...query, current })
const identityKey = computed(() =>
  JSON.stringify({
    id: user.id || null,
    tenantId: user.tenantId || null,
    permissions: [...user.permissions].sort(),
  })
)
const sameIdentity = (
  scope: ReturnType<typeof tenantScope.snapshot>,
  token: string | null,
  authUserId: string | null,
  storeIdentity: string
) =>
  mounted &&
  tenantScope.isCurrent(scope) &&
  getToken() === token &&
  getUserId() === authUserId &&
  identityKey.value === storeIdentity

const eventTypeOptions = computed(
  () => catalogue.value?.eventTypes || AUDIT_EVENT_TYPES
)
const resultOptions = computed(() => catalogue.value?.results || AUDIT_RESULTS)
const visibleActions = computed(() =>
  (catalogue.value?.actions || []).filter(
    (action) => !draft.module || action.module === draft.module
  )
)
const pageCount = computed(() =>
  Math.max(1, Math.ceil(total.value / applied.pageSize))
)
const moduleLabel = (code: string) =>
  catalogue.value?.modules.find((item) => item.code === code)?.label || code
const actionLabel = (module: string, action: string) =>
  catalogue.value?.actions.find(
    (item) => item.module === module && item.action === action
  )?.action || action
const typeLabel = (value: AuditEventType) =>
  ((
    {
      operation: '操作',
      security: '安全',
      permission: '权限',
      export: '导出',
    } as const
  )[value])
const resultLabel = (value: AuditResult) =>
  value === 'success' ? '成功' : '失败'

const loadCatalogue = async () => {
  const generation = ++catalogueGeneration
  const scope = tenantScope.snapshot()
  const token = getToken()
  const authUserId = getUserId()
  const storeIdentity = identityKey.value
  try {
    const result = await fetchAuditCatalogue()
    if (
      generation !== catalogueGeneration ||
      !sameIdentity(scope, token, authUserId, storeIdentity)
    )
      return
    catalogue.value = result
  } catch (failure) {
    if (
      generation !== catalogueGeneration ||
      !sameIdentity(scope, token, authUserId, storeIdentity)
    )
      return
    catalogue.value = null
    if (
      failure instanceof ApiRequestError &&
      ['forbidden', 'unauthorized'].includes(failure.context.kind)
    ) {
      rights.value = true
      records.value = []
      total.value = 0
    }
  }
}
const load = async (query: AuditLogQuery) => {
  const generation = ++queryGeneration
  const scope = tenantScope.snapshot()
  const token = getToken()
  const authUserId = getUserId()
  const storeIdentity = identityKey.value
  syncApplied(query)
  loading.value = true
  error.value = ''
  rights.value = false
  failedFields.value = []
  records.value = []
  total.value = 0
  try {
    const result = await fetchAuditEventPage(query)
    if (
      generation !== queryGeneration ||
      !sameIdentity(scope, token, authUserId, storeIdentity)
    )
      return
    if (
      result.source !== 'server' ||
      result.projectionVersion !== 1 ||
      result.version !== query.version
    )
      throw new Error('审计服务返回了不受支持的事实投影')
    const maxPage = Math.max(1, Math.ceil(result.total / result.pageSize))
    if (query.current > maxPage) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      await navigate(withCurrent(query, maxPage))
      return
    }
    records.value = result.list
    total.value = result.total
    syncApplied({
      ...result.query,
      current: result.current,
      pageSize: result.pageSize,
    })
  } catch (failure) {
    if (
      generation !== queryGeneration ||
      !sameIdentity(scope, token, authUserId, storeIdentity)
    )
      return
    records.value = []
    total.value = 0
    if (failure instanceof ApiRequestError) {
      rights.value = ['forbidden', 'unauthorized'].includes(
        failure.context.kind
      )
      error.value = rights.value ? '' : failure.context.displayMessage
      failedFields.value = Object.keys(failure.context.errors || {})
    } else
      error.value = failure instanceof Error ? failure.message : '审计查询失败'
  } finally {
    if (generation === queryGeneration) loading.value = false
  }
}
const navigate = async (query: AuditLogQuery) => {
  const before = route.fullPath
  await router.replace({ query: routeQuery(query) })
  if (before === route.fullPath) await load(query)
}
const acceptRoute = () => {
  try {
    const query = queryFromRoute()
    routeInvalid.value = false
    syncDraft(query)
    if (query.version === 2 && route.query.version !== '2')
      return navigate(query)
    return load(query)
  } catch (failure) {
    routeInvalid.value = true
    queryGeneration += 1
    loading.value = false
    records.value = []
    total.value = 0
    rights.value = false
    failedFields.value = []
    preserveRouteInputs()
    error.value = failure instanceof Error ? failure.message : 'URL审计筛选无效'
    return Promise.resolve()
  }
}
const submit = async () => {
  try {
    const query = draftQuery({ current: 1 })
    error.value = ''
    failedFields.value = []
    await navigate(query)
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '筛选条件无效'
  }
}
const reset = () => navigate(defaultQuery())
const refresh = () =>
  routeInvalid.value ? acceptRoute() : load(currentAppliedQuery())
const goPage = (current: number) =>
  navigate(withCurrent(currentAppliedQuery(), current))
const changePageSize = () =>
  navigate(draftQuery({ current: 1, pageSize: draft.pageSize }))

const operatorName = (record: AuditEventRecordV1) => {
  if (record.operator.name) return record.operator.name
  if (record.hiddenFields.includes('operator.name')) return '操作人字段已隐藏'
  return '系统事件'
}
const operatorMeta = (record: AuditEventRecordV1) => {
  const values = [record.operator.id, record.operator.role].filter(Boolean)
  return values.length ? values.join(' · ') : '无获准操作人元数据'
}
const detailEntries = (record: AuditEventRecordV1) =>
  Object.entries(record.detail)
const displayScalar = (value: string | number | boolean | null) => {
  if (value === null) return '空值'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}
const formatTime = (value: string) => {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: applied.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')} ${part(
    'hour'
  )}:${part('minute')}:${part('second')} (${applied.timeZone})`
}
const copyTrace = async (traceId: string) => {
  try {
    await navigator.clipboard.writeText(traceId)
    copyMessage.value = 'Trace ID 已复制'
  } catch {
    copyMessage.value = '复制失败，请手动选择 Trace ID'
  }
}

onMounted(() => {
  Promise.all([loadCatalogue(), acceptRoute()])
})
watch(identityKey, (next, previous) => {
  if (!mounted || next === previous) return
  queryGeneration += 1
  catalogueGeneration += 1
  loading.value = false
  records.value = []
  total.value = 0
  catalogue.value = null
  error.value = ''
  failedFields.value = []
  rights.value =
    !user.permissions.includes('audit:read') && !user.permissions.includes('*')
  if (!rights.value) Promise.all([loadCatalogue(), acceptRoute()])
})
onBeforeUnmount(() => {
  mounted = false
  queryGeneration += 1
  catalogueGeneration += 1
})
</script>

<style scoped>
.audit-v1 {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}
.audit-v1__header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}
h1,
p {
  margin: 0;
}
h1 {
  margin: 4px 0;
}
.audit-v1__header small {
  color: #667085;
}
.audit-v1__summary {
  display: flex;
  align-items: center;
  gap: 8px;
}
.audit-v1__summary b {
  font-size: 28px;
  color: #165dff;
}
.audit-v1__summary span {
  color: #667085;
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
.audit-v1__filters {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 12px;
  padding: 16px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
}
.audit-v1__filters label,
.audit-v1__pagination label {
  display: grid;
  gap: 6px;
  color: #4e5969;
  font-size: 13px;
}
.audit-v1__filters input,
.audit-v1__filters select,
.audit-v1__pagination select {
  height: 34px;
  box-sizing: border-box;
  padding: 0 9px;
  border: 1px solid #c9cdd4;
  border-radius: 4px;
  background: #fff;
}
.audit-v1__filter-actions {
  display: flex;
  align-items: end;
  gap: 8px;
}
.audit-v1__filter-actions button:first-child {
  color: #fff;
  border-color: #165dff;
  background: #165dff;
}
.audit-v1__catalogue {
  margin: 12px 0;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #e5e6eb;
}
.audit-v1__catalogue span {
  display: inline-block;
  margin: 8px 12px 0 0;
  color: #667085;
}
.audit-v1__state {
  min-height: 180px;
  display: grid;
  place-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 20px;
  text-align: center;
  background: #fff;
  border: 1px solid #e5e6eb;
}
.audit-v1__state--error,
.audit-v1__state--rights {
  color: #b42318;
  background: #fff5f4;
  border-color: #fecdca;
}
.audit-v1__table-wrap {
  overflow: auto;
  margin-top: 16px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
}
.audit-v1__table {
  width: 100%;
  min-width: 1280px;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  padding: 11px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid #eef0f3;
}
th {
  color: #4e5969;
  background: #f7f8fa;
}
td strong,
td span {
  display: block;
}
td span {
  margin-top: 3px;
  color: #667085;
}
code {
  word-break: break-all;
}
.audit-v1__badge,
.audit-v1__result {
  display: inline-block !important;
  width: max-content;
  padding: 2px 7px;
  border-radius: 4px;
  background: #f2f4f7;
}
.audit-v1__result.is-success {
  color: #067647;
  background: #ecfdf3;
}
.audit-v1__result.is-failure {
  color: #b42318;
  background: #fef3f2;
}
.audit-v1__copy {
  display: block;
  margin-top: 6px;
  min-height: 26px;
  padding: 0 7px;
  font-size: 12px;
}
.audit-v1__detail {
  margin: 0;
}
.audit-v1__detail div {
  display: grid;
  grid-template-columns: minmax(70px, auto) 1fr;
  gap: 6px;
}
.audit-v1__detail dt {
  color: #667085;
}
.audit-v1__detail dd {
  margin: 0;
  word-break: break-word;
}
.audit-v1__pagination {
  display: flex;
  justify-content: flex-end;
  align-items: end;
  gap: 10px;
  margin-top: 14px;
}
.audit-v1__copy-message {
  position: fixed;
  right: 20px;
  bottom: 20px;
  padding: 10px 14px;
  color: #fff;
  background: #344054;
  border-radius: 4px;
}
@media (max-width: 1100px) {
  .audit-v1__filters {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }
}
@media (max-width: 640px) {
  .audit-v1 {
    padding: 14px;
  }
  .audit-v1__header {
    flex-direction: column;
  }
  .audit-v1__filters {
    grid-template-columns: 1fr;
  }
  .audit-v1__pagination {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
