<template>
  <section
    class="recovery-console"
    aria-label="运行待办检查与恢复"
    data-testid="workflow-recovery-console"
  >
    <h2>运行待办检查与恢复</h2>
    <p>
      按授权范围分页检查当前处理人和实际下一票位；恢复不会跳过审批或修改签署阈值。
    </p>
    <button type="button" :disabled="busy" @click="load">刷新待办检查</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!busy && !items.length">当前页没有可检查的运行待办。</p>
    <article v-for="item in items" :key="item.id" :data-recovery-task="item.id">
      <h3>{{ item.nodeName }} · {{ item.requestId }}</h3>
      <p>
        {{
          item.assigneeUnavailable
            ? '当前分配人已不可审批'
            : '当前分配人可审批'
        }}；下一阻塞票位 {{ item.nextSlots.length }} 个。
      </p>
      <WorkflowAssignmentEditor
        v-if="item.assigneeUnavailable"
        :task-id="item.id"
        :revision="item.revision"
        mode="recover"
        @updated="load"
      />
      <WorkflowAssignmentEditor
        v-for="slot in item.nextSlots"
        :key="`${slot.nodeId}:${slot.originalAssigneeId}`"
        :recovery-slot="slot"
        :task-id="item.id"
        :revision="item.revision"
        mode="recover-next"
        @updated="load"
      />
    </article>
    <nav aria-label="运行待办检查分页">
      <button
        type="button"
        :disabled="page <= 1 || busy"
        @click="change(page - 1)"
      >
        上一页
      </button>
      <span>{{ page }} / {{ Math.max(1, Math.ceil(total / 20)) }}</span>
      <button
        type="button"
        :disabled="page * 20 >= total || busy"
        @click="change(page + 1)"
      >
        下一页
      </button>
    </nav>
  </section>
</template>
<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useUserStore } from '@/store'
import { inspectAssignments } from '@/api/workflow-recovery'
import type { AssignmentIssue } from '@/api/workflow-recovery'
import { errorMessage } from '@/views/leave/shared'
import WorkflowAssignmentEditor from './workflow-assignment-editor.vue'

const user = useUserStore()
const items = ref<AssignmentIssue[]>([])
const page = ref(1)
const total = ref(0)
const busy = ref(false)
const error = ref('')
let ticket = 0
const load = async () => {
  const current = ++ticket
  busy.value = true
  error.value = ''
  items.value = []
  try {
    const result = await inspectAssignments(page.value)
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
const change = (value: number) => {
  page.value = value
  load()
}
watch(
  () => [user.id, user.tenantId],
  () => {
    page.value = 1
    total.value = 0
    load()
  }
)
onMounted(load)
onUnmounted(() => {
  ticket += 1
})
</script>
<style scoped>
.recovery-console {
  margin: 20px 0;
  padding: 20px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
}
h2 {
  font-size: 20px;
  margin-bottom: 12px;
}
article {
  padding: 16px;
  margin: 12px 0;
  border: 1px solid var(--color-border-2);
  border-radius: 6px;
}
button {
  padding: 8px;
  margin: 4px;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
  color: var(--color-text-1);
  border-radius: 4px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
