<template>
  <main class="reporting-page" data-testid="real-report-schedules">
    <header>
      <h1>真实定时报表</h1>
      <div class="reporting-actions">
        <button
          v-if="allowed(P.create) && canAuthor"
          type="button"
          :disabled="busy || detailLoading"
          data-testid="report-schedule-new"
          @click="newSchedule"
        >
          新增定时规则
        </button>
        <button
          type="button"
          :disabled="busy || loading || runLoading"
          data-testid="report-schedule-reload"
          @click="reload"
        >
          重新读取服务器
        </button>
      </div>
    </header>
    <p class="reporting-muted">
      按固定发布版本和启用区间处理真实日报、周报、月报，文件逐收件人核对双方当前授权。当前提供站内通知；外部邮件尚不可用。
    </p>
    <p v-if="error" role="alert" data-testid="report-schedule-error">
      {{ error }}
    </p>
    <p v-if="notice" role="status" data-testid="report-schedule-notice">
      {{ notice }}
    </p>
    <details class="reporting-panel">
      <summary>查看日历、数据窗与启停规则</summary>
      <p>
        周按 ISO 周一至周日；月选 1–31
        日，不存在的日期跳过该月。夏令时不存在的本地时间跳过当天；重复时间只执行第一次，不重复产生同一计划。
      </p>
      <p>
        上一自然周期：前一天、上一周或上个月；当前周期：计划当日、所在周一至计划日、月初至计划日。日期按固定报表时区，补跑在实际执行时查询，不能声称恢复过去的数据快照。
      </p>
      <p>
        启用从服务器当前时刻严格下一个有效时段开始。编辑或停用关闭旧启用区间；停用前已到期的计划仍会处理，已生成运行和导出不会自动取消，需要显式取消未完成任务。
      </p>
    </details>
    <section v-if="allowed(P.list)" class="reporting-panel">
      <h2>当前授权定时规则</h2>
      <form class="reporting-form" @submit.prevent="searchSchedules">
        <label>
          规则名称
          <input
            v-model="scheduleKeyword"
            maxlength="100"
            data-testid="report-schedule-keyword"
          />
        </label>
        <label>
          启用状态
          <select v-model="scheduleStatus" data-testid="report-schedule-status">
            <option value="">全部状态</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已停用</option>
          </select>
        </label>
        <label>
          周期
          <select
            v-model="scheduleFrequency"
            data-testid="report-schedule-frequency-filter"
          >
            <option value="">全部周期</option>
            <option value="daily">每日</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
        </label>
        <button
          type="submit"
          :disabled="loading || busy"
          data-testid="report-schedule-search"
        >
          查询已保存规则
        </button>
      </form>
      <p v-if="loading" role="status">正在读取服务器规则…</p>
      <p v-else-if="!schedules.length">当前没有可管理的已保存规则。</p>
      <ul class="reporting-list">
        <li
          v-for="schedule in schedules"
          :key="schedule.id"
          :data-testid="`report-schedule-${schedule.id}`"
        >
          <button
            type="button"
            :disabled="busy || detailLoading"
            :data-testid="`report-schedule-edit-${schedule.id}`"
            @click="edit(schedule.id)"
          >
            {{ schedule.schema.name }} ·
            {{ frequencyLabels[schedule.schema.timing.frequency] }} ·
            {{ schedule.enabled ? '已启用' : '已停用' }}
          </button>
          <p class="reporting-muted reporting-copy">
            规则 v{{ schedule.version }} · 修订 {{ schedule.revision }} ·
            固定报表 {{ schedule.schema.definitionVersionId }} ·
            {{ schedule.schema.timing.timeZone }}
            {{ schedule.schema.timing.time }} · 下次
            {{ schedule.nextRunAt || '无开放启用区间' }}
          </p>
        </li>
      </ul>
      <nav
        class="reporting-actions reporting-pagination"
        aria-label="定时规则分页"
      >
        <button
          type="button"
          :disabled="loading || schedulePage === 1"
          @click="changeSchedulePage(-1)"
        >
          上一页规则
        </button>
        <span>第 {{ schedulePage }} 页 / 共 {{ scheduleTotal }} 项</span>
        <button
          type="button"
          :disabled="loading || schedulePage * 20 >= scheduleTotal"
          @click="changeSchedulePage(1)"
        >
          下一页规则
        </button>
      </nav>
    </section>
    <ScheduleEditor :state="state" />
    <ScheduleRuns :state="state" />
    <p v-if="![P.list, P.create, P.runRead].some(allowed)" role="alert">
      当前没有定时规则或运行查看权限。
    </p>
  </main>
</template>
<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import ScheduleEditor from './schedule-editor.vue'
import ScheduleRuns from './schedule-runs.vue'
import { useReportScheduleState } from './use-report-schedule-state'
import './reporting.css'

const state = useReportScheduleState()
const {
  P,
  user,
  schedules,
  schedulePage,
  scheduleTotal,
  scheduleKeyword,
  scheduleStatus,
  scheduleFrequency,
  loading,
  runLoading,
  busy,
  detailLoading,
  error,
  notice,
  allowed,
  canAuthor,
  reload,
  newSchedule,
  edit,
  searchSchedules,
  changeSchedulePage,
} = state
const route = useRoute()
watch(
  () => [
    route?.query.runId,
    user.id,
    user.tenantId,
    user.availablePermissions.join('|'),
  ],
  () => {
    state.clearRunSelection()
    const runId = route?.query.runId
    if (
      typeof runId === 'string' &&
      runId.trim() &&
      runId.length <= 100 &&
      allowed(P.runRead)
    )
      state.inspectRun(runId)
  },
  { immediate: true, flush: 'sync' }
)
const frequencyLabels = { daily: '每日', weekly: '每周', monthly: '每月' }
</script>
