<template>
  <section aria-label="并行分支配置" class="parallel-editor">
    <p>全部分支完成后进入配对汇合；各分支可以配置独立审批、条件和嵌套并行。</p>
    <p>
      配对汇合：{{
        workflow.nodes.find((item) => item.id === node.config.joinId)?.name ||
        '未配置'
      }}
      · {{ node.config.joinId }}
    </p>
    <label v-for="(target, index) in targets" :key="index">
      分支 {{ index + 1 }} 入口
      <select
        :value="target"
        :aria-label="`并行分支 ${index + 1}`"
        @change="change(index, $event)"
      >
        <option value="">请选择节点</option>
        <option
          v-for="item in workflow.nodes.filter(
            (item) => item.id !== node.id && item.type !== 'start'
          )"
          :key="item.id"
          :value="item.id"
        >
          {{ item.name }} · {{ item.id }}
        </option>
      </select>
      <button v-if="targets.length > 2" type="button" @click="remove(index)">
        移除此分支
      </button>
    </label>
    <button type="button" :disabled="targets.length >= 10" @click="add">
      添加并行分支
    </button>
    <p>发布检查每条分支必须到达配对汇合，拒绝跨分支共享活动、环和提前结束。</p>
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { WorkflowSchema, WorkflowNode } from './schema'

const props = defineProps<{ node: WorkflowNode; workflow: WorkflowSchema }>()
const emit = defineEmits<{ (event: 'update', value: WorkflowSchema): void }>()
const targets = ref<string[]>(['', ''])
let lastNodeId = ''
watch(
  () => [props.node.id, props.workflow.edges],
  () => {
    const edges = props.workflow.edges
      .filter((edge) => edge.source === props.node.id)
      .sort(
        (a, b) =>
          Number(a.channel?.split('-')[1]) - Number(b.channel?.split('-')[1])
      )
    const size = Math.max(
      2,
      edges.length,
      lastNodeId === props.node.id ? targets.value.length : 0
    )
    targets.value = [
      ...edges.map((edge) => edge.target),
      ...Array(Math.max(0, size - edges.length)).fill(''),
    ]
    lastNodeId = props.node.id
  },
  { immediate: true }
)
const apply = () =>
  emit('update', {
    ...props.workflow,
    version: 3,
    edges: [
      ...props.workflow.edges.filter((edge) => edge.source !== props.node.id),
      ...targets.value
        .map((target, index) => ({
          id: `parallel-${props.node.id}-${index + 1}`,
          source: props.node.id,
          target,
          channel: `branch-${index + 1}`,
          label: `并行分支 ${index + 1}`,
        }))
        .filter((edge) => edge.target),
    ],
  })
const change = (index: number, event: Event) => {
  targets.value[index] = (event.target as HTMLSelectElement).value
  apply()
}
const add = () => {
  targets.value.push('')
}
const remove = (index: number) => {
  targets.value.splice(index, 1)
  apply()
}
</script>
<style scoped>
.parallel-editor {
  font-size: 12px;
}
label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
select,
button {
  padding: 6px;
  max-width: 100%;
  border: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
  color: var(--color-text-1);
  border-radius: 4px;
}
</style>
