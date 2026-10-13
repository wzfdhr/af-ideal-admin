<template>
  <section
    ref="rootElement"
    class="reference-screen"
    :class="[`theme-${canvasDefinition.theme.preset}`, { fullscreen }]"
    :style="{ '--screen-brand': canvasDefinition.theme.brandColor }"
    data-testid="reference-data-screen"
  >
    <header class="topbar">
      <div>
        <h1>{{ canvasDefinition.title }}</h1>
        <p>
          1920 × 1080 · {{ canvasDefinition.widgets.length }} 个组件 ·
          {{ current ? `修订 ${current.revision}` : '未保存草稿' }}
        </p>
      </div>
      <div class="actions">
        <button type="button" data-testid="screen-refresh" @click="refreshNow">
          刷新数据
        </button>
        <button
          type="button"
          data-testid="screen-preview"
          @click="previewDraft"
        >
          预览草稿
        </button>
        <button
          type="button"
          data-testid="screen-run-release"
          :disabled="!current?.activeReleaseId || !can('run')"
          @click="runRelease"
        >
          运行发布版
        </button>
        <button
          type="button"
          :disabled="busy || !canSave"
          data-testid="screen-save"
          @click="save"
        >
          保存
        </button>
        <button
          type="button"
          :disabled="busy || !current || !can('publish')"
          data-testid="screen-publish"
          @click="publish"
        >
          发布
        </button>
        <button
          type="button"
          :disabled="busy || !current"
          data-testid="screen-copy"
          @click="copy"
        >
          复制
        </button>
        <button
          type="button"
          data-testid="screen-fullscreen"
          @click="toggleFullscreen"
        >
          {{ fullscreen ? '退出全屏' : '全屏' }}
        </button>
      </div>
    </header>

    <div v-if="notice" class="notice" :class="notice.kind" role="status">
      {{ notice.text }}
      <button type="button" aria-label="关闭提示" @click="notice = null">
        ×
      </button>
    </div>

    <div class="workspace">
      <aside class="left-panel">
        <section>
          <h2>真实大屏</h2>
          <input
            v-model="keyword"
            placeholder="搜索大屏"
            data-testid="screen-keyword"
            @keyup.enter="loadDefinitions()"
          />
          <button
            v-for="screen in definitions"
            :key="screen.id"
            type="button"
            class="screen-row"
            :class="{ active: screen.id === current?.id }"
            :data-testid="`screen-definition-${screen.id}`"
            @click="openDefinition(screen.id)"
          >
            <b>{{ screen.draft.title }}</b>
            <small>
              {{ screen.enabled ? '启用' : '停用' }} ·
              {{ screen.versions.length }} 个版本
            </small>
          </button>
        </section>
        <section>
          <h2>模板向导</h2>
          <label>
            模板
            <select v-model="templateKey" data-testid="screen-template">
              <option
                v-for="template in templates"
                :key="template.key"
                :value="template.key"
              >
                {{ template.name }}
              </option>
            </select>
          </label>
          <label>
            趋势报表
            <select v-model="binding.trend" data-testid="screen-binding-trend">
              <option value="">请选择已发布趋势报表</option>
              <option
                v-for="report in trendReports"
                :key="report.id"
                :value="report.id"
              >
                {{ report.schema.name }} v{{ report.version }}
              </option>
            </select>
          </label>
          <label>
            分布报表
            <select
              v-model="binding.distribution"
              data-testid="screen-binding-distribution"
            >
              <option value="">请选择已发布分布报表</option>
              <option
                v-for="report in distributionReports"
                :key="report.id"
                :value="report.id"
              >
                {{ report.schema.name }} v{{ report.version }}
              </option>
            </select>
          </label>
          <label>
            明细报表
            <select
              v-model="binding.detail"
              data-testid="screen-binding-detail"
              @change="loadDetailCatalogue"
            >
              <option value="">请选择已发布明细报表</option>
              <option
                v-for="report in detailReports"
                :key="report.id"
                :value="report.id"
              >
                {{ report.schema.name }} v{{ report.version }}
              </option>
            </select>
          </label>
          <button
            type="button"
            data-testid="screen-apply-template"
            @click="applyTemplate"
          >
            应用模板到新草稿
          </button>
        </section>
        <section>
          <h2>组件</h2>
          <div class="palette">
            <button
              v-for="kind in widgetKinds"
              :key="kind"
              type="button"
              @click="addWidget(kind)"
            >
              + {{ kindLabels[kind] }}
            </button>
          </div>
        </section>
      </aside>

      <main class="stage-column">
        <div class="stage-toolbar">
          <button
            v-for="item in alignments"
            :key="item.value"
            type="button"
            :disabled="selectedIds.length < 2"
            @click="align(item.value)"
          >
            {{ item.label }}
          </button>
          <span />
          <button
            v-for="item in layers"
            :key="item.value"
            type="button"
            :disabled="!selectedIds.length"
            @click="reorder(item.value)"
          >
            {{ item.label }}
          </button>
          <span class="mode">
            {{
              runtimeMode === 'draft'
                ? '草稿预览'
                : runtimeMode === 'release'
                ? '发布版运行'
                : '编辑'
            }}
          </span>
        </div>
        <div
          ref="viewportElement"
          class="viewport"
          @click.self="selectedIds = []"
        >
          <div class="fit-box" :style="fitBoxStyle">
            <div
              ref="canvasElement"
              class="canvas"
              tabindex="0"
              :style="canvasStyle"
              data-testid="screen-canvas"
              @keydown="onCanvasKeydown"
            >
              <div
                v-for="widget in canvasDefinition.widgets"
                :key="widget.id"
                class="widget-frame"
                :class="{ selected: selectedIds.includes(widget.id) }"
                :style="widgetStyle(widget)"
                :data-testid="`screen-widget-${widget.id}`"
                @pointerdown="startMove($event, widget.id)"
                @click.stop="selectWidget($event, widget.id)"
              >
                <ScreenWidget
                  :widget="widget"
                  :runtime="runtimeFor(widget.sourceKey)"
                  @pause-table="toggleTablePause"
                />
                <template v-if="selectedIds.includes(widget.id)">
                  <button
                    v-for="handle in resizeHandles"
                    :key="handle"
                    type="button"
                    class="resize-handle"
                    :class="`handle-${handle}`"
                    :aria-label="`从${handle}缩放`"
                    @pointerdown.stop="startResize($event, widget.id, handle)"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="canvasDefinition.alert.enabled"
          class="alert-strip"
          :class="{ paused: canvasDefinition.alert.scrollingPaused }"
        >
          <button type="button" @click="toggleAlertPause">
            {{ draft.alert.scrollingPaused ? '继续告警滚动' : '暂停告警滚动' }}
          </button>
          <div>
            <span>{{ alertText }}</span>
          </div>
        </div>
      </main>

      <aside class="right-panel">
        <section>
          <h2>画布属性</h2>
          <label>
            标题
            <input
              v-model="draft.title"
              maxlength="100"
              data-testid="screen-title"
            />
          </label>
          <label>
            主题
            <select v-model="draft.theme.preset">
              <option value="dark">深色</option>
              <option value="enterprise">企业</option>
              <option value="ocean">海洋</option>
            </select>
          </label>
          <label>
            品牌色
            <input v-model="draft.theme.brandColor" type="color" />
          </label>
          <label class="check">
            <input v-model="draft.alert.enabled" type="checkbox" />
            启用真实状态告警
          </label>
          <label>
            告警阈值
            <input
              v-model.number="draft.alert.countThreshold"
              type="number"
              min="1"
              max="1000000"
            />
          </label>
        </section>
        <section v-if="selectedWidget">
          <h2>组件属性</h2>
          <label>
            标题
            <input v-model="selectedWidget.title" maxlength="100" />
          </label>
          <label>
            来源
            <select v-model="selectedWidget.sourceKey">
              <option
                v-for="source in draft.sources"
                :key="source.sourceKey"
                :value="source.sourceKey"
              >
                {{ source.sourceKey }}
              </option>
            </select>
          </label>
          <div class="rect-grid">
            <label v-for="property in rectProperties" :key="property">
              {{ property }}
              <input
                :value="selectedWidget.layout[property]"
                type="number"
                :data-testid="`screen-prop-${property}`"
                @change="setRect(property, $event)"
              />
            </label>
          </div>
          <template v-if="selectedWidget.kind === 'table'">
            <label>
              最大行数
              <input
                v-model.number="selectedWidget.props.maxRows"
                type="number"
                min="1"
                max="100"
              />
            </label>
            <fieldset>
              <legend>显示字段</legend>
              <label
                v-for="field in fieldsForSource(selectedWidget.sourceKey)"
                :key="field.key"
                class="check"
              >
                <input
                  type="checkbox"
                  :checked="hasTableField(selectedWidget, field.reference)"
                  @change="toggleTableField(selectedWidget, field.reference)"
                />
                {{ field.label }}
              </label>
            </fieldset>
          </template>
          <template v-if="selectedWidget.kind === 'map'">
            <label>
              经度字段
              <select
                :value="refKey(selectedWidget.props.longitudeField)"
                @change="setMapField(selectedWidget, 'longitudeField', $event)"
              >
                <option
                  v-for="field in coordinateFields(
                    selectedWidget.sourceKey,
                    'longitude'
                  )"
                  :key="field.key"
                  :value="field.key"
                >
                  {{ field.label }}
                </option>
              </select>
            </label>
            <label>
              纬度字段
              <select
                :value="refKey(selectedWidget.props.latitudeField)"
                @change="setMapField(selectedWidget, 'latitudeField', $event)"
              >
                <option
                  v-for="field in coordinateFields(
                    selectedWidget.sourceKey,
                    'latitude'
                  )"
                  :key="field.key"
                  :value="field.key"
                >
                  {{ field.label }}
                </option>
              </select>
            </label>
          </template>
          <button type="button" class="danger" @click="removeSelected">
            删除所选组件
          </button>
        </section>
        <section v-if="current">
          <h2>版本与状态</h2>
          <label>
            历史发布版
            <select
              v-model="rollbackReleaseId"
              data-testid="screen-rollback-release"
            >
              <option value="">请选择</option>
              <option
                v-for="release in current.versions"
                :key="release.id"
                :value="release.id"
              >
                v{{ release.version }} · {{ formatTime(release.publishedAt) }}
              </option>
            </select>
          </label>
          <button
            type="button"
            :disabled="busy || !rollbackReleaseId || !can('rollback')"
            data-testid="screen-rollback"
            @click="rollback"
          >
            切换到历史版
          </button>
          <button
            type="button"
            :disabled="busy || !can('toggle')"
            data-testid="screen-toggle"
            @click="toggleEnabled"
          >
            {{ current.enabled ? '停用' : '启用' }}
          </button>
          <button
            type="button"
            class="danger"
            :disabled="busy || !can('archive')"
            data-testid="screen-archive"
            @click="archive"
          >
            归档
          </button>
        </section>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import {
  archiveDataScreenDefinition,
  copyDataScreenDefinition,
  createDataScreenDefinition,
  fetchDataScreenDefinitions,
  fetchDataScreenTemplates,
  getDataScreenDefinition,
  previewDataScreen,
  publishDataScreenDefinition,
  rollbackDataScreenDefinition,
  runDataScreen,
  toggleDataScreenDefinition,
  updateDataScreenDefinition,
} from '@/api/data-screens'
import {
  fetchPublishedReportingDefinitions,
  getReportingVersionCatalogue,
} from '@/api/reporting'
import { tenantScope } from '@/services/tenant-context'
import {
  CANVAS_RECT_PROPERTIES,
  CANVAS_RESIZE_HANDLES,
  alignCanvasRects,
  clientDeltaToCanvasDelta,
  fitCanvasScale,
  moveCanvasRect,
  reorderCanvasLayers,
  resizeCanvasRect,
  setCanvasRectProperty,
} from './canvas-geometry'
import ScreenWidget from './widget.vue'
import {
  buildDataScreenAlertFacts,
  createDataScreenScheduler,
  dataScreenAlertSourceName,
  emptySourceRuntime,
} from './runtime'
import type { SourceRuntimeState } from './runtime'
import type {
  DataScreenAllowedAction,
  DataScreenDefinitionV1,
  DataScreenDetails,
  DataScreenTemplateKey,
  DataScreenTemplateV1,
  DataScreenWidgetKind,
  DataScreenWidgetV1,
  ReportingDefinitionVersion,
  ReportingFieldReference,
  ReportingSourceCatalogue,
  ReportingVisibleField,
} from '@af-admin/contracts'
import type {
  CanvasAlignment,
  CanvasLayerAction,
  CanvasRectProperty,
  CanvasResizeHandle,
} from './canvas-geometry'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
const blank = (): DataScreenDefinitionV1 => ({
  version: 1,
  title: '未命名真实数据大屏',
  theme: { preset: 'dark', brandColor: '#3C86FF' },
  sources: [],
  widgets: [],
  alert: {
    enabled: false,
    statuses: ['running', 'rejected'],
    countThreshold: 1,
    scrollingPaused: false,
  },
})
const definitions = ref<DataScreenDetails[]>([])
const templates = ref<DataScreenTemplateV1[]>([])
const reports = ref<ReportingDefinitionVersion[]>([])
const catalogues = reactive<Record<string, ReportingSourceCatalogue>>({})
const runtime = reactive<Record<string, SourceRuntimeState>>({})
const current = ref<DataScreenDetails | null>(null)
const draft = ref<DataScreenDefinitionV1>(blank())
const keyword = ref('')
const busy = ref(false)
const notice = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const templateKey = ref<DataScreenTemplateKey>('operations')
const binding = reactive({ trend: '', distribution: '', detail: '' })
const rollbackReleaseId = ref('')
const selectedIds = ref<string[]>([])
const viewportElement = ref<HTMLElement | null>(null)
const canvasElement = ref<HTMLElement | null>(null)
const rootElement = ref<HTMLElement | null>(null)
const fitScale = ref(0.5)
const fullscreen = ref(false)
const runtimeMode = ref<'idle' | 'draft' | 'release'>('idle')
let resizeObserver: ResizeObserver | undefined
let definitionGeneration = 0

const widgetKinds: DataScreenWidgetKind[] = [
  'line',
  'bar',
  'pie',
  'ranking',
  'metric',
  'table',
  'map',
]
const kindLabels: Record<DataScreenWidgetKind, string> = {
  line: '折线图',
  bar: '柱状图',
  pie: '饼图',
  ranking: '排行',
  metric: '指标卡',
  table: '滚动表格',
  map: '地图点位',
}
const statusLabels: Record<string, string> = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
}
const alignments = [
  { value: 'left', label: '左对齐' },
  { value: 'right', label: '右对齐' },
  { value: 'top', label: '顶对齐' },
  { value: 'bottom', label: '底对齐' },
  { value: 'horizontal-center', label: '水平居中' },
  { value: 'vertical-center', label: '垂直居中' },
] as { value: CanvasAlignment; label: string }[]
const layers = [
  { value: 'forward', label: '上移一层' },
  { value: 'backward', label: '下移一层' },
  { value: 'front', label: '置顶' },
  { value: 'back', label: '置底' },
] as { value: CanvasLayerAction; label: string }[]
const resizeHandles = [...CANVAS_RESIZE_HANDLES]
const rectProperties = [...CANVAS_RECT_PROPERTIES]
const trendReports = computed(() =>
  reports.value.filter((report) => report.schema.kind === 'trend')
)
const distributionReports = computed(() =>
  reports.value.filter((report) => report.schema.kind === 'distribution')
)
const detailReports = computed(() =>
  reports.value.filter((report) => report.schema.kind === 'detail')
)
const selectedWidget = computed(
  () =>
    draft.value.widgets.find(
      (widget) => widget.id === selectedIds.value[selectedIds.value.length - 1]
    ) || null
)
const can = (action: DataScreenAllowedAction) =>
  current.value?.allowedActions.includes(action) || false
const canSave = computed(() => (!current.value ? true : can('update')))
const activeTemplate = computed(
  () =>
    templates.value.find((template) => template.key === templateKey.value) ||
    null
)
const activeReleaseDefinition = computed(() =>
  current.value?.versions.find(
    (release) => release.id === current.value?.activeReleaseId
  )
)
const canvasDefinition = computed(() =>
  runtimeMode.value === 'release' && activeReleaseDefinition.value
    ? activeReleaseDefinition.value.snapshot
    : draft.value
)
const canvasStyle = computed(() => ({ transform: `scale(${fitScale.value})` }))
const fitBoxStyle = computed(() => ({
  width: `${1920 * fitScale.value}px`,
  height: `${1080 * fitScale.value}px`,
}))
const runtimeFor = (sourceKey: string) =>
  runtime[sourceKey] || emptySourceRuntime()
const setRuntime = (sourceKey: string, state: SourceRuntimeState) => {
  runtime[sourceKey] = state
}
const scheduler = createDataScreenScheduler({
  readSources: () => canvasDefinition.value.sources,
  readState: runtimeFor,
  onState: setRuntime,
  execute: () => {
    if (runtimeMode.value === 'release' && current.value?.activeReleaseId)
      return runDataScreen(current.value.id, current.value.activeReleaseId)
    return previewDataScreen(draft.value)
  },
})

const commandKey = () =>
  window.crypto?.randomUUID?.() || `screen-${Date.now()}-${Math.random()}`
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败'
const perform = async (
  action: () => Promise<DataScreenDetails>,
  message: string
) => {
  busy.value = true
  try {
    const next = await action()
    current.value = next
    draft.value = clone(next.draft)
    notice.value = { kind: 'ok', text: message }
    await loadDefinitions(false)
    restartRuntime()
  } catch (error) {
    notice.value = { kind: 'error', text: errorText(error) }
  } finally {
    busy.value = false
  }
}
const loadDefinitions = async (selectFirst = true) => {
  const page = await fetchDataScreenDefinitions({
    current: 1,
    pageSize: 50,
    keyword: keyword.value,
  })
  definitions.value = page.list
  if (selectFirst && !current.value && page.list.length)
    await openDefinition(page.list[0].id)
}
function syncBindingWizardFromDraft() {
  const template = templates.value.find(
    (candidate) => candidate.theme.preset === draft.value.theme.preset
  )
  if (template) templateKey.value = template.key
  const matched = {
    trend: '',
    distribution: '',
    detail: '',
  }
  draft.value.sources.forEach((source) => {
    const kind = reportById(source.reportDefinitionVersionId)?.schema.kind
    if (kind) matched[kind] = source.reportDefinitionVersionId
  })
  binding.trend = matched.trend
  binding.distribution = matched.distribution
  binding.detail = matched.detail
}
const loadAll = async () => {
  busy.value = true
  try {
    const [templateList, reportPage] = await Promise.all([
      fetchDataScreenTemplates(),
      fetchPublishedReportingDefinitions({
        current: 1,
        pageSize: 100,
        keyword: '',
      }),
    ])
    templates.value = templateList
    reports.value = reportPage.list
    binding.trend = trendReports.value[0]?.id || ''
    binding.distribution = distributionReports.value[0]?.id || ''
    binding.detail = detailReports.value[0]?.id || ''
    await Promise.all([loadDefinitions(), loadDetailCatalogue()])
  } catch (error) {
    notice.value = { kind: 'error', text: errorText(error) }
  } finally {
    busy.value = false
  }
}
const openDefinition = async (id: string) => {
  const generation = ++definitionGeneration
  notice.value = null
  try {
    const opened = await getDataScreenDefinition(id)
    if (generation !== definitionGeneration) return
    current.value = opened
    draft.value = clone(opened.draft)
    syncBindingWizardFromDraft()
    selectedIds.value = []
    rollbackReleaseId.value = opened.activeReleaseId || ''
    restartRuntime()
    await loadDraftCatalogues(opened.draft)
  } catch (error) {
    if (generation === definitionGeneration)
      notice.value = { kind: 'error', text: errorText(error) }
  }
}
const loadDetailCatalogue = async () => {
  if (!binding.detail || catalogues[binding.detail]) return
  catalogues[binding.detail] = await getReportingVersionCatalogue(
    binding.detail
  )
}
const loadDraftCatalogues = async (
  definition: DataScreenDefinitionV1 = draft.value
) => {
  await Promise.all(
    definition.sources.map(async (source) => {
      if (!catalogues[source.reportDefinitionVersionId])
        catalogues[source.reportDefinitionVersionId] =
          await getReportingVersionCatalogue(source.reportDefinitionVersionId)
    })
  )
}
const refKey = (reference: ReportingFieldReference) =>
  `${reference.kind}:${reference.id}`
const reportById = (id: string) =>
  reports.value.find((report) => report.id === id)
const sourceFor = (sourceKey: string) =>
  draft.value.sources.find((source) => source.sourceKey === sourceKey)
const fieldsForSource = (sourceKey: string): ReportingVisibleField[] => {
  const source = sourceFor(sourceKey)
  return source
    ? catalogues[source.reportDefinitionVersionId]?.visibleFields || []
    : []
}
const coordinateFields = (sourceKey: string, axis: 'longitude' | 'latitude') =>
  fieldsForSource(sourceKey).filter(
    (field) => field.valueType === 'coordinate' && field.coordinateAxis === axis
  )
const createWidget = (
  kind: DataScreenWidgetKind,
  id: string,
  sourceKey: string,
  z: number
): DataScreenWidgetV1 => {
  const layout = {
    x: 32 + (z % 4) * 200,
    y: 32 + (z % 5) * 120,
    width: 480,
    height: 288,
    z,
  }
  if (kind === 'line')
    return {
      id,
      kind,
      title: '每日趋势',
      sourceKey,
      layout,
      props: { view: 'trend', showValues: true },
    }
  if (kind === 'bar')
    return {
      id,
      kind,
      title: '数量分布',
      sourceKey,
      layout,
      props: {
        view:
          reportById(sourceFor(sourceKey)?.reportDefinitionVersionId || '')
            ?.schema.kind === 'trend'
            ? 'trend'
            : 'distribution',
        showValues: true,
      },
    }
  if (kind === 'pie')
    return {
      id,
      kind,
      title: '状态分布',
      sourceKey,
      layout,
      props: { view: 'distribution', showLegend: true },
    }
  if (kind === 'ranking')
    return {
      id,
      kind,
      title: '状态排行',
      sourceKey,
      layout,
      props: { view: 'distribution', limit: 5 },
    }
  if (kind === 'metric')
    return {
      id,
      kind,
      title: '记录数量',
      sourceKey,
      layout,
      props: { view: 'count', showTrend: false },
    }
  const fields = fieldsForSource(sourceKey)
  if (kind === 'table')
    return {
      id,
      kind,
      title: '授权明细',
      sourceKey,
      layout,
      props: {
        view: 'detail',
        columns: fields.slice(0, 5).map((field) => field.reference),
        maxRows: 20,
        scrollingPaused: false,
      },
    }
  const longitude = coordinateFields(sourceKey, 'longitude')[0]
  const latitude = coordinateFields(sourceKey, 'latitude')[0]
  if (!longitude || !latitude)
    throw new Error('地图需要当前可见且轴向明确的经纬度字段')
  return {
    id,
    kind,
    title: '真实地图点位',
    sourceKey,
    layout,
    props: {
      view: 'coordinates',
      longitudeField: longitude.reference,
      latitudeField: latitude.reference,
      maxPoints: 100,
    },
  }
}
const applyTemplate = async () => {
  const template = activeTemplate.value
  if (!template || !binding.trend || !binding.distribution || !binding.detail) {
    notice.value = {
      kind: 'error',
      text: '请分别选择已发布的趋势、分布和明细报表',
    }
    return
  }
  await loadDetailCatalogue()
  const chosen: Record<string, string> = {
    trend: binding.trend,
    distribution: binding.distribution,
    detail: binding.detail,
  }
  const sources = Object.entries(chosen).map(
    ([sourceKey, reportDefinitionVersionId]) => ({
      sourceKey,
      reportDefinitionVersionId,
      dateWindow: 'current-month' as const,
      statuses: [],
      refreshSeconds: 30,
    })
  )
  const detailFields = catalogues[binding.detail]?.visibleFields || []
  const widgets = template.layout.map((item) => {
    const recipe = template.bindingRecipe.find(
      (candidate) => candidate.widgetKey === item.widgetKey
    )
    if (!recipe) throw new Error('模板绑定配方缺失')
    const widget = createWidget(
      item.kind,
      item.widgetKey,
      recipe.sourceSlot,
      item.layout.z
    )
    widget.title = item.title
    widget.layout = clone(item.layout)
    if (widget.kind === 'table')
      widget.props.columns = detailFields
        .slice(0, 5)
        .map((field) => field.reference)
    return widget
  })
  current.value = null
  draft.value = {
    version: 1,
    title: `${template.name}大屏`,
    theme: clone(template.theme),
    sources,
    widgets,
    alert: {
      enabled: true,
      statuses: ['running', 'rejected'],
      countThreshold: 1,
      scrollingPaused: false,
    },
  }
  selectedIds.value = []
  Object.keys(runtime).forEach((key) => delete runtime[key])
  runtimeMode.value = 'idle'
  scheduler.invalidate()
  notice.value = { kind: 'ok', text: '模板已生成；数值全部来自所选真实报表' }
}
const addWidget = (kind: DataScreenWidgetKind) => {
  if (draft.value.widgets.length >= 30) return
  const compatible = draft.value.sources.find((source) => {
    const reportKind = reportById(source.reportDefinitionVersionId)?.schema.kind
    return (
      kind === 'metric' ||
      (kind === 'line' && reportKind === 'trend') ||
      (['pie', 'ranking'].includes(kind) && reportKind === 'distribution') ||
      (['table', 'map'].includes(kind) && reportKind === 'detail') ||
      kind === 'bar'
    )
  })
  if (!compatible) {
    notice.value = { kind: 'error', text: '当前草稿没有适合该组件的真实来源' }
    return
  }
  if (
    kind === 'map' &&
    (!coordinateFields(compatible.sourceKey, 'longitude').length ||
      !coordinateFields(compatible.sourceKey, 'latitude').length)
  ) {
    notice.value = {
      kind: 'error',
      text: '地图需要明细报表中当前可见且轴向明确的经纬度字段',
    }
    return
  }
  const id = `widget_${Date.now().toString(36)}`
  draft.value.widgets.push(
    createWidget(kind, id, compatible.sourceKey, draft.value.widgets.length)
  )
  selectedIds.value = [id]
}
const save = () => {
  const record = current.value
  if (record)
    return perform(
      () => updateDataScreenDefinition(record, draft.value, commandKey()),
      '草稿已保存，可刷新重开'
    )
  return perform(
    () => createDataScreenDefinition(draft.value, commandKey()),
    '大屏草稿已创建'
  )
}
const copy = () => {
  const record = current.value
  if (!record) return undefined
  return perform(
    () => copyDataScreenDefinition(record.id, record.draft, commandKey()),
    '已创建独立副本'
  )
}
const publish = () => {
  const record = current.value
  if (!record) return undefined
  return perform(async () => {
    const persisted =
      JSON.stringify(draft.value) === JSON.stringify(record.draft)
        ? record
        : await updateDataScreenDefinition(record, draft.value, commandKey())
    return publishDataScreenDefinition(persisted, commandKey())
  }, '已发布不可变版本')
}
const rollback = () => {
  const record = current.value
  const releaseId = rollbackReleaseId.value
  if (!record || !releaseId) return undefined
  return perform(
    () => rollbackDataScreenDefinition(record, releaseId, commandKey()),
    '活动版本已切换'
  )
}
const toggleEnabled = () => {
  const record = current.value
  if (!record) return undefined
  return perform(
    () => toggleDataScreenDefinition(record, !record.enabled, commandKey()),
    record.enabled ? '大屏已停用' : '大屏已启用'
  )
}
const archive = () => {
  const record = current.value
  if (!record) return undefined
  // eslint-disable-next-line no-alert
  if (!window.confirm('归档后只允许读取历史，确认归档？')) return undefined
  return perform(
    () => archiveDataScreenDefinition(record, commandKey()),
    '大屏已归档'
  )
}

const restartRuntime = () => {
  Object.keys(runtime).forEach((key) => delete runtime[key])
  scheduler.invalidate()
}
const previewDraft = () => {
  runtimeMode.value = 'draft'
  restartRuntime()
  scheduler.start()
  scheduler.refresh()
}
const runRelease = () => {
  runtimeMode.value = 'release'
  restartRuntime()
  scheduler.start()
  scheduler.refresh()
}
const refreshNow = () => {
  if (runtimeMode.value === 'idle') runtimeMode.value = 'draft'
  scheduler.start()
  scheduler.refresh()
}

const widgetStyle = (widget: DataScreenWidgetV1) => ({
  left: `${widget.layout.x}px`,
  top: `${widget.layout.y}px`,
  width: `${widget.layout.width}px`,
  height: `${widget.layout.height}px`,
  zIndex: widget.layout.z + 1,
})
const selectWidget = (event: MouseEvent, id: string) => {
  if (event.ctrlKey || event.metaKey)
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((item) => item !== id)
      : [...selectedIds.value, id]
  else if (!selectedIds.value.includes(id)) selectedIds.value = [id]
}
const pointerOperation = (
  event: PointerEvent,
  apply: (delta: { x: number; y: number }) => void
) => {
  const start = { x: event.clientX, y: event.clientY }
  const move = (next: PointerEvent) =>
    apply(
      clientDeltaToCanvasDelta(
        { x: next.clientX - start.x, y: next.clientY - start.y },
        fitScale.value
      )
    )
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
const startMove = (event: PointerEvent, id: string) => {
  if ((event.target as HTMLElement).closest('button,select,input')) return
  if (!selectedIds.value.includes(id)) selectedIds.value = [id]
  const selected = draft.value.widgets
    .filter((widget) => selectedIds.value.includes(widget.id))
    .map((widget) => ({ id: widget.id, layout: clone(widget.layout) }))
  pointerOperation(event, (delta) =>
    selected.forEach((item) => {
      const widget = draft.value.widgets.find(
        (candidate) => candidate.id === item.id
      )
      if (widget)
        Object.assign(widget.layout, moveCanvasRect(item.layout, delta))
    })
  )
}
const startResize = (
  event: PointerEvent,
  id: string,
  handle: CanvasResizeHandle
) => {
  const widget = draft.value.widgets.find((candidate) => candidate.id === id)
  if (!widget) return
  const original = clone(widget.layout)
  pointerOperation(event, (delta) =>
    Object.assign(widget.layout, resizeCanvasRect(original, handle, delta))
  )
}
const setRect = (property: CanvasRectProperty, event: Event) => {
  if (!selectedWidget.value) return
  Object.assign(
    selectedWidget.value.layout,
    setCanvasRectProperty(
      selectedWidget.value.layout,
      property,
      Number((event.target as HTMLInputElement).value)
    )
  )
}
const align = (alignment: CanvasAlignment) => {
  const widgets = draft.value.widgets.filter((widget) =>
    selectedIds.value.includes(widget.id)
  )
  alignCanvasRects(
    widgets.map((widget) => widget.layout),
    alignment
  ).forEach((rect, index) => Object.assign(widgets[index].layout, rect))
}
const reorder = (action: CanvasLayerAction) => {
  const reordered = reorderCanvasLayers(
    draft.value.widgets.map((widget) => ({
      id: widget.id,
      z: widget.layout.z,
    })),
    selectedIds.value,
    action
  )
  reordered.forEach((layer) => {
    const widget = draft.value.widgets.find((item) => item.id === layer.id)
    if (widget) widget.layout.z = layer.z
  })
}
const onCanvasKeydown = (event: KeyboardEvent) => {
  const delta = event.shiftKey ? 80 : 8
  const directions: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -delta, y: 0 },
    ArrowRight: { x: delta, y: 0 },
    ArrowUp: { x: 0, y: -delta },
    ArrowDown: { x: 0, y: delta },
  }
  if (!directions[event.key]) return
  event.preventDefault()
  draft.value.widgets
    .filter((widget) => selectedIds.value.includes(widget.id))
    .forEach((widget) =>
      Object.assign(
        widget.layout,
        moveCanvasRect(widget.layout, directions[event.key])
      )
    )
}
const removeSelected = () => {
  draft.value.widgets = draft.value.widgets
    .filter((widget) => !selectedIds.value.includes(widget.id))
    .sort((a, b) => a.layout.z - b.layout.z)
  draft.value.widgets.forEach((widget, index) => {
    widget.layout.z = index
  })
  selectedIds.value = []
}
const hasTableField = (
  widget: Extract<DataScreenWidgetV1, { kind: 'table' }>,
  reference: ReportingFieldReference
) => widget.props.columns.some((field) => refKey(field) === refKey(reference))
const toggleTableField = (
  widget: Extract<DataScreenWidgetV1, { kind: 'table' }>,
  reference: ReportingFieldReference
) => {
  if (hasTableField(widget, reference))
    widget.props.columns = widget.props.columns.filter(
      (field) => refKey(field) !== refKey(reference)
    )
  else
    widget.props.columns = [...widget.props.columns, clone(reference)].slice(
      0,
      20
    )
}
const parseFieldKey = (value: string): ReportingFieldReference => {
  const [kind, id] = value.split(':')
  return { kind: kind as 'field', id } as ReportingFieldReference
}
const setMapField = (
  widget: Extract<DataScreenWidgetV1, { kind: 'map' }>,
  property: 'longitudeField' | 'latitudeField',
  event: Event
) => {
  widget.props[property] = parseFieldKey(
    (event.target as HTMLSelectElement).value
  )
}
const toggleTablePause = (id: string) => {
  const widget = canvasDefinition.value.widgets.find((item) => item.id === id)
  if (widget?.kind === 'table')
    widget.props.scrollingPaused = !widget.props.scrollingPaused
}
const toggleAlertPause = () => {
  canvasDefinition.value.alert.scrollingPaused =
    !canvasDefinition.value.alert.scrollingPaused
}
const alertText = computed(() => {
  const { alert } = canvasDefinition.value
  const facts = buildDataScreenAlertFacts(
    canvasDefinition.value.sources.map((source) =>
      runtimeFor(source.sourceKey)
    ),
    alert.statuses
  )
  if (!facts.length) return '当前没有可用于告警的授权来源事实'
  return facts
    .map((fact) => {
      const sourceName = dataScreenAlertSourceName(
        fact,
        canvasDefinition.value,
        reports.value
      )
      const statuses =
        fact.statuses.map((status) => statusLabels[status]).join('、') ||
        '无匹配告警状态'
      const threshold =
        fact.count >= alert.countThreshold
          ? `达到阈值 ${alert.countThreshold}`
          : `未达阈值 ${alert.countThreshold}`
      return `来源 ${sourceName} / 发布版 ${
        fact.sourceReleaseVersion
      } · 状态 ${statuses} · ${fact.count} 条 · 截止 ${formatTime(
        fact.dataCutoffAt
      )} · ${threshold}`
    })
    .join('；')
})
const fit = () => {
  const element = viewportElement.value
  if (!element) return
  fitScale.value = fitCanvasScale(
    Math.max(1, element.clientWidth - 24),
    Math.max(1, element.clientHeight - 24)
  )
}
const toggleFullscreen = async () => {
  try {
    if (!document.fullscreenElement)
      await rootElement.value?.requestFullscreen()
    else await document.exitFullscreen()
  } catch {
    notice.value = { kind: 'error', text: '浏览器拒绝进入全屏，请检查页面权限' }
  }
}
const onFullscreen = () => {
  fullscreen.value = Boolean(document.fullscreenElement)
  nextTick(fit)
}
const onVisibility = () => scheduler.visibilityChanged()
const formatTime = (value: string) => new Date(value).toLocaleString()
watch(
  draft,
  () => {
    if (runtimeMode.value === 'draft') scheduler.invalidate()
  },
  { deep: true }
)
watch(
  () => tenantScope.snapshot(),
  () => {
    runtimeMode.value = 'idle'
    restartRuntime()
    loadDefinitions(false)
  },
  { deep: true }
)
onMounted(() => {
  loadAll()
  resizeObserver = new ResizeObserver(fit)
  if (viewportElement.value) resizeObserver.observe(viewportElement.value)
  document.addEventListener('fullscreenchange', onFullscreen)
  document.addEventListener('visibilitychange', onVisibility)
  nextTick(fit)
})
onBeforeUnmount(() => {
  scheduler.stop()
  resizeObserver?.disconnect()
  document.removeEventListener('fullscreenchange', onFullscreen)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
.reference-screen {
  height: calc(100vh - 116px);
  min-height: 680px;
  display: flex;
  flex-direction: column;
  color: #dcecff;
  background: #061225;
  border: 1px solid #203c61;
  --panel: #0b1d35;
}
.reference-screen.fullscreen {
  height: 100vh;
  width: 100vw;
  box-sizing: border-box;
  overflow: hidden;
}
.reference-screen.fullscreen .workspace {
  grid-template-columns: minmax(0, 1fr);
}
.reference-screen.fullscreen .left-panel,
.reference-screen.fullscreen .right-panel,
.reference-screen.fullscreen .stage-toolbar {
  display: none;
}
.reference-screen.fullscreen .topbar {
  min-height: 58px;
}
.reference-screen.fullscreen
  .topbar
  .actions
  > button:not([data-testid='screen-refresh']):not(
    [data-testid='screen-fullscreen']
  ) {
  display: none;
}
.reference-screen.fullscreen .viewport {
  padding: 6px;
}
.topbar {
  min-height: 70px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 10px 18px;
  background: linear-gradient(90deg, #0b1d35, #102c4c);
  border-bottom: 1px solid #24476e;
}
h1,
h2,
p {
  margin: 0;
}
h1 {
  font-size: 20px;
}
h2 {
  font-size: 14px;
  margin-bottom: 10px;
  color: #a9cdf7;
}
.topbar p {
  color: #7189a7;
  font-size: 12px;
  margin-top: 4px;
}
button,
input,
select {
  font: inherit;
}
button {
  border: 1px solid #315c87;
  color: #cfe5ff;
  background: #102b49;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 3px;
}
button:hover:not(:disabled) {
  border-color: var(--screen-brand);
}
button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-content: flex-end;
}
.notice {
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
}
.notice.ok {
  background: #123a36;
}
.notice.error {
  background: #512230;
}
.notice button {
  border: 0;
  background: none;
}
.workspace {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 230px minmax(420px, 1fr) 246px;
}
.left-panel,
.right-panel {
  overflow: auto;
  background: var(--panel);
}
.left-panel {
  border-right: 1px solid #203c61;
}
.right-panel {
  border-left: 1px solid #203c61;
}
aside section {
  padding: 14px;
  border-bottom: 1px solid #203c61;
}
label {
  display: grid;
  gap: 5px;
  margin: 9px 0;
  color: #91acd0;
  font-size: 12px;
}
input,
select {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  padding: 7px;
  color: #dcecff;
  background: #07162a;
  border: 1px solid #294d74;
  border-radius: 2px;
}
.check {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.check input {
  width: auto;
}
.screen-row {
  width: 100%;
  display: grid;
  text-align: left;
  margin: 5px 0;
}
.screen-row small {
  color: #7189a7;
}
.screen-row.active {
  border-color: var(--screen-brand);
  background: #14385e;
}
.palette {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.palette button {
  font-size: 12px;
  padding: 6px;
}
.stage-column {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.stage-toolbar {
  min-height: 36px;
  padding: 5px 8px;
  display: flex;
  gap: 5px;
  align-items: center;
  background: #091a30;
  border-bottom: 1px solid #203c61;
}
.stage-toolbar button {
  padding: 4px 7px;
  font-size: 11px;
}
.stage-toolbar span:first-of-type {
  flex: 1;
}
.stage-toolbar .mode {
  color: #6eb4ff;
  font-size: 12px;
}
.viewport {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  place-items: center;
  padding: 12px;
  background-color: #040b17;
  background-image: radial-gradient(#183654 1px, transparent 1px);
  background-size: 16px 16px;
}
.fit-box {
  position: relative;
  flex: none;
}
.canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 1920px;
  height: 1080px;
  transform-origin: top left;
  overflow: hidden;
  outline: none;
  background: radial-gradient(
      circle at 50% -10%,
      rgb(40 103 175 / 22%),
      transparent 45%
    ),
    linear-gradient(140deg, #071426, #091c35);
}
.theme-enterprise .canvas {
  background: linear-gradient(145deg, #101223, #17162e);
}
.theme-ocean .canvas {
  background: radial-gradient(
      circle at 50% 0,
      rgb(12 123 141 / 26%),
      transparent 50%
    ),
    #061e2a;
}
.widget-frame {
  position: absolute;
  box-sizing: border-box;
}
.widget-frame.selected {
  outline: 3px solid var(--screen-brand);
  outline-offset: 2px;
}
.resize-handle {
  position: absolute;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 2px solid #fff;
  background: var(--screen-brand);
  border-radius: 50%;
}
.handle-n {
  left: 50%;
  top: -9px;
}
.handle-ne {
  right: -9px;
  top: -9px;
}
.handle-e {
  right: -9px;
  top: 50%;
}
.handle-se {
  right: -9px;
  bottom: -9px;
}
.handle-s {
  left: 50%;
  bottom: -9px;
}
.handle-sw {
  left: -9px;
  bottom: -9px;
}
.handle-w {
  left: -9px;
  top: 50%;
}
.handle-nw {
  left: -9px;
  top: -9px;
}
.alert-strip {
  height: 34px;
  display: flex;
  align-items: center;
  background: #3d1521;
  border-top: 1px solid #7b3046;
  overflow: hidden;
}
.alert-strip button {
  margin: 0 10px;
  font-size: 11px;
  padding: 3px 6px;
}
.alert-strip div {
  flex: 1;
  overflow: hidden;
}
.alert-strip span {
  display: inline-block;
  white-space: nowrap;
  animation: alert-scroll 18s linear infinite;
}
.alert-strip.paused span {
  animation-play-state: paused;
}
@keyframes alert-scroll {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(-100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .alert-strip span {
    animation: none;
  }
}
.rect-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
fieldset {
  border: 1px solid #294d74;
  max-height: 180px;
  overflow: auto;
}
.danger {
  border-color: #824052;
  color: #ff9bad;
}
.right-panel section > button {
  width: 100%;
  margin-top: 6px;
}
@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 190px minmax(380px, 1fr);
  }
  .right-panel {
    position: absolute;
    right: 0;
    top: 70px;
    bottom: 0;
    width: 230px;
    z-index: 20;
    box-shadow: -8px 0 24px #0008;
  }
  .reference-screen {
    position: relative;
  }
}
</style>
