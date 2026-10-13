<template>
  <article class="screen-widget" :data-kind="widget.kind">
    <header>
      <strong>{{ widget.title }}</strong>
      <span v-if="runtime.stale" class="stale">过期</span>
      <button
        v-if="widget.kind === 'table'"
        type="button"
        class="pause"
        @click="emit('pause-table', widget.id)"
      >
        {{ widget.props.scrollingPaused ? '继续滚动' : '暂停滚动' }}
      </button>
    </header>
    <div v-if="runtime.phase === 'loading'" class="state">正在授权查询…</div>
    <div v-else-if="runtime.phase === 'rights'" class="state rights">
      {{ runtime.message }}
    </div>
    <div v-else-if="runtime.phase === 'error'" class="state error">
      {{ runtime.message }}
    </div>
    <div v-else-if="runtime.phase === 'empty'" class="state">
      {{ runtime.message }}
    </div>
    <div v-else-if="!result" class="state">等待真实来源</div>
    <template v-else>
      <div v-if="widget.kind === 'metric'" class="metric">
        <b>{{ result.total }}</b>
        <span>条授权记录</span>
      </div>
      <svg
        v-else-if="widget.kind === 'line'"
        class="chart"
        viewBox="0 0 640 250"
        role="img"
        aria-label="真实记录每日趋势"
      >
        <line x1="28" y1="216" x2="620" y2="216" class="axis" />
        <polyline :points="trendPoints" class="line" />
        <circle
          v-for="(point, index) in result.trend"
          :key="point.date"
          :cx="trendX(index)"
          :cy="trendY(point.count)"
          r="4"
          class="dot"
        >
          <title>{{ point.date }}：{{ point.count }} 条</title>
        </circle>
      </svg>
      <div v-else-if="widget.kind === 'bar'" class="bars">
        <div v-for="item in barItems" :key="item.label" class="bar-row">
          <span>{{ item.label }}</span>
          <i><b :style="{ width: `${(item.count / barMax) * 100}%` }" /></i>
          <em>{{ item.count }}</em>
        </div>
      </div>
      <div v-else-if="widget.kind === 'pie'" class="pie-wrap">
        <div class="pie" :style="{ background: pieGradient }" />
        <ul>
          <li v-for="(item, index) in result.distribution" :key="item.status">
            <i :style="{ background: colors[index % colors.length] }" />
            {{ statusLabel(item.status) }} {{ item.count }}
          </li>
        </ul>
      </div>
      <ol v-else-if="widget.kind === 'ranking'" class="ranking">
        <li v-for="item in ranking" :key="item.status">
          <span>{{ statusLabel(item.status) }}</span>
          <b>{{ item.count }}</b>
        </li>
      </ol>
      <div
        v-else-if="widget.kind === 'table'"
        class="table-scroll"
        :class="{ moving: !widget.props.scrollingPaused }"
      >
        <table>
          <thead>
            <tr>
              <th v-for="field in tableFields" :key="field.key">
                {{ field.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tableRows" :key="row.id">
              <td v-for="field in tableFields" :key="field.key">
                {{ cell(row, field.key) }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="result.total > tableRows.length" class="cutoff">
          显示 {{ tableRows.length }}/{{ result.total }} 条，服务端结果已截断
        </p>
      </div>
      <div v-else class="map" aria-label="真实经纬度点位">
        <template v-if="mapPoints.length">
          <span
            v-for="point in mapPoints"
            :key="point.id"
            class="map-point"
            :style="{ left: `${point.x}%`, top: `${point.y}%` }"
            :title="`${point.longitude}, ${point.latitude}`"
          />
          <small>{{ mapPoints.length }} 个有效点位</small>
        </template>
        <p v-else>当前明细没有有效经纬度；无点位时不会生成位置。</p>
      </div>
      <footer>
        <span v-if="runtime.refreshing">刷新中</span>
        <span v-if="runtime.lastSuccessAt">
          上次成功 {{ formatTime(runtime.lastSuccessAt) }}
        </span>
        <span v-if="runtime.dataCutoffAt">
          截止 {{ formatTime(runtime.dataCutoffAt) }}
        </span>
      </footer>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type {
  DataScreenWidgetV1,
  ReportingQueryResultV1,
  ReportingVisibleField,
} from '@af-admin/contracts'
import type { SourceRuntimeState } from './runtime'

const props = defineProps<{
  widget: DataScreenWidgetV1
  runtime: SourceRuntimeState
}>()
const emit = defineEmits<{ (event: 'pause-table', id: string): void }>()
const result = computed(() => props.runtime.source?.result || null)
const colors = ['#3c86ff', '#23c9b7', '#ffc857', '#ff708d', '#8d7cff']
const statuses: Record<string, string> = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
}
const statusLabel = (status: string) => statuses[status] || status
const trendMax = computed(() =>
  Math.max(1, ...(result.value?.trend || []).map((point) => point.count))
)
const trendX = (index: number) => {
  const length = result.value?.trend.length || 0
  return 28 + (length > 1 ? (index * 592) / (length - 1) : 296)
}
const trendY = (count: number) => 216 - (count / trendMax.value) * 185
const trendPoints = computed(() =>
  (result.value?.trend || [])
    .map((point, index) => `${trendX(index)},${trendY(point.count)}`)
    .join(' ')
)
const barItems = computed(() => {
  if (!result.value) return []
  if (props.widget.kind === 'bar' && props.widget.props.view === 'trend')
    return result.value.trend.map((item) => ({
      label: item.date.slice(5),
      count: item.count,
    }))
  return result.value.distribution.map((item) => ({
    label: statusLabel(item.status),
    count: item.count,
  }))
})
const barMax = computed(() =>
  Math.max(1, ...barItems.value.map((item) => item.count))
)
const pieGradient = computed(() => {
  const items = result.value?.distribution || []
  const total = Math.max(
    1,
    items.reduce((sum, item) => sum + item.count, 0)
  )
  let at = 0
  const stops = items.map((item, index) => {
    const start = at
    at += (item.count / total) * 100
    return `${colors[index % colors.length]} ${start}% ${at}%`
  })
  return `conic-gradient(${stops.join(',') || '#334155 0 100%'})`
})
const ranking = computed(() => {
  if (!result.value || props.widget.kind !== 'ranking') return []
  return [...result.value.distribution]
    .sort((left, right) => right.count - left.count)
    .slice(0, props.widget.props.limit)
})
const referenceKey = (reference: { kind: string; id: string }) =>
  `${reference.kind}:${reference.id}`
const tableFields = computed<ReportingVisibleField[]>(() => {
  if (!result.value || props.widget.kind !== 'table') return []
  const wanted = new Set(props.widget.props.columns.map(referenceKey))
  return result.value.visibleFields.filter((field) => wanted.has(field.key))
})
const tableRows = computed(() => {
  if (!result.value || props.widget.kind !== 'table') return []
  return result.value.rows.slice(0, Math.min(100, props.widget.props.maxRows))
})
const cell = (row: ReportingQueryResultV1['rows'][number], key: string) => {
  if (row.hiddenFieldKeys?.includes(key)) return '不可见'
  const value = row.values[key]
  if (value === null || value === undefined) return '未填写'
  return typeof value === 'object' ? '复杂值' : String(value)
}
const coordinateValue = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const mapPoints = computed(() => {
  if (!result.value || props.widget.kind !== 'map') return []
  const longitudeKey = referenceKey(props.widget.props.longitudeField)
  const latitudeKey = referenceKey(props.widget.props.latitudeField)
  const longitudeVisible = result.value.visibleFields.some(
    (field) =>
      field.key === longitudeKey &&
      field.valueType === 'coordinate' &&
      field.coordinateAxis === 'longitude'
  )
  const latitudeVisible = result.value.visibleFields.some(
    (field) =>
      field.key === latitudeKey &&
      field.valueType === 'coordinate' &&
      field.coordinateAxis === 'latitude'
  )
  if (!longitudeVisible || !latitudeVisible) return []
  return result.value.rows
    .map((row) => ({
      id: row.id,
      hidden:
        row.hiddenFieldKeys?.includes(longitudeKey) ||
        row.hiddenFieldKeys?.includes(latitudeKey),
      longitude: coordinateValue(row.values[longitudeKey]),
      latitude: coordinateValue(row.values[latitudeKey]),
    }))
    .filter(
      (
        point
      ): point is typeof point & { longitude: number; latitude: number } =>
        !point.hidden &&
        point.longitude !== null &&
        Number.isFinite(point.longitude) &&
        point.longitude >= -180 &&
        point.longitude <= 180 &&
        point.latitude !== null &&
        Number.isFinite(point.latitude) &&
        point.latitude >= -90 &&
        point.latitude <= 90
    )
    .slice(0, Math.min(100, props.widget.props.maxPoints))
    .map((point) => ({
      ...point,
      x: ((point.longitude + 180) / 360) * 100,
      y: ((90 - point.latitude) / 180) * 100,
    }))
})
const formatTime = (value: string) => new Date(value).toLocaleString()
</script>

<style scoped>
.screen-widget {
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid rgb(94 171 255 / 35%);
  background: rgb(8 21 43 / 92%);
  color: #dcecff;
  box-shadow: inset 0 0 24px rgb(44 133 255 / 8%);
}
header {
  height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid rgb(94 171 255 / 18%);
  letter-spacing: 0.04em;
}
header strong {
  flex: 1;
}
.pause {
  color: #9bc8ff;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.stale {
  color: #ffce70;
}
.state {
  flex: 1;
  display: grid;
  place-items: center;
  color: #8299b7;
  padding: 18px;
  text-align: center;
}
.rights,
.error {
  color: #ff8799;
}
.metric {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.metric b {
  font-size: 58px;
  color: var(--screen-brand);
  text-shadow: 0 0 22px color-mix(in srgb, var(--screen-brand), transparent 45%);
}
.chart {
  width: 100%;
  height: calc(100% - 68px);
}
.axis {
  stroke: #536a87;
}
.line {
  fill: none;
  stroke: var(--screen-brand);
  stroke-width: 4;
}
.dot {
  fill: #fff;
  stroke: var(--screen-brand);
  stroke-width: 3;
}
.bars {
  padding: 18px;
  overflow: auto;
}
.bar-row {
  display: grid;
  grid-template-columns: 90px 1fr 45px;
  gap: 10px;
  align-items: center;
  margin: 10px 0;
}
.bar-row i {
  height: 10px;
  background: #1a304c;
}
.bar-row i b {
  display: block;
  height: 100%;
  background: var(--screen-brand);
}
.bar-row em {
  font-style: normal;
  text-align: right;
}
.pie-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}
.pie {
  width: 160px;
  aspect-ratio: 1;
  border-radius: 50%;
  box-shadow: 0 0 32px rgb(37 114 255 / 22%);
}
ul {
  list-style: none;
  padding: 0;
}
.pie-wrap li {
  margin: 8px;
}
.pie-wrap li i {
  width: 9px;
  height: 9px;
  display: inline-block;
  margin-right: 8px;
}
.ranking {
  margin: 0;
  padding: 14px 24px 14px 46px;
  overflow: auto;
}
.ranking li {
  border-bottom: 1px solid rgb(255 255 255 / 8%);
  padding: 10px 0;
}
.ranking li b {
  float: right;
  color: var(--screen-brand);
}
.table-scroll {
  overflow: auto;
  flex: 1;
  position: relative;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  padding: 9px 12px;
  border-bottom: 1px solid rgb(255 255 255 / 7%);
  text-align: left;
  white-space: nowrap;
}
th {
  color: #8fb9e8;
  position: sticky;
  top: 0;
  background: #0d2342;
}
.cutoff {
  padding: 8px 12px;
  color: #ffcf70;
}
.table-scroll.moving tbody {
  animation: table-drift 18s linear infinite alternate;
}
@keyframes table-drift {
  to {
    transform: translateY(-20%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .table-scroll.moving tbody {
    animation: none;
  }
}
.map {
  flex: 1;
  margin: 14px;
  position: relative;
  overflow: hidden;
  border: 1px solid #27496d;
  background-color: #0a1d36;
  background-image: linear-gradient(rgb(62 117 166 / 20%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(62 117 166 / 20%) 1px, transparent 1px);
  background-size: 10% 16.666%;
}
.map-point {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: var(--screen-brand);
  box-shadow: 0 0 0 5px rgb(255 255 255 / 12%), 0 0 18px var(--screen-brand);
}
.map small {
  position: absolute;
  right: 8px;
  bottom: 8px;
}
.map p {
  display: grid;
  place-items: center;
  height: 100%;
  color: #8299b7;
}
footer {
  min-height: 24px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 4px 10px;
  font-size: 11px;
  color: #7189a7;
}
</style>
