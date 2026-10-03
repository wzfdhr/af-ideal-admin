<template>
  <section
    class="timer-console"
    data-testid="workflow-timer-console"
    aria-label="流程定时管理"
  >
    <h2>流程定时管理</h2>
    <p>按授权范围查询计划、到期结果和恢复状态；计划时间按北京时间显示。</p>
    <label>
      定时状态
      <select v-model="status" aria-label="定时状态筛选" @change="changeFilter">
        <option value="">全部状态</option>
        <option v-for="(label, key) in labels" :key="key" :value="key">
          {{ label }}
        </option>
      </select>
    </label>
    <button type="button" :disabled="busy" @click="load">刷新定时计划</button>
    <p v-if="busy" role="status">正在读取定时计划…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!busy && !error && !items.length">当前页没有匹配的定时计划。</p>
    <article
      v-for="timer in items"
      :key="`${timer.id}:${timer.revision}`"
      :data-console-timer="timer.id"
    >
      <h3>
        {{ timer.nodeName }} ·
        {{ timer.kind === 'resume' ? '等待唤起' : '期限提醒' }}
      </h3>
      <p>
        {{ labels[timer.status] }} · 计划时间 {{ time(timer.dueAt) }} · 本轮尝试
        {{ timer.attempts }}/5 次
      </p>
      <p v-if="timer.completedAt">实际执行时间 {{ time(timer.completedAt) }}</p>
      <p v-if="timer.status === 'blocked'">
        人员资格或运行条件不可用，需要恢复后执行。
      </p>
      <p v-if="timer.status === 'failed'">
        重试次数已用尽，恢复前请检查对应流程和服务状态。
      </p>
      <WorkflowTimerRecovery
        v-if="canRetry && ['blocked', 'failed'].includes(timer.status)"
        :timer="timer"
        @updated="load"
      />
    </article>
    <nav aria-label="定时计划分页">
      <button
        type="button"
        :disabled="page <= 1 || busy"
        @click="changePage(page - 1)"
      >
        上一页
      </button>
      <span>{{ page }} / {{ Math.max(1, Math.ceil(total / 20)) }}</span>
      <button
        type="button"
        :disabled="page * 20 >= total || busy"
        @click="changePage(page + 1)"
      >
        下一页
      </button>
    </nav>
  </section>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useUserStore } from '@/store'
import { workflowTimers } from '@/api/workflow-timers'
import type { TimerEntry } from '@/api/workflow-timers'
import { errorMessage } from '@/views/leave/shared'
import { hasPermission } from '@af-admin/workflow-core'
import WorkflowTimerRecovery from './workflow-timer-recovery.vue'

const user = useUserStore()
const canRetry = computed(() =>
  hasPermission(user.permissions, 'workflow:timer:retry')
)
const labels: Record<string, string> = {
  pending: '等待执行',
  processing: '执行中',
  completed: '已执行',
  cancelled: '已取消',
  blocked: '待恢复',
  failed: '执行失败',
}
const time = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
const items = ref<TimerEntry[]>([])
const page = ref(1)
const total = ref(0)
const status = ref('')
const busy = ref(false)
const error = ref('')
let ticket = 0
const load = async () => {
  const current = ++ticket
  busy.value = true
  error.value = ''
  items.value = []
  try {
    const result = await workflowTimers(page.value, status.value)
    if (current === ticket) {
      items.value = result.list
      total.value = result.total
    }
  } catch (failure) {
    if (current === ticket) error.value = errorMessage(failure)
  } finally {
    if (current === ticket) busy.value = false
  }
}
const changeFilter = () => {
  page.value = 1
  load()
}
const changePage = (value: number) => {
  page.value = value
  load()
}
watch(
  () => [user.id, user.tenantId],
  () => {
    page.value = 1
    ticket += 1
    load()
  }
)
onMounted(load)
onUnmounted(() => {
  ticket += 1
})
</script>
<style scoped>
.timer-console {
  padding: 20px;
  margin: 20px 0;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
}
article {
  padding: 16px;
  margin: 12px 0;
  border: 1px solid var(--color-border-2);
  border-radius: 6px;
}
label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
button,
select {
  padding: 8px;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
  color: var(--color-text-1);
  border-radius: 4px;
}
nav {
  display: flex;
  align-items: center;
  gap: 12px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
