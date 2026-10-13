<template>
  <section
    v-if="editorOpen"
    class="reporting-panel"
    data-testid="report-schedule-editor"
  >
    <h2>{{ selected ? '编辑固定定时规则' : '新增真实定时规则' }}</h2>
    <p v-if="!canEdit" role="alert">当前没有编辑此规则的授权，原输入已保留。</p>
    <form class="reporting-form" @submit.prevent="save">
      <fieldset
        :disabled="busy || detailLoading || !canEdit"
        class="reporting-form"
      >
        <legend>保存为不可变规则版本</legend>
        <label>
          规则名称
          <input
            v-model="draft.name"
            required
            maxlength="100"
            data-testid="report-schedule-name"
          />
        </label>
        <label>
          查找固定报表发布版本
          <input
            v-model="reportKeyword"
            type="search"
            maxlength="100"
            data-testid="report-schedule-report-keyword"
            @keydown.enter.prevent="searchReports"
          />
        </label>
        <div class="reporting-actions">
          <button
            type="button"
            :disabled="directoryLoading"
            data-testid="report-schedule-report-search"
            @click="searchReports"
          >
            查询发布库
          </button>
          <button
            type="button"
            :disabled="directoryLoading || reportPage === 1"
            @click="changeReportPage(-1)"
          >
            上一页报表
          </button>
          <span>第 {{ reportPage }} 页 / 共 {{ reportTotal }} 个发布版本</span>
          <button
            type="button"
            :disabled="directoryLoading || reportPage * 20 >= reportTotal"
            @click="changeReportPage(1)"
          >
            下一页报表
          </button>
        </div>
        <label>
          固定报表发布版本
          <select
            :value="draft.definitionVersionId"
            required
            :disabled="directoryLoading"
            data-testid="report-schedule-report"
            @change="chooseReport(($event.target as HTMLSelectElement).value)"
          >
            <option value="">请选择已启用发布版本</option>
            <option
              v-if="draft.definitionVersionId && !chosenReport"
              :value="draft.definitionVersionId"
            >
              已保存的固定版本（当前目录之外或不可用）
            </option>
            <option
              v-for="report in reports"
              :key="report.id"
              :value="report.id"
            >
              {{ report.schema.name }} · 报表 v{{ report.version }} / 来源 v{{
                report.sourceReleaseVersion
              }}
            </option>
          </select>
        </label>
        <p v-if="chosenReport" class="reporting-muted reporting-copy">
          固定报表 {{ chosenReport.id }}；来源
          {{ chosenReport.sourceReleaseId }}。执行不自动跟随新版。
        </p>
        <label>
          业务时区（跟随固定报表版本）
          <input
            :value="draft.timeZone"
            readonly
            data-testid="report-schedule-time-zone"
          />
        </label>
        <label>
          执行周期
          <select
            v-model="draft.frequency"
            data-testid="report-schedule-frequency"
          >
            <option value="daily">每日</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
        </label>
        <label v-if="draft.frequency === 'weekly'">
          ISO 周几
          <select
            v-model.number="draft.weekday"
            data-testid="report-schedule-weekday"
          >
            <option
              v-for="(day, index) in weekdays"
              :key="day"
              :value="index + 1"
            >
              {{ day }}
            </option>
          </select>
        </label>
        <label v-if="draft.frequency === 'monthly'">
          每月日期
          <input
            v-model.number="draft.dayOfMonth"
            type="number"
            min="1"
            max="31"
            required
            data-testid="report-schedule-day"
          />
        </label>
        <label>
          本地执行时间（HH:mm）
          <input
            v-model="draft.time"
            type="time"
            step="60"
            required
            data-testid="report-schedule-time"
          />
        </label>
        <label>
          自然数据窗
          <select
            v-model="draft.dataWindow"
            data-testid="report-schedule-window"
          >
            <option value="previous-period">上一完整自然周期</option>
            <option value="current-period">当前自然周期至计划日</option>
          </select>
        </label>
        <label>
          真实收件范围
          <select
            v-model="draft.recipientKind"
            data-testid="report-schedule-recipient-kind"
          >
            <option value="tenant">当前租户内授权成员</option>
            <option value="role">真实角色</option>
            <option value="department">真实部门</option>
          </select>
        </label>
        <label v-if="draft.recipientKind === 'role'">
          接收角色
          <select
            v-model="draft.roleId"
            required
            data-testid="report-schedule-role"
          >
            <option value="">请选择真实角色</option>
            <option
              v-if="
                draft.roleId &&
                !options?.roles.some((role) => role.id === draft.roleId)
              "
              :value="draft.roleId"
            >
              原角色当前不在授权目录
            </option>
            <option
              v-for="role in options?.roles || []"
              :key="role.id"
              :value="role.id"
            >
              {{ role.name }} · 当前候选 {{ role.eligibleRecipientCount }} 人
            </option>
          </select>
        </label>
        <label v-if="draft.recipientKind === 'department'">
          接收部门
          <select
            v-model="draft.departmentId"
            required
            data-testid="report-schedule-department"
          >
            <option value="">请选择真实部门</option>
            <option
              v-if="
                draft.departmentId &&
                !options?.departments.some(
                  (department) => department.id === draft.departmentId
                )
              "
              :value="draft.departmentId"
            >
              原部门当前不在授权目录
            </option>
            <option
              v-for="department in options?.departments || []"
              :key="department.id"
              :value="department.id"
            >
              {{ department.name }} · 当前候选
              {{ department.eligibleRecipientCount }} 人
            </option>
          </select>
        </label>
        <label>
          文件格式
          <select
            v-model="draft.format"
            :disabled="directoryLoading"
            data-testid="report-schedule-format"
          >
            <option
              v-for="capability in capabilities"
              :key="capability.format"
              :value="capability.format"
              :disabled="!capability.available"
            >
              {{ capability.format.toUpperCase()
              }}{{ capability.available ? '' : '（不可用）' }}
            </option>
          </select>
        </label>
        <p v-if="chosenFormat?.reason" role="status">
          {{ chosenFormat.reason }}
        </p>
        <label v-if="!selected" class="reporting-check">
          <input
            v-model="enabledOnCreate"
            type="checkbox"
            data-testid="report-schedule-enable-create"
          />
          保存后启用（从严格下一有效时段开始）
        </label>
      </fieldset>
      <div class="reporting-actions">
        <button
          type="button"
          :disabled="busy || previewing || !canEdit || directoryLoading"
          data-testid="report-schedule-preview"
          @click="previewSchedule"
        >
          {{ previewing ? '正在读取服务器预览…' : '预览真实下次时间和收件人' }}
        </button>
        <button
          v-if="canEdit"
          type="submit"
          :disabled="
            busy ||
            directoryLoading ||
            !chosenFormat?.available ||
            (!!selected && !dirty)
          "
          class="reporting-primary"
          data-testid="report-schedule-save"
        >
          {{ busy ? '正在保存服务器规则…' : '保存真实规则' }}
        </button>
      </div>
    </form>
    <section
      v-if="preview"
      class="reporting-record"
      data-testid="report-schedule-preview-result"
      aria-live="polite"
    >
      <h3>服务器实际预览</h3>
      <p>
        下次有效时段 {{ preview.nextRunAt }}（{{ preview.timeZone }}）；数据窗
        {{ preview.dateRange.from }} 至 {{ preview.dateRange.to }}。
      </p>
      <p>
        当前符合资格 {{ preview.recipientTotal }} 人，未准入
        {{ preview.unavailableRecipientCount }} 人；最多
        {{ preview.maxRecipients }} 人。
      </p>
      <ul>
        <li v-for="recipient in preview.recipients" :key="recipient.userId">
          {{ recipient.name || '姓名当前不可见' }} · {{ recipient.userId }}
        </li>
      </ul>
      <p class="reporting-muted">
        此预览不产生运行或文件；到期按原主体和收件人双方当前资格重新核对。
      </p>
    </section>
    <section
      v-if="selected"
      class="reporting-record"
      data-testid="report-schedule-versions"
    >
      <h3>已保存规则和版本</h3>
      <p>
        规则 {{ selected.id }} · 当前 v{{ selected.version }} · 修订
        {{ selected.revision }} · {{ selected.enabled ? '已启用' : '已停用' }} ·
        当前规则版本 {{ selected.activeVersionId }}
      </p>
      <p>
        服务器下次运行
        {{ selected.nextRunAt || '无开放启用区间' }}；上次实际计划
        {{ selected.lastRunAt || '尚无运行事实' }}。
      </p>
      <ol>
        <li
          v-for="version in selected.versions || []"
          :key="version.id"
          class="reporting-copy"
        >
          v{{ version.version }} · {{ version.createdAt }} · {{ version.id }} ·
          {{ version.schema.name }} · 固定报表
          {{ version.schema.definitionVersionId }} ·
          {{ version.schema.timing.timeZone }} {{ version.schema.timing.time }}
        </li>
      </ol>
      <button
        v-if="canToggle(selected)"
        type="button"
        :disabled="busy || dirty"
        data-testid="report-schedule-toggle"
        @click="toggleSelected"
      >
        {{ selected.enabled ? '停用后续时段' : '启用下一有效时段' }}
      </button>
    </section>
  </section>
</template>
<script setup lang="ts">
import type { ReportScheduleState } from './use-report-schedule-state'

const props = defineProps<{ state: ReportScheduleState }>()
// The parent retains this composable container; each binding is a ref or method.
// eslint-disable-next-line vue/no-setup-props-destructure
const bindings = props.state
const {
  editorOpen,
  selected,
  draft,
  enabledOnCreate,
  dirty,
  reportKeyword,
  reports,
  reportPage,
  reportTotal,
  options,
  capabilities,
  preview,
  busy,
  detailLoading,
  directoryLoading,
  previewing,
  canEdit,
  chosenReport,
  chosenFormat,
  canToggle,
  chooseReport,
  previewSchedule,
  save,
  toggle,
  searchReports,
  changeReportPage,
} = bindings
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const toggleSelected = () => {
  if (selected.value) toggle(selected.value)
}
</script>
