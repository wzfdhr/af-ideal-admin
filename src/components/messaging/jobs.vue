<template>
  <section
    v-if="allowed(P.sendList)"
    class="messaging-panel"
    aria-label="服务器发送任务"
  >
    <div class="messaging-actions">
      <h2>发送任务与实际投递记录</h2>
      <button
        type="button"
        :disabled="loading || busy"
        data-testid="messaging-jobs-refresh"
        @click="load"
      >
        刷新任务
      </button>
    </div>
    <p class="messaging-muted">
      创建任务只代表已入队。站内消息写入、跳过、失败和实时确认均按服务器持久记录显示；实时确认不代表用户已阅读。
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">正在读取任务…</p>
    <p v-if="!loading && !jobs.length && !error">暂无发送任务</p>
    <ul class="messaging-list">
      <li
        v-for="job in jobs"
        :key="job.id"
        :class="{ 'messaging-selected': detail?.id === job.id }"
      >
        <button
          type="button"
          :disabled="busy"
          :data-testid="`messaging-job-${job.id}`"
          @click="open(job.id)"
        >
          {{ job.title }} · {{ jobLabels[job.status] }} · {{ job.id }}
        </button>
        <p class="messaging-muted">
          计划 {{ job.scheduledAt }} · 来源快照 {{ job.sourceVersionId }} ·
          站内写入 {{ job.counts.sent }} · 失败 {{ job.counts.failed }} · 跳过
          {{ job.counts.skipped }}
        </p>
      </li>
    </ul>
    <nav
      class="messaging-actions messaging-pagination"
      aria-label="发送任务分页"
    >
      <button
        type="button"
        :disabled="page === 1 || loading"
        @click="changePage(-1)"
      >
        上一页
      </button>
      <span>第 {{ page }} 页 / 共 {{ total }} 项</span>
      <button
        type="button"
        :disabled="page * 20 >= total || loading"
        @click="changePage(1)"
      >
        下一页
      </button>
    </nav>
    <article
      v-if="detail"
      class="messaging-record"
      data-testid="messaging-job-detail"
    >
      <h3>{{ detail.title }} · {{ jobLabels[detail.status] }}</h3>
      <p>{{ detail.id }}</p>
      <p class="messaging-copy">{{ detail.content }}</p>
      <p>
        实际收件记录 {{ detail.recipients?.length || 0 }} 条 · 待处理
        {{ detail.counts.pending }} · 处理中 {{ detail.counts.processing }} ·
        站内已写入 {{ detail.counts.sent }} · 失败 {{ detail.counts.failed }} ·
        阻止 {{ detail.counts.blocked }} · 跳过 {{ detail.counts.skipped }} ·
        取消 {{ detail.counts.cancelled }}
      </p>
      <p>
        实时 ACK {{ detail.counts.realtimeAcknowledged }} · 计划
        {{ detail.scheduledAt }}
      </p>
      <div class="messaging-actions">
        <button type="button" :disabled="busy" @click="refreshDetail">
          重新读取投递事实
        </button>
        <button
          v-if="
            allowed(P.sendCancel) &&
            ['queued', 'running', 'blocked'].includes(detail.status)
          "
          type="button"
          :disabled="busy"
          data-testid="messaging-job-cancel"
          @click="cancel"
        >
          取消尚未投递的记录
        </button>
        <button
          v-if="
            allowed(P.sendRetry) &&
            ['failed', 'partial', 'blocked'].includes(detail.status)
          "
          type="button"
          :disabled="busy"
          data-testid="messaging-job-retry"
          @click="retry"
        >
          重试可恢复记录
        </button>
      </div>
      <div class="messaging-scroll">
        <table>
          <thead>
            <tr>
              <th>成员身份</th>
              <th>实际状态</th>
              <th>尝试与时间</th>
              <th>服务器原因</th>
              <th>实时状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="recipient in detail.recipients" :key="recipient.id">
              <td>{{ recipient.userId }}</td>
              <td>
                {{ recipientLabels[recipient.status] }}
                <small v-if="recipient.notificationId">
                  · 站内消息 {{ recipient.notificationId }}
                </small>
              </td>
              <td>
                {{ recipient.attempts }} 次 ·
                {{ recipient.completedAt || recipient.nextAttemptAt }}
              </td>
              <td>
                {{ recipient.errorCode || '—' }} {{ recipient.errorMessage }}
              </td>
              <td>
                {{ realtimeLabels[recipient.realtimeStatus] }}
                {{ recipient.realtimeAckAt }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  cancelMessagingJob,
  fetchMessagingJobs,
  getMessagingJob,
  retryMessagingJob,
} from '@/api/messaging'
import { errorMessage } from '@/views/leave/shared'
import { MESSAGING_PERMISSIONS as P } from '@af-admin/contracts'
import { useMessagingContext } from './use-messaging-context'
import type { MessageSendJobRecord } from '@af-admin/contracts'

const props = defineProps<{ newJob?: MessageSendJobRecord }>()
const jobs = ref<MessageSendJobRecord[]>([])
const detail = ref<MessageSendJobRecord>()
const total = ref(0)
const page = ref(1)
const loading = ref(false)
let sequence = 0
let detailSequence = 0
const { error, notice, busy, allowed, command, ticket } = useMessagingContext(
  () => false,
  () => {
    jobs.value = []
    loading.value = false
    detail.value = undefined
    page.value = 1
    total.value = 0
    load()
  }
)
const jobLabels = {
  queued: '排队中',
  running: '处理中',
  sent: '站内消息写入完成',
  partial: '部分完成',
  failed: '失败',
  blocked: '已阻止',
  cancelled: '已取消',
}
const recipientLabels = {
  pending: '待处理',
  processing: '处理中',
  sent: '站内已写入',
  skipped: '已跳过',
  failed: '失败',
  blocked: '已阻止',
  cancelled: '已取消',
}
const realtimeLabels = {
  off: '未启用',
  queued: '待实时确认',
  acknowledged: '已收到客户端 ACK',
}
async function load() {
  if (!allowed(P.sendList)) return
  const current = ticket()
  const seq = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await fetchMessagingJobs({
      current: page.value,
      pageSize: 20,
    })
    if (current() && seq === sequence) {
      jobs.value = result.list
      total.value = result.total
    }
  } catch (failure) {
    if (current() && seq === sequence) error.value = errorMessage(failure)
  } finally {
    if (current() && seq === sequence) loading.value = false
  }
}
const open = async (id: string) => {
  if (busy.value) return
  const current = ticket()
  const seq = ++detailSequence
  error.value = ''
  try {
    const result = await getMessagingJob(id)
    if (current() && seq === detailSequence) detail.value = result
  } catch (failure) {
    if (current() && seq === detailSequence) error.value = errorMessage(failure)
  }
}
const refreshDetail = () => {
  if (detail.value) open(detail.value.id)
}
const changePage = (delta: number) => {
  page.value += delta
  load()
}
const cancel = () => {
  const job = detail.value
  if (!job || !allowed(P.sendCancel)) return
  command(
    `cancel:${job.id}`,
    { expectedRevision: job.revision },
    (key) => cancelMessagingJob(job, key),
    async (result) => {
      if (detail.value?.id === job.id) detail.value = result
      notice.value = '服务器已记录取消结果，已写入的站内消息保留'
      await load()
    },
    '确认取消尚未投递的收件记录？已经写入的站内消息保留。'
  )
}
const retry = () => {
  const job = detail.value
  if (!job || !allowed(P.sendRetry)) return
  command(
    `retry:${job.id}`,
    { expectedRevision: job.revision },
    (key) => retryMessagingJob(job, key),
    async (result) => {
      if (detail.value?.id === job.id) detail.value = result
      notice.value = '服务器已记录重试任务，请刷新查看实际结果'
      await load()
    },
    '确认重试服务器允许恢复的投递记录？'
  )
}
watch(
  () => props.newJob,
  (job) => {
    if (job) {
      detail.value = job
      load()
      open(job.id)
    }
  }
)
onMounted(load)
</script>
