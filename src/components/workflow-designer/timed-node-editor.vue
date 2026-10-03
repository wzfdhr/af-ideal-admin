<template>
  <section
    aria-label="定时配置"
    class="timed-editor"
    data-testid="timed-node-editor"
  >
    <p v-if="waiting">等待到期后恢复流程路径；此节点不执行审批。</p>
    <template v-else>
      <label class="deadline-toggle">
        <input
          :checked="enabled"
          type="checkbox"
          aria-label="启用审批期限提醒"
          @change="toggle"
        />
        启用审批期限提醒
      </label>
      <p>期限到达后提醒实际处理人，审批规则和签署票数保持固定。</p>
    </template>
    <label v-if="waiting || enabled">
      {{ waiting ? '等待秒数' : '期限秒数' }}
      <input
        :value="raw"
        type="number"
        min="1"
        max="2592000"
        step="1"
        :aria-label="waiting ? '等待秒数' : '期限秒数'"
        @input="change"
      />
    </label>
    <p v-if="error" role="alert">{{ error }}</p>
    <p>范围为1秒至30天，已发布的实例使用固定计划。</p>
  </section>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { WorkflowNode, WorkflowSchema } from './schema'

const props = defineProps<{ node: WorkflowNode; workflow: WorkflowSchema }>()
const emit = defineEmits<{ (event: 'update', value: WorkflowSchema): void }>()
const waiting = computed(() => props.node.type === 'wait')
const field = computed(() =>
  waiting.value ? 'delaySeconds' : 'deadlineSeconds'
)
const raw = ref('')
const enabled = ref(false)
const error = ref('')
let lastNode = ''
let lastEmitted: number | undefined
watch(
  () => [props.node.id, props.node.config[field.value]],
  () => {
    const value = props.node.config[field.value]
    if (lastNode !== props.node.id || !Object.is(value, lastEmitted))
      raw.value = value === undefined ? '60' : String(value)
    enabled.value = value !== undefined
    lastNode = props.node.id
  },
  { immediate: true }
)
const apply = (value: number | undefined) => {
  lastEmitted = value
  error.value =
    value !== undefined &&
    (!Number.isInteger(value) || value < 1 || value > 2592000)
      ? '请填写1至2592000之间的整数秒数'
      : ''
  emit('update', {
    ...props.workflow,
    version: 4,
    nodes: props.workflow.nodes.map((node) => {
      if (node.id !== props.node.id) return node
      const config = { ...node.config }
      if (value === undefined) delete config[field.value]
      else config[field.value] = value
      return { ...node, config }
    }),
  })
}
const change = (event: Event) => {
  raw.value = (event.target as HTMLInputElement).value
  apply(raw.value === '' ? 0 : Number(raw.value))
}
const toggle = (event: Event) => {
  enabled.value = (event.target as HTMLInputElement).checked
  apply(enabled.value ? Number(raw.value) : undefined)
}
</script>
<style scoped>
.timed-editor {
  margin: 16px 0;
  font-size: 12px;
}
label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
input {
  padding: 6px;
  max-width: 100%;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
  color: var(--color-text-1);
  border-radius: 4px;
}
.deadline-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}
[role='alert'] {
  color: var(--color-danger-6);
}
</style>
