<template>
  <main class="report-schedules" data-testid="report-schedules">
    <div class="report-schedules__header">
      <div>
        <p class="report-schedules__breadcrumb">数据可视化 / 定时报表</p>
        <h1>定时报表</h1>
      </div>
      <div class="report-schedules__summary">共 {{ total }} 个调度任务</div>
    </div>

    <section class="report-schedules__filters" aria-label="定时报表筛选">
      <label class="report-schedules__field">
        <span>状态</span>
        <select v-model="filters.status" data-testid="report-schedule-status">
          <option value="">全部状态</option>
          <option value="enabled">启用</option>
          <option value="disabled">停用</option>
        </select>
      </label>
      <label class="report-schedules__field">
        <span>频率</span>
        <select
          v-model="filters.frequency"
          data-testid="report-schedule-frequency"
        >
          <option value="">全部频率</option>
          <option value="daily">每日</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
        </select>
      </label>
      <label class="report-schedules__field">
        <span>关键词</span>
        <input
          v-model.trim="filters.keyword"
          data-testid="report-schedule-keyword"
          placeholder="报表名称、接收目标或格式"
        />
      </label>
      <div class="report-schedules__actions">
        <button
          class="report-schedules__button report-schedules__button--primary"
          data-testid="report-schedule-query"
          :disabled="loading"
          type="button"
          @click="querySchedules"
        >
          查询
        </button>
        <button
          class="report-schedules__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="report-schedules__layout">
      <div class="report-schedules__panel">
        <div class="report-schedules__panel-title">
          <h2>调度任务</h2>
          <span>Mock 定时导出与接收范围</span>
        </div>

        <div class="report-schedules__table-wrap">
          <table class="report-schedules__table">
            <thead>
              <tr>
                <th>报表</th>
                <th>频率</th>
                <th>接收范围</th>
                <th>格式</th>
                <th>下次运行</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && schedules.length === 0">
                <td class="report-schedules__empty" colspan="7">
                  暂无定时报表
                </td>
              </tr>
              <tr v-for="schedule in schedules" :key="schedule.id">
                <td>
                  <strong>{{ schedule.reportName }}</strong>
                  <span>{{ schedule.auditLogId }}</span>
                </td>
                <td>{{ getFrequencyLabel(schedule.frequency) }}</td>
                <td>
                  {{ getScopeLabel(schedule.recipientScope) }}：
                  {{ schedule.recipientTarget }}
                </td>
                <td>{{ schedule.exportFormat }}</td>
                <td>{{ schedule.nextRunAt }}</td>
                <td>
                  <span
                    class="report-schedules__status"
                    :class="`is-${schedule.status}`"
                  >
                    {{ schedule.status === 'enabled' ? '启用' : '停用' }}
                  </span>
                </td>
                <td>
                  <button
                    class="report-schedules__link-button"
                    :data-testid="`report-schedule-toggle-${schedule.id}`"
                    :disabled="loading"
                    type="button"
                    @click="handleToggle(schedule)"
                  >
                    {{ schedule.status === 'enabled' ? '停用' : '启用' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="loading" class="report-schedules__loading">加载中...</div>
        </div>
      </div>

      <div class="report-schedules__panel">
        <div class="report-schedules__panel-title">
          <h2>新增调度</h2>
          <span>任务创建会写入 Mock 审计</span>
        </div>
        <div class="report-schedules__form">
          <label class="report-schedules__field">
            <span>报表</span>
            <select
              v-model="createForm.reportId"
              data-testid="report-schedule-report"
            >
              <option value="sales-trend">销售趋势报表</option>
              <option value="channel-distribution">渠道分布报表</option>
              <option value="order-detail">订单明细报表</option>
            </select>
          </label>
          <label class="report-schedules__field">
            <span>频率</span>
            <select
              v-model="createForm.frequency"
              data-testid="report-schedule-create-frequency"
            >
              <option value="daily">每日</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </label>
          <label class="report-schedules__field">
            <span>接收范围</span>
            <select v-model="createForm.recipientScope">
              <option value="role">角色</option>
              <option value="department">部门</option>
              <option value="tenant">租户</option>
            </select>
          </label>
          <label class="report-schedules__field">
            <span>接收目标</span>
            <input v-model.trim="createForm.recipientTarget" />
          </label>
          <label class="report-schedules__field">
            <span>导出格式</span>
            <select v-model="createForm.exportFormat">
              <option value="xlsx">xlsx</option>
              <option value="csv">csv</option>
              <option value="pdf">pdf</option>
            </select>
          </label>
          <label class="report-schedules__check">
            <input v-model="createForm.enabled" type="checkbox" />
            <span>创建后启用</span>
          </label>
          <button
            class="report-schedules__button report-schedules__button--primary"
            data-testid="report-schedule-create"
            :disabled="loading"
            type="button"
            @click="handleCreate"
          >
            创建调度
          </button>
        </div>
      </div>
    </section>

    <section class="report-schedules__panel report-schedules__audits">
      <div class="report-schedules__panel-title">
        <h2>导出审计</h2>
        <span>创建、开关和运行结果</span>
      </div>
      <div class="report-schedules__audit-list">
        <article
          v-for="audit in audits"
          :key="audit.id"
          class="report-schedules__audit"
        >
          <strong>{{ audit.reportName }}</strong>
          <span>{{ audit.action }} / {{ audit.result }}</span>
          <p>{{ audit.message }}</p>
          <small>{{ audit.operator }} · {{ audit.createdAt }}</small>
        </article>
        <div
          v-if="!loading && audits.length === 0"
          class="report-schedules__empty"
        >
          暂无审计记录
        </div>
      </div>
    </section>

    <p v-if="actionMessage" class="report-schedules__message">
      {{ actionMessage }}
    </p>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  createReportSchedule,
  fetchReportScheduleAudits,
  fetchReportSchedules,
  toggleReportSchedule,
  type ReportScheduleAuditRecord,
  type ReportScheduleExportFormat,
  type ReportScheduleFrequency,
  type ReportScheduleQuery,
  type ReportScheduleRecord,
  type ReportScheduleRecipientScope,
  type ReportScheduleStatus,
} from '@/api/report-schedule'

const schedules = ref<ReportScheduleRecord[]>([])
const audits = ref<ReportScheduleAuditRecord[]>([])
const total = ref(0)
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)
const actionMessage = ref('')

const filters = reactive({
  status: '' as ReportScheduleStatus | '',
  frequency: '' as ReportScheduleFrequency | '',
  keyword: '',
})

const createForm = reactive({
  reportId: 'sales-trend',
  frequency: 'weekly' as ReportScheduleFrequency,
  recipientScope: 'department' as ReportScheduleRecipientScope,
  recipientTarget: '运营部',
  exportFormat: 'xlsx' as ReportScheduleExportFormat,
  enabled: true,
})

const frequencyLabels: Record<ReportScheduleFrequency, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
}

const scopeLabels: Record<ReportScheduleRecipientScope, string> = {
  role: '角色',
  department: '部门',
  tenant: '租户',
}

const buildQuery = (): ReportScheduleQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  status: filters.status,
  frequency: filters.frequency,
  keyword: filters.keyword,
})

const loadAudits = async (scheduleId?: string) => {
  const result = await fetchReportScheduleAudits(
    scheduleId ? { scheduleId } : {}
  )
  audits.value = result.list
}

const loadSchedules = async () => {
  loading.value = true

  try {
    const result = await fetchReportSchedules(buildQuery())
    schedules.value = result.list
    total.value = result.total
  } finally {
    loading.value = false
  }
}

const querySchedules = async () => {
  current.value = 1
  await loadSchedules()
}

const resetFilters = async () => {
  filters.status = ''
  filters.frequency = ''
  filters.keyword = ''
  await querySchedules()
}

const handleCreate = async () => {
  const schedule = await createReportSchedule({
    reportId: createForm.reportId,
    frequency: createForm.frequency,
    recipientScope: createForm.recipientScope,
    recipientTarget: createForm.recipientTarget,
    exportFormat: createForm.exportFormat,
    enabled: createForm.enabled,
  })
  schedules.value = [schedule, ...schedules.value]
  total.value += 1
  actionMessage.value = '已创建定时报表'
  await loadAudits()
}

const handleToggle = async (schedule: ReportScheduleRecord) => {
  const enabled = schedule.status !== 'enabled'
  const result = await toggleReportSchedule(schedule.id, enabled)

  if (result.success && result.status) {
    schedules.value = schedules.value.map((item) => {
      if (item.id !== schedule.id) return item

      return {
        ...item,
        status: result.status as ReportScheduleStatus,
        auditLogId: result.auditLogId || item.auditLogId,
      }
    })
    actionMessage.value = '已更新定时报表'
  } else {
    actionMessage.value = result.reason || '定时报表更新失败'
  }
  await loadAudits()
}

const getFrequencyLabel = (frequency: ReportScheduleFrequency) =>
  frequencyLabels[frequency]

const getScopeLabel = (scope: ReportScheduleRecipientScope) =>
  scopeLabels[scope]

onMounted(async () => {
  await loadSchedules()
  await loadAudits()
})
</script>

<style scoped lang="scss">
.report-schedules {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}

.report-schedules__header {
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

.report-schedules__breadcrumb {
  margin: 0;
  color: #667085;
  font-size: 13px;
}

.report-schedules__summary {
  color: #475467;
  font-weight: 600;
}

.report-schedules__filters,
.report-schedules__layout {
  display: grid;
  gap: 16px;
}

.report-schedules__filters {
  grid-template-columns: 160px 160px minmax(220px, 1fr) auto;
  align-items: end;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.report-schedules__layout {
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
  align-items: start;
  margin-bottom: 16px;
}

.report-schedules__panel {
  min-width: 0;
  padding: 16px;
  background: #fff;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.report-schedules__panel-title {
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

.report-schedules__field {
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
}

.report-schedules__actions,
.report-schedules__form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.report-schedules__form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.report-schedules__button,
.report-schedules__link-button {
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

.report-schedules__button--primary {
  border-color: #165dff;
  background: #165dff;
  color: #fff;
}

.report-schedules__link-button {
  border-color: transparent;
  background: transparent;
  color: #165dff;
}

.report-schedules__table-wrap {
  position: relative;
  overflow: auto;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.report-schedules__table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;

  th,
  td {
    padding: 12px 14px;
    text-align: left;
    border-bottom: 1px solid #eaecf0;
    vertical-align: top;
  }

  th {
    color: #667085;
    font-weight: 600;
    background: #f9fafb;
  }

  td strong,
  td span {
    display: block;
  }
}

.report-schedules__status {
  display: inline-flex;
  width: fit-content;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f2f4f7;
  color: #475467;
  font-size: 12px;

  &.is-enabled {
    background: #ecfdf3;
    color: #027a48;
  }

  &.is-disabled {
    background: #fff7ed;
    color: #b54708;
  }
}

.report-schedules__check {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: #344054;
  font-size: 13px;
}

.report-schedules__audit-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.report-schedules__audit {
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #fff;

  strong,
  span,
  small {
    display: block;
  }

  p {
    margin: 6px 0;
    color: #344054;
  }

  span,
  small {
    color: #667085;
    font-size: 12px;
  }
}

.report-schedules__empty,
.report-schedules__loading {
  padding: 28px;
  text-align: center;
  color: #667085;
}

.report-schedules__message {
  margin: 12px 0 0;
  color: #475467;
  font-size: 13px;
}

@media (max-width: 1024px) {
  .report-schedules__filters,
  .report-schedules__layout,
  .report-schedules__audit-list {
    grid-template-columns: 1fr;
  }

  .report-schedules__header {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 720px) {
  .report-schedules {
    padding: 16px;
  }

  .report-schedules__panel-title {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
