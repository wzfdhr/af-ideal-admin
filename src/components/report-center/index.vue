<template>
  <div class="report-center" data-testid="report-center">
    <a-layout class="report-layout">
      <a-layout-sider :width="276" class="report-panel">
        <a-scrollbar class="report-scroll">
          <div class="panel-section">
            <div class="panel-title">报表列表</div>
            <button
              v-for="report in reports"
              :key="report.id"
              class="report-item"
              :class="{ active: report.id === currentReport?.id }"
              :data-testid="`report-select-${report.id}`"
              type="button"
              @click="selectReport(report)"
            >
              <span>{{ report.name }}</span>
              <small>{{ getReportTypeText(report.type) }}</small>
            </button>
          </div>
        </a-scrollbar>
      </a-layout-sider>

      <a-layout-content class="report-main">
        <div class="report-header">
          <div>
            <h2>{{ currentReport?.name || '报表中心' }}</h2>
            <p>{{ currentReport?.description || 'Mock 报表查询和导出任务' }}</p>
            <code>{{ currentReport?.permissionCode }}</code>
          </div>
          <a-space>
            <a-button
              data-testid="report-query"
              :loading="querying"
              @click="queryCurrentReport"
            >
              查询
            </a-button>
            <a-button
              type="primary"
              data-testid="report-export"
              :loading="exporting"
              @click="createExport()"
            >
              导出
            </a-button>
          </a-space>
        </div>

        <div class="query-bar">
          <label for="report-keyword">关键词</label>
          <a-input
            id="report-keyword"
            v-model="query.keyword"
            data-testid="report-keyword"
            placeholder="客户 / 负责人"
          />
          <span>日期范围：{{ query.dateRange.join(' 至 ') || '全部' }}</span>
        </div>
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <div class="report-grid">
          <section class="report-card">
            <div class="card-title">趋势</div>
            <SChart :option="trendOption" height="260" />
          </section>
          <section class="report-card">
            <div class="card-title">分布</div>
            <SChart :option="distributionOption" height="260" />
          </section>
        </div>

        <section class="report-card">
          <div class="card-title">明细</div>
          <table class="detail-table">
            <thead>
              <tr>
                <th v-for="field in dataResult.columns" :key="field.key">
                  {{ field.label }}
                  <code>{{ field.permissionCode }}</code>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in dataResult.rows" :key="index">
                <td v-for="field in dataResult.columns" :key="field.key">
                  {{ row[field.key] }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </a-layout-content>

      <a-layout-sider :width="320" class="report-panel right-panel">
        <div class="panel-section">
          <div class="panel-title">字段权限</div>
          <div
            v-for="field in currentReport?.fields || []"
            :key="field.key"
            class="permission-row"
          >
            <span>{{ field.label }}</span>
            <code>{{ field.permissionCode }}</code>
          </div>
        </div>
        <a-divider />
        <div class="panel-section">
          <div class="panel-title">导出任务</div>
          <div class="export-scenarios">
            <a-button
              v-for="status in exportScenarios"
              :key="status"
              size="small"
              :data-testid="`report-export-${status}`"
              @click="createExport(status)"
            >
              {{ status }}
            </a-button>
          </div>
          <div v-for="task in exportTasks" :key="task.id" class="task-row">
            <span>{{ task.reportName }}</span>
            <strong>{{ task.status }}</strong>
          </div>
        </div>
      </a-layout-sider>
    </a-layout>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import SChart from '@/components/s-chart.vue'
import {
  createReportExportTask,
  fetchReportData,
  fetchReportExportTasks,
  fetchReports,
  getReportDetail,
  type ReportDataQuery,
  type ReportDataResult,
  type ReportExportTask,
  type ReportExportStatus,
  type ReportRecord,
  type ReportType,
} from '@/api/report'

const reports = ref<ReportRecord[]>([])
const currentReport = ref<ReportRecord | null>(null)
const dataResult = ref<ReportDataResult>({
  type: 'detail',
  columns: [],
  rows: [],
  trend: [],
  distribution: [],
  total: 0,
})
const exportTasks = ref<ReportExportTask[]>([])
const query = reactive<Required<ReportDataQuery>>({
  keyword: '',
  dateRange: [],
})
const querying = ref(false)
const exporting = ref(false)
const errorMessage = ref('')

const exportScenarios: ReportExportStatus[] = [
  'created',
  'in-progress',
  'completed',
  'failed',
]

const trendOption = computed(() => ({
  grid: { left: 32, right: 16, top: 24, bottom: 24 },
  xAxis: {
    type: 'category',
    data: dataResult.value.trend.map((item) => item.time),
  },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'line',
      smooth: true,
      data: dataResult.value.trend.map((item) => item.value),
    },
  ],
}))

const distributionOption = computed(() => ({
  series: [
    {
      type: 'pie',
      radius: ['42%', '68%'],
      data: dataResult.value.distribution,
    },
  ],
}))

const getReportTypeText = (type: ReportType) => {
  const typeMap: Record<ReportType, string> = {
    trend: '趋势',
    distribution: '分布',
    detail: '明细',
  }
  return typeMap[type]
}

const getQueryParams = (): Required<ReportDataQuery> => ({
  keyword: query.keyword,
  dateRange: [...query.dateRange],
})

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const queryCurrentReport = async () => {
  if (!currentReport.value) return
  querying.value = true
  errorMessage.value = ''
  try {
    dataResult.value = await fetchReportData(
      currentReport.value.id,
      getQueryParams()
    )
  } catch (error) {
    dataResult.value = {
      type: currentReport.value.type,
      columns: currentReport.value.fields,
      rows: [],
      trend: [],
      distribution: [],
      total: 0,
    }
    errorMessage.value = getErrorMessage(error, '报表查询失败')
  } finally {
    querying.value = false
  }
}

const loadExportTasks = async () => {
  try {
    const result = await fetchReportExportTasks({
      reportId: currentReport.value?.id,
    })
    exportTasks.value = result.list
  } catch (error) {
    exportTasks.value = []
    errorMessage.value = getErrorMessage(error, '导出任务加载失败')
  }
}

const selectReport = async (report: ReportRecord, loadDetail = true) => {
  errorMessage.value = ''

  try {
    currentReport.value = loadDetail ? await getReportDetail(report.id) : report
    await queryCurrentReport()
    await loadExportTasks()
  } catch (error) {
    currentReport.value = report
    dataResult.value = {
      type: report.type,
      columns: report.fields,
      rows: [],
      trend: [],
      distribution: [],
      total: 0,
    }
    exportTasks.value = []
    errorMessage.value = getErrorMessage(error, '报表加载失败')
  }
}

const loadReports = async () => {
  errorMessage.value = ''

  try {
    const result = await fetchReports({ current: 1, pageSize: 20 })
    reports.value = result.list
    if (result.list.length) {
      await selectReport(result.list[0], false)
    }
  } catch (error) {
    reports.value = []
    errorMessage.value = getErrorMessage(error, '报表列表加载失败')
  }
}

const createExport = async (scenario: ReportExportStatus = 'in-progress') => {
  if (!currentReport.value) return
  exporting.value = true
  errorMessage.value = ''
  try {
    const task = await createReportExportTask({
      reportId: currentReport.value.id,
      params: getQueryParams(),
      scenario,
    })
    exportTasks.value = [task, ...exportTasks.value]
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '导出任务创建失败')
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  loadReports()
})
</script>

<style scoped>
.report-center {
  min-height: calc(100vh - 96px);
}

.report-layout {
  min-height: calc(100vh - 96px);
  background: #f7f8fa;
}

.report-panel {
  overflow: hidden;
  background: #ffffff;
  border-right: 1px solid #e5e6eb;
}

.right-panel {
  border-right: 0;
  border-left: 1px solid #e5e6eb;
}

.report-scroll {
  height: calc(100vh - 96px);
}

.panel-section {
  padding: 16px;
}

.panel-title,
.card-title {
  margin-bottom: 12px;
  color: #1d2129;
  font-size: 14px;
  font-weight: 600;
}

.report-item {
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

.report-item.active {
  color: #165dff;
  background: #e8f3ff;
  border-color: #165dff;
}

.report-item small {
  flex: none;
  color: #86909c;
}

.report-main {
  min-width: 0;
  padding: 16px;
}

.report-header,
.query-bar,
.permission-row,
.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.report-header {
  margin-bottom: 16px;
}

.report-header h2 {
  margin: 0 0 4px;
  color: #1d2129;
  font-size: 18px;
  font-weight: 600;
}

.report-header p,
.query-bar,
.permission-row,
.task-row {
  color: #4e5969;
  font-size: 13px;
}

.query-bar {
  justify-content: flex-start;
  padding: 12px;
  margin-bottom: 12px;
  background: #ffffff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
}

.error-message {
  margin-bottom: 12px;
  color: #f53f3f;
  font-size: 13px;
}

.query-bar :deep(.arco-input-wrapper),
.query-bar input {
  width: 220px;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.report-card {
  padding: 14px;
  background: #ffffff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  color: #4e5969;
  font-size: 13px;
}

.detail-table th,
.detail-table td {
  padding: 10px;
  border-bottom: 1px solid #f2f3f5;
}

.detail-table th {
  color: #1d2129;
  text-align: left;
  background: #f7f8fa;
}

.detail-table code,
.report-header code,
.permission-row code {
  display: block;
  color: #165dff;
  font-size: 12px;
}

.permission-row,
.task-row {
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid #f2f3f5;
}

.task-row strong {
  color: #165dff;
  font-weight: 600;
}

.export-scenarios {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
