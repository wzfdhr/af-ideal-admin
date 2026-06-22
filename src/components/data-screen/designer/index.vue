<template>
  <div
    class="data-screen-designer"
    :class="{ 'is-fullscreen': fullscreen }"
    data-testid="data-screen-designer"
  >
    <a-layout class="data-screen-layout">
      <a-layout-sider :width="264" class="data-screen-panel">
        <a-scrollbar class="data-screen-scroll">
          <div class="panel-section">
            <div class="panel-title">大屏</div>
            <button
              v-for="screen in screenList"
              :key="screen.id"
              class="screen-item"
              :class="{ active: screen.id === currentScreen?.id }"
              type="button"
              @click="selectScreen(screen)"
            >
              <span>{{ screen.name }}</span>
              <small>
                {{ getStatusText(screen.status) }} v{{ screen.version }}
              </small>
            </button>
          </div>
          <a-divider />
          <div class="panel-section">
            <div class="panel-title">实时场景</div>
            <div class="scenario-list">
              <a-button
                v-for="item in scenarios"
                :key="item.value"
                :type="scenario === item.value ? 'primary' : 'secondary'"
                :data-testid="`data-screen-scenario-${item.value}`"
                long
                @click="switchScenario(item.value)"
              >
                {{ item.label }}
              </a-button>
            </div>
          </div>
        </a-scrollbar>
      </a-layout-sider>

      <a-layout-content class="data-screen-main">
        <div class="data-screen-toolbar">
          <div>
            <h2>{{ currentScreen?.name || schema.title }}</h2>
            <p>
              {{ schema.width }} x {{ schema.height }} /
              {{ schema.widgets.length }} 个组件
            </p>
          </div>
          <a-space>
            <a-button :loading="refreshing" @click="refreshRealtimeData">
              刷新
            </a-button>
            <a-button
              data-testid="data-screen-save"
              :loading="saving"
              @click="saveCurrent"
            >
              保存
            </a-button>
            <a-button
              type="primary"
              data-testid="data-screen-publish"
              :loading="publishing"
              @click="publishCurrent"
            >
              发布
            </a-button>
            <a-button
              data-testid="data-screen-fullscreen"
              @click="toggleFullscreen"
            >
              {{ fullscreen ? '退出全屏' : '全屏预览' }}
            </a-button>
          </a-space>
        </div>

        <div class="screen-viewport">
          <div
            class="screen-canvas"
            data-testid="data-screen-canvas"
            :data-width="schema.width"
            :data-height="schema.height"
            :style="canvasStyle"
          >
            <div class="screen-background" />
            <header class="screen-header">
              <span>{{ schema.title }}</span>
              <code>{{ schema.permissionCode }}</code>
            </header>

            <section
              v-for="widget in schema.widgets"
              :key="widget.id"
              class="screen-widget"
              :style="getWidgetStyle(widget)"
            >
              <div class="widget-title">
                <span>{{ widget.name }}</span>
                <code>{{ widget.permissionCode }}</code>
              </div>

              <div v-if="widget.type === 'MetricCard'" class="metric-grid">
                <div
                  v-for="metric in realtimeData.metrics"
                  :key="metric.key"
                  class="metric-item"
                >
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.value }}{{ metric.unit }}</strong>
                  <small>{{ formatTrend(metric.trend) }}</small>
                </div>
              </div>

              <SChart
                v-else-if="widget.type === 'LineChart'"
                :option="lineChartOption"
                height="100%"
              />
              <SChart
                v-else-if="widget.type === 'BarChart'"
                :option="barChartOption"
                height="100%"
              />
              <SChart
                v-else-if="widget.type === 'PieChart'"
                :option="pieChartOption"
                height="100%"
              />

              <ol
                v-else-if="widget.type === 'RankingList'"
                class="ranking-list"
              >
                <li v-for="item in realtimeData.ranking" :key="item.name">
                  <span>{{ item.name }}</span>
                  <strong>{{ item.value }}</strong>
                </li>
              </ol>

              <table v-else class="scroll-table">
                <tbody>
                  <tr v-for="item in realtimeData.table" :key="item.id">
                    <td>{{ item.name }}</td>
                    <td>{{ item.amount }}</td>
                    <td>{{ item.status }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <div class="alert-ticker">
              <span
                v-for="alert in realtimeData.alerts"
                :key="alert.id"
                :class="`level-${alert.level}`"
              >
                {{ alert.message }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="actionMessage" class="action-message">
          {{ actionMessage }}
        </div>
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>
      </a-layout-content>
    </a-layout>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SChart from '@/components/s-chart.vue'
import {
  fetchDataScreenRealtimeData,
  fetchDataScreens,
  publishDataScreen,
  saveDataScreen,
  type DataScreenDefinition,
  type DataScreenRealtimeData,
  type DataScreenScenario,
} from '@/api/data-screen'
import {
  createEnterpriseDataScreenSchema,
  validateDataScreenSchema,
  type DataScreenSchema,
  type DataScreenWidget,
} from '@/components/data-screen/schema'

const emptyRealtimeData: DataScreenRealtimeData = {
  metrics: [],
  trend: [],
  distribution: [],
  ranking: [],
  table: [],
  alerts: [],
}

const scenarios: Array<{ label: string; value: DataScreenScenario }> = [
  { label: '实时数据', value: 'realtime' },
  { label: '空数据', value: 'empty' },
  { label: '告警滚动', value: 'alert' },
  { label: '异常数据', value: 'failure' },
]

const screenList = ref<DataScreenDefinition[]>([])
const currentScreen = ref<DataScreenDefinition | null>(null)
const schema = ref<DataScreenSchema>(createEnterpriseDataScreenSchema())
const realtimeData = ref<DataScreenRealtimeData>(emptyRealtimeData)
const scenario = ref<DataScreenScenario>('realtime')
const fullscreen = ref(false)
const saving = ref(false)
const publishing = ref(false)
const refreshing = ref(false)
const actionMessage = ref('')
const errorMessage = ref('')

const canvasStyle = computed(() => ({
  width: `${schema.value.width}px`,
  height: `${schema.value.height}px`,
  borderColor: schema.value.theme.brandColor,
}))

const lineChartOption = computed(() => ({
  grid: { left: 32, right: 16, top: 24, bottom: 24 },
  xAxis: {
    type: 'category',
    data: realtimeData.value.trend.map((item) => item.time),
  },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'line',
      data: realtimeData.value.trend.map((item) => item.value),
      smooth: true,
    },
  ],
}))

const barChartOption = computed(() => ({
  grid: { left: 32, right: 16, top: 24, bottom: 24 },
  xAxis: {
    type: 'category',
    data: realtimeData.value.distribution.map((item) => item.name),
  },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'bar',
      data: realtimeData.value.distribution.map((item) => item.value),
    },
  ],
}))

const pieChartOption = computed(() => ({
  series: [
    {
      type: 'pie',
      radius: ['42%', '68%'],
      data: realtimeData.value.distribution,
    },
  ],
}))

const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    draft: '草稿',
    published: '已发布',
  }
  return statusMap[status] || status
}

const formatTrend = (trend?: number) => {
  if (trend === undefined) return ''
  return `${trend >= 0 ? '+' : ''}${trend}%`
}

const getWidgetStyle = (widget: DataScreenWidget) => ({
  left: `${widget.x}px`,
  top: `${widget.y}px`,
  width: `${widget.w}px`,
  height: `${widget.h}px`,
})

const getRealtimeDataSourceKey = () =>
  schema.value.dataSources[0]?.key || 'realtime'

const mergeCurrentScreen = (patch: Partial<DataScreenDefinition>) => {
  if (!currentScreen.value) return
  currentScreen.value = {
    ...currentScreen.value,
    ...patch,
  }
  screenList.value = screenList.value.map((screen) =>
    screen.id === currentScreen.value?.id ? currentScreen.value : screen
  )
}

const refreshRealtimeData = async () => {
  refreshing.value = true
  errorMessage.value = ''
  try {
    realtimeData.value = await fetchDataScreenRealtimeData({
      screenId: currentScreen.value?.id,
      dataSourceKey: getRealtimeDataSourceKey(),
      scenario: scenario.value,
    })
  } catch (error) {
    realtimeData.value = emptyRealtimeData
    errorMessage.value =
      error instanceof Error ? error.message : '大屏实时数据获取失败'
  } finally {
    refreshing.value = false
  }
}

const selectScreen = async (screen: DataScreenDefinition) => {
  currentScreen.value = screen
  schema.value = validateDataScreenSchema(screen.schema)
  await refreshRealtimeData()
}

const loadScreens = async () => {
  const result = await fetchDataScreens({ current: 1, pageSize: 20 })
  screenList.value = result.list

  if (result.list.length) {
    await selectScreen(result.list[0])
  }
}

const switchScenario = async (nextScenario: DataScreenScenario) => {
  scenario.value = nextScenario
  await refreshRealtimeData()
}

const toggleFullscreen = () => {
  fullscreen.value = !fullscreen.value
}

const saveCurrent = async () => {
  if (!currentScreen.value) return
  saving.value = true
  try {
    const result = await saveDataScreen(currentScreen.value.id, schema.value)
    mergeCurrentScreen({
      schema: result.schema || schema.value,
      status: result.status || currentScreen.value.status,
      version: result.version || currentScreen.value.version,
    })
    actionMessage.value = '已保存'
  } finally {
    saving.value = false
  }
}

const publishCurrent = async () => {
  if (!currentScreen.value) return
  publishing.value = true
  try {
    const result = await publishDataScreen(currentScreen.value.id, schema.value)
    mergeCurrentScreen({
      schema: result.schema || schema.value,
      status: result.status || 'published',
      version: result.version || currentScreen.value.version,
    })
    actionMessage.value = '已发布'
  } finally {
    publishing.value = false
  }
}

onMounted(() => {
  loadScreens()
})
</script>

<style scoped>
.data-screen-designer {
  min-height: calc(100vh - 96px);
}

.data-screen-layout {
  min-height: calc(100vh - 96px);
  background: #f7f8fa;
}

.data-screen-panel {
  overflow: hidden;
  background: #ffffff;
  border-right: 1px solid #e5e6eb;
}

.data-screen-scroll {
  height: calc(100vh - 96px);
}

.panel-section {
  padding: 16px;
}

.panel-title {
  margin-bottom: 12px;
  color: #1d2129;
  font-size: 14px;
  font-weight: 600;
}

.screen-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  margin-bottom: 8px;
  padding: 8px 10px;
  color: #1d2129;
  text-align: left;
  background: #f7f8fa;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  cursor: pointer;
}

.screen-item.active {
  color: #165dff;
  background: #e8f3ff;
  border-color: #165dff;
}

.screen-item small {
  flex: none;
  color: #86909c;
}

.scenario-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.data-screen-main {
  min-width: 0;
  padding: 16px;
}

.data-screen-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.data-screen-toolbar h2 {
  margin: 0 0 4px;
  color: #1d2129;
  font-size: 18px;
  font-weight: 600;
}

.data-screen-toolbar p {
  margin: 0;
  color: #4e5969;
  font-size: 13px;
}

.screen-viewport {
  width: 100%;
  overflow: auto;
  padding: 16px;
  background: #111827;
  border-radius: 8px;
}

.screen-canvas {
  position: relative;
  overflow: hidden;
  color: #e5f7ff;
  background: #07111f;
  border: 2px solid;
  border-radius: 8px;
  transform: scale(0.5);
  transform-origin: left top;
}

.is-fullscreen .screen-canvas {
  transform: scale(0.62);
}

.screen-background {
  position: absolute;
  inset: 0;
  background: linear-gradient(
      90deg,
      rgba(0, 213, 255, 0.08) 1px,
      transparent 1px
    ),
    linear-gradient(rgba(0, 213, 255, 0.08) 1px, transparent 1px);
  background-size: 48px 48px;
}

.screen-header {
  position: absolute;
  top: 18px;
  left: 40px;
  right: 40px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #ffffff;
  font-size: 24px;
  font-weight: 600;
}

.screen-header code,
.widget-title code {
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 400;
}

.screen-widget {
  position: absolute;
  z-index: 1;
  padding: 18px;
  background: rgba(8, 21, 40, 0.86);
  border: 1px solid rgba(125, 211, 252, 0.28);
  border-radius: 8px;
}

.widget-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 28px;
  margin-bottom: 8px;
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.metric-item {
  min-height: 100px;
  padding: 14px;
  background: rgba(0, 213, 255, 0.08);
  border-radius: 6px;
}

.metric-item span,
.metric-item small {
  display: block;
  color: #9cc7d8;
  font-size: 13px;
}

.metric-item strong {
  display: block;
  margin: 8px 0;
  color: #ffffff;
  font-size: 24px;
  font-weight: 600;
}

.ranking-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ranking-list li,
.scroll-table tr {
  background: rgba(0, 213, 255, 0.08);
}

.ranking-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
}

.scroll-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 8px;
  color: #dff7ff;
  font-size: 14px;
}

.scroll-table td {
  padding: 10px 12px;
}

.alert-ticker {
  position: absolute;
  left: 40px;
  right: 40px;
  bottom: 40px;
  z-index: 1;
  display: flex;
  gap: 12px;
  min-height: 36px;
  overflow: hidden;
}

.alert-ticker span {
  flex: none;
  padding: 8px 14px;
  color: #ffffff;
  background: rgba(245, 63, 63, 0.22);
  border: 1px solid rgba(245, 63, 63, 0.38);
  border-radius: 18px;
}

.alert-ticker .level-critical {
  background: rgba(245, 63, 63, 0.34);
}

.action-message {
  margin-top: 12px;
  color: #00b42a;
  font-size: 13px;
}

.error-message {
  margin-top: 12px;
  color: #f53f3f;
  font-size: 13px;
}
</style>
