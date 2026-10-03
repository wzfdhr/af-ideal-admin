<template>
  <section aria-label="恢复定时执行" data-testid="workflow-timer-recovery">
    <p>
      请先恢复人员资格或待办分配，再重试计划；等待节点可按权限选择替代处理人。
    </p>
    <label v-if="canAssign && timer.kind === 'resume'" class="replace-toggle">
      <input
        v-model="replace"
        :disabled="busy"
        type="checkbox"
        aria-label="替换失效的下一处理人"
      />
      替换失效的下一处理人
    </label>
    <template v-if="replace">
      <label>
        阻塞票位
        <select
          v-model.number="slotIndex"
          :disabled="busy"
          aria-label="定时阻塞票位"
        >
          <option
            v-for="(slot, index) in slots"
            :key="`${slot.nodeId}:${slot.originalAssigneeId}`"
            :value="index"
          >
            {{ slot.nodeName }}
          </option>
        </select>
      </label>
      <label>
        目标处理人
        <select v-model="targetId" :disabled="busy" aria-label="定时目标处理人">
          <option value="">请选择可审批成员</option>
          <option v-for="person in people" :key="person.id" :value="person.id">
            {{ person.name }}
          </option>
        </select>
      </label>
    </template>
    <label>
      恢复原因
      <textarea
        v-model="reason"
        :disabled="busy"
        aria-label="定时恢复原因"
        maxlength="500"
      />
    </label>
    <button
      type="button"
      :disabled="busy || (replace && !targetId)"
      @click="save"
    >
      恢复定时执行
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useUserStore } from '@/store'
import {
  timerRecoverySlots,
  timerCandidates,
  retryWorkflowTimer,
} from '@/api/workflow-timers'
import type { TimerEntry, TimerRecoverySlot } from '@/api/workflow-timers'
import { createCommandRetry } from '@/services/command-retry'
import { confirmR1Action } from '@/services/r1-confirm'
import { errorMessage } from '@/views/leave/shared'
import { hasPermission } from '@af-admin/workflow-core'

const props = defineProps<{ timer: TimerEntry }>()
const emit = defineEmits<{ (event: 'updated'): void }>()
const user = useUserStore()
const canAssign = computed(() =>
  hasPermission(user.permissions, 'workflow:recover')
)
const replace = ref(false)
const slots = ref<TimerRecoverySlot[]>([])
const slotIndex = ref(0)
const people = ref<{ id: string; name: string }[]>([])
const targetId = ref('')
const reason = ref('')
const error = ref('')
const busy = ref(false)
const retry = createCommandRetry()
let ticket = 0
const candidates = async () => {
  const seq = ++ticket
  people.value = []
  targetId.value = ''
  if (!replace.value || !slots.value[slotIndex.value]) return
  try {
    const result = await timerCandidates(
      props.timer.id,
      slots.value[slotIndex.value]
    )
    if (seq === ticket) people.value = result
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
  }
}
watch(replace, async (value) => {
  error.value = ''
  if (!value) {
    ticket += 1
    people.value = []
    return
  }
  const seq = ++ticket
  try {
    const result = await timerRecoverySlots(props.timer.id)
    if (seq !== ticket) return
    slots.value = result
    slotIndex.value = 0
    if (!result.length)
      error.value = '当前没有需要替换的下一票位，请直接重试计划。'
    await candidates()
  } catch (failure) {
    if (seq === ticket) error.value = errorMessage(failure)
  }
})
watch(slotIndex, candidates)
watch(reason, () => {
  if (
    reason.value.trim().length >= 2 &&
    error.value === '请填写至少两个字符的恢复原因'
  )
    error.value = ''
})
const save = async () => {
  error.value = ''
  if (reason.value.trim().length < 2) {
    error.value = '请填写至少两个字符的恢复原因'
    return
  }
  const slot = slots.value[slotIndex.value]
  if (replace.value && (!slot || !targetId.value)) {
    error.value = '请选择实际阻塞票位和目标'
    return
  }
  if (
    !(await confirmR1Action(
      '确认恢复此定时计划？审批规则保持固定，恢复后仍由实际处理人审批。'
    ))
  )
    return
  const body: {
    expectedRevision: number
    reason: string
    nodeId?: string
    originalAssigneeId?: string
    targetUserId?: string
  } = {
    expectedRevision: props.timer.revision,
    reason: reason.value,
  }
  if (replace.value && slot) {
    body.nodeId = slot.nodeId
    body.originalAssigneeId = slot.originalAssigneeId
    body.targetUserId = targetId.value
  }
  busy.value = true
  try {
    await retryWorkflowTimer(props.timer.id, body, retry.key('timer', body))
    retry.complete('timer')
    emit('updated')
  } catch (failure) {
    error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
onUnmounted(() => {
  ticket += 1
  retry.clear()
})
</script>
<style scoped>
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
.replace-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
