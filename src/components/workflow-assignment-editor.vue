<template>
  <section
    class="assignment-editor"
    :aria-label="label"
    data-testid="workflow-assignment-editor"
  >
    <h3>{{ label }}</h3>
    <p v-if="recoverySlot">
      待恢复节点：{{
        recoverySlot.nodeName
      }}；仅改变实例分配，原流程与签署规则保持固定。
    </p>
    <label>
      目标处理人
      <select v-model="targetId" aria-label="目标处理人" :disabled="busy">
        <option value="">请选择可审批成员</option>
        <option v-for="person in people" :key="person.id" :value="person.id">
          {{ person.name }} · {{ person.id }}
        </option>
      </select>
    </label>
    <label>
      转交或恢复原因
      <textarea v-model="reason" aria-label="转交或恢复原因" maxlength="500" />
    </label>
    <button type="button" :disabled="busy" @click="load">刷新候选</button>
    <button type="button" :disabled="busy || !targetId" @click="save">
      {{ label }}
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  assignmentCandidates,
  transferAssignment,
  recoverNextAssignment,
} from '@/api/workflow-recovery'
import type { AssignmentIssue } from '@/api/workflow-recovery'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import { errorMessage } from '@/views/leave/shared'
import { useUserStore } from '@/store'

const props = defineProps<{
  taskId: string
  revision: number
  mode: 'transfer' | 'recover' | 'recover-next'
  recoverySlot?: AssignmentIssue['nextSlots'][number]
}>()
const emit = defineEmits<{ (event: 'updated'): void }>()
const label = computed(() => {
  if (props.mode === 'transfer') return '转交待办'
  if (props.mode === 'recover-next') return '恢复下一票位'
  return '恢复当前待办'
})
const user = useUserStore()
const people = ref<{ id: string; name: string }[]>([])
const targetId = ref('')
const reason = ref('')
const busy = ref(false)
const error = ref('')
const message = ref('')
const retry = createCommandRetry()
let sequence = 0
const load = async () => {
  const ticket = ++sequence
  error.value = ''
  people.value = []
  try {
    const result = await assignmentCandidates(
      props.taskId,
      props.mode,
      props.recoverySlot
    )
    if (ticket === sequence) people.value = result
  } catch (failure) {
    if (ticket === sequence) error.value = errorMessage(failure)
  }
}
const save = async () => {
  error.value = ''
  message.value = ''
  if (reason.value.trim().length < 2) {
    error.value = '请填写至少两个字符的原因'
    return
  }
  if (
    !(await confirmR1Action(
      '确认更改此待办分配？旧人立即不能处理，新人保留同一审批票位。'
    ))
  )
    return
  const body: Record<string, unknown> = {
    expectedRevision: props.revision,
    targetUserId: targetId.value,
    reason: reason.value,
  }
  if (props.recoverySlot) {
    body.nodeId = props.recoverySlot.nodeId
    body.originalAssigneeId = props.recoverySlot.originalAssigneeId
  }
  busy.value = true
  try {
    if (props.mode === 'recover-next')
      await recoverNextAssignment(
        props.taskId,
        body,
        retry.key('assignment', body)
      )
    else
      await transferAssignment(
        props.taskId,
        body,
        retry.key('assignment', body),
        props.mode
      )
    retry.complete('assignment')
    message.value = '分配已保存'
    emit('updated')
  } catch (failure) {
    error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
watch(
  () => [
    props.taskId,
    props.mode,
    props.recoverySlot?.nodeId,
    user.tenantId,
    user.id,
  ],
  () => {
    targetId.value = ''
    reason.value = ''
    message.value = ''
    retry.clear()
    load()
  }
)
onMounted(load)
</script>
<style scoped>
.assignment-editor {
  padding: 16px;
  border: 1px solid var(--color-border-2);
  margin: 12px 0;
  border-radius: 6px;
}
label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
select,
textarea,
button {
  padding: 8px;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
  color: var(--color-text-1);
  border-radius: 4px;
}
button {
  margin: 4px 8px 4px 0;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
