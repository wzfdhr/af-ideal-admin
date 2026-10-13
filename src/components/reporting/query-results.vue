<template>
  <section
    class="reporting-panel"
    data-testid="real-reporting-results"
    aria-label="服务器报表查询结果"
  >
    <h2>{{ kindLabels[result.kind] }} · 当前授权记录 {{ result.total }} 条</h2>
    <dl class="reporting-metadata">
      <div>
        <dt>固定来源</dt>
        <dd>
          {{ result.source.applicationId }} · 来源发布版
          {{ result.sourceReleaseVersion }}
          <br />
          {{ result.sourceReleaseId }}
        </dd>
      </div>
      <div>
        <dt>范围及口径</dt>
        <dd>
          仅此固定来源发布版的记录；按创建时间 createdAt
          统计记录数量。当前成员当前有权访问的记录。
        </dd>
      </div>
      <div>
        <dt>时区与日期闭区间</dt>
        <dd>
          {{ result.timeZone }} · {{ result.dateRange.from }} 至
          {{ result.dateRange.to }}（首尾日期均包含）
        </dd>
      </div>
      <div>
        <dt>查询及截止时间</dt>
        <dd>
          查询 {{ result.queriedAt }}
          <br />
          数据截止 {{ result.dataCutoffAt }}
        </dd>
      </div>
      <div>
        <dt>报表版本</dt>
        <dd>
          固定配置 {{ result.definitionId }} · 版本
          {{ result.definitionVersion }} · 口径版本 {{ result.policyVersion }}
        </dd>
      </div>
    </dl>
    <p v-if="result.total === 0" data-testid="reporting-result-empty">
      此日期闭区间内没有当前可访问的记录。
    </p>
    <section
      v-if="result.kind === 'trend'"
      data-testid="reporting-result-trend"
    >
      <h3>按日数量趋势</h3>
      <svg
        v-if="result.trend.length"
        class="reporting-chart"
        viewBox="0 0 720 250"
        role="img"
        aria-label="服务端记录数量按日趋势"
      >
        <line x1="30" y1="215" x2="690" y2="215" stroke="#9ca3af" />
        <line x1="30" y1="25" x2="30" y2="215" stroke="#9ca3af" />
        <polyline
          :points="trendPoints"
          fill="none"
          stroke="#165dff"
          stroke-width="3"
        />
        <circle
          v-for="(point, index) in result.trend"
          :key="point.date"
          :cx="trendX(index)"
          :cy="trendY(point.count)"
          r="3"
          fill="#165dff"
        >
          <title>{{ point.date }}：{{ point.count }} 条</title>
        </circle>
        <text x="30" y="240" fill="currentColor" font-size="12">
          {{ result.trend[0].date }}
        </text>
        <text
          x="690"
          y="240"
          text-anchor="end"
          fill="currentColor"
          font-size="12"
        >
          {{ result.trend[result.trend.length - 1].date }}
        </text>
      </svg>
      <details>
        <summary>查看服务端每日数量（{{ result.trend.length }} 天）</summary>
        <div class="reporting-scroll">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>记录数量</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in result.trend" :key="point.date">
                <td>{{ point.date }}</td>
                <td>{{ point.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>
    <section
      v-if="result.kind === 'distribution'"
      data-testid="reporting-result-distribution"
    >
      <h3>真实业务状态分布</h3>
      <ul class="reporting-bars">
        <li v-for="item in result.distribution" :key="item.status">
          <span>{{ statusLabels[item.status] }}</span>
          <div
            class="reporting-bar"
            :aria-label="`${statusLabels[item.status]} ${item.count} 条`"
          >
            <span
              :style="{ width: `${(item.count / distributionMax) * 100}%` }"
            />
          </div>
          <strong>{{ item.count }} 条</strong>
        </li>
      </ul>
    </section>
    <section
      v-if="result.kind === 'detail'"
      data-testid="reporting-result-detail"
    >
      <h3>服务器分页明细</h3>
      <div class="reporting-scroll">
        <table>
          <thead>
            <tr>
              <th v-for="field in result.visibleFields" :key="field.key">
                {{ field.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in result.rows"
              :key="row.id"
              :data-record-id="row.id"
            >
              <td v-for="field in result.visibleFields" :key="field.key">
                {{ cell(row, field) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav
        class="reporting-actions reporting-pagination"
        aria-label="真实报表明细分页"
      >
        <button
          type="button"
          :disabled="busy || result.current <= 1"
          data-testid="reporting-result-previous"
          @click="emit('page', result.current - 1)"
        >
          上一页
        </button>
        <span>
          第 {{ result.current }} 页 · 每页 {{ result.pageSize }} 条 · 共
          {{ result.total }} 条
        </span>
        <button
          type="button"
          :disabled="busy || result.current * result.pageSize >= result.total"
          data-testid="reporting-result-next"
          @click="emit('page', result.current + 1)"
        >
          下一页
        </button>
      </nav>
    </section>
    <details class="reporting-record">
      <summary>当前可见与隐藏字段说明</summary>
      <ul>
        <li v-for="field in result.visibleFields" :key="field.key">
          {{ field.label }} · {{ field.searchable ? '允许搜索' : '不可搜索' }} ·
          {{ field.sortable ? '允许排序' : '不可排序' }}
        </li>
      </ul>
      <p v-if="!result.hiddenFields.length">
        当前选择的登记字段均可见；单条记录中字段受限时会逐格说明。
      </p>
      <ul v-else>
        <li
          v-for="field in result.hiddenFields"
          :key="referenceKey(field.reference)"
        >
          {{
            field.reference.kind === 'field'
              ? '业务字段'
              : metadataLabels[field.reference.id] || '元数据字段'
          }}：{{ hiddenLabels[field.reason] }}
        </li>
      </ul>
      <p class="reporting-muted">
        隐藏字段的数据不会在此展示，也不能加入搜索或排序；空值“未填写”与当前行字段不可见分开标识。
      </p>
    </details>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type {
  ReportingFieldReference,
  ReportingQueryResultV1,
  ReportingVisibleField,
} from '@af-admin/contracts'

const props = defineProps<{ result: ReportingQueryResultV1; busy?: boolean }>()
const emit = defineEmits<{ (event: 'page', current: number): void }>()
const kindLabels = {
  trend: '创建数量趋势',
  distribution: '业务状态分布',
  detail: '业务记录明细',
}
const statusLabels = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
}
const hiddenLabels = {
  'permission-denied': '当前字段权限不足',
  'scope-denied': '当前成员字段范围不足',
  'source-unavailable': '固定来源字段当前不可用',
  'unsupported': '当前字段类型尚不支持',
}
const metadataLabels: Record<string, string> = {
  id: '记录编号',
  status: '业务状态',
  revision: '记录版本',
  applicationReleaseId: '来源发布编号',
  releaseVersion: '来源发布版本',
  applicantId: '申请人编号',
  applicantName: '申请人姓名',
  departmentSnapshot: '申请部门',
  createdAt: '创建时间',
  updatedAt: '更新时间',
}
const referenceKey = (reference: ReportingFieldReference) =>
  `${reference.kind}:${reference.id}`
const trendMax = computed(() =>
  Math.max(1, ...props.result.trend.map((point) => point.count))
)
const trendX = (index: number) =>
  30 +
  (props.result.trend.length > 1
    ? (index * 660) / (props.result.trend.length - 1)
    : 330)
const trendY = (count: number) => 215 - (count / trendMax.value) * 190
const trendPoints = computed(() =>
  props.result.trend
    .map((point, index) => `${trendX(index)},${trendY(point.count)}`)
    .join(' ')
)
const distributionMax = computed(() =>
  Math.max(1, ...props.result.distribution.map((item) => item.count))
)
const cell = (
  row: ReportingQueryResultV1['rows'][number],
  field: ReportingVisibleField
) => {
  if (row.hiddenFieldKeys?.includes(field.key)) return '此记录字段不可见'
  const value = row.values[field.key]
  if (value === null || value === undefined) return '未填写'
  if (field.valueType === 'status' && typeof value === 'string')
    return statusLabels[value as keyof typeof statusLabels] || value
  if (typeof value === 'object') return '字段格式当前不可显示'
  return String(value)
}
</script>
