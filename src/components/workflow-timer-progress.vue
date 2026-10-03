<template>
  <section
    v-if="timers.length"
    class="timer-progress"
    data-testid="workflow-timer-progress"
  >
    <h2>流程定时</h2>
    <p>计划时间按北京时间显示；期限提醒保留原审批规则。</p>
    <button type="button" @click="$emit('refresh')">刷新定时状态</button>
    <ul>
      <li v-for="timer in timers" :key="timer.id" :data-timer-id="timer.id">
        {{ nodeName(timer.nodeId) }} ·
        {{ timer.kind === 'resume' ? '等待唤起' : '审批期限' }} ·
        {{ labels[timer.status] }}
        <p>计划时间：{{ time(timer.dueAt) }}</p>
        <p v-if="timer.completedAt">执行时间：{{ time(timer.completedAt) }}</p>
        <p v-if="timer.status === 'blocked' || timer.status === 'failed'">
          执行未完成，请联系有恢复权限的管理员。
        </p>
      </li>
    </ul>
  </section>
</template>
<script setup lang="ts">
import type { WorkflowTimer, WorkflowNode } from '@af-admin/contracts'

const props = defineProps<{ timers: WorkflowTimer[]; nodes: WorkflowNode[] }>()
defineEmits<{ (event: 'refresh'): void }>()
const labels: Record<WorkflowTimer['status'], string> = {
  pending: '等待执行',
  processing: '执行中',
  completed: '已执行',
  cancelled: '已取消',
  blocked: '待恢复',
  failed: '执行失败',
}
const nodeName = (id: string) =>
  props.nodes.find((node) => node.id === id)?.name || '流程节点'
const time = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
</script>
<style scoped>
.timer-progress {
  padding: 16px;
  margin: 16px 0;
  border: 1px solid var(--color-border-2);
  border-radius: 6px;
}
li {
  margin: 12px 0;
}
button {
  padding: 8px;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
  color: var(--color-text-1);
  border-radius: 4px;
}
</style>
