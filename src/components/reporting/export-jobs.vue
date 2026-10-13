<template>
  <section
    class="reporting-panel"
    aria-label="真实文件导出任务"
    data-testid="reporting-export-jobs"
  >
    <h2>真实导出任务与文件</h2>
    <p class="reporting-muted">
      文件通过真实内容扫描后可下载。普通文件保留 7 天，归档文件保留 365
      天；到期会删除文件字节并保留任务记录。日、周、月计划可在定时报表配置；批量创建尚未接通。
    </p>
    <p v-if="!allowed(P.list)" role="alert">当前账户没有导出任务查看权限。</p>
    <template v-else>
      <form class="reporting-form" @submit.prevent="search">
        <label>
          报表或任务名称
          <input
            v-model="keyword"
            maxlength="100"
            data-testid="reporting-export-keyword"
          />
        </label>
        <div class="reporting-actions">
          <label>
            任务状态
            <select v-model="status" data-testid="reporting-export-status">
              <option value="">全部状态</option>
              <option
                v-for="(label, key) in statusLabels"
                :key="key"
                :value="key"
              >
                {{ label }}
              </option>
            </select>
          </label>
          <label>
            归档范围
            <select v-model="archived" data-testid="reporting-export-archived">
              <option value="active">未归档</option>
              <option value="archived">已归档</option>
              <option value="all">全部</option>
            </select>
          </label>
          <button
            type="submit"
            :disabled="loading || busy"
            data-testid="reporting-export-search"
          >
            查询任务
          </button>
          <button
            type="button"
            :disabled="loading || busy"
            data-testid="reporting-export-refresh"
            @click="load()"
          >
            重新读取任务
          </button>
        </div>
      </form>
      <p v-if="loading" role="status">正在读取服务器任务状态…</p>
      <p v-if="!loading && !jobs.length && !error">当前筛选下没有导出任务。</p>
      <ul class="reporting-list">
        <li
          v-for="job in jobs"
          :key="job.id"
          :data-testid="`reporting-export-job-${job.id}`"
        >
          <button
            type="button"
            :disabled="busy"
            :data-testid="`reporting-export-inspect-${job.id}`"
            @click="inspect(job.id)"
          >
            {{ job.reportName }} · {{ job.format.toUpperCase() }} ·
            {{ statusLabels[job.status] }}
          </button>
          <p class="reporting-muted reporting-copy">
            任务 {{ job.id }} · 固定来源 {{ job.sourceReleaseId }}（v{{
              job.sourceReleaseVersion
            }}）
          </p>
          <p :data-testid="`reporting-export-progress-${job.id}`">
            {{ stageLabels[job.stage] }} ·
            {{
              job.restricted
                ? '当前权限不能读取行数'
                : `${job.processedRows ?? '未知'} / ${
                    job.totalRows ?? '未知'
                  } 条`
            }}
            · 已尝试 {{ job.attempts }} 次
          </p>
          <p v-if="job.restricted" role="status">
            当前授权不足，筛选、文件大小与摘要已隐藏。
          </p>
          <p v-if="job.errorCode" role="alert">
            {{ job.errorCode }}：{{ job.errorMessage }}
          </p>
          <p v-if="job.artifact" class="reporting-muted reporting-copy">
            {{ artifactLabels[job.artifact.status] }} ·
            {{ job.artifact.fileName }} ·
            {{
              job.artifact.size === null
                ? '字节数受限'
                : `${job.artifact.size} 字节`
            }}
            · 扫描引擎 {{ job.artifact.scanEngine }} · 扫描时间
            {{ job.artifact.scannedAt }} · 到期 {{ job.artifact.expiresAt }}
          </p>
          <div class="reporting-actions">
            <button
              v-if="canAction(job, 'cancel')"
              type="button"
              :disabled="busy"
              :data-testid="`reporting-export-cancel-${job.id}`"
              @click="command(job, 'cancel')"
            >
              取消任务
            </button>
            <button
              v-if="canAction(job, 'retry')"
              type="button"
              :disabled="busy"
              :data-testid="`reporting-export-retry-${job.id}`"
              @click="command(job, 'retry')"
            >
              按原快照重试
            </button>
            <button
              v-if="canAction(job, 'archive')"
              type="button"
              :disabled="busy"
              :data-testid="`reporting-export-archive-${job.id}`"
              @click="command(job, 'archive')"
            >
              归档文件
            </button>
            <button
              v-if="canAction(job, 'unarchive')"
              type="button"
              :disabled="busy"
              :data-testid="`reporting-export-unarchive-${job.id}`"
              @click="command(job, 'unarchive')"
            >
              取消归档
            </button>
            <button
              v-if="canAction(job, 'download')"
              type="button"
              :disabled="busy"
              :data-testid="`reporting-export-download-${job.id}`"
              @click="download(job)"
            >
              {{ busy ? '正在核对服务器状态…' : '下载并校验文件' }}
            </button>
          </div>
        </li>
      </ul>
      <nav
        class="reporting-actions reporting-pagination"
        aria-label="真实导出任务分页"
      >
        <button
          type="button"
          :disabled="loading || busy || currentPage === 1"
          @click="changePage(-1)"
        >
          上一页任务
        </button>
        <span>第 {{ currentPage }} 页 / 共 {{ total }} 项</span>
        <button
          type="button"
          :disabled="loading || busy || currentPage * pageSize >= total"
          @click="changePage(1)"
        >
          下一页任务
        </button>
      </nav>
      <section
        v-if="selected"
        class="reporting-record"
        data-testid="reporting-export-detail"
      >
        <h3>服务器任务详情</h3>
        <dl class="reporting-metadata">
          <div>
            <dt>任务编号 / 修订</dt>
            <dd>{{ selected.id }} / {{ selected.revision }}</dd>
          </div>
          <div>
            <dt>创建时间</dt>
            <dd>{{ selected.createdAt }}</dd>
          </div>
          <div>
            <dt>下次重试时间</dt>
            <dd>{{ selected.nextAttemptAt }}</dd>
          </div>
          <div>
            <dt>处理租约截止</dt>
            <dd>{{ selected.leaseUntil || '无有效租约' }}</dd>
          </div>
          <div>
            <dt>SHA-256</dt>
            <dd data-testid="reporting-export-sha256">
              {{ selected.artifact?.sha256 || '尚未产生或当前授权受限' }}
            </dd>
          </div>
        </dl>
        <p
          v-if="selected.query"
          class="reporting-copy"
          data-testid="reporting-export-fixed-query"
        >
          固定筛选：{{ selected.query.dateRange.from }} 至
          {{ selected.query.dateRange.to }}（{{ selected.query.timeZone }}），
          关键字 {{ selected.query.keyword || '无' }}，状态
          {{
            selected.query.statuses
              .map((item) => recordStatusLabels[item])
              .join('、') || '全部'
          }}。
        </p>
        <p v-else class="reporting-muted">固定筛选当前授权受限。</p>
        <ol v-if="selected.events?.length" aria-label="服务器导出任务事件">
          <li
            v-for="event in selected.events"
            :key="event.id"
            class="reporting-copy"
          >
            {{ event.occurredAt }} · {{ event.action }}
          </li>
        </ol>
      </section>
    </template>
  </section>
</template>
<script setup lang="ts">
import type { ReportExportState } from './use-report-export-state'

const props = defineProps<{ state: ReportExportState }>()
// The parent retains this composable container; each binding is itself a ref.
// eslint-disable-next-line vue/no-setup-props-destructure
const bindings = props.state
const {
  P,
  jobs,
  selected,
  keyword,
  status,
  archived,
  loading,
  busy,
  error,
  currentPage,
  pageSize,
  total,
  allowed,
  canAction,
  load,
  inspect,
  command,
  download,
  search,
  changePage,
} = bindings
const statusLabels = {
  queued: '已排队',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  blocked: '授权或来源阻止',
  cancelled: '已取消',
  infected: '文件已隔离',
}
const stageLabels = {
  queued: '等待处理',
  rendering: '正在生成文件',
  scanning: '正在扫描内容',
  completed: '生成与扫描完成',
  stopped: '处理停止',
}
const artifactLabels = {
  ready: '可用文件',
  quarantined: '已隔离文件',
  expired: '已过期文件',
}
const recordStatusLabels = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
}
</script>
