<template>
  <section
    v-if="allowed(P.runRead)"
    class="reporting-panel"
    data-testid="report-schedule-runs"
  >
    <h2>实际计划时段和收件处理</h2>
    <p class="reporting-muted">
      运行完成仅代表真实文件已完成生成、扫描与通知。排队、等待文件、部分失败均保留实际状态；本页不展示业务记录或业务条数。
    </p>
    <form class="reporting-form" @submit.prevent="searchRuns">
      <label>
        规则编号
        <input
          v-model="runScheduleId"
          maxlength="100"
          data-testid="report-schedule-run-filter"
        />
      </label>
      <label>
        实际运行状态
        <select v-model="runStatus" data-testid="report-schedule-run-status">
          <option value="">全部状态</option>
          <option
            v-for="(label, status) in statusLabels"
            :key="status"
            :value="status"
          >
            {{ label }}
          </option>
        </select>
      </label>
      <div class="reporting-actions">
        <button
          type="submit"
          :disabled="runLoading || busy"
          data-testid="report-schedule-run-search"
        >
          读取运行事实
        </button>
        <button
          type="button"
          :disabled="runLoading || busy"
          data-testid="report-schedule-run-refresh"
          @click="loadRuns()"
        >
          刷新运行
        </button>
      </div>
    </form>
    <p v-if="runLoading" role="status">正在读取服务器运行…</p>
    <p v-else-if="!runs.length">
      当前筛选下没有已到期运行。保存规则或预览不代表已执行。
    </p>
    <ul class="reporting-list">
      <li
        v-for="run in runs"
        :key="run.id"
        :data-testid="`report-schedule-run-${run.id}`"
      >
        <button
          type="button"
          :disabled="busy"
          :data-testid="`report-schedule-run-inspect-${run.id}`"
          @click="inspectRun(run.id)"
        >
          {{ statusLabels[run.status] }} · 计划 {{ run.slotAt }} · 规则 v{{
            run.ruleVersion
          }}
        </button>
        <p class="reporting-muted reporting-copy">
          运行 {{ run.id }} · 启用区间 {{ run.periodId }} · 不可变规则
          {{ run.ruleVersionId }}
        </p>
        <p>
          收件 {{ run.recipientTotal }} 人：完成
          {{ run.completedRecipients }}，失败
          {{ run.failedRecipients }}，授权阻止 {{ run.blockedRecipients }}，跳过
          {{ run.skippedRecipients }}，取消 {{ run.cancelledRecipients }}。
        </p>
        <p class="reporting-muted">
          实际尝试 {{ run.attempts }} 次；下一重试 {{ run.nextAttemptAt }}；租约
          {{ run.leaseUntil || '无有效租约' }}。
        </p>
        <p v-if="run.errorCode" role="alert">
          {{ run.errorCode }}：{{ run.errorMessage }}
        </p>
        <div class="reporting-actions">
          <button
            v-if="canRunAction(run, 'retry')"
            type="button"
            :disabled="busy"
            :data-testid="`report-schedule-run-retry-${run.id}`"
            @click="commandRun(run, 'retry')"
          >
            按原收件身份重试
          </button>
          <button
            v-if="canRunAction(run, 'cancel')"
            type="button"
            :disabled="busy"
            :data-testid="`report-schedule-run-cancel-${run.id}`"
            @click="commandRun(run, 'cancel')"
          >
            取消未完成收件处理
          </button>
        </div>
      </li>
    </ul>
    <nav
      class="reporting-actions reporting-pagination"
      aria-label="定时报表运行分页"
    >
      <button
        type="button"
        :disabled="runLoading || runPage === 1"
        @click="changeRunPage(-1)"
      >
        上一页运行
      </button>
      <span>第 {{ runPage }} 页 / 共 {{ runTotal }} 项</span>
      <button
        type="button"
        :disabled="runLoading || runPage * 20 >= runTotal"
        @click="changeRunPage(1)"
      >
        下一页运行
      </button>
    </nav>
    <section
      v-if="selectedRun"
      class="reporting-record"
      data-testid="report-schedule-run-detail"
    >
      <h3>固定运行 {{ selectedRun.id }}</h3>
      <p class="reporting-copy">
        启用区间 {{ selectedRun.periodId }} · 计划时段
        {{ selectedRun.slotAt }} · 修订 {{ selectedRun.revision }}。
      </p>
      <p v-if="selectedRun.query">
        本次自然窗 {{ selectedRun.query.dateRange.from }} 至
        {{ selectedRun.query.dateRange.to }}（{{
          selectedRun.query.timeZone
        }}）。补跑使用实际执行时的数据截止，未伪造历史快照。
      </p>
      <p v-else>本次查询范围当前不可见。</p>
      <ul class="reporting-list">
        <li
          v-for="recipient in selectedRun.recipients || []"
          :key="recipient.id"
          :data-testid="`report-schedule-recipient-${recipient.id}`"
        >
          <strong>{{ recipient.name || '姓名当前不可见' }}</strong>
          · {{ recipient.userId }} · {{ recipientLabels[recipient.status] }} ·
          尝试 {{ recipient.attempts }} 次
          <p v-if="recipient.errorCode" role="alert">
            {{ recipient.errorCode }}：{{ recipient.errorMessage }}
          </p>
          <p>实际通知 {{ recipient.notifiedAt || '尚未产生通知事实' }}。</p>
          <router-link
            v-if="recipient.exportJobId && allowed(EP.list)"
            :to="{
              path: '/visualization/reportCenter',
              query: { exportJobId: recipient.exportJobId },
            }"
            :data-testid="`report-schedule-export-${recipient.id}`"
          >
            查看当前授权导出文件
          </router-link>
        </li>
      </ul>
    </section>
  </section>
</template>
<script setup lang="ts">
import { REPORT_EXPORT_PERMISSIONS as EP } from '@af-admin/contracts'
import type { ReportScheduleState } from './use-report-schedule-state'

const props = defineProps<{ state: ReportScheduleState }>()
// The parent retains this composable container; each binding is a ref or method.
// eslint-disable-next-line vue/no-setup-props-destructure
const bindings = props.state
const {
  P,
  runs,
  selectedRun,
  runPage,
  runTotal,
  runScheduleId,
  runStatus,
  runLoading,
  busy,
  allowed,
  canRunAction,
  loadRuns,
  inspectRun,
  commandRun,
  searchRuns,
  changeRunPage,
} = bindings
const statusLabels = {
  'queued': '已排队',
  'processing': '处理中',
  'waiting-exports': '等待实际导出',
  'completed': '已完成文件与通知',
  'partial-failed': '部分收件失败',
  'failed': '失败',
  'blocked': '授权或来源阻止',
  'cancelled': '已取消',
}
const recipientLabels = {
  'queued': '已排队',
  'processing': '处理中',
  'waiting-export': '等待实际文件',
  'completed': '文件与通知完成',
  'failed': '失败',
  'blocked': '授权阻止',
  'skipped': '已跳过',
  'cancelled': '已取消',
}
</script>
