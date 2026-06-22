<template>
  <main class="audit-log-page" data-testid="audit-log-page">
    <div class="audit-log-page__header">
      <div>
        <p class="audit-log-page__breadcrumb">审计中心 / 审计日志</p>
        <h1>审计日志</h1>
      </div>
      <div class="audit-log-page__total">共 {{ total }} 条</div>
    </div>

    <section class="audit-log-page__filters" aria-label="审计日志筛选">
      <label class="audit-log-page__field">
        <span>操作人</span>
        <input
          v-model.trim="filters.operatorName"
          data-testid="audit-operator"
          placeholder="请输入操作人"
        />
      </label>
      <label class="audit-log-page__field">
        <span>模块</span>
        <select v-model="filters.module" data-testid="audit-module">
          <option value="">全部模块</option>
          <option
            v-for="moduleOption in moduleOptions"
            :key="moduleOption.value"
            :value="moduleOption.value"
          >
            {{ moduleOption.label }}
          </option>
        </select>
      </label>
      <label class="audit-log-page__field">
        <span>结果</span>
        <select v-model="filters.result" data-testid="audit-result">
          <option value="">全部结果</option>
          <option value="success">成功</option>
          <option value="failure">失败</option>
        </select>
      </label>
      <label class="audit-log-page__field">
        <span>事件类型</span>
        <select v-model="filters.eventType" data-testid="audit-event-type">
          <option value="">全部类型</option>
          <option value="security">security</option>
          <option value="operation">operation</option>
          <option value="permission">permission</option>
          <option value="export">export</option>
        </select>
      </label>
      <label class="audit-log-page__field">
        <span>开始时间</span>
        <input
          v-model="filters.startDate"
          data-testid="audit-date-start"
          type="date"
        />
      </label>
      <label class="audit-log-page__field">
        <span>结束时间</span>
        <input
          v-model="filters.endDate"
          data-testid="audit-date-end"
          type="date"
        />
      </label>
      <div class="audit-log-page__actions">
        <button
          class="audit-log-page__button audit-log-page__button--primary"
          data-testid="audit-query"
          :disabled="loading"
          type="button"
          @click="queryLogs"
        >
          查询
        </button>
        <button
          class="audit-log-page__button"
          :disabled="loading"
          type="button"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </section>

    <section class="audit-log-page__table-wrap" aria-label="审计日志列表">
      <table class="audit-log-page__table">
        <thead>
          <tr>
            <th>发生时间</th>
            <th>操作人</th>
            <th>模块</th>
            <th>动作</th>
            <th>类型</th>
            <th>结果</th>
            <th>对象</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && records.length === 0">
            <td class="audit-log-page__empty" colspan="8">暂无数据</td>
          </tr>
          <tr v-for="record in records" :key="record.id">
            <td>{{ formatTime(record.occurredAt) }}</td>
            <td>
              <strong>{{ record.operator?.name || '-' }}</strong>
              <span>{{ record.operator?.role || '-' }}</span>
            </td>
            <td>{{ record.module }}</td>
            <td>{{ record.action }}</td>
            <td>
              <span class="audit-log-page__badge">{{ record.eventType }}</span>
            </td>
            <td>
              <span
                class="audit-log-page__result"
                :class="`audit-log-page__result--${record.result}`"
              >
                {{ record.result }}
              </span>
            </td>
            <td>
              <strong>
                {{ record.target.name || record.target.id || '-' }}
              </strong>
              <span>{{ record.target.type }}</span>
            </td>
            <td>
              <pre>{{ formatDetail(record.detail) }}</pre>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  fetchAuditEvents,
  type AuditEventQuery,
  type AuditEventRecord,
} from '@/api/audit'

const moduleOptions = [
  { label: '认证', value: 'auth' },
  { label: '系统', value: 'system' },
  { label: '流程', value: 'workflow' },
  { label: '表单', value: 'form' },
  { label: '数据可视化', value: 'visualization' },
  { label: '报表', value: 'report' },
]

const records = ref<AuditEventRecord[]>([])
const total = ref(0)
const loading = ref(false)
const current = ref(1)
const pageSize = ref(20)

const filters = reactive({
  operatorName: '',
  module: '',
  result: '' as AuditEventQuery['result'],
  eventType: '' as AuditEventQuery['eventType'],
  startDate: '',
  endDate: '',
})

const buildDateRange = () => {
  if (!filters.startDate && !filters.endDate) {
    return []
  }

  return [filters.startDate, filters.endDate].filter(Boolean)
}

const buildQuery = (): AuditEventQuery => ({
  current: current.value,
  pageSize: pageSize.value,
  operatorName: filters.operatorName,
  module: filters.module,
  result: filters.result,
  eventType: filters.eventType,
  dateRange: buildDateRange(),
})

const loadLogs = async () => {
  loading.value = true

  try {
    const result = await fetchAuditEvents(buildQuery())
    records.value = result.list
    total.value = result.total
  } finally {
    loading.value = false
  }
}

const queryLogs = async () => {
  current.value = 1
  await loadLogs()
}

const resetFilters = async () => {
  filters.operatorName = ''
  filters.module = ''
  filters.result = ''
  filters.eventType = ''
  filters.startDate = ''
  filters.endDate = ''
  await queryLogs()
}

const formatTime = (value: string) =>
  value.replace('T', ' ').replace('.000Z', '')

const formatDetail = (detail?: Record<string, unknown>) => {
  if (!detail || Object.keys(detail).length === 0) {
    return '-'
  }

  return JSON.stringify(detail)
}

onMounted(loadLogs)
</script>

<style scoped lang="scss">
.audit-log-page {
  min-height: 100%;
  padding: 24px;
  color: #1d2129;
  background: #f5f7fb;
}

.audit-log-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h1 {
    margin: 4px 0 0;
    font-size: 24px;
    font-weight: 600;
    line-height: 32px;
  }
}

.audit-log-page__breadcrumb {
  margin: 0;
  color: #86909c;
  font-size: 13px;
  line-height: 20px;
}

.audit-log-page__total {
  color: #4e5969;
  font-size: 14px;
}

.audit-log-page__filters {
  display: grid;
  grid-template-columns: repeat(6, minmax(132px, 1fr)) auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
}

.audit-log-page__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  span {
    color: #4e5969;
    font-size: 13px;
    line-height: 18px;
  }

  input,
  select {
    width: 100%;
    height: 34px;
    padding: 0 10px;
    color: #1d2129;
    border: 1px solid #c9cdd4;
    border-radius: 4px;
    outline: none;
    background: #fff;
  }

  input:focus,
  select:focus {
    border-color: #165dff;
    box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.12);
  }
}

.audit-log-page__actions {
  display: flex;
  gap: 8px;
}

.audit-log-page__button {
  min-width: 64px;
  height: 34px;
  padding: 0 14px;
  color: #1d2129;
  border: 1px solid #c9cdd4;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.audit-log-page__button--primary {
  color: #fff;
  border-color: #165dff;
  background: #165dff;
}

.audit-log-page__table-wrap {
  overflow-x: auto;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
}

.audit-log-page__table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 12px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid #f2f3f5;
  }

  th {
    color: #4e5969;
    font-weight: 600;
    background: #f7f8fa;
  }

  strong {
    display: block;
    font-weight: 600;
  }

  span {
    display: inline-block;
    margin-top: 2px;
    color: #86909c;
  }

  pre {
    max-width: 260px;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: #4e5969;
    font-family: inherit;
  }
}

.audit-log-page__badge,
.audit-log-page__result {
  min-width: 72px;
  padding: 2px 8px;
  text-align: center;
  border-radius: 4px;
  background: #f2f3f5;
}

.audit-log-page__result--success {
  color: #00a870 !important;
  background: #e8ffea;
}

.audit-log-page__result--failure {
  color: #f53f3f !important;
  background: #ffece8;
}

.audit-log-page__empty {
  height: 120px;
  color: #86909c;
  text-align: center !important;
  vertical-align: middle !important;
}

@media (max-width: 1200px) {
  .audit-log-page__filters {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
  }
}

@media (max-width: 640px) {
  .audit-log-page {
    padding: 16px;
  }

  .audit-log-page__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .audit-log-page__filters {
    grid-template-columns: 1fr;
  }
}
</style>
